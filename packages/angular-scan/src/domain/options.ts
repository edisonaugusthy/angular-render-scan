import type { AngularScanOptions, AngularScanResolvedOptions, AngularScanTheme } from './entities';

const defaultTheme: AngularScanTheme = {
  fast: [147, 197, 253],          // blue-300
  medium: [253, 224, 71],         // yellow-300
  slow: [239, 68, 68],            // red-500
  labelBackground: [124, 58, 237],     // violet-600
  labelBackgroundSlow: [220, 38, 38],  // red-600
};

const defaultOptions: AngularScanResolvedOptions = {
  enabled: true,
  showToolbar: true,
  animationSpeed: 'fast',
  showFPS: true,
  log: false,
  dangerouslyForceRunInProduction: false,
  theme: defaultTheme
};

let options: AngularScanResolvedOptions = { ...defaultOptions };

export function resolveOptions(next?: AngularScanOptions): AngularScanResolvedOptions {
  const merged = { ...options, ...next } as AngularScanResolvedOptions;

  if (!['slow', 'fast', 'off'].includes(merged.animationSpeed)) {
    merged.animationSpeed = defaultOptions.animationSpeed;
  }

  merged.theme = { ...defaultTheme, ...(next?.theme || {}) };

  return merged;
}

export function setResolvedOptions(next: Partial<AngularScanOptions>): AngularScanResolvedOptions {
  options = resolveOptions(next);
  return options;
}

export function getResolvedOptions(): AngularScanResolvedOptions {
  return { ...options };
}

export function resetOptionsForTest(): void {
  options = { ...defaultOptions };
}
