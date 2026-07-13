import type {
  InteractionComparison,
  InteractionFinding,
  InteractionMetricDelta,
  InteractionMetrics,
  InteractionReport,
  SessionCycleData,
  SessionExportData
} from '../domain/entities';

const severityScore = { critical: 4, high: 3, medium: 2, low: 1 } as const;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function metricsFor(session: SessionExportData): InteractionMetrics {
  const entries = session.cycles.flatMap((cycle) => cycle.entries);
  // Session entry counters are cumulative; one entry represents one observed check in a cycle.
  const totalChecks = entries.length;
  const wastedChecks = entries.filter((entry) => entry.mutationType === 'none').length;
  const totalCycleDuration = session.cycles.reduce((sum, cycle) => sum + cycle.duration, 0);
  return {
    cycleCount: session.cycles.length,
    componentCheckCount: totalChecks,
    totalCycleDuration: round(totalCycleDuration),
    maxCycleDuration: round(Math.max(0, ...session.cycles.map((cycle) => cycle.duration))),
    wastedChecks,
    wastedPercentage: totalChecks === 0 ? 0 : Math.round((wastedChecks / totalChecks) * 100),
    budgetViolationCount: session.budgetViolations.length
  };
}

function finding(input: Omit<InteractionFinding, 'score'>): InteractionFinding {
  const confidence = { high: 3, medium: 2, low: 1 }[input.confidence];
  return { ...input, score: severityScore[input.severity] * 100 + confidence * 10 };
}

function rankedFindings(session: SessionExportData, metrics: InteractionMetrics): InteractionFinding[] {
  const findings: InteractionFinding[] = [];
  for (const violation of session.budgetViolations) {
    findings.push(finding({
      kind: 'budget-violation',
      severity: violation.type === 'error' || violation.type === 'render-rate' ? 'critical' : 'high',
      confidence: 'high',
      title: `${violation.componentName} exceeded a configured budget`,
      summary: violation.message,
      componentName: violation.componentName,
      evidence: [`Observed ${round(violation.actual)}; budget ${round(violation.budget)}`, `Selector: ${violation.selector || 'not captured'}`],
      action: 'Profile this component in the captured interaction and reduce the measured work or revise the explicit budget.'
    }));
  }

  const latestByComponent = new Map<string, SessionCycleData['entries'][number]>();
  for (const entry of session.cycles.flatMap((cycle) => cycle.entries)) {
    const current = latestByComponent.get(entry.name);
    if (!current || entry.latestDuration > current.latestDuration) latestByComponent.set(entry.name, entry);
  }
  for (const entry of [...latestByComponent.values()].sort((a, b) => b.latestDuration - a.latestDuration).slice(0, 3)) {
    if (entry.latestDuration < 8) continue;
    findings.push(finding({
      kind: 'slow-component', severity: entry.latestDuration >= 16 ? 'high' : 'medium', confidence: 'high',
      title: `${entry.name} was expensive in this interaction`,
      summary: `Its slowest observed check took ${round(entry.latestDuration)}ms.`, componentName: entry.name,
      evidence: [`Average ${round(entry.averageDuration)}ms`, `Observed count ${entry.count}`, `Trigger: ${entry.reason ?? 'unknown'}`],
      action: 'Measure the component template and synchronous work, apply one change, then recapture the same interaction.'
    }));
  }

  if (metrics.wastedPercentage >= 30) {
    findings.push(finding({
      kind: 'wasted-checks', severity: metrics.wastedPercentage >= 70 ? 'high' : 'medium', confidence: 'medium',
      title: 'Many observed checks produced no DOM mutation',
      summary: `${metrics.wastedPercentage}% of checks in this capture had no observed DOM mutation.`,
      evidence: [`${metrics.wastedChecks} checks classified as no-mutation`, `${metrics.componentCheckCount} component checks observed`],
      action: 'Rank the affected components, then verify whether stable inputs, signals, or OnPush reduce checks without changing behavior.'
    }));
  }

  for (const candidate of session.onPushCandidates.slice(0, 3)) {
    findings.push(finding({
      kind: 'onpush-opportunity', severity: candidate.opportunityPercentage >= 70 ? 'medium' : 'low', confidence: candidate.confidence,
      title: `${candidate.name} is an OnPush experiment candidate`, summary: candidate.reason, componentName: candidate.name,
      evidence: [`${candidate.opportunityPercentage}% observed no-mutation check share`, `${candidate.totalChecks} checks sampled`],
      action: 'Try OnPush in a candidate branch and use a before/after interaction comparison to verify the result.'
    }));
  }

  for (const report of session.referentialInstabilityReports.slice(0, 3)) {
    findings.push(finding({
      kind: 'referential-instability', severity: report.unstableRefPct >= 60 ? 'high' : 'medium', confidence: 'medium',
      title: `${report.componentName}.${report.inputName} repeatedly changed reference`,
      summary: 'A new reference was observed with a deeply equal sampled value.', componentName: report.componentName,
      evidence: [`${report.unstableRefCount} unstable references`, `${report.unstableRefPct}% of sampled renders`],
      action: 'Stabilize the input value at its producer and recapture to confirm fewer checks.'
    }));
  }

  if (session.zonePollutionEvents.length) {
    findings.push(finding({
      kind: 'zone-pollution', severity: 'medium', confidence: 'medium', title: 'Async work triggered change detection without a nearby user event',
      summary: 'This applies to Zone-based Angular applications; modern zoneless applications should ignore this finding.',
      evidence: [`${session.zonePollutionEvents.length} suspected cycles`, ...session.zonePollutionEvents.slice(0, 2).map((event) => `${event.source}: ${round(event.cycleDuration)}ms`)],
      action: 'If this app uses Zone.js, move noisy async work outside Angular or reduce its frequency, then compare the interaction again.'
    }));
  }

  for (const name of session.detachedComponents ?? session.leakedComponents ?? []) {
    findings.push(finding({
      kind: 'detached-component', severity: 'low', confidence: 'low', title: `${name} had a disconnected host element`,
      summary: 'A disconnected element was observed. This is not proof that the component is retained or leaking memory.', componentName: name,
      evidence: ['Host element was disconnected when sampled'],
      action: 'Confirm retention with heap snapshots or allocation profiling before treating this as a memory leak.'
    }));
  }
  return findings.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function createInteractionReport(name: string, session: SessionExportData, startedAt?: string): InteractionReport {
  const metrics = metricsFor(session);
  return {
    schemaVersion: 1, name: name.trim() || 'Captured interaction',
    startedAt: startedAt ?? session.exportedAt, finishedAt: session.exportedAt,
    url: session.url, viewport: session.viewport, metrics,
    findings: rankedFindings(session, metrics), session
  };
}

function delta(baseline: number, candidate: number): InteractionMetricDelta {
  return { baseline, candidate, absolute: round(candidate - baseline), percentage: baseline === 0 ? null : round(((candidate - baseline) / baseline) * 100) };
}

export function compareInteractionReports(baseline: InteractionReport, candidate: InteractionReport): InteractionComparison {
  const deltas = {
    totalCycleDuration: delta(baseline.metrics.totalCycleDuration, candidate.metrics.totalCycleDuration),
    maxCycleDuration: delta(baseline.metrics.maxCycleDuration, candidate.metrics.maxCycleDuration),
    wastedPercentage: delta(baseline.metrics.wastedPercentage, candidate.metrics.wastedPercentage),
    budgetViolationCount: delta(baseline.metrics.budgetViolationCount, candidate.metrics.budgetViolationCount)
  };
  const regressions: string[] = [];
  if (deltas.totalCycleDuration.percentage !== null && deltas.totalCycleDuration.percentage > 10) regressions.push(`Total cycle time increased ${deltas.totalCycleDuration.percentage}%.`);
  if (deltas.maxCycleDuration.percentage !== null && deltas.maxCycleDuration.percentage > 10) regressions.push(`Maximum cycle time increased ${deltas.maxCycleDuration.percentage}%.`);
  if (deltas.wastedPercentage.absolute > 5) regressions.push(`No-mutation check share increased ${deltas.wastedPercentage.absolute} points.`);
  if (deltas.budgetViolationCount.absolute > 0) regressions.push(`${deltas.budgetViolationCount.absolute} additional budget violation(s).`);
  const improvements = [deltas.totalCycleDuration.percentage, deltas.maxCycleDuration.percentage].filter((value) => value !== null && value < -10).length;
  return { schemaVersion: 1, name: `${baseline.name}: baseline vs candidate`, outcome: regressions.length ? 'regressed' : improvements ? 'improved' : 'unchanged', baseline, candidate, deltas, regressions };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
}

export function formatInteractionReportMarkdown(report: InteractionReport): string {
  const lines = [`# Angular Render Scan: ${report.name}`, '', `**Result:** ${report.findings.length ? `${report.findings.length} ranked finding(s)` : 'No actionable finding'}`, '',
    `- Cycles: ${report.metrics.cycleCount}`, `- Total cycle time: ${report.metrics.totalCycleDuration}ms`, `- Maximum cycle: ${report.metrics.maxCycleDuration}ms`,
    `- No-mutation check share: ${report.metrics.wastedPercentage}%`, `- Budget violations: ${report.metrics.budgetViolationCount}`, '', '## Ranked findings', ''];
  if (!report.findings.length) lines.push('No actionable findings were observed in this interaction.');
  report.findings.forEach((item, index) => lines.push(`### ${index + 1}. ${item.title}`, '', `${item.summary}`, '', `**Evidence:** ${item.evidence.join('; ')}`, '', `**Next action:** ${item.action}`, ''));
  lines.push('> CPU and FPS are environmental context only. Disconnected elements and OnPush opportunity shares are signals to verify, not proven leaks or savings.');
  return lines.join('\n');
}

export function formatInteractionReportHtml(report: InteractionReport): string {
  const findings = report.findings.map((item, index) => `<section><h2>${index + 1}. ${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p><p><strong>Evidence:</strong> ${escapeHtml(item.evidence.join('; '))}</p><p><strong>Next action:</strong> ${escapeHtml(item.action)}</p></section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(report.name)}</title><style>body{font:15px/1.5 system-ui;max-width:860px;margin:40px auto;padding:0 20px;color:#172033}header,section{border:1px solid #dbe2ea;border-radius:12px;padding:20px;margin:16px 0}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}dt{color:#667085}dd{font-size:22px;font-weight:700;margin:0}small{color:#667085}</style></head><body><header><h1>${escapeHtml(report.name)}</h1><dl><div><dt>Cycles</dt><dd>${report.metrics.cycleCount}</dd></div><div><dt>Total cycle time</dt><dd>${report.metrics.totalCycleDuration}ms</dd></div><div><dt>Maximum cycle</dt><dd>${report.metrics.maxCycleDuration}ms</dd></div><div><dt>No-mutation share</dt><dd>${report.metrics.wastedPercentage}%</dd></div></dl></header>${findings || '<section><h2>No actionable findings</h2></section>'}<small>CPU and FPS are context only. Disconnected elements and OnPush opportunity shares require verification.</small></body></html>`;
}
