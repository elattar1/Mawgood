import { describe, expect, it } from 'vitest';
import {
  parseStoreHours,
  isStoreCurrentlyOpen,
  cleanStoreDescription,
  embedStoreHoursInDescription,
  formatArabicTime,
} from '@/lib/store-hours';

describe('Store Working Hours logic', () => {
  it('parses embedded hours tag correctly', () => {
    const config = parseStoreHours({
      description: 'أفضل شاورما في الحسينية [hours:11:00-01:30]',
      category: 'restaurants',
    });
    expect(config.openTime).toBe('11:00');
    expect(config.closeTime).toBe('01:30');
    expect(config.is24Hours).toBe(false);
  });

  it('cleans embedded hours tag from user display description', () => {
    const clean = cleanStoreDescription('مطعم بيتزا وفطائر [hours:10:00-02:00]');
    expect(clean).toBe('مطعم بيتزا وفطائر');
  });

  it('embeds hours cleanly into description', () => {
    const embedded = embedStoreHoursInDescription('صيدلية النور', '08:00', '02:00');
    expect(embedded).toBe('صيدلية النور [hours:08:00-02:00]');
  });

  it('respects manual closure when is_open is false', () => {
    const status = isStoreCurrentlyOpen({
      is_open: false,
      is_active: true,
      description: '[hours:08:00-23:00]',
    });
    expect(status.isOpen).toBe(false);
    expect(status.reason).toContain('المتجر مغلق');
  });

  it('treats 24-hour pharmacies as always open', () => {
    const status = isStoreCurrentlyOpen({
      is_open: true,
      is_active: true,
      description: 'صيدلية 24 ساعة لخدمتكم',
      category: 'pharmacies',
    });
    expect(status.isOpen).toBe(true);
    expect(status.formattedHours).toBe('مفتوح 24 ساعة');
  });

  it('formats Arabic time cleanly', () => {
    expect(formatArabicTime('10:00')).toBe('10:00 ص');
    expect(formatArabicTime('14:30')).toBe('02:30 م');
    expect(formatArabicTime('00:00')).toBe('12:00 منتصف الليل');
  });
});
