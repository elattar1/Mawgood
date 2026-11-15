// src/lib/chat-unread.ts
// نظام تتبع وحساب الرسائل غير المقروءة في الشات لكل طلب
import { useEffect, useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { getNotifications } from "@/lib/customer.functions";
import { readOrderChatNotifications } from "@/lib/chat.functions";

export function extractOrderIdFromLink(link: string | null | undefined): string | null {
  if (!link || !link.includes("chat=")) return null;
  const match = link.match(/chat=([0-9a-fA-F-]+)/);
  return match ? match[1] : null;
}

export function parseChatMessagesFromNotes(notes: string | null | undefined): Array<{
  id: string;
  sender_id: string;
  sender_role: string;
  created_at: string;
  message: string;
}> {
  if (!notes) return [];
  const match = notes.match(/<!-- CHAT_V1: ([\s\S]*?) -->/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface OrderWithNotes {
  id: string;
  notes?: string | null;
}

/**
 * Hook لحساب وتتبع الرسائل غير المقروءة لكل طلب (للعميل، الكابتن، والمحل)
 * يعتمد على استعلام الإشعارات الفوري الذي يتم تحديثه تلقائياً كل 3.5 ثوانٍ
 * ويفحص أيضاً ملاحظات الطلب لضمان دقة 100% دون تأخير
 */
export function useOrderChatUnreadMap(ordersWithNotes?: OrderWithNotes[]) {
  const { user } = useAuth();
  const getNotifs = useServerFn(getNotifications);
  const markOrderRead = useServerFn(readOrderChatNotifications);
  const qc = useQueryClient();

  // مشاركة نفس مفتاح استعلام الإشعارات النشط مع InAppChatNotifier
  const { data: notifications } = useQuery({
    queryKey: ["in-app-chat-notifications", user?.id],
    queryFn: () => getNotifs(),
    enabled: !!user,
    refetchInterval: 3500,
  });

  // تتبع الأوقات الزمنية المحلية لآخر مرة تم فيها فتح الشات
  const [localSeenTimes, setLocalSeenTimes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    try {
      const stored = localStorage.getItem(`husayniya_chat_seen_${user.id}`);
      if (stored) {
        setLocalSeenTimes(JSON.parse(stored));
      }
    } catch {}
  }, [user?.id]);

  // دالة تعليم المحادثة كمقروءة فور فتحها
  const markChatAsRead = useCallback(
    async (orderId: string) => {
      if (!orderId || !user?.id) return;
      const now = Date.now();
      setLocalSeenTimes((prev) => {
        const next = { ...prev, [orderId]: now };
        try {
          localStorage.setItem(`husayniya_chat_seen_${user.id}`, JSON.stringify(next));
        } catch {}
        return next;
      });

      try {
        await markOrderRead({ data: { orderId } });
        qc.invalidateQueries({ queryKey: ["in-app-chat-notifications", user.id] });
        qc.invalidateQueries({ queryKey: ["unread", user.id] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
      } catch {}
    },
    [user?.id, markOrderRead, qc]
  );

  const unreadMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!user?.id) return map;

    // 1. حساب الرسائل غير المقروءة من الإشعارات الواردة
    if (Array.isArray(notifications)) {
      for (const n of notifications) {
        if (!n.is_read) {
          const orderId = extractOrderIdFromLink(n.link);
          if (orderId) {
            const seenTime = localSeenTimes[orderId] || 0;
            const notifTime = new Date(n.created_at).getTime();
            if (notifTime > seenTime) {
              map[orderId] = (map[orderId] || 0) + 1;
            }
          }
        }
      }
    }

    // 2. فحص تكميلي من ملاحظات الطلب (Notes) إن وُجدت
    if (Array.isArray(ordersWithNotes)) {
      for (const order of ordersWithNotes) {
        if (!order?.id || !order?.notes) continue;
        const messages = parseChatMessagesFromNotes(order.notes);
        if (messages.length === 0) continue;
        const seenTime = localSeenTimes[order.id] || 0;
        let unreadCount = 0;
        for (const msg of messages) {
          if (msg.sender_id !== user.id) {
            const msgTime = new Date(msg.created_at).getTime();
            if (msgTime > seenTime) {
              unreadCount++;
            }
          }
        }
        if (unreadCount > 0 && (!map[order.id] || unreadCount > map[order.id])) {
          map[order.id] = unreadCount;
        }
      }
    }

    return map;
  }, [notifications, ordersWithNotes, localSeenTimes, user?.id]);

  const getUnreadCount = useCallback(
    (orderId: string): number => {
      if (!orderId) return 0;
      return unreadMap[orderId] || 0;
    },
    [unreadMap]
  );

  return {
    unreadMap,
    getUnreadCount,
    markChatAsRead,
  };
}

/**
 * Hook لحساب الرسائل غير المقروءة لطلب محدد
 */
export function useOrderChatUnread(orderId?: string | null, notes?: string | null) {
  const orders = useMemo(() => (orderId ? [{ id: orderId, notes }] : []), [orderId, notes]);
  const { getUnreadCount, markChatAsRead } = useOrderChatUnreadMap(orders);
  return {
    unreadCount: orderId ? getUnreadCount(orderId) : 0,
    markChatAsRead,
  };
}
