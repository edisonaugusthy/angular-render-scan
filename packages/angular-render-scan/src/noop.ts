/**
 * Production no-op stubs.
 *
 * When the Angular build process sets NODE_ENV=production or uses
 * `isDevMode()=false`, tree-shakers (esbuild, webpack, Rollup) can eliminate
 * ALL of angular-render-scan's code because provideAngularRenderScan() already
 * returns an empty providers array in production (via the isDevMode() guard
 * in angular.ts).
 *
 * However, for consumers who want to explicitly import a guaranteed no-op
 * (e.g. in unit tests or SSR), they can import from
 * 'angular-render-scan/noop' to get these safe stubs without pulling any
 * real implementation code into the bundle.
 */
import type { EnvironmentProviders } from '@angular/core';
import type {
  AngularRenderScanOptions,
  AngularRenderCycle,
  AngularRenderEntry,
  OnPushCandidate,
  ReferentialInstabilityReport,
  SessionExportData,
  WastedStats,
  ZonePollutionEvent,
  CdGraph,
  InteractionComparison,
  InteractionReport
} from './domain/entities';

/** No-op provider for production — contributes zero bytes to output. */
export function provideAngularRenderScan(_options?: AngularRenderScanOptions): EnvironmentProviders {
  // Returns an empty providers array — Angular tree-shakes everything else.
  const { makeEnvironmentProviders } = require('@angular/core');
  return makeEnvironmentProviders([]);
}

export function scan(_options?: AngularRenderScanOptions): void {}
export function setOptions(_options: Partial<AngularRenderScanOptions>): void {}
export function getOptions(): AngularRenderScanOptions { return {}; }
export function stop(): void {}
export function getAIPrompt(): string { return ''; }
export async function copyAIPrompt(): Promise<boolean> { return false; }
export function getWastedStats(): WastedStats { return { totalChecks: 0, wastedChecks: 0, wastedPercentage: 0 }; }
export function getLeakedComponents(): AngularRenderEntry[] { return []; }
export function getDetachedComponents(): AngularRenderEntry[] { return []; }
export function getOnPushCandidates(): OnPushCandidate[] { return []; }
export function getReferentialInstability(): ReferentialInstabilityReport[] { return []; }
export function getZonePollutionEvents(): ZonePollutionEvent[] { return []; }
export function getCdGraph(): CdGraph { return { nodes: [], edges: [], capturedAt: 0 }; }
export function getSessionData(): SessionExportData {
  return {
    exportedAt: new Date().toISOString(),
    url: '',
    viewport: '',
    userAgent: '',
    options: {},
    cycles: [],
    wastedStats: { totalChecks: 0, wastedChecks: 0, wastedPercentage: 0 },
    budgetViolations: [],
    detachedComponents: [],
    leakedComponents: [],
    onPushCandidates: [],
    zonePollutionEvents: [],
    referentialInstabilityReports: []
  };
}

let interactionName = 'Captured interaction';
export function beginInteraction(name: string): void { interactionName = name || interactionName; }
export function endInteraction(): InteractionReport {
  const session = getSessionData();
  return {
    schemaVersion: 1, name: interactionName, startedAt: session.exportedAt, finishedAt: session.exportedAt,
    url: '', viewport: '', findings: [], session,
    metrics: { cycleCount: 0, componentCheckCount: 0, totalCycleDuration: 0, maxCycleDuration: 0, wastedChecks: 0, wastedPercentage: 0, budgetViolationCount: 0 }
  };
}
export function getInteractionReport(): InteractionReport | undefined { return undefined; }
export function setInteractionBaseline(_report: InteractionReport): void {}
export function compareWithInteractionBaseline(): InteractionComparison { throw new Error('[angular-render-scan] No reports exist in noop mode.'); }
export function formatInteractionReportMarkdown(_report: InteractionReport): string { return ''; }
export function formatInteractionReportHtml(_report: InteractionReport): string { return ''; }
