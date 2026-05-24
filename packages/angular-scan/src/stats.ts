import type { AngularRenderCycle, AngularRenderEntry, AngularScanRegisteredComponent } from './types';

interface ComponentStats extends AngularScanRegisteredComponent {
  totalDuration: number;
  totalChecks: number;
  latestDuration: number;
  latestCycleId: number;
}

let cycleId = 0;
const components = new Map<string, ComponentStats>();

export function registerComponent(component: AngularScanRegisteredComponent): void {
  const existing = components.get(component.id);
  components.set(component.id, {
    ...existing,
    ...component,
    totalDuration: existing?.totalDuration ?? 0,
    totalChecks: existing?.totalChecks ?? 0,
    latestDuration: existing?.latestDuration ?? 0,
    latestCycleId: existing?.latestCycleId ?? 0
  });
}

export function unregisterComponent(id: string): void {
  components.delete(id);
}

export function recordComponentCheck(id: string, duration: number, currentCycleId = cycleId): AngularRenderEntry | undefined {
  const stats = components.get(id);
  if (!stats || !stats.element.isConnected) {
    return undefined;
  }

  stats.totalChecks += 1;
  stats.latestDuration = Math.max(0, duration);
  stats.totalDuration += stats.latestDuration;
  stats.latestCycleId = currentCycleId;
  return toEntry(stats);
}

export function startCycle(): number {
  cycleId += 1;
  return cycleId;
}

export function finishCycle(id: number, startedAt: number, finishedAt: number): AngularRenderCycle {
  const entries = [...components.values()]
    .filter((component) => component.latestCycleId === id && component.element.isConnected)
    .map(toEntry)
    .sort((a, b) => b.latestDuration - a.latestDuration);

  return {
    id,
    startedAt,
    finishedAt,
    duration: Math.max(0, finishedAt - startedAt),
    renderedCount: entries.length,
    slowest: entries[0],
    entries
  };
}

export function resetStats(): void {
  cycleId = 0;
  components.clear();
}

function toEntry(stats: ComponentStats): AngularRenderEntry {
  return {
    id: stats.id,
    name: stats.name,
    element: stats.element,
    rect: stats.element.getBoundingClientRect(),
    count: stats.totalChecks,
    latestDuration: stats.latestDuration,
    averageDuration: stats.totalChecks === 0 ? 0 : stats.totalDuration / stats.totalChecks,
    latestCycleId: stats.latestCycleId
  };
}
