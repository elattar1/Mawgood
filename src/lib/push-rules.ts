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
