export type AngularScanAnimationSpeed = 'slow' | 'fast' | 'off';

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

export interface AngularScanOptions {
  enabled?: boolean;
  showToolbar?: boolean;
  animationSpeed?: AngularScanAnimationSpeed;
  showFPS?: boolean;
  log?: boolean;
  dangerouslyForceRunInProduction?: boolean;
  onCycleStart?: () => void;
  onRender?: (entry: AngularRenderEntry) => void;
  onCycleFinish?: (cycle: AngularRenderCycle) => void;
}

export interface AngularScanResolvedOptions extends Required<Omit<AngularScanOptions, 'onCycleStart' | 'onRender' | 'onCycleFinish'>> {
  onCycleStart?: () => void;
  onRender?: (entry: AngularRenderEntry) => void;
  onCycleFinish?: (cycle: AngularRenderCycle) => void;
}

export interface AngularScanRegisteredComponent {
  id: string;
  name: string;
  element: Element;
}
