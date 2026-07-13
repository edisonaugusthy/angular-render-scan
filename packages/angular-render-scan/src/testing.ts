import type { BudgetViolation, InteractionComparison, InteractionReport, SessionExportData } from './domain/entities';
import { compareInteractionReports, formatInteractionReportHtml, formatInteractionReportMarkdown } from './application/interaction';

interface BrowserScanApi {
  scan(options: { enabled: boolean }): void;
  stop(): void;
  beginInteraction?(name: string): void;
  endInteraction?(): InteractionReport;
  getSessionData(): SessionExportData;
}

export interface RenderAuditPage {
  evaluate<Result>(pageFunction: () => Result | Promise<Result>): Promise<Awaited<Result>>;
  evaluate<Result, Argument>(pageFunction: (argument: Argument) => Result | Promise<Result>, argument: Argument): Promise<Awaited<Result>>;
}

export interface RenderAuditReport {
  rendersFor(name: string): Promise<number>;
  maxDurationFor(name: string): Promise<number>;
  wastedRenderPercentage(): Promise<number>;
  budgetViolations(): Promise<BudgetViolation[]>;
  sessionData(): Promise<SessionExportData>;
  interactionReport(): Promise<InteractionReport>;
  compareWith(baseline: InteractionReport): Promise<InteractionComparison>;
  toMarkdown(): Promise<string>;
  toHtml(): Promise<string>;
}

export interface RenderAuditSession {
  stop(): Promise<RenderAuditReport>;
}

/** Starts a named, Playwright-compatible interaction audit. */
export async function startRenderAudit(page: RenderAuditPage, name = 'Playwright interaction'): Promise<RenderAuditSession> {
  await page.evaluate(() => {
    const scan = (window as Window & { AngularRenderScan?: BrowserScanApi }).AngularRenderScan;
    scan?.scan({ enabled: true });
  });
  await page.evaluate((interactionName) => {
    const scan = (window as Window & { AngularRenderScan?: BrowserScanApi }).AngularRenderScan;
    scan?.beginInteraction?.(interactionName);
  }, name);

  return {
    async stop(): Promise<RenderAuditReport> {
      const payload = await page.evaluate(() => {
        const scan = (window as Window & { AngularRenderScan?: BrowserScanApi }).AngularRenderScan;
        if (!scan?.getSessionData) return null;
        const interaction = scan.endInteraction?.();
        const session = scan.getSessionData();
        scan.stop();
        return { interaction, session };
      });
      if (!payload) {
        throw new Error('[angular-render-scan] Telemetry could not be fetched. Is the scanner enabled in development mode?');
      }
      const interaction = payload.interaction ?? {
        schemaVersion: 1 as const,
        name,
        startedAt: payload.session.exportedAt,
        finishedAt: payload.session.exportedAt,
        url: payload.session.url,
        viewport: payload.session.viewport,
        metrics: { cycleCount: 0, componentCheckCount: 0, totalCycleDuration: 0, maxCycleDuration: 0, wastedChecks: 0, wastedPercentage: payload.session.wastedStats.wastedPercentage, budgetViolationCount: payload.session.budgetViolations.length },
        findings: [],
        session: payload.session
      };
      const sessionData = payload.session;
      return {
        async rendersFor(componentName) {
          return Math.max(0, ...sessionData.cycles.flatMap((cycle) => cycle.entries.filter((entry) => entry.name === componentName).map((entry) => entry.count)));
        },
        async maxDurationFor(componentName) {
          return Math.max(0, ...sessionData.cycles.flatMap((cycle) => cycle.entries.filter((entry) => entry.name === componentName).map((entry) => entry.latestDuration)));
        },
        async wastedRenderPercentage() { return interaction.metrics.wastedPercentage; },
        async budgetViolations() { return interaction.session.budgetViolations; },
        async sessionData() { return sessionData; },
        async interactionReport() { return interaction; },
        async compareWith(baseline) { return compareInteractionReports(baseline, interaction); },
        async toMarkdown() { return formatInteractionReportMarkdown(interaction); },
        async toHtml() { return formatInteractionReportHtml(interaction); }
      };
    }
  };
}
