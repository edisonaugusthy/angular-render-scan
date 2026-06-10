import { AngularRenderScanOverlay } from '../infrastructure/ui/overlay';
import { getResolvedOptions, setResolvedOptions } from '../domain/options';
import {
  finishCycle,
  resetStats,
  startCycle,
  getWastedStats as statsGetWastedStats,
  getLeakedComponents as statsGetLeakedComponents,
  getOnPushCandidates as statsGetOnPushCandidates,
  getReferentialInstability as statsGetReferentialInstability,
  getCdGraph as statsGetCdGraph,
  clearStats,
  getComponentCostEntries,
  getRegisteredComponentEntries,
  registerGetRenderCauseCallback
} from './stats';
import type {
  AngularRenderCycle,
  AngularRenderEntry,
  AngularRenderScanOptions,
  BudgetViolation,
  CdTriggerAttribution,
  OnPushCandidate,
  ReferentialInstabilityReport,
  SessionExportData,
  WastedStats,
  ZonePollutionEvent,
  CdGraph,
  RenderCause,
  SignalDependencyGraph,
  ComponentCostEntry,
  SignalDependencyNode,
  SignalDependencyEdge
} from '../domain/entities';

// Register callback for stats to query render cause to avoid circular imports
registerGetRenderCauseCallback((name) => {
  return findRenderCauseForComponent(name, activeCycleTrigger);
});

let overlay: AngularRenderScanOverlay | undefined;
let activeCycleId = 0;
let activeCycleStartedAt = 0;
let lastCycle: AngularRenderCycle | undefined;
let implicitCycleScheduled = false;
let recentCycles: AngularRenderCycle[] = [];
let activeSessionBudgetViolations: BudgetViolation[] = [];
let activeZonePollutionEvents: ZonePollutionEvent[] = [];

// v0.2 state tracking
let activeCycleTrigger: CdTriggerAttribution | undefined;
let recentSignalWrites: { name: string; action: 'set' | 'update'; stack?: string[]; timestamp: number; isWasted: boolean }[] = [];
let activeCheckingComponentId: string | null = null;
let activeCheckingComponentName: string | null = null;
let activeComputedSignalName: string | null = null;
const dependencyEdges = new Set<string>();
const signalUpdateCounts = new Map<string, { total: number; wasted: number; kind: 'signal' | 'computed' }>();

// Lazily-loaded Zone tracker references (avoid importing in test/non-Zone envs)
let _resolveTrigger: (() => CdTriggerAttribution) | null = null;
let _resetCycleTrigger: (() => void) | null = null;
let _notifySignalWrite: (() => void) | null = null;

async function ensureZoneTracker() {
  if (_resolveTrigger) return;
  try {
    const mod = await import('../infrastructure/angular/zone-tracker');
    _resolveTrigger = mod.resolveTriggerAttribution;
    _resetCycleTrigger = mod.resetCycleTriggerState;
    _notifySignalWrite = mod.notifySignalWrite;
  } catch {
    // Zone tracker unavailable
  }
}
// Pre-load asynchronously so it's ready by the time the first cycle fires
ensureZoneTracker();

let scheduleTask = (fn: () => void) => queueMicrotask(fn);

export function setTaskScheduler(scheduler: (fn: () => void) => void) {
  scheduleTask = scheduler;
}

export function scan(options?: AngularRenderScanOptions): void {
  const resolved = setResolvedOptions(options ?? {}, {
    persistEnabled: false,
    preferStoredEnabled: true
  });
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
  activeSessionBudgetViolations = [];
  activeZonePollutionEvents = [];
}

export function beginCycle(): number {
  const options = getResolvedOptions();
  if (!options.enabled) {
    return 0;
  }

  scan();
  activeCycleId = startCycle();
  activeCycleStartedAt = performance.now();

  // Resolve trigger at the start of the cycle (when tick starts)
  let trigger: CdTriggerAttribution | undefined;
  if (_resolveTrigger) {
    trigger = _resolveTrigger();
  }
  activeCycleTrigger = trigger;
  _resetCycleTrigger?.();

  options.onCycleStart?.();
  return activeCycleId;
}

function getRendersInLastSecond(id: string, now: number): number {
  let count = 0;
  for (let i = recentCycles.length - 1; i >= 0; i--) {
    const cycle = recentCycles[i];
    if (now - cycle.finishedAt > 1000) {
      break;
    }
    if (cycle.entries.some(e => e.id === id)) {
      count++;
    }
  }
  return count;
}

export function endCycle(cycleId = activeCycleId): AngularRenderCycle | undefined {
  if (!cycleId) {
    return undefined;
  }

  const options = getResolvedOptions();
  const finishedAt = performance.now();
  const cycle = finishCycle(cycleId, activeCycleStartedAt, finishedAt, options);

  // ─── CD Trigger Attribution ───────────────────────────────────────────────
  const trigger = activeCycleTrigger;
  if (trigger) {
    cycle.trigger = trigger;
    cycle.isZonePollution = trigger.isZonePollution;
  }

  // ─── Zone Pollution Detection ─────────────────────────────────────────────
  if (trigger?.isZonePollution && cycle.entries.length > 0) {
    const pollutionEvent: ZonePollutionEvent = {
      timestamp: Date.now(),
      source: trigger.source,
      detail: trigger.detail,
      callSite: trigger.callSite,
      componentCount: cycle.entries.length,
      cycleDuration: cycle.duration
    };
    const maxPollution = options.maxZonePollutionEvents ?? 50;
    activeZonePollutionEvents.push(pollutionEvent);
    if (activeZonePollutionEvents.length > maxPollution) {
      activeZonePollutionEvents = activeZonePollutionEvents.slice(-maxPollution);
    }
    options.onZonePollution?.(pollutionEvent);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('angular-render-scan:zone-pollution', { detail: pollutionEvent }));
    }
  }

  lastCycle = cycle;
  recordRecentCycle(cycle, options.maxRecordedCycles);

  // ─── Budget validation ────────────────────────────────────────────────────
  const now = performance.now();
  const realNowTimestamp = Date.now();
  if (options.budgets) {
    const { warnMs, errorMs, maxRendersPerSecond } = options.budgets;
    for (const entry of cycle.entries) {
      if (warnMs !== undefined && entry.latestDuration > warnMs && entry.latestDuration <= (errorMs ?? Infinity)) {
        const violation: BudgetViolation = {
          componentName: entry.name,
          selector: entry.selector ?? '',
          type: 'warn',
          actual: entry.latestDuration,
          budget: warnMs,
          message: `Component ${entry.name} exceeded warning budget of ${warnMs}ms (took ${entry.latestDuration.toFixed(1)}ms)`,
          timestamp: realNowTimestamp
        };
        activeSessionBudgetViolations.push(violation);
        options.onBudgetViolation?.(violation);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('angular-render-scan:budget-violation', { detail: violation }));
        }
      }
      if (errorMs !== undefined && entry.latestDuration > errorMs) {
        const violation: BudgetViolation = {
          componentName: entry.name,
          selector: entry.selector ?? '',
          type: 'error',
          actual: entry.latestDuration,
          budget: errorMs,
          message: `Component ${entry.name} exceeded error budget of ${errorMs}ms (took ${entry.latestDuration.toFixed(1)}ms)`,
          timestamp: realNowTimestamp
        };
        activeSessionBudgetViolations.push(violation);
        options.onBudgetViolation?.(violation);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('angular-render-scan:budget-violation', { detail: violation }));
        }
      }
      if (maxRendersPerSecond !== undefined) {
        const rendersInLastSec = getRendersInLastSecond(entry.id, now);
        if (rendersInLastSec > maxRendersPerSecond) {
          const violation: BudgetViolation = {
            componentName: entry.name,
            selector: entry.selector ?? '',
            type: 'render-rate',
            actual: rendersInLastSec,
            budget: maxRendersPerSecond,
            message: `Component ${entry.name} exceeded max render rate budget of ${maxRendersPerSecond}/sec (rendered ${rendersInLastSec} times in last second)`,
            timestamp: realNowTimestamp
          };
          activeSessionBudgetViolations.push(violation);
          options.onBudgetViolation?.(violation);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('angular-render-scan:budget-violation', { detail: violation }));
          }
        }
      }
    }
  }

  for (const entry of cycle.entries) {
    options.onRender?.(entry);
  }
  options.onCycleFinish?.(cycle);
  overlay?.showCycle(cycle);

  if (options.log && cycle.entries.length > 0) {
    const triggerLabel = trigger
      ? ` [${trigger.source}${trigger.isZonePollution ? ' ⚠️ POLLUTION' : ''}]`
      : '';
    console.groupCollapsed(
      `%c[angular-render-scan] cycle ${cycle.id} - ${cycle.duration.toFixed(2)}ms, ${cycle.renderedCount} components${triggerLabel}`,
      'color: #7c3aed; font-weight: bold;'
    );
    const tableData = cycle.entries.map((e) => ({
      Name: e.name,
      Count: e.count,
      'Time (ms)': Number(e.latestDuration.toFixed(2)),
      'Avg (ms)': Number(e.averageDuration.toFixed(2)),
      Reason: e.reason ?? 'unknown',
      CD: e.cdStrategy ?? 'unknown',
      OnPush: e.isOnPushCandidate ? '⚡ candidate' : ''
    }));
    console.table(tableData);
    if (trigger) {
      console.log(
        '%c[trigger]',
        'color: #0ea5e9;',
        trigger.source,
        trigger.detail ?? '',
        trigger.isZonePollution ? '⚠️ Zone Pollution' : ''
      );
    }
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

export function getRegisteredComponents(): AngularRenderEntry[] {
  return getRegisteredComponentEntries();
}

export function clearRecording(): void {
  recentCycles = [];
  activeZonePollutionEvents = [];
  activeSessionBudgetViolations = [];
  recentSignalWrites = [];
  dependencyEdges.clear();
  signalUpdateCounts.clear();
  activeCheckingComponentId = null;
  activeCheckingComponentName = null;
  activeComputedSignalName = null;
  activeCycleTrigger = undefined;
  clearStats();
}

// ─── v0.2 Signal dependency & cause tracking logic ────────────────────────────

export function setActiveCheckingComponent(id: string | null, name: string | null): void {
  activeCheckingComponentId = id;
  activeCheckingComponentName = name;
}

export function setActiveComputedSignal(name: string | null): void {
  activeComputedSignalName = name;
}

export function recordSignalRead(name: string, kind: 'signal' | 'computed'): void {
  if (!signalUpdateCounts.has(name)) {
    signalUpdateCounts.set(name, { total: 0, wasted: 0, kind });
  }

  let consumer: string | null = null;
  let consumerKind: 'component' | 'computed' | null = null;

  if (activeComputedSignalName) {
    consumer = activeComputedSignalName;
    consumerKind = 'computed';
  } else if (activeCheckingComponentName) {
    consumer = activeCheckingComponentName;
    consumerKind = 'component';
  }

  if (consumer && consumer !== name) {
    const edgeKey = `${name}->${consumer}`;
    dependencyEdges.add(edgeKey);

    if (consumerKind === 'computed' && !signalUpdateCounts.has(consumer)) {
      signalUpdateCounts.set(consumer, { total: 0, wasted: 0, kind: 'computed' });
    }
  }
}

export function recordSignalWrite(name: string, action: 'set' | 'update', stack: string[], isWasted: boolean): void {
  if (recentSignalWrites.length > 0) {
    const last = recentSignalWrites[recentSignalWrites.length - 1];
    if (last.name === name && last.action === 'update' && action === 'set' && Date.now() - last.timestamp < 2) {
      return;
    }
  }

  recentSignalWrites.push({
    name,
    action,
    stack,
    timestamp: Date.now(),
    isWasted
  });
  if (recentSignalWrites.length > 200) {
    recentSignalWrites = recentSignalWrites.slice(-200);
  }

  const stats = signalUpdateCounts.get(name) || { total: 0, wasted: 0, kind: 'signal' };
  stats.total += 1;
  if (isWasted) {
    stats.wasted += 1;
  }
  signalUpdateCounts.set(name, stats);

  // Notify the zone tracker
  _notifySignalWrite?.();
}

function isSignalDependent(consumer: string, producer: string): boolean {
  if (consumer === producer) return true;

  const adj = new Map<string, string[]>();
  for (const edge of dependencyEdges) {
    const [from, to] = edge.split('->');
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }

  const visited = new Set<string>();
  const queue = [producer];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === consumer) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);

    const next = adj.get(curr) || [];
    for (const n of next) {
      if (!visited.has(n)) {
        queue.push(n);
      }
    }
  }
  return false;
}

export function findRenderCauseForComponent(componentName: string, cycleTrigger: CdTriggerAttribution | undefined): RenderCause | undefined {
  if (!cycleTrigger) return undefined;

  if (cycleTrigger.source === 'signal:write') {
    const now = Date.now();
    const possibleWrites = recentSignalWrites
      .filter(w => now - w.timestamp < 1000)
      .reverse();

    for (const write of possibleWrites) {
      if (isSignalDependent(componentName, write.name)) {
        return {
          trigger: 'signal:write',
          source: write.name,
          stack: write.stack,
          timestamp: write.timestamp
        };
      }
    }

    if (possibleWrites.length > 0) {
      const write = possibleWrites[0];
      return {
        trigger: 'signal:write',
        source: write.name,
        stack: write.stack,
        timestamp: write.timestamp
      };
    }
  }

  return {
    trigger: cycleTrigger.source,
    source: cycleTrigger.detail,
    stack: cycleTrigger.callSite ? [cycleTrigger.callSite] : undefined,
    timestamp: Date.now()
  };
}

export function getRenderCause(component: string | Element): RenderCause | null {
  const name = typeof component === 'string' ? component : component.tagName.toLowerCase();
  
  // Find the component's entry from the last cycle or stats
  for (let i = recentCycles.length - 1; i >= 0; i--) {
    const entry = recentCycles[i].entries.find(e => e.name === name || e.selector?.includes(name));
    if (entry && entry.renderCause) {
      return entry.renderCause;
    }
  }
  return null;
}

export function getSignalDependencyGraph(): SignalDependencyGraph {
  const nodes: SignalDependencyNode[] = [];
  const edges: SignalDependencyEdge[] = [];

  const nodeNames = new Set<string>();
  for (const [name, stats] of signalUpdateCounts.entries()) {
    nodeNames.add(name);
    nodes.push({
      id: name,
      name,
      kind: stats.kind,
      updateCount: stats.total,
      wastedCount: stats.wasted
    });
  }

  for (const edge of dependencyEdges) {
    const [from, to] = edge.split('->');
    nodeNames.add(from);
    nodeNames.add(to);
    edges.push({ fromId: from, toId: to });
  }

  for (const name of nodeNames) {
    if (!signalUpdateCounts.has(name)) {
      const isComponent = !name.includes('.') && /^[A-Z]/.test(name);
      nodes.push({
        id: name,
        name,
        kind: isComponent ? 'component' : 'signal',
        updateCount: 0,
        wastedCount: 0
      });
    }
  }

  return { nodes, edges };
}

// ─── New public exports ────────────────────────────────────────────────────────

export function getOnPushCandidates(threshold?: number): OnPushCandidate[] {
  const opts = getResolvedOptions();
  return statsGetOnPushCandidates(threshold ?? opts.onPushCandidateThreshold);
}

export function getReferentialInstability(minUnstable = 1): ReferentialInstabilityReport[] {
  return statsGetReferentialInstability(minUnstable);
}

export function getZonePollutionEvents(): ZonePollutionEvent[] {
  return [...activeZonePollutionEvents];
}

export function getCdGraph(): CdGraph {
  return statsGetCdGraph();
}

// ─── AI prompt ────────────────────────────────────────────────────────────────

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

  const slowThreshold = options.budgets?.warnMs ?? 10;
  const fastThreshold = slowThreshold / 2;

  const onPushCandidates = statsGetOnPushCandidates(options.onPushCandidateThreshold);
  const pollutionEvents = activeZonePollutionEvents.slice(-5);
  const refInstability = statsGetReferentialInstability().slice(0, 5);

  return [
    '# ⚡️ Angular change-detection Performance Audit (via angular-render-scan)',
    'This prompt is self-contained and includes the telemetry evidence of slow/actionable components in the application.',
    context ? `* **Project context:** ${context}` : '',
    '',
    '## 💻 Environment:',
    ...environment,
    '',
    '## ⏱️ Latest Render Cycle Details:',
    `* **Cycle id:** #${latest.id}`,
    `* **Duration:** \`${formatMs(latest.duration)}\``,
    latest.trigger
      ? `* **Trigger:** \`${latest.trigger.source}\`${latest.trigger.detail ? ` (${latest.trigger.detail})` : ''}${latest.trigger.isZonePollution ? ' ⚠️ Zone Pollution detected' : ''}`
      : '',
    `* **Rendered components count:** ${latest.renderedCount}`,
    latest.slowest
      ? `* **Slowest component:** \`${latest.slowest.name}\` (${formatMs(latest.slowest.latestDuration)}, reason: \`${latest.slowest.reason ?? 'unknown'}\`)`
      : '',
    `* **Thresholds:** Fast <= \`${formatMs(fastThreshold)}\` | Slow >= \`${formatMs(slowThreshold)}\``,
    '',
    '## 📈 Recent cycle history:',
    ...cycles.slice(-8).map(formatPromptCycle),
    '',
    onPushCandidates.length > 0 ? '## ⚡️ OnPush Migration Candidates:' : '',
    onPushCandidates.length > 0
      ? 'These components use Default CD and have high wasted render rates. Switching to OnPush should significantly reduce unnecessary checks.'
      : '',
    ...onPushCandidates.slice(0, 5).map((c, i) =>
      `${i + 1}. **${c.name}** (${c.selector}) — ${c.wastedPercentage}% wasted, ~${c.estimatedSavingPct}% estimated saving [${c.confidence} confidence] — ${c.reason}`
    ),
    '',
    pollutionEvents.length > 0 ? '## ⚠️ Zone Pollution Events (last 5):' : '',
    pollutionEvents.length > 0
      ? 'These CD cycles were triggered by async operations with no user interaction.'
      : '',
    ...pollutionEvents.map(e =>
      `- ${e.source}${e.detail ? ` (${e.detail})` : ''} — ${e.componentCount} components ran, ${formatMs(e.cycleDuration)}`
    ),
    '',
    refInstability.length > 0 ? '## 🔄 Referentially Unstable Inputs:' : '',
    refInstability.length > 0
      ? 'These inputs receive new object references with the same value, causing unnecessary OnPush re-renders.'
      : '',
    ...refInstability.map(r =>
      `- **${r.componentName}** \`@Input() ${r.inputName}\`: ${r.unstableRefCount}/${r.totalRenders} renders (${r.unstableRefPct}%) had same value, new reference`
    ),
    '',
    '## 🚨 Slow/error component issues to fix:',
    ...issueEntries.map((entry, index) => formatIssueEntry(entry, index + 1, latest.duration, slowThreshold)),
    issueEntries.length === 0
      ? '- No component exceeded the configured slow threshold in the captured cycles.'
      : '',
    '',
    '## 📊 Reference metrics (top observed components):',
    'Overall render footprint and frequencies for active components:',
    ...entries.map((entry, index) => formatReferenceEntry(entry, index + 1)),
    '',
    '## 🛠️ Optimization Instructions:',
    'Please identify the likely root causes for each slow/error component issue and suggest concrete Angular fixes. Focus on ChangeDetectionStrategy.OnPush, signal/computed usage, template calculations, input reference stabilization (memo patterns, pure pipes, stable factories), Zone.js pollution elimination (NgZone.runOutsideAngular), and list tracking (trackBy). For referentially unstable inputs, suggest using pure pipes or stable object factories. Prioritize resolving the highest estimated cost first. Generate complete, refactored TypeScript templates showing optimized before/after structures.'
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
  const slowThreshold = options.budgets?.warnMs ?? 10;
  return entries.filter((entry) => entry.latestDuration >= slowThreshold);
}

function formatIssueEntry(
  entry: AngularRenderEntry,
  index: number,
  latestCycleDuration: number,
  slowThresholdMs: number
): string {
  const overBy = Math.max(0, entry.latestDuration - slowThresholdMs);
  const cycleShare = latestCycleDuration > 0 ? (entry.latestDuration / latestCycleDuration) * 100 : 0;
  const estimatedTotalCost = entry.averageDuration * entry.count;
  const changedInputsStr = entry.changedInputs?.length
    ? entry.changedInputs
        .map((input) =>
          `${input.name} ${input.previous} -> ${input.current}${input.isReferentiallyUnstable ? ' [UNSTABLE REF]' : ''}`
        )
        .join('; ')
    : 'none captured';

  return [
    `### 🛑 Component #${index}: \`${entry.name}\``,
    `   Selector: ${entry.selector ?? '-'}`,
    `   CD Strategy: ${entry.cdStrategy ?? 'unknown'}${entry.isOnPushCandidate ? ' → OnPush candidate ⚡' : ''}`,
    `   Performance Issue: latest render ${formatMs(entry.latestDuration)} exceeded slow threshold ${formatMs(slowThresholdMs)} by ${formatMs(overBy)}.`,
    `   Cost: ${formatMs(entry.latestDuration)} in latest cycle, about ${cycleShare.toFixed(0)}% of latest cycle time, estimated observed total ${formatMs(estimatedTotalCost)} across ${entry.count} renders.`,
    `   Average render: ${formatMs(entry.averageDuration)}`,
    `   Render reason: ${entry.reason ?? 'unknown'}`,
    `   Changed inputs: ${changedInputsStr}`
  ].join('\n');
}

function formatReferenceEntry(entry: AngularRenderEntry, index: number): string {
  return `${index}. ${entry.name}: selector ${entry.selector ?? '-'}, latest ${formatMs(entry.latestDuration)}, avg ${formatMs(entry.averageDuration)}, renders ${entry.count}, reason ${entry.reason ?? 'unknown'}, CD: ${entry.cdStrategy ?? '?'}${entry.isOnPushCandidate ? ' ⚡' : ''}`;
}

function formatPromptCycle(cycle: AngularRenderCycle): string {
  const slowest = cycle.slowest ? `${cycle.slowest.name} ${formatMs(cycle.slowest.latestDuration)}` : 'none';
  const trigger = cycle.trigger
    ? ` [${cycle.trigger.source}${cycle.isZonePollution ? ' ⚠️' : ''}]`
    : '';
  return `- #${cycle.id}: ${formatMs(cycle.duration)}, ${cycle.renderedCount} components, slowest ${slowest}${trigger}`;
}

function getPromptEnvironment(fps?: number): string[] {
  const viewport =
    typeof window !== 'undefined'
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

export function getSessionData(): SessionExportData {
  const options = getResolvedOptions();
  const wasted = statsGetWastedStats();
  const leaks = statsGetLeakedComponents().map((c) => c.name);
  const onPushCandidates = statsGetOnPushCandidates(options.onPushCandidateThreshold);
  const refInstability = statsGetReferentialInstability();

  const mappedCycles = recentCycles.map((cycle) => ({
    id: cycle.id,
    startedAt: cycle.startedAt,
    finishedAt: cycle.finishedAt,
    duration: cycle.duration,
    renderedCount: cycle.renderedCount,
    entries: cycle.entries.map((e) => ({
      id: e.id,
      name: e.name,
      count: e.count,
      latestDuration: e.latestDuration,
      averageDuration: e.averageDuration,
      latestCycleId: e.latestCycleId,
      reason: e.reason,
      changedInputs: e.changedInputs,
      selector: e.selector,
      wastedChecks: e.wastedChecks,
      wastedPercentage: e.wastedPercentage,
      mutationType: e.mutationType,
      cdStrategy: e.cdStrategy,
      isOnPushCandidate: e.isOnPushCandidate
    })),
    waterfall: cycle.waterfall,
    trigger: cycle.trigger,
    isZonePollution: cycle.isZonePollution
  }));

  const viewport =
    typeof window !== 'undefined'
      ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`
      : '';
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  return {
    exportedAt: new Date().toISOString(),
    url,
    viewport,
    userAgent,
    options,
    cycles: mappedCycles,
    wastedStats: wasted,
    budgetViolations: activeSessionBudgetViolations,
    leakedComponents: leaks,
    onPushCandidates,
    zonePollutionEvents: [...activeZonePollutionEvents],
    referentialInstabilityReports: refInstability
  };
}

export function setResolvedTriggerForTest(trigger: CdTriggerAttribution | undefined): void {
  activeCycleTrigger = trigger;
}

export { statsGetWastedStats as getWastedStats, statsGetLeakedComponents as getLeakedComponents, getComponentCostEntries as getComponentCostAnalysis };
