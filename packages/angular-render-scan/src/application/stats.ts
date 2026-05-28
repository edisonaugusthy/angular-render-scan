import type {
  AngularRenderCycle,
  AngularRenderEntry,
  AngularRenderScanRegisteredComponent,
  AngularRenderScanRenderDetails,
  AngularRenderScanResolvedOptions,
  AngularRenderMutationType,
  WaterfallEntry
} from '../domain/entities';

interface ComponentStats extends AngularRenderScanRegisteredComponent {
  totalDuration: number;
  totalChecks: number;
  latestDuration: number;
  latestCycleId: number;
  latestDetails: AngularRenderScanRenderDetails;
  wastedChecks: number;
}

let cycleId = 0;
let cycleStartedAt = 0;
let activeCycleWaterfall: WaterfallEntry[] = [];
const components = new Map<string, ComponentStats>();

// Track MutationObservers for connected elements to classify mutation types
const observers = new Map<string, { observer: MutationObserver, lastMutation: AngularRenderMutationType }>();

export function registerComponent(component: AngularRenderScanRegisteredComponent): void {
  const existing = components.get(component.id);
  components.set(component.id, {
    ...existing,
    ...component,
    totalDuration: existing?.totalDuration ?? 0,
    totalChecks: existing?.totalChecks ?? 0,
    latestDuration: existing?.latestDuration ?? 0,
    latestCycleId: existing?.latestCycleId ?? 0,
    latestDetails: existing?.latestDetails ?? {},
    wastedChecks: existing?.wastedChecks ?? 0
  });

  if (component.element && typeof MutationObserver !== 'undefined' && !observers.has(component.id)) {
    try {
      const state = { lastMutation: 'none' as AngularRenderMutationType } as any;
      const observer = new MutationObserver((mutations) => {
        let highest: AngularRenderMutationType = 'none';
        for (const m of mutations) {
          if (m.addedNodes.length > 0 || m.removedNodes.length > 0) {
            highest = 'structural';
            break;
          } else if (m.type === 'attributes') {
            highest = 'attribute';
          } else if (m.type === 'characterData') {
            if (highest !== 'attribute') {
              highest = 'text';
            }
          }
        }
        if (highest !== 'none') {
          state.lastMutation = highest;
        }
      });
      observer.observe(component.element, { attributes: true, characterData: true, childList: true, subtree: true });
      state.observer = observer;
      observers.set(component.id, state);
    } catch (e) {
      // Ignore observer failures in test environments
    }
  }
}

export function unregisterComponent(id: string): void {
  components.delete(id);
  const state = observers.get(id);
  if (state) {
    state.observer.disconnect();
    observers.delete(id);
  }
}

export function recordComponentCheck(
  id: string,
  duration: number,
  currentCycleId = cycleId,
  details: AngularRenderScanRenderDetails = {},
  timing?: { startTime: number; totalDuration: number; depth: number }
): AngularRenderEntry | undefined {
  const stats = components.get(id);
  if (!stats || !stats.element.isConnected) {
    return undefined;
  }

  stats.totalChecks += 1;
  stats.latestDuration = Math.max(0, duration);
  stats.totalDuration += stats.latestDuration;
  stats.latestCycleId = currentCycleId;

  // Track wasted checks
  const isWasted = details.mutationType === 'none';
  if (isWasted) {
    stats.wastedChecks += 1;
  }

  // Determine final mutation type
  const obsState = observers.get(id);
  let finalMutationType: AngularRenderMutationType = 'none';
  if (isWasted) {
    finalMutationType = 'none';
  } else {
    finalMutationType = obsState ? obsState.lastMutation : 'text';
    if (finalMutationType === 'none') {
      finalMutationType = 'text';
    }
  }

  if (obsState) {
    obsState.lastMutation = 'none'; // reset for next check
  }

  stats.latestDetails = {
    reason: details.reason ?? 'unknown',
    changedInputs: details.changedInputs?.slice(0, 6),
    mutationType: finalMutationType
  };

  // Add waterfall entry
  if (timing) {
    const startOffset = Math.max(0, timing.startTime - cycleStartedAt);
    activeCycleWaterfall.push({
      id: stats.id,
      name: stats.name,
      startOffset,
      selfDuration: duration,
      totalDuration: timing.totalDuration,
      depth: timing.depth
    });
  }

  return toEntry(stats);
}

export function startCycle(): number {
  cycleId += 1;
  cycleStartedAt = performance.now();
  activeCycleWaterfall = [];
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

  const waterfall = [...activeCycleWaterfall];

  return {
    id,
    startedAt,
    finishedAt,
    duration: Math.max(0, finishedAt - startedAt),
    renderedCount: entries.length,
    slowest: entries[0],
    entries,
    waterfall
  };
}

export function resetStats(): void {
  cycleId = 0;
  cycleStartedAt = 0;
  activeCycleWaterfall = [];
  for (const state of observers.values()) {
    state.observer.disconnect();
  }
  observers.clear();
  components.clear();
}

export function clearStats(): void {
  activeCycleWaterfall = [];
  for (const stats of components.values()) {
    stats.totalChecks = 0;
    stats.totalDuration = 0;
    stats.latestDuration = 0;
    stats.latestCycleId = 0;
    stats.latestDetails = {};
    stats.wastedChecks = 0;
  }
  for (const state of observers.values()) {
    state.lastMutation = 'none';
  }
}

export function getWastedStats(): { totalChecks: number; wastedChecks: number; wastedPercentage: number } {
  let totalChecks = 0;
  let wastedChecks = 0;
  for (const stats of components.values()) {
    totalChecks += stats.totalChecks;
    wastedChecks += stats.wastedChecks || 0;
  }
  const wastedPercentage = totalChecks === 0 ? 0 : Math.round((wastedChecks / totalChecks) * 100);
  return { totalChecks, wastedChecks, wastedPercentage };
}

export function getLeakedComponents(): AngularRenderEntry[] {
  return [...components.values()]
    .filter((stats) => !stats.element.isConnected)
    .map(toEntry);
}

function toEntry(stats: ComponentStats): AngularRenderEntry {
  const count = stats.totalChecks;
  const wastedChecks = stats.wastedChecks || 0;
  const wastedPercentage = count === 0 ? 0 : Math.round((wastedChecks / count) * 100);

  return {
    id: stats.id,
    name: stats.name,
    element: stats.element,
    rect: stats.element && stats.element.isConnected
      ? stats.element.getBoundingClientRect()
      : { left: 0, top: 0, width: 0, height: 0 } as DOMRect,
    count,
    latestDuration: stats.latestDuration,
    averageDuration: count === 0 ? 0 : stats.totalDuration / count,
    latestCycleId: stats.latestCycleId,
    reason: stats.latestDetails.reason ?? 'unknown',
    changedInputs: stats.latestDetails.changedInputs,
    selector: stats.selector ?? (stats.element ? selectorFor(stats.element) : ''),
    wastedChecks,
    wastedPercentage,
    mutationType: stats.latestDetails.mutationType ?? 'none'
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
