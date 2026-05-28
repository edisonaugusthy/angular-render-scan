import { afterEach, describe, expect, it } from 'vitest';
import { getSessionData, beginCycle, endCycle, stop } from './runtime';
import { registerComponent, resetStats, recordComponentCheck } from './stats';
import { setResolvedOptions, resetOptionsForTest } from '../domain/options';

describe('session export', () => {
  afterEach(() => {
    stop();
    resetStats();
    resetOptionsForTest();
  });

  it('serializes session data safely without DOM elements', () => {
    const element = document.createElement('div');
    document.body.append(element);
    registerComponent({ id: 'export-test', name: 'ExportTestComponent', element });

    setResolvedOptions({
      enabled: true,
      maxRecordedCycles: 10
    });

    const cycleId = beginCycle();
    recordComponentCheck('export-test', 15.0, cycleId);
    const cycle = endCycle(cycleId);

    const session = getSessionData();

    expect(session).toBeDefined();
    expect(session.exportedAt).toBeDefined();
    expect(session.options).toBeDefined();
    expect(session.cycles.length).toBeGreaterThan(0);
    expect(session.wastedStats).toMatchObject({
      totalChecks: 1,
      wastedChecks: 0,
      wastedPercentage: 0
    });

    // Verify entries are fully mapped and contain no raw DOM elements
    const sessionCycle = session.cycles[0];
    expect(sessionCycle.entries.length).toBe(1);
    const entry = sessionCycle.entries[0];
    expect(entry.name).toBe('ExportTestComponent');
    expect((entry as any).element).toBeUndefined(); // Crucial! Must not have DOM reference

    // Verify budget violations were recorded
    expect(session.budgetViolations.length).toBe(1);
    expect(session.budgetViolations[0]).toMatchObject({
      componentName: 'ExportTestComponent',
      type: 'warn',
      budget: 10
    });
  });
});
