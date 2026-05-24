import { describe, expect, it } from 'vitest';
import { FpsMeter } from './fps';

describe('FpsMeter', () => {
  it('counts frames inside the latest second', () => {
    const meter = new FpsMeter();

    meter.mark(0);
    meter.mark(500);
    meter.mark(1000);
    meter.mark(1501);

    expect(meter.value).toBe(2);
  });
});
