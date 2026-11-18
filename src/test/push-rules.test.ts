import { describe, expect, it } from 'vitest';
import {
  pushTokenInput,
  isStalePushToken,
  formatOrderPushPayload,
  formatCancellationNotification,
  formatStoreProgressionNotification,
  determineChatNotificationRecipient,
} from '../lib/push-rules';

describe('push delivery rules', () => {
  it('rejects a missing device token', () => { expect(pushTokenInput.safeParse({ token: '' }).success).toBe(false); });
  it('removes unregistered tokens, not temporary failures', () => {
    expect(isStalePushToken(404, 'UNREGISTERED')).toBe(true);
    expect(isStalePushToken(429, 'RESOURCE_EXHAUSTED')).toBe(false);
    expect(isStalePushToken(503, 'UNAVAILABLE')).toBe(false);
  });
  it('removes invalid or mismatched device tokens', () => {
    expect(isStalePushToken(400, 'INVALID_ARGUMENT')).toBe(true);
    expect(isStalePushToken(403, 'SENDER_ID_MISMATCH')).toBe(true);
  });

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

  it('formats customer cancellation targeting store owner with clear attribution', () => {
    const res = formatCancellationNotification({
      orderId: 'c1d2e3f4-1234-5678-90ab-cdef12345678',
      storeName: 'الآن ماركت',
      cancelledBy: 'customer',
    });

    expect(res.target).toBe('store');
    expect(res.title).toContain('تم إلغاء الطلب #c1d2e3f4 من قِبل العميل');
    expect(res.body).toContain('قام العميل بإلغاء طلبه رقم #c1d2e3f4 من الآن ماركت');
    expect(res.path).toBe('/provider?tab=orders');
    expect(res.chatMessage).toBe('قام العميل بإلغاء هذا الطلب.');
  });

  it('formats store cancellation targeting customer with store apology and optional note', () => {
    const res = formatCancellationNotification({
      orderId: 'c1d2e3f4-1234-5678-90ab-cdef12345678',
      storeName: 'الآن ماركت',
      cancelledBy: 'store',
      note: 'الأصناف المطلوبة نفذت من المخزن',
    });

    expect(res.target).toBe('customer');
    expect(res.title).toContain('تم إلغاء طلبك من قِبل الآن ماركت');
    expect(res.body).toContain('الأصناف المطلوبة نفذت من المخزن');
    expect(res.path).toContain('/orders?filter=cancelled');
    expect(res.chatMessage).toContain('الأصناف المطلوبة نفذت من المخزن');
  });

  it('formats admin cancellation targeting both customer and store owner', () => {
    const res = formatCancellationNotification({
      orderId: 'a1b2c3d4-1234-5678-90ab-cdef12345678',
      storeName: 'الآن ماركت',
      cancelledBy: 'admin',
      note: 'مخالفة معايير الجودة',
    });

    expect(res.target).toBe('both');
    expect(res.customerTitle).toContain('تم إلغاء طلبك من قِبل إدارة المنصة');
    expect(res.customerBody).toContain('مخالفة معايير الجودة');
    expect(res.storeTitle).toContain('تم إلغاء الطلب #a1b2c3d4 من قِبل الإدارة');
    expect(res.storeBody).toContain('يرجى التوقف عن تحضير الطلب');
  });

  it('formats store progression notifications when driver claims and completes delivery', () => {
    const onTheWay = formatStoreProgressionNotification({
      orderId: 'e1f2a3b4-5678-90ab-cdef-1234567890ab',
      status: 'on_the_way',
      driverName: 'أحمد',
    });
    expect(onTheWay.title).toContain('تم استلام طلبك (#e1f2a3b4) بواسطة الكابتن أحمد');
    expect(onTheWay.body).toContain('بدأ الكابتن أحمد توصيل الطلب');
    expect(onTheWay.path).toBe('/provider?tab=orders&order=e1f2a3b4-5678-90ab-cdef-1234567890ab');

    const delivered = formatStoreProgressionNotification({
      orderId: 'e1f2a3b4-5678-90ab-cdef-1234567890ab',
      status: 'delivered',
    });
    expect(delivered.title).toContain('تم تسليم الطلب (#e1f2a3b4) للعميل بنجاح');
    expect(delivered.body).toContain('تحصيل المبلغ بنجاح');
    expect(delivered.path).toBe('/provider?tab=orders&order=e1f2a3b4-5678-90ab-cdef-1234567890ab');
  });

  describe('chat notification recipient isolation rules', () => {
    const storeOwnerId = 'store-owner-uuid';
    const customerId = 'customer-uuid';
    const driverId = 'driver-uuid';

    it('routes customer messages to store when no driver is assigned', () => {
      const result = determineChatNotificationRecipient({
        senderRole: 'customer',
        order: {
          customer_id: customerId,
          driver_id: null,
          status: 'preparing',
          picked_up_at: null,
        },
        storeOwnerId,
      });

      expect(result.isDriverStage).toBe(false);
      expect(result.targetRole).toBe('store');
      expect(result.recipientId).toBe(storeOwnerId);
    });

    it('isolates store: routes customer messages ONLY to driver once driver is assigned', () => {
      const result = determineChatNotificationRecipient({
        senderRole: 'customer',
        order: {
          customer_id: customerId,
          driver_id: driverId,
          status: 'preparing', // still preparing, but driver already claimed
          picked_up_at: null,
        },
        storeOwnerId,
      });

      expect(result.isDriverStage).toBe(true);
      expect(result.targetRole).toBe('driver');
      expect(result.recipientId).toBe(driverId);
      expect(result.recipientId).not.toBe(storeOwnerId);
    });

    it('isolates store: routes driver messages ONLY to customer, never to store', () => {
      const result = determineChatNotificationRecipient({
        senderRole: 'driver',
        order: {
          customer_id: customerId,
          driver_id: driverId,
          status: 'on_the_way',
          picked_up_at: new Date().toISOString(),
        },
        storeOwnerId,
      });

      expect(result.isDriverStage).toBe(true);
      expect(result.targetRole).toBe('customer');
      expect(result.recipientId).toBe(customerId);
      expect(result.recipientId).not.toBe(storeOwnerId);
    });
  });
});
