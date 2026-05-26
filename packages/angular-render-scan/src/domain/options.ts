import type { AngularRenderScanOptions, AngularRenderScanResolvedOptions, AngularRenderScanTheme } from './entities';

const defaultTheme: AngularRenderScanTheme = {
  fast: [147, 197, 253],          // blue-300
  medium: [253, 224, 71],         // yellow-300
  slow: [239, 68, 68],            // red-500
  labelBackground: [124, 58, 237],     // violet-600
  labelBackgroundSlow: [220, 38, 38],  // red-600
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
  fastThresholdMs: 5,
  slowThresholdMs: 15,
  maxRecordedCycles: 30,
  showCopyPrompt: true,
  promptContext: '',
  theme: defaultTheme
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
  merged.fastThresholdMs = normalizeNonNegative(merged.fastThresholdMs, defaultOptions.fastThresholdMs);
  merged.slowThresholdMs = normalizeNonNegative(merged.slowThresholdMs, defaultOptions.slowThresholdMs);
  if (merged.slowThresholdMs < merged.fastThresholdMs) {
    merged.slowThresholdMs = defaultOptions.slowThresholdMs;
  }
  merged.maxRecordedCycles = normalizePositiveInteger(merged.maxRecordedCycles, defaultOptions.maxRecordedCycles);
  merged.include = Array.isArray(merged.include) ? merged.include : defaultOptions.include;
  merged.exclude = Array.isArray(merged.exclude) ? merged.exclude : defaultOptions.exclude;
  merged.promptContext = typeof merged.promptContext === 'string' ? merged.promptContext : defaultOptions.promptContext;
  merged.theme = { ...defaultTheme, ...(next?.theme || {}) };

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
