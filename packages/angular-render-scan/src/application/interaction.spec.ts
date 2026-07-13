import { describe, expect, it } from 'vitest';
import type { SessionExportData } from '../domain/entities';
import {
  compareInteractionReports,
  createInteractionReport,
  formatInteractionReportHtml,
  formatInteractionReportMarkdown
} from './interaction';

function session(duration = 12, wasted = false): SessionExportData {
  return {
    exportedAt: '2026-07-13T12:00:01.000Z', url: 'https://example.test/products', viewport: '1280x720 @1x', userAgent: 'test', options: {},
    cycles: [{
      id: 1, startedAt: 0, finishedAt: duration, duration, renderedCount: 1, waterfall: [],
      entries: [{ id: 'product', name: 'ProductCard', count: 4, latestDuration: duration, averageDuration: duration, latestCycleId: 1, wastedChecks: wasted ? 4 : 0, wastedPercentage: wasted ? 100 : 0, mutationType: wasted ? 'none' : 'text', cdStrategy: 'Default' }]
    }],
    wastedStats: { totalChecks: 4, wastedChecks: wasted ? 4 : 0, wastedPercentage: wasted ? 100 : 0 },
    budgetViolations: [], detachedComponents: ['OldDialog'], leakedComponents: ['OldDialog'],
    onPushCandidates: wasted ? [{ name: 'ProductCard', selector: 'app-product', totalChecks: 10, wastedChecks: 8, wastedPercentage: 80, opportunityPercentage: 80, estimatedSavingPct: 80, confidence: 'high', reason: 'Observed opportunity.' }] : [],
    zonePollutionEvents: [], referentialInstabilityReports: []
  };
}

describe('interaction reports', () => {
  it('ranks evidence and uses cautious detached and OnPush language', () => {
    const report = createInteractionReport('Add to cart', session(18, true));
    expect(report.metrics.cycleCount).toBe(1);
    expect(report.metrics.componentCheckCount).toBe(1);
    expect(report.findings[0].kind).toBe('slow-component');
    expect(report.findings.find((item) => item.kind === 'detached-component')?.summary).toContain('not proof');
    expect(report.findings.find((item) => item.kind === 'onpush-opportunity')?.evidence[0]).toContain('observed');
  });

  it('flags material before/after regressions', () => {
    const baseline = createInteractionReport('Checkout', session(10));
    const candidate = createInteractionReport('Checkout', session(14));
    const comparison = compareInteractionReports(baseline, candidate);
    expect(comparison.outcome).toBe('regressed');
    expect(comparison.regressions[0]).toContain('Total cycle time increased');
  });

  it('formats portable Markdown and self-contained HTML', () => {
    const report = createInteractionReport('Search', session());
    expect(formatInteractionReportMarkdown(report)).toContain('# Angular Render Scan: Search');
    expect(formatInteractionReportHtml(report)).toContain('<!doctype html>');
    expect(formatInteractionReportHtml(report)).toContain('CPU and FPS are context only');
  });
});
