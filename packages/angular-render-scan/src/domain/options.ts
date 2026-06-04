import type { AngularRenderScanBudgets, AngularRenderScanOptions, AngularRenderScanResolvedOptions, AngularRenderScanTheme } from './entities';

const defaultTheme: AngularRenderScanTheme = {
  fast: [147, 197, 253],          // blue-300
  medium: [253, 224, 71],         // yellow-300
  slow: [239, 68, 68],            // red-500
  labelBackground: [124, 58, 237],     // violet-600
  labelBackgroundSlow: [220, 38, 38],  // red-600
};

const defaultBudgets: Required<AngularRenderScanBudgets> = {
  warnMs: 10,
  errorMs: 30,
  maxRendersPerSecond: 20
};

const defaultOptions: AngularRenderScanResolvedOptions = {
  enabled: true,
  showToolbar: true,
  animationSpeed: 'fast',
  showFPS: true,
  log: false,
  dangerouslyForceRunInProduction: false,
  minDurationMs: 0,
  minRenderCount: 0,
  include: [],
  exclude: [],
  maxLabelCount: 20,
  maxRecordedCycles: 30,
  showCopyPrompt: true,
  promptContext: '',
  theme: defaultTheme,
  budgets: defaultBudgets,
  editorProtocol: 'vscode',
  darkMode: 'auto',
  showCdGraph: true,
  maxZonePollutionEvents: 50,
  trackComponents: [],
  onPushCandidateThreshold: 40,
  trackReferentialStability: true,
  referentialStabilityDepth: 4,
};

let options: AngularRenderScanResolvedOptions = { ...defaultOptions };

export function resolveOptions(next?: AngularRenderScanOptions): AngularRenderScanResolvedOptions {
  const merged = { ...options, ...next } as AngularRenderScanResolvedOptions;

  if (!['slow', 'fast', 'off'].includes(merged.animationSpeed)) {
    merged.animationSpeed = defaultOptions.animationSpeed;
  }

  merged.minDurationMs = normalizeNonNegative(merged.minDurationMs, defaultOptions.minDurationMs);
  merged.minRenderCount = normalizeNonNegative(merged.minRenderCount, defaultOptions.minRenderCount);
  merged.maxLabelCount = normalizePositiveInteger(merged.maxLabelCount, defaultOptions.maxLabelCount);
  merged.maxRecordedCycles = normalizePositiveInteger(merged.maxRecordedCycles, defaultOptions.maxRecordedCycles);
  merged.maxZonePollutionEvents = normalizePositiveInteger(merged.maxZonePollutionEvents, defaultOptions.maxZonePollutionEvents);
  merged.include = Array.isArray(merged.include) ? merged.include : defaultOptions.include;
  merged.exclude = Array.isArray(merged.exclude) ? merged.exclude : defaultOptions.exclude;
  merged.trackComponents = Array.isArray(merged.trackComponents) ? merged.trackComponents : defaultOptions.trackComponents;
  merged.promptContext = typeof merged.promptContext === 'string' ? merged.promptContext : defaultOptions.promptContext;
  merged.showCopyPrompt = typeof next?.showCopyPrompt === 'boolean' ? next.showCopyPrompt : options.showCopyPrompt;
  merged.showCdGraph = typeof next?.showCdGraph === 'boolean' ? next.showCdGraph : options.showCdGraph;
  merged.trackReferentialStability = typeof next?.trackReferentialStability === 'boolean' ? next.trackReferentialStability : options.trackReferentialStability;
  merged.theme = { ...options.theme, ...(next?.theme || {}) };
  merged.budgets = defaultBudgets;
  merged.editorProtocol = typeof next?.editorProtocol === 'string' ? next.editorProtocol : options.editorProtocol;
  merged.darkMode = ['auto', 'dark', 'light'].includes(next?.darkMode as string) ? next!.darkMode! : options.darkMode;
  merged.onPushCandidateThreshold = normalizeNonNegative(merged.onPushCandidateThreshold, defaultOptions.onPushCandidateThreshold);
  merged.referentialStabilityDepth = normalizePositiveInteger(merged.referentialStabilityDepth, defaultOptions.referentialStabilityDepth);

  return merged;
}

export function setResolvedOptions(next: Partial<AngularRenderScanOptions>): AngularRenderScanResolvedOptions {
  options = resolveOptions(next);
  return options;
}

export function getResolvedOptions(): AngularRenderScanResolvedOptions {
  return { ...options };
}

export function resetOptionsForTest(): void {
  options = { ...defaultOptions };
}

function normalizeNonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizePositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
