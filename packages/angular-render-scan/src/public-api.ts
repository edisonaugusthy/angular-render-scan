export {
  copyAIPrompt,
  getAIPrompt,
  getOptions,
  scan,
  setOptions,
  stop,
  getSessionData,
  getWastedStats,
  getLeakedComponents
} from './application/runtime';
export { AngularRenderScanMarkDirective, ANGULAR_RENDER_SCAN_OPTIONS, provideAngularRenderScan, restoreApplicationRef } from './infrastructure/angular/angular';
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
  AngularRenderMutationType
} from './domain/entities';
export { startRenderAudit } from './testing';
export type { RenderAuditReport, RenderAuditSession } from './testing';
