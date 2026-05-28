import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOptionsForTest, setResolvedOptions } from '../domain/options';
import { recordComponentCheck, registerComponent, resetStats } from './stats';
import {
  beginCycle,
  clearRecording,
  copyAIPrompt,
  endCycle,
  getAIPrompt,
  getRecording,
  stop,
} from './runtime';

describe('runtime diagnostics', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    stop();
    resetStats();
    clearRecording();
    resetOptionsForTest();
    vi.restoreAllMocks();
  });

  it('keeps recent cycles and builds a self-contained AI-ready performance prompt', () => {
    setResolvedOptions({ promptContext: 'Angular signals storefront' });
    const element = document.createElement('app-cart');
    document.body.append(element);
    registerComponent({ id: 'cart', name: 'CartComponent', element, selector: 'app-cart' });

    const cycleId = beginCycle();
    recordComponentCheck('cart', 18, cycleId, {
      reason: 'input',
      changedInputs: [{ name: 'items', previous: 'Array(1)', current: 'Array(2)' }]
    });
    endCycle(cycleId);

    expect(getRecording()).toHaveLength(1);
    expect(getAIPrompt(55)).toContain('Angular signals storefront');
    expect(getAIPrompt(55)).toContain('Environment:');
    expect(getAIPrompt(55)).toContain('Recent cycle history:');
    expect(getAIPrompt(55)).toContain('Slow/error component issues to fix:');
    expect(getAIPrompt(55)).toContain('CartComponent');
    expect(getAIPrompt(55)).toContain('selector app-cart');
    expect(getAIPrompt(55)).toContain('Cost: 18.0ms in latest cycle');
    expect(getAIPrompt(55)).toContain('Changed inputs: items Array(1) -> Array(2)');
    expect(getAIPrompt(55)).toContain('FPS: 55');
  });

  it('returns an empty prompt when there is no render data', () => {
    expect(getAIPrompt()).toBe('');
  });

  it('reports copy failure when clipboard is unavailable or there is no data', async () => {
    await expect(copyAIPrompt()).resolves.toBe(false);
  });

  it('keeps recent cycles without requiring recording to be enabled', () => {
    const element = document.createElement('app-product');
    document.body.append(element);
    registerComponent({ id: 'product', name: 'ProductComponent', element, selector: 'app-product' });

    const cycleId = beginCycle();
    recordComponentCheck('product', 12, cycleId);
    endCycle(cycleId);

    expect(getRecording()).toHaveLength(1);
  });
});
