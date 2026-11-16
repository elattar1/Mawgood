import { describe, expect, it } from 'vitest';
import { pushTokenInput, isStalePushToken, formatOrderPushPayload } from '../lib/push-rules';

describe('push delivery rules', () => {
  it('rejects a missing device token', () => { expect(pushTokenInput.safeParse({ token: '' }).success).toBe(false); });
  it('removes unregistered tokens, not temporary failures', () => {
    expect(isStalePushToken(404, 'UNREGISTERED')).toBe(true);
    expect(isStalePushToken(429, 'RESOURCE_EXHAUSTED')).toBe(false);
    expect(isStalePushToken(503, 'UNAVAILABLE')).toBe(false);
  });
  it('removes invalid device tokens', () => { expect(isStalePushToken(400, 'INVALID_ARGUMENT')).toBe(true); });

  it('formats order push notification payload with merchant direct link and stay-on-screen interaction', () => {
    const payload = formatOrderPushPayload({
      orderId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      storeName: 'مطعم الحسينية الملكي',
      itemsCount: 4,
      phone: '01012345678',
      address: 'شارع الجمهورية أمام المستشفى',
      notes: 'بدون شطة وبطاطس إضافية',
    });

    expect(payload.title).toContain('🛍️ طلب جديد (#a1b2c3d4)');
    expect(payload.title).toContain('مطعم الحسينية الملكي');
    expect(payload.body).toContain('4 أصناف');
    expect(payload.body).toContain('01012345678');
    expect(payload.body).toContain('شارع الجمهورية');
    expect(payload.body).toContain('بدون شطة وبطاطس إضافية');
    expect(payload.path).toBe('/provider?tab=orders&order=a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(payload.tag).toBe('husayniya-order-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(payload.requireInteraction).toBe(true);
  });

  it('handles order push payload without notes cleanly', () => {
    const payload = formatOrderPushPayload({
      orderId: '11223344-5566-7788-99aa-bbccddeeff00',
      storeName: 'سوبرماركت المدينة',
      itemsCount: 2,
      phone: '01298765432',
      address: 'بجوار المسجد الكبير',
    });

    expect(payload.title).toContain('🛍️ طلب جديد (#11223344)');
    expect(payload.body).not.toContain('ملاحظات:');
    expect(payload.body).toContain('2 أصناف');
    expect(payload.path).toBe('/provider?tab=orders&order=11223344-5566-7788-99aa-bbccddeeff00');
    expect(payload.requireInteraction).toBe(true);
  });
});