import { z } from 'zod';

export const pushTokenInput = z.object({ token: z.string().trim().min(20).max(4096) });

export function isStalePushToken(status: number, code?: string) {
  return (status === 404 && code === 'UNREGISTERED') || (status === 400 && code === 'INVALID_ARGUMENT');
}

export function formatOrderPushPayload(params: {
  orderId: string;
  storeName: string;
  itemsCount: number;
  phone: string;
  address: string;
  notes?: string;
}) {
  const shortId = params.orderId.slice(0, 8);
  const title = `🛍️ طلب جديد (#${shortId}) - ${params.storeName}`;
  const body = `طلب جديد (${params.itemsCount} أصناف) من ${params.phone} - العنوان: ${params.address}${params.notes ? ` (ملاحظات: ${params.notes})` : ''}`;
  const path = `/provider?tab=orders&order=${params.orderId}`;
  const tag = `husayniya-order-${params.orderId}`;

  return {
    title,
    body,
    path,
    tag,
    requireInteraction: true,
  };
}

export function formatCancellationNotification(params: {
  orderId: string;
  storeName: string;
  cancelledBy: 'customer' | 'store' | 'admin';
  note?: string;
}) {
  const shortId = params.orderId.slice(0, 8);
  if (params.cancelledBy === 'customer') {
    return {
      target: 'store' as const,
      title: `❌ تم إلغاء الطلب #${shortId} من قِبل العميل`,
      body: `قام العميل بإلغاء طلبه رقم #${shortId} من ${params.storeName}. يرجى التوقف عن تحضير الطلب.`,
      path: '/provider?tab=orders',
      chatMessage: 'قام العميل بإلغاء هذا الطلب.',
    };
  }
  return {
    target: 'customer' as const,
    title: `❌ اعتذار: تم إلغاء طلبك من قِبل ${params.storeName}`,
    body: params.note
      ? `نعتذر منك، قام ${params.storeName} بإلغاء طلبك رقم #${shortId}: ${params.note}`
      : `نعتذر منك، قام ${params.storeName} بإلغاء طلبك رقم #${shortId} لعدم إمكانية توفيره حالياً.`,
    path: `/orders?filter=cancelled&chat=${params.orderId}`,
    chatMessage: params.note
      ? `قام ${params.storeName} بإلغاء هذا الطلب: ${params.note}`
      : `قام ${params.storeName} بإلغاء هذا الطلب.`,
  };
}

export function determineChatNotificationRecipient(params: {
  senderRole: 'customer' | 'store' | 'driver' | 'admin';
  order: {
    customer_id: string;
    driver_id?: string | null;
    status: string;
    picked_up_at?: string | null;
  };
  storeOwnerId?: string | null;
}): {
  recipientId: string | null;
  targetRole: 'customer' | 'store' | 'driver' | null;
  isDriverStage: boolean;
} {
  const isDriverStage = Boolean(
    params.order.driver_id ||
      params.order.status === 'on_the_way' ||
      params.order.status === 'delivered' ||
      params.order.picked_up_at
  );

  if (params.senderRole === 'customer') {
    if (isDriverStage) {
      // Driver stage: message goes ONLY to driver, never to store
      return {
        recipientId: params.order.driver_id || null,
        targetRole: params.order.driver_id ? 'driver' : null,
        isDriverStage,
      };
    }
    // Store stage: message goes to store owner
    return {
      recipientId: params.storeOwnerId || null,
      targetRole: params.storeOwnerId ? 'store' : null,
      isDriverStage,
    };
  }

  if (params.senderRole === 'driver') {
    // Driver messages go ONLY to customer, never to store
    return {
      recipientId: params.order.customer_id,
      targetRole: 'customer',
      isDriverStage,
    };
  }

  // Store or admin messages go to customer
  return {
    recipientId: params.order.customer_id,
    targetRole: 'customer',
    isDriverStage,
  };
}

