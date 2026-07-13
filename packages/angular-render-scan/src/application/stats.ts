import type {
  AngularRenderCycle,
  AngularRenderEntry,
  AngularRenderScanRegisteredComponent,
  AngularRenderScanRenderDetails,
  AngularRenderScanResolvedOptions,
  AngularRenderMutationType,
  WaterfallEntry,
  OnPushCandidate,
  ReferentialInstabilityReport,
  CdTriggerSource,
  RenderCause,
  ComponentCostEntry
} from '../domain/entities';
import { analyzeOnPushCandidates } from './onpush-analyzer';
import { getReferentialInstabilityReports, resetReferentialStability, clearReferentialStabilityStats } from './referential-stability';
import { buildCdGraph, recordParentChildRender, resetCdGraph } from './cd-graph';
import type { CdGraph } from '../domain/entities';

interface ComponentStats extends AngularRenderScanRegisteredComponent {
  totalDuration: number;
  totalChecks: number;
  latestDuration: number;
  latestCycleId: number;
  latestDetails: AngularRenderScanRenderDetails;
  wastedChecks: number;
  inputChangeCount: number;
  lastTrigger?: CdTriggerSource;
  templateChanges: number;
  renderCause?: RenderCause;
}

let cycleId = 0;
let cycleStartedAt = 0;
let activeCycleWaterfall: WaterfallEntry[] = [];
const components = new Map<string, ComponentStats>();

// Callback to resolve render cause from runtime to avoid circular dependency
let getRenderCauseCallback: ((componentName: string) => RenderCause | undefined) | null = null;

export function registerGetRenderCauseCallback(cb: (componentName: string) => RenderCause | undefined): void {
  getRenderCauseCallback = cb;
}

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
    wastedChecks: existing?.wastedChecks ?? 0,
    templateChanges: existing?.templateChanges ?? 0,
    inputChangeCount: existing?.inputChangeCount ?? 0,
    cdStrategy: component.cdStrategy ?? existing?.cdStrategy ?? 'unknown',
    parentId: component.parentId ?? existing?.parentId ?? null
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
    } catch {
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
  timing?: { startTime: number; totalDuration: number; depth: number },
  lastTrigger?: CdTriggerSource
): AngularRenderEntry | undefined {
  const stats = components.get(id);
  if (!stats || !stats.element.isConnected) {
    return undefined;
  }

  stats.totalChecks += 1;
  stats.latestDuration = Math.max(0, duration);
  stats.totalDuration += stats.latestDuration;
  stats.latestCycleId = currentCycleId;
  if (lastTrigger) stats.lastTrigger = lastTrigger;

  // Track wasted checks vs template changes
  const isWasted = details.mutationType === 'none';
  if (isWasted) {
    stats.wastedChecks += 1;
  } else {
    stats.templateChanges = (stats.templateChanges || 0) + 1;
  }

  // Resolve render cause using runtime callback
  if (getRenderCauseCallback) {
    stats.renderCause = getRenderCauseCallback(stats.name);
  }

  // Track input changes
  if (details.changedInputs && details.changedInputs.length > 0) {
    stats.inputChangeCount += 1;
  }

  // Record parent→child edge in CD graph
  if (details.parentId && details.parentId !== id) {
    recordParentChildRender(details.parentId, id);
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
    mutationType: finalMutationType,
    parentId: details.parentId ?? stats.parentId ?? null
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
  const cycleEntries = [...components.values()]
    .filter((component) => component.latestCycleId === id && component.element.isConnected)
    .map(toEntry)
    .sort((a, b) => b.latestDuration - a.latestDuration);
  const entries = cycleEntries
    .filter((entry) => shouldIncludeEntry(entry, options))
    .sort((a, b) => b.latestDuration - a.latestDuration);

  const waterfall = [...activeCycleWaterfall];

  // Filters control presentation, not the accuracy of cycle-level telemetry.
  const checked = cycleEntries.length;
  const changed = cycleEntries.filter((e) => e.mutationType !== 'none').length;
  const wasteScore = checked === 0 ? 0 : Math.round(((checked - changed) / checked) * 100);

  return {
    id,
    startedAt,
    finishedAt,
    duration: Math.max(0, finishedAt - startedAt),
    renderedCount: entries.length,
    slowest: entries[0],
    entries,
    waterfall,
    wastedCdStats: {
      checked,
      changed,
      wasteScore
    }
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
  resetReferentialStability();
  resetCdGraph();
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
    stats.templateChanges = 0;
    stats.inputChangeCount = 0;
    stats.renderCause = undefined;
  }
  for (const state of observers.values()) {
    state.lastMutation = 'none';
  }
  clearReferentialStabilityStats();
  resetCdGraph();
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
  return getDetachedComponents();
}

/** Components whose host element is currently disconnected. This alone does not prove retention. */
export function getDetachedComponents(): AngularRenderEntry[] {
  return [...components.values()]
    .filter((stats) => !stats.element.isConnected)
    .map(toEntry);
}

export function getRegisteredComponentEntries(): AngularRenderEntry[] {
  return [...components.values()]
    .filter((stats) => stats.element.isConnected)
    .map(toEntry);
}

export function getOnPushCandidates(threshold = 40): OnPushCandidate[] {
  const data = [...components.values()].map(c => ({
    id: c.id,
    name: c.name,
    selector: c.selector ?? selectorFor(c.element),
    totalChecks: c.totalChecks,
    wastedChecks: c.wastedChecks,
    totalDuration: c.totalDuration,
    cdStrategy: c.cdStrategy ?? 'unknown',
    inputChangeCount: c.inputChangeCount
  }));
  return analyzeOnPushCandidates(data, threshold);
}

export function getReferentialInstability(minUnstable = 1): ReferentialInstabilityReport[] {
  return getReferentialInstabilityReports(minUnstable);
}

export function getCdGraph(): CdGraph {
  const totalDurationAll = [...components.values()].reduce((s, c) => s + c.totalDuration, 0);
  const data = [...components.values()].map(c => {
    const wastedPct = c.totalChecks > 0 ? Math.round((c.wastedChecks / c.totalChecks) * 100) : 0;
    return {
      id: c.id,
      name: c.name,
      selector: c.selector ?? selectorFor(c.element),
      parentId: c.parentId ?? null,
      depth: 1,
      renderCount: c.totalChecks,
      totalDuration: c.totalDuration,
      wastedChecks: c.wastedChecks,
      totalChecks: c.totalChecks,
      cdStrategy: c.cdStrategy ?? 'unknown',
      isOnPushCandidate: wastedPct >= 40 && (c.cdStrategy === 'Default' || c.cdStrategy === 'unknown'),
      lastTrigger: c.lastTrigger
    };
  });
  return buildCdGraph(data);
}

export function getComponentCostEntries(): ComponentCostEntry[] {
  const totalDurationAll = [...components.values()].reduce((sum, c) => sum + c.totalDuration, 0);
  
  return [...components.values()]
    .map(c => {
      const totalDuration = c.totalDuration;
      const averageDuration = c.totalChecks === 0 ? 0 : totalDuration / c.totalChecks;
      const costPercentage = totalDurationAll === 0 ? 0 : Math.round((totalDuration / totalDurationAll) * 100);
      
      return {
        name: c.name,
        selector: c.selector ?? (c.element ? selectorFor(c.element) : ''),
        totalDuration,
        averageDuration,
        renderCount: c.totalChecks,
        costPercentage
      };
    })
    .sort((a, b) => b.totalDuration - a.totalDuration);
}

function toEntry(stats: ComponentStats): AngularRenderEntry {
  const count = stats.totalChecks;
  const wastedChecks = stats.wastedChecks || 0;
  const wastedPercentage = count === 0 ? 0 : Math.round((wastedChecks / count) * 100);
  const isOnPushCandidate = (stats.cdStrategy === 'Default' || stats.cdStrategy === 'unknown') &&
    wastedPercentage >= 40 && count >= 5;

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
    mutationType: stats.latestDetails.mutationType ?? 'none',
    cdStrategy: stats.cdStrategy ?? 'unknown',
    isOnPushCandidate,
    parentId: stats.parentId ?? null,
    renderCause: stats.renderCause,
    templateChanges: stats.templateChanges ?? 0
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
  // trackComponents filter: if specified, only include matching components
  if (options.trackComponents && options.trackComponents.length > 0 && !matchesAny(entry, options.trackComponents)) {
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
  if (!element) return '';
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const className = element.classList.length > 0 ? `.${Array.from(element.classList).slice(0, 3).join('.')}` : '';
  return `${tag}${id}${className}`;
}
