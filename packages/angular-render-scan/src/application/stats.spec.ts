import { afterEach, describe, expect, it } from 'vitest';
import {
  finishCycle,
  recordComponentCheck,
  registerComponent,
  resetStats,
  startCycle,
  getWastedStats,
  getLeakedComponents,
  getComponentCostEntries,
  getRegisteredComponentEntries
} from './stats';
import { getResolvedOptions, resetOptionsForTest, setResolvedOptions } from '../domain/options';

describe('stats', () => {
  afterEach(() => {
    resetStats();
    resetOptionsForTest();
  });

  it('aggregates component timings and slowest entries', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    registerComponent({ id: 'first', name: 'FirstComponent', element: first });
    registerComponent({ id: 'second', name: 'SecondComponent', element: second });
    const cycleId = startCycle();

    recordComponentCheck('first', 1.5, cycleId);
    recordComponentCheck('second', 8.2, cycleId);
    const cycle = finishCycle(cycleId, 10, 20);

    expect(cycle.renderedCount).toBe(2);
    expect(cycle.duration).toBe(10);
    expect(cycle.slowest?.name).toBe('SecondComponent');
  });

  it('stores render reasons and changed input summaries', () => {
    const element = document.createElement('app-cart');
    document.body.append(element);
    registerComponent({ id: 'cart', name: 'CartComponent', element, selector: 'app-cart' });
    const cycleId = startCycle();

    const entry = recordComponentCheck('cart', 6, cycleId, {
      reason: 'input',
      changedInputs: [{ name: 'items', previous: 'Array(1)', current: 'Array(2)' }]
    });

    expect(entry).toMatchObject({
      reason: 'input',
      selector: 'app-cart',
      changedInputs: [{ name: 'items', previous: 'Array(1)', current: 'Array(2)' }]
    });
  });

  it('filters entries by duration, count, include, and exclude options', () => {
    const cart = document.createElement('app-cart');
    const product = document.createElement('app-product-card');
    document.body.append(cart, product);
    registerComponent({ id: 'cart', name: 'CartComponent', element: cart, selector: 'app-cart' });
    registerComponent({ id: 'product', name: 'ProductCard', element: product, selector: 'app-product-card' });
    const cycleId = startCycle();

    recordComponentCheck('cart', 8, cycleId);
    recordComponentCheck('cart', 9, cycleId);
    recordComponentCheck('product', 20, cycleId);
    setResolvedOptions({
      minDurationMs: 5,
      minRenderCount: 2,
      include: ['Cart'],
      exclude: ['Product']
    });

    const cycle = finishCycle(cycleId, 10, 20, getResolvedOptions());

    expect(cycle.entries.map((entry) => entry.name)).toEqual(['CartComponent']);
  });

  it('tracks wasted checks and percentage', () => {
    const element = document.createElement('div');
    document.body.append(element);
    registerComponent({ id: 'wasted', name: 'WastedComponent', element });
    const cycleId = startCycle();

    recordComponentCheck('wasted', 2.0, cycleId, { mutationType: 'none' });
    recordComponentCheck('wasted', 3.0, cycleId, { mutationType: 'text' });
    
    const entry = recordComponentCheck('wasted', 1.0, cycleId, { mutationType: 'none' });
    expect(entry?.wastedChecks).toBe(2);
    expect(entry?.wastedPercentage).toBe(67);
  });

  it('detects memory leaks (disconnected elements)', () => {
    const element = document.createElement('div');
    registerComponent({ id: 'leak', name: 'LeakComponent', element });
    
    const leaks = getLeakedComponents();
    expect(leaks.length).toBe(1);
    expect(leaks[0].name).toBe('LeakComponent');

    document.body.append(element);
    expect(getLeakedComponents().length).toBe(0);
  });

  it('returns connected registered components for picker hit testing', () => {
    const root = document.createElement('app-root');
    const child = document.createElement('app-child');
    root.append(child);
    document.body.append(root);

    registerComponent({ id: 'root', name: 'RootComponent', element: root, selector: 'app-root' });
    registerComponent({ id: 'child', name: 'ChildComponent', element: child, selector: 'app-child', parentId: 'root' });

    expect(getRegisteredComponentEntries().map((entry) => entry.name)).toEqual([
      'RootComponent',
      'ChildComponent'
    ]);

    child.remove();
    expect(getRegisteredComponentEntries().map((entry) => entry.name)).toEqual([
      'RootComponent'
    ]);
  });

  it('calculates component cost entries and ranks them by total duration', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    registerComponent({ id: 'first', name: 'FirstComponent', element: first });
    registerComponent({ id: 'second', name: 'SecondComponent', element: second });
    const cycleId = startCycle();

    recordComponentCheck('first', 10, cycleId);
    recordComponentCheck('second', 40, cycleId);
    finishCycle(cycleId, 10, 20);

    const costEntries = getComponentCostEntries();
    expect(costEntries).toHaveLength(2);
    expect(costEntries[0].name).toBe('SecondComponent');
    expect(costEntries[0].costPercentage).toBe(80);
    expect(costEntries[1].name).toBe('FirstComponent');
    expect(costEntries[1].costPercentage).toBe(20);
  });

  it('calculates wastedCdStats inside finishCycle', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    registerComponent({ id: 'first', name: 'FirstComponent', element: first });
    registerComponent({ id: 'second', name: 'SecondComponent', element: second });
    const cycleId = startCycle();

    recordComponentCheck('first', 10, cycleId, { mutationType: 'none' });
    recordComponentCheck('second', 20, cycleId, { mutationType: 'text' });
    const cycle = finishCycle(cycleId, 10, 20);

    expect(cycle.wastedCdStats).toBeDefined();
    expect(cycle.wastedCdStats?.checked).toBe(2);
    expect(cycle.wastedCdStats?.changed).toBe(1);
    expect(cycle.wastedCdStats?.wasteScore).toBe(50);
  });

  it('keeps cycle waste telemetry independent from display filters', () => {
    const visible = document.createElement('div');
    const filtered = document.createElement('div');
    document.body.append(visible, filtered);
    registerComponent({ id: 'visible', name: 'VisibleComponent', element: visible });
    registerComponent({ id: 'filtered', name: 'FilteredComponent', element: filtered });
    const cycleId = startCycle();

    recordComponentCheck('visible', 12, cycleId, { mutationType: 'text' });
    recordComponentCheck('filtered', 1, cycleId, { mutationType: 'none' });
    setResolvedOptions({ minDurationMs: 5 });
    const cycle = finishCycle(cycleId, 10, 20, getResolvedOptions());

    expect(cycle.entries.map(entry => entry.name)).toEqual(['VisibleComponent']);
    expect(cycle.wastedCdStats).toEqual({ checked: 2, changed: 1, wasteScore: 50 });
  });
});
