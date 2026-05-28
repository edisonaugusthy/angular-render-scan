import { AngularRenderScanOverlay } from '../infrastructure/ui/overlay';
import { getResolvedOptions, resolveOptions, setResolvedOptions } from '../domain/options';
import { finishCycle, resetStats, startCycle } from './stats';
import type { AngularRenderCycle, AngularRenderEntry, AngularRenderScanOptions } from '../domain/entities';

let overlay: AngularRenderScanOverlay | undefined;
let activeCycleId = 0;
let activeCycleStartedAt = 0;
let lastCycle: AngularRenderCycle | undefined;
let implicitCycleScheduled = false;
let recentCycles: AngularRenderCycle[] = [];

let scheduleTask = (fn: () => void) => queueMicrotask(fn);

export function setTaskScheduler(scheduler: (fn: () => void) => void) {
  scheduleTask = scheduler;
}

export function scan(options?: AngularRenderScanOptions): void {
  const resolved = setResolvedOptions(resolveOptions(options));
  if (!overlay && typeof document !== 'undefined') {
    overlay = new AngularRenderScanOverlay(resolved, (enabled) => setOptions({ enabled }));
  }
  overlay?.updateOptions(resolved);
}

export function setOptions(options: Partial<AngularRenderScanOptions>): void {
  const resolved = setResolvedOptions(options);
  overlay?.updateOptions(resolved);
}

export function getOptions() {
  return getResolvedOptions();
}

export function stop(): void {
  overlay?.destroy();
  overlay = undefined;
  resetStats();
  clearRecording();
  lastCycle = undefined;
  activeCycleId = 0;
  activeCycleStartedAt = 0;
  implicitCycleScheduled = false;
  
  if (typeof window !== 'undefined') {
    const globalWindow = window as any;
    if (globalWindow.__ANGULAR_RENDER_SCAN_APP_REF__) {
      // Assuming restoreApplicationRef was called via the global stop or we can't easily reach it here without circular deps.
      // But we can dispatch an event or just let the global handle it.
    }
  }
}

export function beginCycle(): number {
  const options = getResolvedOptions();
  if (!options.enabled) {
    return 0;
  }

  scan();
  activeCycleId = startCycle();
  activeCycleStartedAt = performance.now();
  options.onCycleStart?.();
  return activeCycleId;
}

export function endCycle(cycleId = activeCycleId): AngularRenderCycle | undefined {
  if (!cycleId) {
    return undefined;
  }

  const options = getResolvedOptions();
  const finishedAt = performance.now();
  const cycle = finishCycle(cycleId, activeCycleStartedAt, finishedAt, options);
  lastCycle = cycle;
  recordRecentCycle(cycle, options.maxRecordedCycles);
  for (const entry of cycle.entries) {
    options.onRender?.(entry);
  }
  options.onCycleFinish?.(cycle);
  overlay?.showCycle(cycle);

  if (options.log && cycle.entries.length > 0) {
    console.groupCollapsed(`%c[angular-render-scan] cycle ${cycle.id} - ${cycle.duration.toFixed(2)}ms, ${cycle.renderedCount} components`, 'color: #7c3aed; font-weight: bold;');
    const tableData = cycle.entries.map((e) => ({
      Name: e.name,
      Count: e.count,
      'Time (ms)': Number(e.latestDuration.toFixed(2)),
      'Avg (ms)': Number(e.averageDuration.toFixed(2)),
      Reason: e.reason ?? 'unknown'
    }));
    console.table(tableData);
    console.groupEnd();
  }

  if (activeCycleId === cycleId) {
    activeCycleId = 0;
    activeCycleStartedAt = 0;
  }
  implicitCycleScheduled = false;

  return cycle;
}

export function currentCycleId(): number {
  return activeCycleId;
}

export function ensureCycleForComponentCheck(): number {
  if (activeCycleId) {
    return activeCycleId;
  }

  const cycleId = beginCycle();
  if (!cycleId || implicitCycleScheduled) {
    return cycleId;
  }

  implicitCycleScheduled = true;
  scheduleTask(() => {
    if (activeCycleId === cycleId) {
      endCycle(cycleId);
    }
  });
  return cycleId;
}

export function getLastCycle(): AngularRenderCycle | undefined {
  return lastCycle;
}

export function getRecording(): AngularRenderCycle[] {
  return recentCycles.slice();
}

export function clearRecording(): void {
  recentCycles = [];
}

export function getAIPrompt(fps?: number): string {
  const options = getResolvedOptions();
  const cycles = recentCycles.length > 0 ? recentCycles : lastCycle ? [lastCycle] : [];
  if (cycles.length === 0 || cycles.every((cycle) => cycle.entries.length === 0)) {
    return '';
  }

  return buildAIPrompt(cycles, options, fps);
}

export async function copyAIPrompt(fps?: number): Promise<boolean> {
  const prompt = getAIPrompt(fps);
  if (!prompt || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(prompt);
    return true;
  } catch {
    return false;
  }
}

function recordRecentCycle(cycle: AngularRenderCycle, maxRecordedCycles: number): void {
  recentCycles.push(cycle);
  if (recentCycles.length > maxRecordedCycles) {
    recentCycles = recentCycles.slice(-maxRecordedCycles);
  }
}

function buildAIPrompt(cycles: AngularRenderCycle[], options = getResolvedOptions(), fps?: number): string {
  const latest = cycles[cycles.length - 1];
  const entries = topEntries(cycles, Math.min(options.maxLabelCount, 8));
  const issueEntries = issueEntriesForPrompt(cycles, options);
  const context = options.promptContext.trim();
  const environment = getPromptEnvironment(fps);

  return [
    '# ⚡️ Angular change-detection Performance Audit (via angular-render-scan)',
    'This prompt is self-contained and includes the telemetry evidence of slow/actionable components in the application.',
    context ? `* **Project context:** ${context}` : '',
    '',
    '## 💻 Environment:',
    ...environment,
    '',
    '## ⏱️ Latest Render Cycle Details:',
    'Here are the telemetry details of the last captured change detection cycle:',
    `* **Cycle id:** #${latest.id}`,
    `* **Duration:** \`${formatMs(latest.duration)}\``,
    `* **Rendered components count:** ${latest.renderedCount}`,
    latest.slowest ? `* **Slowest component:** \`${latest.slowest.name}\` (${formatMs(latest.slowest.latestDuration)}, reason: \`${latest.slowest.reason ?? 'unknown'}\`)` : '',
    `* **Thresholds:** Fast <= \`${formatMs(options.fastThresholdMs)}\` | Slow >= \`${formatMs(options.slowThresholdMs)}\``,
    `* **Filters:** Min duration \`${formatMs(options.minDurationMs)}\`, min render count ${options.minRenderCount}`,
    '',
    '## 📈 Recent cycle history:',
    ...cycles.slice(-8).map(formatPromptCycle),
    '',
    '## 🚨 Slow/error component issues to fix:',
    ...issueEntries.map((entry, index) => formatIssueEntry(entry, index + 1, latest.duration, options.slowThresholdMs)),
    issueEntries.length === 0 ? '- No component exceeded the configured slow threshold in the captured cycles.' : '',
    '',
    '## 📊 Reference metrics (top observed components):',
    'Overall render footprint and frequencies for active components:',
    ...entries.map((entry, index) => formatReferenceEntry(entry, index + 1)),
    '',
    '## 🛠️ Optimization Instructions:',
    'Please identify the likely root causes for each slow/error component issue and suggest concrete Angular fixes. Focus on ChangeDetectionStrategy.OnPush, signal/computed usage, template calculations, input reference stabilization, event handlers, and list tracking. Prioritize resolving the highest estimated cost first. Please generate complete, refactored TypeScript templates showing the exact optimized before/after structures. Do not assume access to source code beyond this diagnostic snapshot.'
  ].filter(Boolean).join('\n');
}

function topEntries(cycles: AngularRenderCycle[], limit: number): AngularRenderEntry[] {
  const latestById = new Map<string, AngularRenderEntry>();
  for (const cycle of cycles) {
    for (const entry of cycle.entries) {
      latestById.set(entry.id, entry);
    }
  }

  return [...latestById.values()]
    .sort((a, b) => (b.latestDuration - a.latestDuration) || (b.count - a.count))
    .slice(0, limit);
}

function issueEntriesForPrompt(cycles: AngularRenderCycle[], options = getResolvedOptions()): AngularRenderEntry[] {
  const entries = topEntries(cycles, Math.min(options.maxLabelCount, 8));
  return entries.filter((entry) => entry.latestDuration >= options.slowThresholdMs);
}

function formatIssueEntry(entry: AngularRenderEntry, index: number, latestCycleDuration: number, slowThresholdMs: number): string {
  const overBy = Math.max(0, entry.latestDuration - slowThresholdMs);
  const cycleShare = latestCycleDuration > 0 ? (entry.latestDuration / latestCycleDuration) * 100 : 0;
  const estimatedTotalCost = entry.averageDuration * entry.count;
  const changedInputsStr = entry.changedInputs?.length
    ? entry.changedInputs.map((input) => `${input.name} ${input.previous} -> ${input.current}`).join('; ')
    : 'none captured';

  return [
    `### 🛑 Component #${index}: \`${entry.name}\``,
    `   Selector: selector ${entry.selector ?? '-'}`,
    `   Performance Issue: latest render ${formatMs(entry.latestDuration)} exceeded slow threshold ${formatMs(slowThresholdMs)} by ${formatMs(overBy)}.`,
    `   Cost: ${formatMs(entry.latestDuration)} in latest cycle, about ${cycleShare.toFixed(0)}% of latest cycle time, estimated observed total ${formatMs(estimatedTotalCost)} across ${entry.count} renders.`,
    `   Average render: ${formatMs(entry.averageDuration)}`,
    `   Render reason: ${entry.reason ?? 'unknown'}`,
    `   Changed inputs: ${changedInputsStr}`
  ].join('\n');
}

function formatReferenceEntry(entry: AngularRenderEntry, index: number): string {
  return `${index}. ${entry.name}: selector ${entry.selector ?? '-'}, latest ${formatMs(entry.latestDuration)}, avg ${formatMs(entry.averageDuration)}, renders ${entry.count}, reason ${entry.reason ?? 'unknown'}`;
}

function formatPromptCycle(cycle: AngularRenderCycle): string {
  const slowest = cycle.slowest ? `${cycle.slowest.name} ${formatMs(cycle.slowest.latestDuration)}` : 'none';
  return `- #${cycle.id}: ${formatMs(cycle.duration)}, ${cycle.renderedCount} components, slowest ${slowest}`;
}

function getPromptEnvironment(fps?: number): string[] {
  const viewport = typeof window !== 'undefined'
    ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`
    : '';
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  return [
    `- Captured at: ${new Date().toISOString()}`,
    typeof fps === 'number' && Number.isFinite(fps) ? `- FPS: ${fps}` : '',
    viewport ? `- Viewport: ${viewport}` : '',
    url ? `- URL: ${url}` : '',
    userAgent ? `- User agent: ${userAgent}` : ''
  ].filter(Boolean);
}

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`;
}
