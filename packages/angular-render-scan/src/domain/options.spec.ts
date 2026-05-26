import { afterEach, describe, expect, it } from 'vitest';
import { getResolvedOptions, resetOptionsForTest, setResolvedOptions } from './options';

describe('options', () => {
  afterEach(() => resetOptionsForTest());

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
      fastThresholdMs: 4,
      slowThresholdMs: 12,
      maxRecordedCycles: 10,
      showCopyPrompt: false,
      promptContext: 'signals app'
    });

    expect(getResolvedOptions()).toMatchObject({
      minDurationMs: 2,
      minRenderCount: 3,
      include: ['Cart'],
      maxLabelCount: 5,
      fastThresholdMs: 4,
      slowThresholdMs: 12,
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
      fastThresholdMs: 20,
      slowThresholdMs: 10,
      maxRecordedCycles: -1
    });

    expect(getResolvedOptions()).toMatchObject({
      minDurationMs: 0,
      minRenderCount: 0,
      maxLabelCount: 20,
      fastThresholdMs: 20,
      slowThresholdMs: 15,
      maxRecordedCycles: 30
    });
  });
});
