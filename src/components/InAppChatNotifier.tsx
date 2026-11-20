import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare, X, Store, Bike, BellRing, Check, CheckCircle2, AlertCircle, Megaphone, Bell, UtensilsCrossed, Volume2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { getNotifications, readNotification } from "@/lib/customer.functions";
import { registerPushDevice } from "@/lib/push.functions";
import { OrderChatDialog } from "@/components/OrderChatDialog";
import { IncomingOrderCallDialog } from "@/components/dashboard/IncomingOrderCallDialog";
import { IncomingDeliveryCallDialog } from "@/components/delivery/IncomingDeliveryCallDialog";
import { StoreOrderActionDialog } from "@/components/dashboard/StoreOrderActionDialog";
import { Button } from "@/components/ui/button";
import { playCustomerOrderAlert, getCustomerSoundEnabled, playNewOrderAlert } from "@/lib/order-alert";
import { supabase } from "@/integrations/supabase/client";
import {
  getPersistedSeenNotificationIds,
  persistSeenNotificationIds,
  syncSeenNotificationIdsFromStorage,
  SEEN_BANNERS_STORAGE_KEY_PREFIX,
} from "@/lib/notification-seen";

function playMessageChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    // Double chime: First high tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Second higher tone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
    gain2.gain.setValueAtTime(0.3, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);
  } catch {}
}

interface NotificationBannerItem {
  id: string;
  orderId: string;
  title: string;
  body: string;
  isOrderStatus?: boolean;
  isStoreNewOrder?: boolean;
  detectedStatus?: string;
  link?: string;
}

export function InAppChatNotifier() {
  const { user, isDriver } = useAuth();
  const getNotifs = useServerFn(getNotifications);
  const markRead = useServerFn(readNotification);
  const registerDevice = useServerFn(registerPushDevice);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [activeBanners, setActiveBanners] = useState<NotificationBannerItem[]>([]);
  const [openChatOrderId, setOpenChatOrderId] = useState<string | null>(null);
  const [storeActionOrderId, setStoreActionOrderId] = useState<string | null>(null);
  const [incomingCallOrderId, setIncomingCallOrderId] = useState<string | null>(null);
  const [deliveryCallOrderId, setDeliveryCallOrderId] = useState<string | null>(null);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const dismissTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const isInitialLoadRef = useRef(true);

  // Load persisted seen IDs when user changes or component mounts
  useEffect(() => {
    if (!user?.id) {
      seenNotificationIdsRef.current = new Set();
      isInitialLoadRef.current = true;
      return;
    }
    const persisted = getPersistedSeenNotificationIds(user.id);
    seenNotificationIdsRef.current = new Set(persisted);
    isInitialLoadRef.current = true;
  }, [user?.id]);

  // Sync seen notifications across multiple open tabs in real-time
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `${SEEN_BANNERS_STORAGE_KEY_PREFIX}${user.id}` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            parsed.forEach((id: string) => seenNotificationIdsRef.current.add(id));
          }
        } catch {}
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [user?.id]);

  // Cleanup auto-dismiss timers on unmount
  useEffect(() => {
    return () => {
      dismissTimersRef.current.forEach((t) => clearTimeout(t));
      dismissTimersRef.current.clear();
    };
  }, []);

  // Remove a banner by id with optional mark-as-read
  const removeBanner = (id: string, shouldMarkRead: boolean = false) => {
    const timer = dismissTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(id);
    }
    setActiveBanners((prev) => prev.filter((b) => b.id !== id));
    if (shouldMarkRead) {
      markAsReadMutation.mutate(id);
    }
  };

  // Auto-register push if permission is granted, or prompt if default
  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    async function checkPushPermission() {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

      if (Notification.permission === "granted") {
        try {
          const { enablePush } = await import("@/lib/push-browser");
          const res = await enablePush();
          if (res.status === "registered" && res.token) {
            await registerDevice({ data: { token: res.token } });
          }
        } catch {}
      } else if (Notification.permission === "default") {
        const dismissed = localStorage.getItem("husayniya_push_dismissed");
        if (!dismissed) {
          setShowPushPrompt(true);
        }
      }
    }

    const t = setTimeout(checkPushPermission, 3000);
    return () => clearTimeout(t);
  }, [user]);

  async function handleEnablePush() {
    setPushBusy(true);
    try {
      const { enablePush } = await import("@/lib/push-browser");
      const res = await enablePush();
      if (res.status === "registered" && res.token) {
        await registerDevice({ data: { token: res.token } });
        setShowPushPrompt(false);
      } else if (res.status === "denied") {
        setShowPushPrompt(false);
      }
    } catch {
      setShowPushPrompt(false);
    } finally {
      setPushBusy(false);
    }
  }

  function handleDismissPushPrompt() {
    setShowPushPrompt(false);
    try {
      localStorage.setItem("husayniya_push_dismissed", "true");
    } catch {}
  }

  // Poll for notifications every 3.5 seconds when user is signed in
  const { data: notifications } = useQuery({
    queryKey: ["in-app-chat-notifications", user?.id],
    queryFn: () => getNotifs(),
    enabled: !!user,
    refetchInterval: 3500,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (notifId: string) => markRead({ data: { id: notifId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["in-app-chat-notifications"] });
    },
  });

  // استقبال الإشعارات وتحديثات الطلبات فورياً عبر Supabase WebSocket في أجزاء من الثانية
  useEffect(() => {
    if (!user?.id) return;

    // 1. القناة الفورية لجدول الإشعارات
    const notifsChannel = supabase
      .channel(`in-app-notifs-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["in-app-chat-notifications", user.id] });
          qc.invalidateQueries({ queryKey: ["notifications"] });
          qc.invalidateQueries({ queryKey: ["unread"] });
          qc.invalidateQueries({ queryKey: ["customer-orders"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }
      )
      .subscribe();

    // 2. القناة الفورية للطلبات في قاعدة البيانات مباشرة (سواء أُرسل الطلب من التطبيق أو الموقع)
    const ordersChannel = supabase
      .channel(`in-app-orders-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["customer-orders"] });
          qc.invalidateQueries({ queryKey: ["delivery-board"] });
          qc.invalidateQueries({ queryKey: ["in-app-chat-notifications", user.id] });

          const newOrder = payload?.new;
          const isDeliveryPage = typeof window !== "undefined" && window.location.pathname.includes("/delivery");

          // إذا كان الطلب جديداً بحالة قيد الانتظار ولم يقم هذا المستخدم بطلبه (أي أنه صاحب المتجر أو الإدارة)
          if (newOrder?.id && newOrder?.status === "pending" && newOrder.customer_id !== user.id) {
            setIncomingCallOrderId(newOrder.id);
          }

          // إذا أصبح الطلب جاهزاً للاستلام (preparing) وكان المستخدم سائقاً وليس في صفحة الدليفري حالياً
          if (
            newOrder?.id &&
            newOrder?.status === "preparing" &&
            !newOrder.driver_id &&
            isDriver &&
            !isDeliveryPage
          ) {
            setDeliveryCallOrderId(newOrder.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifsChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, [user?.id, isDriver, qc]);

  // Check for incoming notifications (orders, chat, broadcasts, appointments)
  useEffect(() => {
    if (!notifications || !Array.isArray(notifications) || !user) return;

    // Synchronize latest seen IDs from storage (handles cross-tab actions)
    syncSeenNotificationIdsFromStorage(user.id, seenNotificationIdsRef.current);

    // On cold start / initial page load after restart:
    // Mark all existing unread notifications as seen so they never flood the screen on reload
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      let hasNewSeen = false;
      for (const n of notifications) {
        if (!seenNotificationIdsRef.current.has(n.id)) {
          seenNotificationIdsRef.current.add(n.id);
          hasNewSeen = true;
        }
      }
      if (hasNewSeen) {
        persistSeenNotificationIds(user.id, seenNotificationIdsRef.current);
      }
      return;
    }

    // Filter all new unread notifications that have not been seen
    const unreadList = notifications.filter(
      (n: any) => !n.is_read && !seenNotificationIdsRef.current.has(n.id)
    );

    if (unreadList.length === 0) return;

    const activeWindowChatId = typeof window !== "undefined" ? (window as any).__HUSAYNIYA_ACTIVE_CHAT_ORDER_ID : null;
    const newBanners: NotificationBannerItem[] = [];
    let playedSound = false;

    for (const unread of unreadList) {
      seenNotificationIdsRef.current.add(unread.id);

      // Extract orderId from link if present
      let extractedOrderId = "";
      if (unread.link && unread.link.includes("chat=")) {
        extractedOrderId = unread.link.split("chat=")[1].split("&")[0];
      } else if (unread.link && unread.link.includes("order=")) {
        extractedOrderId = unread.link.split("order=")[1].split("&")[0];
      }

      // If chat dialog is already open for this order, silently mark read and skip top banner
      if (
        (activeWindowChatId && activeWindowChatId === extractedOrderId) ||
        (openChatOrderId && openChatOrderId === extractedOrderId)
      ) {
        markAsReadMutation.mutate(unread.id);
        continue;
      }

      const isOrderStatus =
        unread.title.includes("طلبك") ||
        unread.title.includes("حالة") ||
        unread.title.includes("استلم") ||
        unread.title.includes("تأكيد") ||
        unread.title.includes("تحضير") ||
        unread.title.includes("تسليم") ||
        unread.title.includes("إلغاء");

      let detectedStatus = "general";
      if (unread.title.includes("طريق") || unread.body.includes("طريق")) {
        detectedStatus = "on_the_way";
      } else if (unread.title.includes("تحضير") || unread.body.includes("تحضير")) {
        detectedStatus = "preparing";
      } else if (unread.title.includes("قبول") || unread.title.includes("تأكيد") || unread.body.includes("تأكيد")) {
        detectedStatus = "accepted";
      } else if (unread.title.includes("تسليم") || unread.title.includes("نجاح")) {
        detectedStatus = "delivered";
      } else if (unread.title.includes("إلغاء") || unread.title.includes("الغاء")) {
        detectedStatus = "cancelled";
      }

      const isChat =
        unread.title.includes("رسالة") ||
        unread.body.includes("رسالة") ||
        (unread.link && unread.link.includes("chat="));

      const isStoreNewOrder =
        (unread.title.includes("طلب جديد") || unread.body.includes("طلب جديد")) &&
        !unread.link?.includes("/delivery") &&
        !isOrderStatus &&
        !isChat;

      const isDeliveryReadyCall =
        unread.link?.includes("/delivery") &&
        (unread.link.includes("call=") || unread.title.includes("جاهز للاستلام"));

      if (isDeliveryReadyCall) {
        qc.invalidateQueries({ queryKey: ['delivery-board'] });
        let targetOrderId = extractedOrderId;
        if (!targetOrderId) {
          const uuidMatch = (unread.link || unread.body || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          if (uuidMatch) {
            targetOrderId = uuidMatch[0];
          }
        }
        const isDeliveryPage = typeof window !== "undefined" && window.location.pathname.includes("/delivery");
        if (targetOrderId && isDriver && !isDeliveryPage) {
          void supabase
            .from('orders')
            .select('id, status, driver_id')
            .eq('id', targetOrderId)
            .maybeSingle()
            .then((res) => {
              if (res.data?.status === 'preparing' && !res.data?.driver_id) {
                setDeliveryCallOrderId(targetOrderId);
              }
            });
        }
      }

      if (isStoreNewOrder) {
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        // فتح شاشة مكالمة الطلب الجديد فقط إذا كان الطلب معلقاً (Pending) ولم يتم قبوله بعد
        let targetOrderId = extractedOrderId;
        if (!targetOrderId) {
          const uuidMatch = (unread.link || unread.body || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          if (uuidMatch) {
            targetOrderId = uuidMatch[0];
          }
        }
        if (targetOrderId) {
          void supabase
            .from('orders')
            .select('id, status')
            .eq('id', targetOrderId)
            .maybeSingle()
            .then((res) => {
              if (res.data?.status === 'pending') {
                setIncomingCallOrderId(targetOrderId);
              }
            });
        }
      } else if (!playedSound) {
        if (isOrderStatus) {
          qc.invalidateQueries({ queryKey: ['customer-orders'] });
          const soundEnabled = getCustomerSoundEnabled();
          playCustomerOrderAlert(detectedStatus, soundEnabled);
          playedSound = true;
        } else {
          playMessageChime();
          playedSound = true;
        }
      }

      const bannerItem: NotificationBannerItem = {
        id: unread.id,
        orderId: extractedOrderId,
        title: unread.title,
        body: unread.body,
        isOrderStatus,
        isStoreNewOrder,
        detectedStatus,
        link: unread.link,
      };

      newBanners.push(bannerItem);

      // Auto-dismiss: normal banners 3s, store orders stay for 30s with kitchen alarm so merchant has ample time
      const dismissDuration = isStoreNewOrder ? 30000 : 3000;
      const timer = setTimeout(() => {
        removeBanner(unread.id, false);
      }, dismissDuration);
      dismissTimersRef.current.set(unread.id, timer);
    }

    // Persist seen IDs immediately so they never reappear even on immediate page refresh
    persistSeenNotificationIds(user.id, seenNotificationIdsRef.current);

    if (newBanners.length > 0) {
      setActiveBanners((prev) => {
        // Stack new banners beneath existing ones, limiting to 4 visible stacked banners
        const combined = [...prev, ...newBanners];
        return combined.slice(-4);
      });
    }
  }, [notifications, user, openChatOrderId]);

  function handleBannerClick(banner: NotificationBannerItem) {
    removeBanner(banner.id, true);

    if (banner.isStoreNewOrder && banner.orderId) {
      setIncomingCallOrderId(banner.orderId);
      return;
    }

    if (banner.link && banner.link.includes("/provider")) {
      navigate({ to: banner.link });
    } else if (banner.orderId && (!banner.isOrderStatus || banner.link?.includes("chat="))) {
      setOpenChatOrderId(banner.orderId);
    } else if (banner.link) {
      navigate({ to: banner.link });
    } else {
      navigate({ to: "/orders" });
    }
  }

  function handleDismiss(e: React.MouseEvent, bannerId: string) {
    e.stopPropagation();
    removeBanner(bannerId, true);
  }

  return (
    <>
      {/* Push Notification Enable Banner */}
      {showPushPrompt && activeBanners.length === 0 && (
        <div
          role="alert"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[9998] w-[94%] max-w-md animate-in fade-in slide-in-from-top-4"
        >
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-card/95 p-3 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <BellRing className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-xs">تفعيل إشعارات الهاتف</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  لتلقي رسائل الطلبات وتنبيهات الكابتن حتى لو أغلقت الموقع
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                disabled={pushBusy}
                onClick={handleEnablePush}
                className="h-8 gap-1 px-2.5 text-xs font-bold"
              >
                <Check className="size-3.5" />
                تفعيل
              </Button>
              <button
                type="button"
                onClick={handleDismissPushPrompt}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
                title="لاحقاً"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stacked In-App Notification Banners: Auto-dismiss after 3s (or 30s for store orders) and stack beneath each other */}
      {activeBanners.length > 0 && (
        <div
          role="region"
          aria-label="تنبيهات الموقع المباشرة"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] w-[94%] max-w-md flex flex-col gap-2.5 pointer-events-none"
        >
          {activeBanners.map((banner) => (
            <div
              key={banner.id}
              role="alert"
              onClick={() => handleBannerClick(banner)}
              className="pointer-events-auto cursor-pointer select-none transition-all duration-300 animate-in fade-in slide-in-from-top-3"
            >
              <div
                className={`relative overflow-hidden rounded-2xl border-2 ${
                  banner.isStoreNewOrder
                    ? "border-amber-500/80 bg-card/98 shadow-2xl ring-2 ring-amber-500/25"
                    : "border-primary/40 bg-card/95 shadow-xl"
                } backdrop-blur-md p-3.5 hover:border-primary transition-colors`}
              >
                {/* Countdown progress bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20">
                  <div
                    className="h-full bg-primary"
                    style={{
                      animation: `shrink ${banner.isStoreNewOrder ? "30s" : "3s"} linear forwards`,
                    }}
                  />
                </div>

                <div className="flex items-start justify-between gap-3 pt-1">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`size-10 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
                        banner.isStoreNewOrder
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/30"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {banner.isStoreNewOrder ? (
                        <UtensilsCrossed className="size-5 animate-pulse" />
                      ) : banner.detectedStatus === "delivered" ? (
                        <CheckCircle2 className="size-5 text-emerald-600" />
                      ) : banner.detectedStatus === "cancelled" || banner.title.includes("إلغاء") || banner.title.includes("اعتذار") ? (
                        <AlertCircle className="size-5 text-destructive" />
                      ) : banner.title.includes("الكابتن") || banner.title.includes("التوصيل") || banner.detectedStatus === "on_the_way" ? (
                        <Bike className="size-5 text-emerald-600 animate-bounce" />
                      ) : banner.title.includes("المتجر") || banner.detectedStatus === "preparing" || banner.detectedStatus === "accepted" ? (
                        <Store className="size-5 text-primary" />
                      ) : banner.title.includes("رسالة") || banner.link?.includes("chat=") ? (
                        <MessageSquare className="size-5 text-primary" />
                      ) : banner.title.includes("إعلان") || banner.title.includes("تنويه") || banner.title.includes("تخفيض") ? (
                        <Megaphone className="size-5 text-amber-600" />
                      ) : (
                        <Bell className="size-5 text-primary" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground truncate">
                          {banner.title}
                        </span>
                        <span
                          className={`inline-block size-2 rounded-full shrink-0 ${
                            banner.isStoreNewOrder
                              ? "bg-amber-500 animate-ping"
                              : "bg-emerald-500 animate-pulse"
                          }`}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {banner.body}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleDismiss(e, banner.id)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors shrink-0"
                    title="إغلاق"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Direct quick action buttons for restaurant/merchant orders */}
                {banner.isStoreNewOrder && banner.orderId && (
                  <div className="mt-3 pt-2.5 border-t border-border/70 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 animate-pulse">
                      <Volume2 className="size-3.5 shrink-0" />
                      رنين إنذار المطبخ
                    </span>
                    <Button
                      size="sm"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBanner(banner.id, false);
                        setIncomingCallOrderId(banner.orderId);
                      }}
                      className="h-8 px-3.5 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm rounded-xl transition-transform active:scale-95"
                    >
                      <UtensilsCrossed className="size-3.5" />
                      فتح الطلب (قبول / رفض)
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Global Order Chat Dialog when banner is clicked */}
      <OrderChatDialog
        orderId={openChatOrderId}
        open={!!openChatOrderId}
        onOpenChange={(open) => !open && setOpenChatOrderId(null)}
      />

      {/* Global Store Order Action Dialog (Fallback) */}
      <StoreOrderActionDialog
        orderId={storeActionOrderId}
        open={!!storeActionOrderId}
        onOpenChange={(open) => !open && setStoreActionOrderId(null)}
      />

      {/* Full-Screen Incoming Phone Call Alert Screen for Store Orders */}
      <IncomingOrderCallDialog
        orderId={incomingCallOrderId}
        open={!!incomingCallOrderId}
        onOpenChange={(open) => !open && setIncomingCallOrderId(null)}
      />

      {/* Full-Screen Incoming Phone Call Alert Screen for Delivery Captains */}
      <IncomingDeliveryCallDialog
        orderId={deliveryCallOrderId}
        open={!!deliveryCallOrderId}
        onOpenChange={(open) => !open && setDeliveryCallOrderId(null)}
        onClaimSuccess={() => {
          setDeliveryCallOrderId(null);
          navigate({ to: "/delivery", search: { tab: "current" } });
        }}
      />
    </>
  );
}
