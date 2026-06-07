export interface RuntimeTelemetrySummary {
  longTasks: {
    count: number;
    maxDuration: number;
    totalBlockingTime: number;
  };
  interaction?: {
    name: string;
    duration: number;
    inputDelay: number;
  };
  layoutShift: {
    count: number;
    score: number;
  };
  resources: {
    slowCount: number;
    repeatedCount: number;
    maxDuration: number;
    slowestName?: string;
  };
}

type StoredEntry = {
  name: string;
  startTime: number;
  duration: number;
  value?: number;
  hadRecentInput?: boolean;
  processingStart?: number;
};

const BUFFER_LIMIT = 120;
const SLOW_RESOURCE_MS = 250;

export class RuntimeTelemetry {
  private readonly observers: PerformanceObserver[] = [];
  private readonly longTasks: StoredEntry[] = [];
  private readonly interactions: StoredEntry[] = [];
  private readonly layoutShifts: StoredEntry[] = [];
  private readonly resources: StoredEntry[] = [];

  constructor(private readonly onChange?: () => void) {
    this.observe("longtask", this.longTasks);
    this.observe("event", this.interactions);
    this.observe("layout-shift", this.layoutShifts);
    this.observe("resource", this.resources);
  }

  getSummary(startTime: number, endTime = performance.now()): RuntimeTelemetrySummary {
    const longTasks = this.inWindow(this.longTasks, startTime, endTime);
    const interactions = this.inWindow(this.interactions, startTime, endTime);
    const shifts = this.inWindow(this.layoutShifts, startTime, endTime).filter(
      (entry) => !entry.hadRecentInput,
    );
    const resources = this.inWindow(this.resources, startTime, endTime);
    const slowResources = resources.filter(
      (entry) => entry.duration >= SLOW_RESOURCE_MS,
    );
    const resourceCounts = new Map<string, number>();
    for (const entry of resources) {
      resourceCounts.set(entry.name, (resourceCounts.get(entry.name) ?? 0) + 1);
    }

    const latestInteraction = interactions
      .slice()
      .sort((a, b) => b.startTime - a.startTime)[0];
    const slowestResource = slowResources
      .slice()
      .sort((a, b) => b.duration - a.duration)[0];

    return {
      longTasks: {
        count: longTasks.length,
        maxDuration: Math.round(max(longTasks.map((entry) => entry.duration))),
        totalBlockingTime: Math.round(
          longTasks.reduce(
            (sum, entry) => sum + Math.max(0, entry.duration - 50),
            0,
          ),
        ),
      },
      interaction: latestInteraction
        ? {
            name: latestInteraction.name,
            duration: Math.round(latestInteraction.duration),
            inputDelay: Math.round(
              Math.max(
                0,
                (latestInteraction.processingStart ?? latestInteraction.startTime) -
                  latestInteraction.startTime,
              ),
            ),
          }
        : undefined,
      layoutShift: {
        count: shifts.length,
        score: Number(
          shifts
            .reduce((sum, entry) => sum + (entry.value ?? 0), 0)
            .toFixed(4),
        ),
      },
      resources: {
        slowCount: slowResources.length,
        repeatedCount: [...resourceCounts.values()].filter((count) => count > 1)
          .length,
        maxDuration: Math.round(max(slowResources.map((entry) => entry.duration))),
        slowestName: slowestResource ? shortResourceName(slowestResource.name) : undefined,
      },
    };
  }

  destroy(): void {
    for (const observer of this.observers) {
      observer.disconnect();
    }
    this.observers.length = 0;
  }

  private observe(type: string, target: StoredEntry[]): void {
    if (
      typeof PerformanceObserver === "undefined" ||
      !PerformanceObserver.supportedEntryTypes?.includes(type)
    ) {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          target.push(toStoredEntry(entry));
        }
        trim(target);
        this.onChange?.();
      });
      observer.observe({ type, buffered: true });
      this.observers.push(observer);
    } catch {
      // Unsupported observer options or browser-specific failures should not break the overlay.
    }
  }

  private inWindow(
    entries: StoredEntry[],
    startTime: number,
    endTime: number,
  ): StoredEntry[] {
    return entries.filter((entry) => {
      const entryEnd = entry.startTime + entry.duration;
      return entry.startTime <= endTime && entryEnd >= startTime;
    });
  }
}

function toStoredEntry(entry: PerformanceEntry): StoredEntry {
  const candidate = entry as PerformanceEntry & {
    value?: number;
    hadRecentInput?: boolean;
    processingStart?: number;
  };

  return {
    name: entry.name,
    startTime: entry.startTime,
    duration: entry.duration,
    value: candidate.value,
    hadRecentInput: candidate.hadRecentInput,
    processingStart: candidate.processingStart,
  };
}

function trim(entries: StoredEntry[]): void {
  if (entries.length > BUFFER_LIMIT) {
    entries.splice(0, entries.length - BUFFER_LIMIT);
  }
}

function max(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

function shortResourceName(name: string): string {
  try {
    const url = new URL(name, window.location.href);
    return url.pathname.split("/").filter(Boolean).pop() || url.hostname;
  } catch {
    return name.split("/").filter(Boolean).pop() || name;
  }
}
