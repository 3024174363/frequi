import { describe, expect, it } from 'vitest';
import { formatHKShareTime, hkSharePollingDelay } from '@/utils/hkshare';
import { aShareVolumeLabel } from '@/utils/ashare';

describe('Hong Kong chart time and units', () => {
  it('shows Hong Kong dates independently of the browser time zone', () => {
    expect(formatHKShareTime('2026-11-02T08:08:21Z')).toBe('2026/11/02 16:08:21');
    expect(formatHKShareTime('2026-11-01T16:00:00Z', true)).toBe('2026/11/02');
    expect(formatHKShareTime(null)).toBe('—');
  });

  it('uses the Hong Kong lunch and close times', () => {
    expect(hkSharePollingDelay(new Date('2026-11-02T01:29:00Z'))).toBe(60000);
    expect(hkSharePollingDelay(new Date('2026-11-02T01:30:00Z'))).toBe(5000);
    expect(hkSharePollingDelay(new Date('2026-11-02T03:45:00Z'))).toBe(5000);
    expect(hkSharePollingDelay(new Date('2026-11-02T04:00:00Z'))).toBe(60000);
    expect(hkSharePollingDelay(new Date('2026-11-02T05:00:00Z'))).toBe(5000);
    expect(hkSharePollingDelay(new Date('2026-11-02T07:30:00Z'))).toBe(5000);
    expect(hkSharePollingDelay(new Date('2026-11-02T08:00:00Z'))).toBe(60000);
    expect(hkSharePollingDelay(new Date('2026-11-01T03:00:00Z'))).toBe(60000);
  });

  it('distinguishes shares, ETF units and missing index volume', () => {
    expect(aShareVolumeLabel('shares')).toBe('股');
    expect(aShareVolumeLabel('fund_units')).toBe('份');
    expect(aShareVolumeLabel('unavailable')).toContain('口径未核清');
  });
});
