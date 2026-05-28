import { CpuMeter } from './cpu';
import { describe, expect, it } from 'vitest';

describe('CpuMeter', () => {
  it('instantiates and provides CPU metrics smoothly', () => {
    const meter = new CpuMeter();
    expect(meter.value).toBe(0);
    const details = meter.getDetails();
    expect(details.percentage).toBe(0);
    expect(details.longTaskCount).toBe(0);
    expect(details.maxDuration).toBe(0);
    expect(details.totalBlockingTime).toBe(0);
    meter.destroy();
  });
});
