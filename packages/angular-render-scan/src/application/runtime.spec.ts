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
  getSignalDependencyGraph,
  recordSignalRead,
  recordSignalWrite,
  getRenderCause,
  setActiveCheckingComponent,
  setResolvedTriggerForTest
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

  it('tracks signal dependencies and builds dependency graph', () => {
    setActiveCheckingComponent('comp1', 'ProductComponent');
    recordSignalRead('productsSignal', 'signal');
    setActiveCheckingComponent(null, null);

    const graph = getSignalDependencyGraph();
    expect(graph.nodes.some(n => n.name === 'productsSignal' && n.kind === 'signal')).toBe(true);
    expect(graph.nodes.some(n => n.name === 'ProductComponent' && n.kind === 'component')).toBe(true);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toEqual({ fromId: 'productsSignal', toId: 'ProductComponent' });
  });

  it('tracks signal writes and flags wasted writes', () => {
    recordSignalWrite('productsSignal', 'set', ['frame1'], true); // wasted
    recordSignalWrite('productsSignal', 'set', ['frame2'], false); // effective

    const graph = getSignalDependencyGraph();
    const node = graph.nodes.find(n => n.name === 'productsSignal');
    expect(node).toBeDefined();
    expect(node?.updateCount).toBe(2);
    expect(node?.wastedCount).toBe(1);
  });

  it('resolves render cause correctly based on signal writes and dependency graph', () => {
    const element = document.createElement('app-product');
    document.body.append(element);
    registerComponent({ id: 'product', name: 'ProductComponent', element, selector: 'app-product' });

    // Component reads signal
    setActiveCheckingComponent('product', 'ProductComponent');
    recordSignalRead('productsSignal', 'signal');
    setActiveCheckingComponent(null, null);

    // Write to signal
    recordSignalWrite('productsSignal', 'set', ['frame1'], false);

    // CD cycle triggered by signal:write
    const mockTrigger = { source: 'signal:write' as const, detail: '', callSite: '', isUserInteraction: false, isZonePollution: false };
    
    // Simulate beginCycle and record Component check
    const cycleId = beginCycle();
    // Overwrite the resolved activeCycleTrigger since Zone hook isn't loaded
    setResolvedTriggerForTest(mockTrigger);
    
    const entry = recordComponentCheck('product', 5.0, cycleId);
    endCycle(cycleId);

    expect(entry).toBeDefined();
    expect(entry?.renderCause).toBeDefined();
    expect(entry?.renderCause?.trigger).toBe('signal:write');
    expect(entry?.renderCause?.source).toBe('productsSignal');
    expect(entry?.renderCause?.stack).toEqual(['frame1']);

    const cause = getRenderCause('ProductComponent');
    expect(cause).toBeDefined();
    expect(cause?.source).toBe('productsSignal');
  });
});
