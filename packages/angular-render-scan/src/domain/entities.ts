export type AngularRenderScanAnimationSpeed = 'slow' | 'fast' | 'off';
export type AngularRenderReason = 'input' | 'event' | 'tick' | 'dom' | 'unknown';
export type AngularRenderMutationType = 'none' | 'text' | 'attribute' | 'structural';
export type AngularRenderScanDarkMode = 'auto' | 'dark' | 'light';

// ─── CD Trigger Attribution ───────────────────────────────────────────────────
/** The source that caused a change-detection cycle to fire. */
export type CdTriggerSource =
  | 'zone:click'
  | 'zone:input'
  | 'zone:keydown'
  | 'zone:keyup'
  | 'zone:submit'
  | 'zone:change'
  | 'zone:focus'
  | 'zone:blur'
  | 'zone:scroll'
  | 'zone:setTimeout'
  | 'zone:setInterval'
  | 'zone:xhr'
  | 'zone:fetch'
  | 'zone:promise'
  | 'zone:microtask'
  | 'zone:macrotask'
  | 'zone:eventTask'
  | 'signal:write'
  | 'manual:markForCheck'
  | 'manual:detectChanges'
  | 'router:navigation'
  | 'zone:unknown'
  | 'unknown';

export interface CdTriggerAttribution {
  /** Primary trigger source */
  source: CdTriggerSource;
  /** Optional detail: event type, XHR URL, timer ID, etc. */
  detail?: string;
  /** Stack frame that triggered the cycle (best-effort) */
  callSite?: string;
  /** Whether this cycle was triggered by user interaction */
  isUserInteraction: boolean;
  /** Whether this is suspected Zone pollution (async with no user action) */
  isZonePollution: boolean;
}

// ─── OnPush Candidate ─────────────────────────────────────────────────────────
export interface OnPushCandidate {
  name: string;
  selector: string;
  totalChecks: number;
  wastedChecks: number;
  wastedPercentage: number;
  /** Share of observed checks that produced no DOM mutation. This is not a verified saving. */
  opportunityPercentage: number;
  /** @deprecated Use opportunityPercentage. Kept for backwards compatibility. */
  estimatedSavingPct: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

// ─── Referential Input Stability ─────────────────────────────────────────────
export interface ReferentialInstabilityReport {
  /** Component name */
  componentName: string;
  selector: string;
  /** Input property name */
  inputName: string;
  /** Number of times a new reference was passed but value was deeply equal */
  unstableRefCount: number;
  /** Total renders of this component */
  totalRenders: number;
  /** Percentage of renders where this input was referentially unstable */
  unstableRefPct: number;
  /** Last serialized value */
  lastValue: string;
}

// ─── Zone Pollution ───────────────────────────────────────────────────────────
export interface ZonePollutionEvent {
  /** When this pollution event was detected */
  timestamp: number;
  /** Which async source caused it */
  source: CdTriggerSource;
  detail?: string;
  callSite?: string;
  /** How many components ran in the polluted cycle */
  componentCount: number;
  /** Duration of the polluted cycle in ms */
  cycleDuration: number;
}

// ─── CD Graph ─────────────────────────────────────────────────────────────────
export interface CdGraphNode {
  id: string;
  name: string;
  selector: string;
  /** parent component id (null = root) */
  parentId: string | null;
  depth: number;
  renderCount: number;
  totalDuration: number;
  wastedChecks: number;
  cdStrategy: 'OnPush' | 'Default' | 'unknown';
  isOnPushCandidate: boolean;
  lastTrigger?: CdTriggerSource;
}

export interface CdGraphEdge {
  fromId: string;
  toId: string;
  /** How many times parent triggered child render */
  triggerCount: number;
}

export interface CdGraph {
  nodes: CdGraphNode[];
  edges: CdGraphEdge[];
  /** When this snapshot was taken */
  capturedAt: number;
}

// ─── Existing types ───────────────────────────────────────────────────────────

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

export interface RenderCause {
  trigger: string;
  source?: string;
  stack?: string[];
  timestamp: number;
}

export interface SignalDependencyNode {
  id: string;
  name: string;
  kind: 'signal' | 'computed' | 'component';
  updateCount: number;
  wastedCount: number;
  value?: string;
}

export interface SignalDependencyEdge {
  fromId: string;
  toId: string;
}

export interface SignalDependencyGraph {
  nodes: SignalDependencyNode[];
  edges: SignalDependencyEdge[];
}

export interface ComponentCostEntry {
  name: string;
  selector: string;
  totalDuration: number;
  averageDuration: number;
  renderCount: number;
  costPercentage: number;
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
  /** NEW: Which input props are referentially unstable */
  unstableInputs?: ReferentialInstabilityReport[];
  /** NEW: CD strategy of this component */
  cdStrategy?: 'OnPush' | 'Default' | 'unknown';
  /** NEW: Whether this is an OnPush migration candidate */
  isOnPushCandidate?: boolean;
  /** NEW: parent component id */
  parentId?: string | null;
  /** v0.2: Render cause chain */
  renderCause?: RenderCause;
  /** v0.2: Number of renders that mutated the DOM */
  templateChanges?: number;
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
  /** NEW: What triggered this CD cycle */
  trigger?: CdTriggerAttribution;
  /** NEW: Whether this cycle is suspected Zone pollution */
  isZonePollution?: boolean;
  /** v0.2: Wasted CD Cycle Stats */
  wastedCdStats?: {
    checked: number;
    changed: number;
    wasteScore: number;
  };
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
  /** Components whose host element was disconnected when sampled. This does not prove a memory leak. */
  detachedComponents?: string[];
  /** @deprecated Use detachedComponents. */
  leakedComponents: string[];
  /** NEW */
  onPushCandidates: OnPushCandidate[];
  zonePollutionEvents: ZonePollutionEvent[];
  referentialInstabilityReports: ReferentialInstabilityReport[];
}

export type InteractionFindingKind =
  | 'budget-violation'
  | 'slow-component'
  | 'wasted-checks'
  | 'onpush-opportunity'
  | 'referential-instability'
  | 'zone-pollution'
  | 'detached-component';

export type InteractionFindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface InteractionFinding {
  kind: InteractionFindingKind;
  severity: InteractionFindingSeverity;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  title: string;
  summary: string;
  componentName?: string;
  evidence: string[];
  action: string;
}

export interface InteractionMetrics {
  cycleCount: number;
  componentCheckCount: number;
  totalCycleDuration: number;
  maxCycleDuration: number;
  wastedChecks: number;
  wastedPercentage: number;
  budgetViolationCount: number;
}

export interface InteractionReport {
  schemaVersion: 1;
  name: string;
  startedAt: string;
  finishedAt: string;
  url: string;
  viewport: string;
  metrics: InteractionMetrics;
  findings: InteractionFinding[];
  session: SessionExportData;
}

export interface InteractionMetricDelta {
  baseline: number;
  candidate: number;
  absolute: number;
  percentage: number | null;
}

export interface InteractionComparison {
  schemaVersion: 1;
  name: string;
  outcome: 'improved' | 'regressed' | 'unchanged';
  baseline: InteractionReport;
  candidate: InteractionReport;
  deltas: {
    totalCycleDuration: InteractionMetricDelta;
    maxCycleDuration: InteractionMetricDelta;
    wastedPercentage: InteractionMetricDelta;
    budgetViolationCount: InteractionMetricDelta;
  };
  regressions: string[];
}

export interface SessionCycleData {
  id: number;
  startedAt: number;
  finishedAt: number;
  duration: number;
  renderedCount: number;
  entries: SessionEntryData[];
  waterfall: WaterfallEntry[];
  trigger?: CdTriggerAttribution;
  isZonePollution?: boolean;
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
  cdStrategy?: 'OnPush' | 'Default' | 'unknown';
  isOnPushCandidate?: boolean;
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
  budgets?: AngularRenderScanBudgets;
  editorProtocol?: 'vscode' | 'webstorm' | 'cursor' | string;
  darkMode?: AngularRenderScanDarkMode;
  onCycleStart?: () => void;
  onRender?: (entry: AngularRenderEntry) => void;
  onCycleFinish?: (cycle: AngularRenderCycle) => void;
  onBudgetViolation?: (violation: BudgetViolation) => void;
  /** NEW: callback when Zone pollution is detected */
  onZonePollution?: (event: ZonePollutionEvent) => void;
  /** NEW: show CD graph panel in toolbar */
  showCdGraph?: boolean;
  /** NEW: how many Zone pollution events to retain in session */
  maxZonePollutionEvents?: number;
  /** NEW: Only track specific components by name/regex */
  trackComponents?: Array<string | RegExp>;
  /** NEW: OnPush candidate minimum wasted render % threshold (0-100) */
  onPushCandidateThreshold?: number;
  /** NEW: Enable referential input stability tracking (JSON deep-equal check) */
  trackReferentialStability?: boolean;
  /** NEW: Max depth for deep equality check in referential stability */
  referentialStabilityDepth?: number;
}

export interface AngularRenderScanResolvedOptions extends Required<Omit<AngularRenderScanOptions, 'onCycleStart' | 'onRender' | 'onCycleFinish' | 'onBudgetViolation' | 'onZonePollution' | 'theme'>> {
  theme: AngularRenderScanTheme;
  budgets: Required<AngularRenderScanBudgets>;
  onCycleStart?: () => void;
  onRender?: (entry: AngularRenderEntry) => void;
  onCycleFinish?: (cycle: AngularRenderCycle) => void;
  onBudgetViolation?: (violation: BudgetViolation) => void;
  onZonePollution?: (event: ZonePollutionEvent) => void;
}

export interface AngularRenderScanRegisteredComponent {
  id: string;
  name: string;
  element: Element;
  selector?: string;
  /** NEW */
  cdStrategy?: 'OnPush' | 'Default' | 'unknown';
  /** NEW */
  parentId?: string | null;
}

export interface AngularRenderChangedInput {
  name: string;
  previous: string;
  current: string;
  /** NEW: true when reference changed but value is deeply equal */
  isReferentiallyUnstable?: boolean;
}

export interface AngularRenderScanRenderDetails {
  reason?: AngularRenderReason;
  changedInputs?: AngularRenderChangedInput[];
  mutationType?: AngularRenderMutationType;
  /** NEW */
  parentId?: string | null;
}
