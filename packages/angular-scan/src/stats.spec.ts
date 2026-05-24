import { afterEach, describe, expect, it } from 'vitest';
import { finishCycle, recordComponentCheck, registerComponent, resetStats, startCycle } from './stats';

describe('stats', () => {
  afterEach(() => resetStats());

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
});
