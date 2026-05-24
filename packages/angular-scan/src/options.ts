import type { AngularScanOptions, AngularScanResolvedOptions } from './types';

const defaultOptions: AngularScanResolvedOptions = {
  enabled: true,
  showToolbar: true,
  animationSpeed: 'fast',
  showFPS: true,
  log: false,
  dangerouslyForceRunInProduction: false
};

let options: AngularScanResolvedOptions = { ...defaultOptions };

export function resolveOptions(next?: AngularScanOptions): AngularScanResolvedOptions {
  const merged = { ...options, ...next };

  if (!['slow', 'fast', 'off'].includes(merged.animationSpeed)) {
    merged.animationSpeed = defaultOptions.animationSpeed;
  }

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
