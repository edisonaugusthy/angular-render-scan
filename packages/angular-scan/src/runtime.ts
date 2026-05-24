import { AngularScanOverlay } from './overlay';
import { getResolvedOptions, resolveOptions, setResolvedOptions } from './options';
import { finishCycle, resetStats, startCycle } from './stats';
import type { AngularRenderCycle, AngularScanOptions } from './types';

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

  if (options.log) {
    console.info('[angular-scan] cycle', {
      id: cycle.id,
      duration: cycle.duration,
      renderedCount: cycle.renderedCount,
      slowest: cycle.slowest?.name
    });
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
