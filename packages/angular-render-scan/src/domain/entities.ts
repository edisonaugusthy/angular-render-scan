export type AngularRenderScanAnimationSpeed = 'slow' | 'fast' | 'off';
export type AngularRenderReason = 'input' | 'event' | 'tick' | 'dom' | 'unknown';
export type AngularRenderMutationType = 'none' | 'text' | 'attribute' | 'structural';
export type AngularRenderScanDarkMode = 'auto' | 'dark' | 'light';

export interface AngularRenderScanTheme {
  fast: readonly [number, number, number];
  medium: readonly [number, number, number];
  slow: readonly [number, number, number];
  labelBackground: readonly [number, number, number];
  labelBackgroundSlow: readonly [number, number, number];
}

export interface AngularRenderScanBudgets {
  warnMs?: number;
  errorMs?: number;
  maxRendersPerSecond?: number;
}

export interface AngularRenderEntry {
  id: string;
  name: string;
  element: Element;
  rect: DOMRect;
  count: number;
  latestDuration: number;
  averageDuration: number;
  latestCycleId: number;
  reason?: AngularRenderReason;
  changedInputs?: AngularRenderChangedInput[];
  selector?: string;
  wastedChecks: number;
  wastedPercentage: number;
  mutationType?: AngularRenderMutationType;
}

export interface AngularRenderCycle {
  id: number;
  startedAt: number;
  finishedAt: number;
  duration: number;
  renderedCount: number;
  slowest?: AngularRenderEntry;
  entries: AngularRenderEntry[];
  waterfall: WaterfallEntry[];
}

export interface WaterfallEntry {
  id: string;
  name: string;
  startOffset: number;
  selfDuration: number;
  totalDuration: number;
  depth: number;
}

export interface BudgetViolation {
  componentName: string;
  selector: string;
  type: 'warn' | 'error' | 'render-rate';
  actual: number;
  budget: number;
  message: string;
  timestamp: number;
}

export interface SessionExportData {
  exportedAt: string;
  url: string;
  viewport: string;
  userAgent: string;
  options: Partial<AngularRenderScanOptions>;
  cycles: SessionCycleData[];
  wastedStats: WastedStats;
  budgetViolations: BudgetViolation[];
  leakedComponents: string[];
}

export interface SessionCycleData {
  id: number;
  startedAt: number;
  finishedAt: number;
  duration: number;
  renderedCount: number;
  entries: SessionEntryData[];
  waterfall: WaterfallEntry[];
}

export interface SessionEntryData {
  id: string;
  name: string;
  count: number;
  latestDuration: number;
  averageDuration: number;
  latestCycleId: number;
  reason?: AngularRenderReason;
  changedInputs?: AngularRenderChangedInput[];
  selector?: string;
  wastedChecks: number;
  wastedPercentage: number;
  mutationType?: AngularRenderMutationType;
}

export interface WastedStats {
  totalChecks: number;
  wastedChecks: number;
  wastedPercentage: number;
}

export interface AngularRenderScanOptions {
  enabled?: boolean;
  showToolbar?: boolean;
  animationSpeed?: AngularRenderScanAnimationSpeed;
  showFPS?: boolean;
  log?: boolean;
  dangerouslyForceRunInProduction?: boolean;
  minDurationMs?: number;
  minRenderCount?: number;
  include?: Array<string | RegExp>;
  exclude?: Array<string | RegExp>;
  maxLabelCount?: number;
  maxRecordedCycles?: number;
  showCopyPrompt?: boolean;
  promptContext?: string;
  theme?: Partial<AngularRenderScanTheme>;
  editorProtocol?: 'vscode' | 'webstorm' | 'cursor' | string;
  darkMode?: AngularRenderScanDarkMode;
  onCycleStart?: () => void;
  onRender?: (entry: AngularRenderEntry) => void;
  onCycleFinish?: (cycle: AngularRenderCycle) => void;
  onBudgetViolation?: (violation: BudgetViolation) => void;
}

export interface AngularRenderScanResolvedOptions extends Required<Omit<AngularRenderScanOptions, 'onCycleStart' | 'onRender' | 'onCycleFinish' | 'onBudgetViolation' | 'theme'>> {
  theme: AngularRenderScanTheme;
  budgets: Required<AngularRenderScanBudgets>;
  onCycleStart?: () => void;
  onRender?: (entry: AngularRenderEntry) => void;
  onCycleFinish?: (cycle: AngularRenderCycle) => void;
  onBudgetViolation?: (violation: BudgetViolation) => void;
}

export interface AngularRenderScanRegisteredComponent {
  id: string;
  name: string;
  element: Element;
  selector?: string;
}

export interface AngularRenderChangedInput {
  name: string;
  previous: string;
  current: string;
}

export interface AngularRenderScanRenderDetails {
  reason?: AngularRenderReason;
  changedInputs?: AngularRenderChangedInput[];
  mutationType?: AngularRenderMutationType;
}
