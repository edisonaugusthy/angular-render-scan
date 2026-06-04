export {
  copyAIPrompt,
  getAIPrompt,
  getOptions,
  scan,
  setOptions,
  stop,
  getSessionData,
  getWastedStats,
  getLeakedComponents,
  getOnPushCandidates,
  getReferentialInstability,
  getZonePollutionEvents,
  getCdGraph
} from './application/runtime';
export {
  AngularRenderScanMarkDirective,
  ANGULAR_RENDER_SCAN_OPTIONS,
  provideAngularRenderScan,
  restoreApplicationRef
} from './infrastructure/angular/angular';
export type {
  AngularRenderChangedInput,
  AngularRenderCycle,
  AngularRenderEntry,
  AngularRenderReason,
  AngularRenderScanOptions,
  AngularRenderScanBudgets,
  BudgetViolation,
  SessionExportData,
  WaterfallEntry,
  WastedStats,
  AngularRenderMutationType,
  CdTriggerAttribution,
  CdTriggerSource,
  OnPushCandidate,
  ReferentialInstabilityReport,
  ZonePollutionEvent,
  ZonePollutionEvent as ZonePollutionEventType,
  CdGraph,
  CdGraphNode,
  CdGraphEdge
} from './domain/entities';
export { startRenderAudit } from './testing';
export type { RenderAuditReport, RenderAuditSession } from './testing';
