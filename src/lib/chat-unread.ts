// src/lib/chat-unread.ts
// نظام تتبع وحساب الرسائل غير المقروءة في الشات لكل طلب وتحديث فوري للمؤشر وقراءة الرسائل
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
  is_read?: boolean;
  read_at?: string | null;
}> {
  if (!notes) return [];
  const match = notes.match(/<!-- CHAT_V1: ([\s\S]*?) -->/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed)
      ? parsed.map((m: any) => ({
          ...m,
          is_read: m.is_read !== undefined ? Boolean(m.is_read) : Boolean(m.read_at),
          read_at: m.read_at || null,
        }))
      : [];
  } catch {
    return [];
  }
}

export interface OrderWithNotes {
  id: string;
  notes?: string | null;
}

// ذاكرة مشتركة آنية في المتصفح لمزامنة إغلاق البادج الأحمر وتحديث المقروئية فوراً عبر جميع المكونات
const globalSeenTimes: Record<string, number> = {};
let currentActiveChatOrderId: string | null = null;
const globalListeners = new Set<() => void>();

function notifySubscribers() {
  globalListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function setActiveChatOrderId(orderId: string | null) {
  currentActiveChatOrderId = orderId;
  if (typeof window !== "undefined") {
    (window as any).__HUSAYNIYA_ACTIVE_CHAT_ORDER_ID = orderId;
  }
  notifySubscribers();
}

export function recordChatSeen(orderId: string, userId?: string) {
  if (!orderId) return;
  const now = Date.now();
  globalSeenTimes[orderId] = now;
  currentActiveChatOrderId = orderId;
  if (typeof window !== "undefined") {
    (window as any).__HUSAYNIYA_ACTIVE_CHAT_ORDER_ID = orderId;
    if (userId) {
      try {
        const stored = localStorage.getItem(`husayniya_chat_seen_${userId}`);
        const parsed = stored ? JSON.parse(stored) : {};
        parsed[orderId] = now;
        localStorage.setItem(`husayniya_chat_seen_${userId}`, JSON.stringify(parsed));
      } catch {}
    }
    window.dispatchEvent(new CustomEvent("husayniya-chat-seen-event", { detail: { orderId, timestamp: now } }));
  }
  notifySubscribers();
}

export function clearActiveChatOrder(orderId: string) {
  if (currentActiveChatOrderId === orderId) {
    currentActiveChatOrderId = null;
  }
  if (typeof window !== "undefined" && (window as any).__HUSAYNIYA_ACTIVE_CHAT_ORDER_ID === orderId) {
    (window as any).__HUSAYNIYA_ACTIVE_CHAT_ORDER_ID = null;
  }
  notifySubscribers();
}

/**
 * Hook لحساب وتتبع الرسائل غير المقروءة لكل طلب (للعميل، الكابتن، والمحل)
 * يعتمد على استعلام الإشعارات الفوري الذي يتم تحديثه تلقائياً كل 3.5 ثوانٍ
 * ويفحص أيضاً ملاحظات الطلب لضمان دقة 100% دون تأخير وتصفير البادج فوراً
 */
export function useOrderChatUnreadMap(ordersWithNotes?: OrderWithNotes[]) {
  const { user } = useAuth();
  const getNotifs = useServerFn(getNotifications);
  const markOrderRead = useServerFn(readOrderChatNotifications);
  const qc = useQueryClient();

  const [, setVersion] = useState(0);

  // اشتراك فوري في الأحداث العامة لمزامنة إغلاق البادج الأحمر في نفس اللحظة
  useEffect(() => {
    const onUpdate = () => setVersion((v) => v + 1);
    globalListeners.add(onUpdate);

    const onCustomEvent = (e: any) => {
      if (e.detail?.orderId && e.detail?.timestamp) {
        globalSeenTimes[e.detail.orderId] = e.detail.timestamp;
      }
      onUpdate();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("husayniya-chat-seen-event", onCustomEvent);
    }

    return () => {
      globalListeners.delete(onUpdate);
      if (typeof window !== "undefined") {
        window.removeEventListener("husayniya-chat-seen-event", onCustomEvent);
      }
    };
  }, []);

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
    if (typeof window !== "undefined" && user?.id) {
      try {
        const stored = localStorage.getItem(`husayniya_chat_seen_${user.id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          setLocalSeenTimes(parsed);
          Object.assign(globalSeenTimes, parsed);
        }
      } catch {}
    }
  }, [user?.id]);

  // دالة تعليم المحادثة كمقروءة فور فتحها
  const markChatAsRead = useCallback(
    async (orderId: string) => {
      if (!orderId || !user?.id) return;
      recordChatSeen(orderId, user.id);

      // تحديث فوري ومتفائل لكافة الإشعارات في الذاكرة لتصفير البادج بدون أي تأخير
      qc.setQueryData(["in-app-chat-notifications", user.id], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((n) => {
          if (n.link && n.link.includes(`chat=${orderId}`)) {
            return { ...n, is_read: true };
          }
          return n;
        });
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
            if (currentActiveChatOrderId === orderId) continue;
            const seenTime = Math.max(localSeenTimes[orderId] || 0, globalSeenTimes[orderId] || 0);
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
        if (currentActiveChatOrderId === order.id) continue;
        const messages = parseChatMessagesFromNotes(order.notes);
        if (messages.length === 0) continue;
        const seenTime = Math.max(localSeenTimes[order.id] || 0, globalSeenTimes[order.id] || 0);
        let unreadCount = 0;
        for (const msg of messages) {
          if (msg.sender_id !== user.id && !msg.is_read) {
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
      if (currentActiveChatOrderId === orderId) return 0;
      if (typeof window !== "undefined" && (window as any).__HUSAYNIYA_ACTIVE_CHAT_ORDER_ID === orderId) return 0;
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
