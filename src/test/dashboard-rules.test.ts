import { describe, expect, it } from 'vitest';
import {
  deleteStoreInput,
  storeVisibilityInput,
  storeDeletionRequestInput,
  reviewStoreDeletionRequestInput,
  cancelStoreDeletionRequestInput,
} from '@/lib/dashboard-rules';

describe('Store Management and Deletion Rules', () => {
  const validUuid = '11111111-2222-3333-4444-555555555555';

  it('validates deleteStoreInput requires valid uuid', () => {
    expect(deleteStoreInput.safeParse({ storeId: validUuid }).success).toBe(true);
    expect(deleteStoreInput.safeParse({ storeId: 'invalid-id' }).success).toBe(false);
    expect(deleteStoreInput.safeParse({}).success).toBe(false);
  });

  it('validates storeVisibilityInput requires uuid and boolean is_active', () => {
    expect(storeVisibilityInput.safeParse({ storeId: validUuid, is_active: false }).success).toBe(true);
    expect(storeVisibilityInput.safeParse({ storeId: validUuid, is_active: true }).success).toBe(true);
    expect(storeVisibilityInput.safeParse({ storeId: validUuid, is_active: 'yes' }).success).toBe(false);
  });

  it('validates storeDeletionRequestInput requires reason with min length 3', () => {
    expect(storeDeletionRequestInput.safeParse({ storeId: validUuid, reason: 'إغلاق النشاط التجاري نهائياً' }).success).toBe(true);
    expect(storeDeletionRequestInput.safeParse({ storeId: validUuid, reason: '  ' }).success).toBe(false);
    expect(storeDeletionRequestInput.safeParse({ storeId: validUuid, reason: 'لا' }).success).toBe(false);
    expect(storeDeletionRequestInput.safeParse({ storeId: 'bad', reason: 'سبب وجيه' }).success).toBe(false);
  });

  it('validates cancelStoreDeletionRequestInput requires valid uuid', () => {
    expect(cancelStoreDeletionRequestInput.safeParse({ requestId: validUuid }).success).toBe(true);
    expect(cancelStoreDeletionRequestInput.safeParse({ requestId: '' }).success).toBe(false);
  });

  it('validates reviewStoreDeletionRequestInput requires action to be approve or reject', () => {
    expect(reviewStoreDeletionRequestInput.safeParse({ requestId: validUuid, action: 'approve' }).success).toBe(true);
    expect(reviewStoreDeletionRequestInput.safeParse({ requestId: validUuid, action: 'reject', admin_notes: 'ملاحظة' }).success).toBe(true);
    expect(reviewStoreDeletionRequestInput.safeParse({ requestId: validUuid, action: 'pending' }).success).toBe(false);
  });

  it('validates allowedNext transitions for store orders (pending allows direct acceptance or rejection)', async () => {
    const { allowedNext } = await import('@/lib/dashboard-rules');
    // Pending store orders can be accepted, started preparing, or cancelled
    const pendingNext = allowedNext('orders', 'pending');
    expect(pendingNext).toContain('accepted');
    expect(pendingNext).toContain('preparing');
    expect(pendingNext).toContain('cancelled');

    // Accepted store orders can move to preparing or cancelled
    const acceptedNext = allowedNext('orders', 'accepted');
    expect(acceptedNext).toContain('preparing');
    expect(acceptedNext).toContain('cancelled');

    // Preparing orders stop at store level (delivery driver takes over)
    const preparingNext = allowedNext('orders', 'preparing');
    expect(preparingNext).toEqual([]);
  });
});
