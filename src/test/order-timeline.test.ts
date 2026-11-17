import { describe, it, expect } from 'vitest';
import { getStatusHeadline, TIMELINE_LABELS } from '@/components/OrderTimelineProgressBar';
import { flows } from '@/lib/dashboard-rules';

describe('OrderTimelineProgressBar rules & helpers', () => {
  it('provides descriptive headlines for all order stages', () => {
    expect(getStatusHeadline('orders', 'pending')).toContain('في انتظار الموافقة');
    expect(getStatusHeadline('orders', 'accepted')).toContain('تم تأكيد طلبك');
    expect(getStatusHeadline('orders', 'preparing')).toContain('تم تحضير وتجهيز');
    expect(getStatusHeadline('orders', 'on_the_way')).toContain('مع كابتن التوصيل');
    expect(getStatusHeadline('orders', 'delivered')).toContain('تم تسليم الطلب بنجاح');
    expect(getStatusHeadline('orders', 'cancelled')).toContain('تم إلغاء');
  });

  it('provides descriptive headlines for bookings and services', () => {
    expect(getStatusHeadline('bookings', 'pending')).toContain('قيد المراجعة');
    expect(getStatusHeadline('bookings', 'confirmed')).toContain('تم تأكيد موعدك');
    expect(getStatusHeadline('bookings', 'completed')).toContain('تم الكشف');

    expect(getStatusHeadline('service_requests', 'pending')).toContain('قيد مراجعة');
    expect(getStatusHeadline('service_requests', 'accepted')).toContain('تم قبول الطلب');
    expect(getStatusHeadline('service_requests', 'in_progress')).toContain('الفني يعمل');
    expect(getStatusHeadline('service_requests', 'completed')).toContain('تم الانتهاء');
  });

  it('calculates correct percentages across order steps', () => {
    const steps = flows.orders;
    expect(steps).toEqual(['pending', 'accepted', 'preparing', 'on_the_way', 'delivered']);

    const getPercent = (status: string) => {
      const idx = steps.indexOf(status);
      return (idx / (steps.length - 1)) * 100;
    };

    expect(getPercent('pending')).toBe(0);
    expect(getPercent('accepted')).toBe(25);
    expect(getPercent('preparing')).toBe(50);
    expect(getPercent('on_the_way')).toBe(75);
    expect(getPercent('delivered')).toBe(100);
  });

  it('has readable timeline labels for all distinct steps', () => {
    expect(TIMELINE_LABELS['pending']).toBe('قيد المراجعة');
    expect(TIMELINE_LABELS['accepted']).toBe('تم التأكيد');
    expect(TIMELINE_LABELS['preparing']).toBe('تم التحضير');
    expect(TIMELINE_LABELS['on_the_way']).toBe('في الطريق');
    expect(TIMELINE_LABELS['delivered']).toBe('تم التسليم');
  });
});
