export class FpsMeter {
  private frames: number[] = [];

  mark(now = performance.now()): number {
    this.frames.push(now);
    const cutoff = now - 1000;
    while (this.frames.length > 0 && this.frames[0] < cutoff) {
      this.frames.shift();
    }
    return this.value;
  }

  get value(): number {
    return this.frames.length;
  }

  reset(): void {
    this.frames = [];
  }
}
