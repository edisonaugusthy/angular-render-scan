export class CpuMeter {
  private observer: PerformanceObserver | null = null;
  private tasks: Array<{ start: number; duration: number }> = [];
  private frameTicks: Array<{ time: number; busy: number }> = [];
  private lastFrameTime = performance.now();

  constructor(private readonly onChange?: () => void) {
    if (typeof PerformanceObserver !== 'undefined' && 
        PerformanceObserver.supportedEntryTypes && 
        PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      try {
        this.observer = new PerformanceObserver((list) => {
          const now = performance.now();
          for (const entry of list.getEntries()) {
            this.tasks.push({
              start: entry.startTime,
              duration: entry.duration
            });
          }
          this.cleanOldTasks(now);
          if (this.onChange) {
            this.onChange();
          }
        });
        this.observer.observe({ entryTypes: ['longtask'] });
      } catch {
        // Safe fallback if observer fails
      }
    }
  }

  markFrame(now = performance.now()): void {
    const elapsed = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    // Target frame duration is 16.67ms (60fps)
    const busy = Math.max(0, elapsed - 16.67);
    this.frameTicks.push({ time: now, busy });
    
    this.cleanOldTicks(now);

    // If a frame was severely blocked, trigger onChange instantly to show live updates!
    if (busy > 20 && this.onChange) {
      this.onChange();
    }
  }

  private cleanOldTicks(now: number): void {
    const cutoff = now - 2000;
    while (this.frameTicks.length > 0 && this.frameTicks[0].time < cutoff) {
      this.frameTicks.shift();
    }
  }

  private cleanOldTasks(now: number): void {
    const cutoff = now - 2000; // 2 second sliding window
    while (this.tasks.length > 0 && this.tasks[0].start + this.tasks[0].duration < cutoff) {
      this.tasks.shift();
    }
  }

  get value(): number {
    const now = performance.now();
    this.cleanOldTasks(now);
    this.cleanOldTicks(now);

    const cutoff = now - 2000;
    
    // 1. Long Tasks Busy Time
    let taskBusyTime = 0;
    for (const task of this.tasks) {
      const taskStart = Math.max(task.start, cutoff);
      const taskEnd = Math.min(task.start + task.duration, now);
      if (taskEnd > taskStart) {
        taskBusyTime += (taskEnd - taskStart);
      }
    }

    // 2. Frame Lag Busy Time
    let frameBusyTime = 0;
    for (const tick of this.frameTicks) {
      frameBusyTime += tick.busy;
    }

    const totalBusyTime = Math.max(taskBusyTime, frameBusyTime);
    return Math.min(100, Math.round((totalBusyTime / 2000) * 100));
  }

  getDetails() {
    const now = performance.now();
    this.cleanOldTasks(now);
    this.cleanOldTicks(now);

    const cutoff = now - 2000;
    let taskBusyTime = 0;
    let maxDuration = 0;
    let longTaskCount = 0;

    for (const task of this.tasks) {
      const taskStart = Math.max(task.start, cutoff);
      const taskEnd = Math.min(task.start + task.duration, now);
      if (taskEnd > taskStart) {
        const overlap = taskEnd - taskStart;
        taskBusyTime += overlap;
        longTaskCount++;
        if (task.duration > maxDuration) {
          maxDuration = task.duration;
        }
      }
    }

    let frameBusyTime = 0;
    let maxFrameDelay = 0;
    for (const tick of this.frameTicks) {
      frameBusyTime += tick.busy;
      if (tick.busy > maxFrameDelay) {
        maxFrameDelay = tick.busy;
      }
    }

    const totalBusyTime = Math.max(taskBusyTime, frameBusyTime);
    const percentage = Math.min(100, Math.round((totalBusyTime / 2000) * 100));
    
    const displayMaxDuration = Math.round(Math.max(maxDuration, maxFrameDelay));
    const totalBlockingTime = Math.round(Math.max(
      this.tasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0),
      frameBusyTime
    ));

    return {
      percentage,
      longTaskCount: Math.max(longTaskCount, frameBusyTime > 80 ? 1 : 0),
      maxDuration: displayMaxDuration,
      totalBlockingTime
    };
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}
