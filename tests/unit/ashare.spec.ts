import { describe, expect, it } from 'vitest';
import { aSharePollingDelay, aShareVolumeLabel, formatAShareTime } from '@/utils/ashare';

describe('A-share time and units', () => {
  it('always displays Beijing time, independent of browser time zone', () => {
    expect(formatAShareTime('2026-11-02T05:41:00Z')).toBe('2026/11/02 13:41:00');
    expect(formatAShareTime('2026-11-01T16:00:00Z', true)).toBe('2026/11/02');
    expect(formatAShareTime(null)).toBe('—');
  });

  it('slows polling at lunch, after close and on weekends', () => {
    expect(aSharePollingDelay(new Date('2026-11-02T01:31:00Z'))).toBe(5000);
    expect(aSharePollingDelay(new Date('2026-11-02T04:00:00Z'))).toBe(60000);
    expect(aSharePollingDelay(new Date('2026-11-02T05:00:00Z'))).toBe(5000);
    expect(aSharePollingDelay(new Date('2026-11-02T07:00:00Z'))).toBe(60000);
    expect(aSharePollingDelay(new Date('2026-11-01T02:00:00Z'))).toBe(60000);
  });

  it('distinguishes shares, ETF units and index volume', () => {
    expect(aShareVolumeLabel('shares')).toBe('股');
    expect(aShareVolumeLabel('fund_units')).toBe('份');
    expect(aShareVolumeLabel('index_lots')).toContain('指数汇总');
  });
});
