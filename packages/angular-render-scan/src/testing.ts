export interface RenderAuditReport {
  rendersFor(name: string): Promise<number>;
  maxDurationFor(name: string): Promise<number>;
  wastedRenderPercentage(): Promise<number>;
  budgetViolations(): Promise<any[]>;
}

export interface RenderAuditSession {
  stop(): Promise<RenderAuditReport>;
}

/**
 * Starts a Playwright-compatible headless render audit session on the given Page object.
 * Intercepts change-detection metrics and budget violations.
 */
export async function startRenderAudit(page: any): Promise<RenderAuditSession> {
  await page.evaluate(() => {
    const scan = (window as any).AngularRenderScan;
    if (scan) {
      scan.scan({ enabled: true });
    }
  });

  return {
    async stop(): Promise<RenderAuditReport> {
      const sessionData = await page.evaluate(() => {
        const scan = (window as any).AngularRenderScan;
        if (scan && scan.getSessionData) {
          const data = scan.getSessionData();
          scan.stop();
          return data;
        }
        return null;
      });

      if (!sessionData) {
        throw new Error(
          '[angular-render-scan] Telemetry session data could not be fetched. ' +
          'Is the package enabled and running in development mode?'
        );
      }

      return {
        async rendersFor(name: string): Promise<number> {
          let count = 0;
          for (const cycle of sessionData.cycles) {
            for (const entry of cycle.entries) {
              if (entry.name === name) {
                count = Math.max(count, entry.count);
              }
            }
          }
          return count;
        },
        async maxDurationFor(name: string): Promise<number> {
          let maxDur = 0;
          for (const cycle of sessionData.cycles) {
            for (const entry of cycle.entries) {
              if (entry.name === name) {
                maxDur = Math.max(maxDur, entry.latestDuration);
              }
            }
          }
          return maxDur;
        },
        async wastedRenderPercentage(): Promise<number> {
          return sessionData.wastedStats.wastedPercentage;
        },
        async budgetViolations(): Promise<any[]> {
          return sessionData.budgetViolations;
        }
      };
    }
  };
}
