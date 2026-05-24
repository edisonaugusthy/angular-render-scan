import { AngularScanOverlay } from '../infrastructure/ui/overlay';
import { getResolvedOptions, resolveOptions, setResolvedOptions } from '../domain/options';
import { finishCycle, resetStats, startCycle } from './stats';
import type { AngularRenderCycle, AngularScanOptions } from '../domain/entities';

let overlay: AngularScanOverlay | undefined;
let activeCycleId = 0;
let activeCycleStartedAt = 0;
let lastCycle: AngularRenderCycle | undefined;
let implicitCycleScheduled = false;

export function scan(options?: AngularScanOptions): void {
  const resolved = setResolvedOptions(resolveOptions(options));
  if (!overlay && typeof document !== 'undefined') {
    overlay = new AngularScanOverlay(resolved, (enabled) => setOptions({ enabled }));
  }
  overlay?.updateOptions(resolved);
}

export function setOptions(options: Partial<AngularScanOptions>): void {
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
  lastCycle = undefined;
  activeCycleId = 0;
  activeCycleStartedAt = 0;
  implicitCycleScheduled = false;
  
  if (typeof window !== 'undefined') {
    const globalWindow = window as any;
    if (globalWindow.__ANGULAR_SCAN_APP_REF__) {
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
  const cycle = finishCycle(cycleId, activeCycleStartedAt, finishedAt);
  lastCycle = cycle;
  for (const entry of cycle.entries) {
    options.onRender?.(entry);
  }
  options.onCycleFinish?.(cycle);
  overlay?.showCycle(cycle);

  if (options.log && cycle.entries.length > 0) {
    console.groupCollapsed(`%c[angular-scan] cycle ${cycle.id} - ${cycle.duration.toFixed(2)}ms, ${cycle.renderedCount} components`, 'color: #7c3aed; font-weight: bold;');
    const tableData = cycle.entries.map((e) => ({
      Name: e.name,
      Count: e.count,
      'Time (ms)': Number(e.latestDuration.toFixed(2)),
      'Avg (ms)': Number(e.averageDuration.toFixed(2))
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
  queueMicrotask(() => {
    if (activeCycleId === cycleId) {
      endCycle(cycleId);
    }
  });
  return cycleId;
}

export function getLastCycle(): AngularRenderCycle | undefined {
  return lastCycle;
}
