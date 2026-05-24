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
  theme: defaultTheme
};

let options: AngularRenderScanResolvedOptions = { ...defaultOptions };

export function resolveOptions(next?: AngularRenderScanOptions): AngularRenderScanResolvedOptions {
  const merged = { ...options, ...next } as AngularRenderScanResolvedOptions;

  if (!['slow', 'fast', 'off'].includes(merged.animationSpeed)) {
    merged.animationSpeed = defaultOptions.animationSpeed;
  }

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
