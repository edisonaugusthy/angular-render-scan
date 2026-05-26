import type {
  AngularRenderCycle,
  AngularRenderEntry,
  AngularRenderScanRegisteredComponent,
  AngularRenderScanRenderDetails,
  AngularRenderScanResolvedOptions
} from '../domain/entities';

interface ComponentStats extends AngularRenderScanRegisteredComponent {
  totalDuration: number;
  totalChecks: number;
  latestDuration: number;
  latestCycleId: number;
  latestDetails: AngularRenderScanRenderDetails;
}

let cycleId = 0;
const components = new Map<string, ComponentStats>();

export function registerComponent(component: AngularRenderScanRegisteredComponent): void {
  const existing = components.get(component.id);
  components.set(component.id, {
    ...existing,
    ...component,
    totalDuration: existing?.totalDuration ?? 0,
    totalChecks: existing?.totalChecks ?? 0,
    latestDuration: existing?.latestDuration ?? 0,
    latestCycleId: existing?.latestCycleId ?? 0,
    latestDetails: existing?.latestDetails ?? {}
  });
}

export function unregisterComponent(id: string): void {
  components.delete(id);
}

export function recordComponentCheck(
  id: string,
  duration: number,
  currentCycleId = cycleId,
  details: AngularRenderScanRenderDetails = {}
): AngularRenderEntry | undefined {
  const stats = components.get(id);
  if (!stats || !stats.element.isConnected) {
    return undefined;
  }

  stats.totalChecks += 1;
  stats.latestDuration = Math.max(0, duration);
  stats.totalDuration += stats.latestDuration;
  stats.latestCycleId = currentCycleId;
  stats.latestDetails = {
    reason: details.reason ?? 'unknown',
    changedInputs: details.changedInputs?.slice(0, 6)
  };
  return toEntry(stats);
}

export function startCycle(): number {
  cycleId += 1;
  return cycleId;
}

export function finishCycle(
  id: number,
  startedAt: number,
  finishedAt: number,
  options?: AngularRenderScanResolvedOptions
): AngularRenderCycle {
  const entries = [...components.values()]
    .filter((component) => component.latestCycleId === id && component.element.isConnected)
    .map(toEntry)
    .filter((entry) => shouldIncludeEntry(entry, options))
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

export function clearStats(): void {
  for (const stats of components.values()) {
    stats.totalChecks = 0;
    stats.totalDuration = 0;
    stats.latestDuration = 0;
    stats.latestCycleId = 0;
    stats.latestDetails = {};
  }
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
    latestCycleId: stats.latestCycleId,
    reason: stats.latestDetails.reason ?? 'unknown',
    changedInputs: stats.latestDetails.changedInputs,
    selector: stats.selector ?? selectorFor(stats.element)
  };
}

function shouldIncludeEntry(entry: AngularRenderEntry, options?: AngularRenderScanResolvedOptions): boolean {
  if (!options) {
    return true;
  }

  if (entry.latestDuration < options.minDurationMs) {
    return false;
  }
  if (entry.count < options.minRenderCount) {
    return false;
  }
  if (options.include.length > 0 && !matchesAny(entry, options.include)) {
    return false;
  }
  if (options.exclude.length > 0 && matchesAny(entry, options.exclude)) {
    return false;
  }

  return true;
}

function matchesAny(entry: AngularRenderEntry, patterns: Array<string | RegExp>): boolean {
  const haystack = `${entry.name} ${entry.selector ?? ''}`;
  return patterns.some((pattern) => {
    if (typeof pattern === 'string') {
      return haystack.includes(pattern);
    }
    pattern.lastIndex = 0;
    return pattern.test(haystack);
  });
}

function selectorFor(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const className = element.classList.length > 0 ? `.${Array.from(element.classList).slice(0, 3).join('.')}` : '';
  return `${tag}${id}${className}`;
}
