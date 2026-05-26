export {
  copyAIPrompt,
  getAIPrompt,
  getOptions,
  scan,
  setOptions,
  stop,
} from './application/runtime';
export { AngularRenderScanMarkDirective, ANGULAR_RENDER_SCAN_OPTIONS, provideAngularRenderScan, restoreApplicationRef } from './infrastructure/angular/angular';
export type { AngularRenderChangedInput, AngularRenderCycle, AngularRenderEntry, AngularRenderReason, AngularRenderScanOptions } from './domain/entities';
