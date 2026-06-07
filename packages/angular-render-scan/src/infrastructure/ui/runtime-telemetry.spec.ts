import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeTelemetry } from "./runtime-telemetry";

type ObserverCallback = (list: { getEntries: () => PerformanceEntry[] }) => void;

describe("RuntimeTelemetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back when PerformanceObserver is unavailable", () => {
    vi.stubGlobal("PerformanceObserver", undefined);

    const telemetry = new RuntimeTelemetry();

    expect(telemetry.getSummary(0)).toMatchObject({
      longTasks: { count: 0, maxDuration: 0, totalBlockingTime: 0 },
      layoutShift: { count: 0, score: 0 },
      resources: { slowCount: 0, repeatedCount: 0, maxDuration: 0 },
    });
  });

  it("summarizes buffered runtime entries", () => {
    const callbacks: Record<string, ObserverCallback> = {};
    class MockPerformanceObserver {
      static supportedEntryTypes = ["longtask", "event", "layout-shift", "resource"];

      constructor(private readonly callback: ObserverCallback) {}

      observe(options: { type?: string }) {
        callbacks[options.type ?? ""] = this.callback;
      }

      disconnect() {}
    }
    vi.stubGlobal("PerformanceObserver", MockPerformanceObserver);

    const telemetry = new RuntimeTelemetry();
    callbacks.longtask({
      getEntries: () => [
        entry({ name: "self", startTime: 100, duration: 120 }),
      ],
    });
    callbacks.event({
      getEntries: () => [
        entry({
          name: "click",
          startTime: 130,
          duration: 88,
          processingStart: 150,
        }),
      ],
    });
    callbacks["layout-shift"]({
      getEntries: () => [
        entry({ name: "", startTime: 150, duration: 0, value: 0.04 }),
      ],
    });
    callbacks.resource({
      getEntries: () => [
        entry({
          name: "https://example.test/assets/main.js",
          startTime: 160,
          duration: 300,
        }),
        entry({
          name: "https://example.test/assets/main.js",
          startTime: 180,
          duration: 40,
        }),
      ],
    });

    expect(telemetry.getSummary(90, 220)).toEqual({
      longTasks: { count: 1, maxDuration: 120, totalBlockingTime: 70 },
      interaction: { name: "click", duration: 88, inputDelay: 20 },
      layoutShift: { count: 1, score: 0.04 },
      resources: {
        slowCount: 1,
        repeatedCount: 1,
        maxDuration: 300,
        slowestName: "main.js",
      },
    });
  });
});

function entry(values: {
  name: string;
  startTime: number;
  duration: number;
  value?: number;
  processingStart?: number;
}): PerformanceEntry {
  return values as PerformanceEntry;
}
