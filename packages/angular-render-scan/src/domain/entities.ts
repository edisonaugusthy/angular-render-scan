export type AngularRenderScanAnimationSpeed = 'slow' | 'fast' | 'off';

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
}
