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
});
