import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResolvedOptions, resetOptionsForTest, setResolvedOptions } from './options';

describe('options', () => {
  afterEach(() => {
    resetOptionsForTest();
    vi.unstubAllGlobals();
  });

  it('merges partial options with defaults', () => {
    setResolvedOptions({ enabled: false, log: true });

    expect(getResolvedOptions()).toMatchObject({
      enabled: false,
      showToolbar: true,
      animationSpeed: 'fast',
      showFPS: true,
      log: true
    });
  });

  it('falls back when animation speed is invalid', () => {
    setResolvedOptions({ animationSpeed: 'turbo' as never });

    expect(getResolvedOptions().animationSpeed).toBe('fast');
  });

  it('resolves developer-life diagnostic options', () => {
    setResolvedOptions({
      minDurationMs: 2,
      minRenderCount: 3,
      include: ['Cart'],
      exclude: [/Legacy/],
      maxLabelCount: 5,
      maxRecordedCycles: 10,
      showCopyPrompt: false,
      promptContext: 'signals app'
    });

    expect(getResolvedOptions()).toMatchObject({
      minDurationMs: 2,
      minRenderCount: 3,
      include: ['Cart'],
      maxLabelCount: 5,
      maxRecordedCycles: 10,
      showCopyPrompt: false,
      promptContext: 'signals app'
    });
  });

  it('normalizes invalid diagnostic numbers', () => {
    setResolvedOptions({
      minDurationMs: -1,
      minRenderCount: Number.NaN,
      maxLabelCount: 0,
      maxRecordedCycles: -1
    });

    expect(getResolvedOptions()).toMatchObject({
      minDurationMs: 0,
      minRenderCount: 0,
      maxLabelCount: 20,
      maxRecordedCycles: 30
    });
  });

  it('validates budget, editorProtocol and darkMode options', () => {
    setResolvedOptions({
      editorProtocol: 'cursor',
      darkMode: 'dark'
    });

    const resolved = getResolvedOptions();
    expect(resolved.budgets).toMatchObject({
      warnMs: 10,
      errorMs: 30,
      maxRendersPerSecond: 20
    });
    expect(resolved.editorProtocol).toBe('cursor');
    expect(resolved.darkMode).toBe('dark');
  });

  it('persists enabled state and reuses it as the next default', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });

    setResolvedOptions({ enabled: false });
    expect(globalThis.localStorage.getItem('angular-render-scan:enabled')).toBe('false');

    setResolvedOptions({ enabled: true });
    globalThis.localStorage.setItem('angular-render-scan:enabled', 'false');
    setResolvedOptions({ log: true });

    expect(getResolvedOptions().enabled).toBe(false);
  });
});
