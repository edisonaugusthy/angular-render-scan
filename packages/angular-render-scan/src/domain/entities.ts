export type AngularRenderScanAnimationSpeed = 'slow' | 'fast' | 'off';
export type AngularRenderReason = 'input' | 'event' | 'tick' | 'dom' | 'unknown';

export interface AngularRenderScanTheme {
  fast: readonly [number, number, number];
  medium: readonly [number, number, number];
  slow: readonly [number, number, number];
  labelBackground: readonly [number, number, number];
  labelBackgroundSlow: readonly [number, number, number];
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
}

export interface AngularRenderCycle {
  id: number;
  startedAt: number;
  finishedAt: number;
  duration: number;
  renderedCount: number;
  slowest?: AngularRenderEntry;
  entries: AngularRenderEntry[];
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
  fastThresholdMs?: number;
  slowThresholdMs?: number;
  maxRecordedCycles?: number;
  showCopyPrompt?: boolean;
  promptContext?: string;
  theme?: Partial<AngularRenderScanTheme>;
  onCycleStart?: () => void;
  onRender?: (entry: AngularRenderEntry) => void;
  onCycleFinish?: (cycle: AngularRenderCycle) => void;
}

export interface AngularRenderScanResolvedOptions extends Required<Omit<AngularRenderScanOptions, 'onCycleStart' | 'onRender' | 'onCycleFinish' | 'theme'>> {
  theme: AngularRenderScanTheme;
  onCycleStart?: () => void;
  onRender?: (entry: AngularRenderEntry) => void;
  onCycleFinish?: (cycle: AngularRenderCycle) => void;
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
}
