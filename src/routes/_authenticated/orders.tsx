import type { SearchSchemaInput } from '@tanstack/react-router';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Package, Check, X, MapPin, MessageCircle, Store, Bike, Star, Volume2, VolumeX, Clock, CheckCircle2, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/AppShell';
import { customerOrdersQuery, catalogQuery } from '@/lib/customer-queries';
import { cancelCustomerRequest } from '@/lib/customer.functions';
import { canCustomerCancel } from '@/lib/customer-rules';
import { flows, type RequestKind } from '@/lib/dashboard-rules';
import { dateAr, money, STATUS_LABELS } from '@/lib/labels';
import { pageMeta } from '@/lib/page-meta';
import { cleanOrderNotes } from '@/lib/utils';
import { cleanDisplayAddress } from '@/lib/map-utils';
import { CustomerError, CustomerNotFound } from '@/components/CustomerFeedback';
import { PushNotificationControls } from '@/components/PushNotificationControls';
import { OrderChatDialog } from '@/components/OrderChatDialog';
import { OrderReviewDialog } from '@/components/OrderReviewDialog';
import { LiveDriverTrackingDialog } from '@/components/LiveDriverTrackingDialog';
import { ChatUnreadBadge } from '@/components/ChatUnreadBadge';
import { useOrderChatUnreadMap } from '@/lib/chat-unread';
import { playCustomerOrderAlert, getCustomerSoundEnabled, setCustomerSoundEnabled } from '@/lib/order-alert';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { OrderTimelineProgressBar } from '@/components/OrderTimelineProgressBar';

export const Route = createFileRoute('/_authenticated/orders')({
  validateSearch: (s: SearchSchemaInput & { filter?: unknown; chat?: unknown }) => ({
    filter: ['all', 'active', 'completed', 'cancelled'].includes(String(s.filter))
      ? String(s.filter)
      : 'all',
    chat: typeof s.chat === 'string' ? s.chat : undefined,
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(customerOrdersQuery),
      context.queryClient.ensureQueryData({ ...catalogQuery, revalidateIfStale: true }),
    ]);
  },
  head: () => pageMeta('طلباتي وحجوزاتي', 'متابعة الطلبات وحجوزات الأطباء والخدمات المنزلية في تطبيق موجود'),
  component: Orders,
  errorComponent: CustomerError,
  notFoundComponent: CustomerNotFound,
});

function getOrderReview(orderId: string): { storeRating: number; driverRating?: number | null } | null {
  try {
    const raw = localStorage.getItem(`order_reviewed_${orderId}`);
    if (!raw) return null;
    if (raw === 'true') return { storeRating: 5 };
    const parsed = JSON.parse(raw);
    return {
      storeRating: typeof parsed.storeRating === 'number' ? parsed.storeRating : 5,
      driverRating: typeof parsed.driverRating === 'number' ? parsed.driverRating : null,
    };
  } catch {
    return null;
  }
}

function Orders() {
  const { data } = useSuspenseQuery(customerOrdersQuery);
  const { data: catalog } = useSuspenseQuery(catalogQuery);
  const client = useQueryClient();
  const cancel = useServerFn(cancelCustomerRequest);
  const { filter, chat } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [busy, setBusy] = useState('');
  const [chatOrderId, setChatOrderId] = useState<string | null>(chat || null);
  const [reviewOrder, setReviewOrder] = useState<any | null>(null);
  const [reviewsVersion, setReviewsVersion] = useState(0);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const { getUnreadCount } = useOrderChatUnreadMap(data?.orders);
  const { user } = useAuth();

  const [soundEnabled, setSoundEnabled] = useState(() => getCustomerSoundEnabled());

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setCustomerSoundEnabled(next);
    if (next) {
      playCustomerOrderAlert("preparing", true);
      toast.info("تم تفعيل صوت تنبيهات حالات الطلب 🔔");
    } else {
      toast.info("تم كتم صوت تنبيهات حالات الطلب 🔕");
    }
  };

  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  const isFirstRender = useRef(true);

  // مراقبة تغير حالات الطلبات وتشغيل التنبيه الصوتي المخصص للعميل عند تغير حالة أي طلب
  useEffect(() => {
    const currentOrders = data?.orders ?? [];
    if (isFirstRender.current) {
      isFirstRender.current = false;
      currentOrders.forEach((o) => {
        prevStatusesRef.current.set(o.id, o.status);
      });
      return;
    }

    let alertTriggered = false;
    for (const o of currentOrders) {
      const oldStatus = prevStatusesRef.current.get(o.id);
      if (oldStatus && oldStatus !== o.status) {
        if (!alertTriggered) {
          playCustomerOrderAlert(o.status, soundEnabled);
          alertTriggered = true;
        }

        const storeName = catalog?.stores.find((s) => s.id === o.store_id)?.name || 'المتجر';
        const label = STATUS_LABELS[o.status] || o.status;
        toast.info(`🔔 تحديث في طلبك من ${storeName}: أصبح "${label}"`, {
          duration: 5000,
        });
      }
      prevStatusesRef.current.set(o.id, o.status);
    }
  }, [data?.orders, catalog?.stores, soundEnabled]);

  // اشتراك فوري عبر Supabase WebSocket لتحديث مراحل الطلبات في أجزاء من الثانية فور تغيير المتجر للحالة
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`customer-live-orders-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;

          // تحديث فوري في كاش React Query في نفس اللحظة (Zero Latency Cache Update)
          client.setQueryData(['customer-orders'], (old: any) => {
            if (!old || !old.orders) return old;
            return {
              ...old,
              orders: old.orders.map((o: any) =>
                o.id === updated.id ? { ...o, ...updated } : o
              ),
            };
          });

          client.invalidateQueries({ queryKey: ['customer-orders'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${user.id}`,
        },
        () => {
          client.invalidateQueries({ queryKey: ['customer-orders'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `customer_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;
          client.setQueryData(['customer-orders'], (old: any) => {
            if (!old || !old.bookings) return old;
            return {
              ...old,
              bookings: old.bookings.map((b: any) =>
                b.id === updated.id ? { ...b, ...updated } : b
              ),
            };
          });
          client.invalidateQueries({ queryKey: ['customer-orders'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests',
          filter: `customer_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;
          client.setQueryData(['customer-orders'], (old: any) => {
            if (!old || !old.services) return old;
            return {
              ...old,
              services: old.services.map((s: any) =>
                s.id === updated.id ? { ...s, ...updated } : s
              ),
            };
          });
          client.invalidateQueries({ queryKey: ['customer-orders'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          client.invalidateQueries({ queryKey: ['customer-orders'] });
          client.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, client]);

  useEffect(() => {
    if (chat) {
      setChatOrderId(chat);
    }
  }, [chat]);

  // Auto-prompt rating dialog ONLY ONCE after an order is delivered
  useEffect(() => {
    const ordersList = data?.orders ?? [];
    const delivered = ordersList.find((o) => o.status === 'delivered');
    if (delivered) {
      try {
        const promptKey = `order_rating_prompted_${delivered.id}`;
        const reviewKey = `order_reviewed_${delivered.id}`;
        const hasPrompted = localStorage.getItem(promptKey);
        const hasReviewed = localStorage.getItem(reviewKey);
        if (!hasPrompted && !hasReviewed) {
          localStorage.setItem(promptKey, 'true');
          setReviewOrder(delivered);
        }
      } catch {}
    }
  }, [data?.orders]);

  const rows = [
    ...(data?.orders ?? []).map((o) => ({
      id: o.id,
      kind: 'orders' as const,
      store_id: o.store_id,
      status: o.status,
      created_at: o.created_at,
      amount: money(o.total),
      description: 'طلب مشتريات',
      address: o.address,
      phone: o.phone,
      notes: o.notes,
      items: o.order_items ?? [],
      driver_id: (o as any).driver_id,
      appointment: '',
      images: 0,
    })),
    ...(data?.bookings ?? []).map((o) => ({
      id: o.id,
      kind: 'bookings' as const,
      store_id: o.store_id,
      status: o.status,
      created_at: o.created_at,
      amount: money(o.fee),
      description: o.patient_name,
      address: 'داخل العيادة',
      phone: o.phone,
      notes: o.notes,
      items: [],
      driver_id: null,
      appointment: `${o.booking_date} • ${o.booking_time}`,
      images: 0,
    })),
    ...(data?.services ?? []).map((o) => ({
      id: o.id,
      kind: 'service_requests' as const,
      store_id: o.store_id,
      status: o.status,
      created_at: o.created_at,
      amount: o.quoted_price === null ? 'بانتظار تحديد السعر' : money(o.quoted_price),
      description: o.description,
      address: o.address,
      phone: o.phone,
      notes: null,
      items: [],
      driver_id: null,
      appointment: o.preferred_date ?? '',
      images: o.image_paths?.length ?? 0,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const complete = (status: string) => ['delivered', 'completed'].includes(status);
  const visible = rows.filter(
    (r) =>
      filter === 'all' ||
      (filter === 'completed'
        ? complete(r.status)
        : filter === 'cancelled'
        ? r.status === 'cancelled'
        : !complete(r.status) && r.status !== 'cancelled')
  );

  async function cancelRow(kind: RequestKind, id: string) {
    if (!window.confirm('هل تريد إلغاء هذا الطلب؟')) return;
    setBusy(id);
    try {
      await cancel({ data: { kind, id } });
      await client.invalidateQueries({ queryKey: ['customer-orders'] });
      await client.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('تم إلغاء الطلب');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر الإلغاء');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-7 flex items-center justify-between">
        <h1 className="text-3xl font-bold">طلباتي وحجوزاتي</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={soundEnabled ? "كتم صوت تنبيهات الطلبات" : "تفعيل صوت تنبيهات الطلبات"}
            title={soundEnabled ? "صوت تنبيهات الطلبات مفعّل (انقر للكتم)" : "صوت تنبيهات الطلبات صامت (انقر للتفعيل)"}
            onClick={toggleSound}
          >
            {soundEnabled ? <Volume2 className="size-4 text-primary" /> : <VolumeX className="size-4 text-muted-foreground" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="تحديث الطلبات"
            aria-label="تحديث الطلبات"
            onClick={() => client.invalidateQueries({ queryKey: ['customer-orders'] })}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      <PushNotificationControls />

      <div className="mb-7 flex flex-wrap gap-2">
        {[
          ['all', 'الكل'],
          ['active', 'قيد التنفيذ'],
          ['completed', 'مكتملة'],
          ['cancelled', 'ملغاة'],
        ].map(([value, label]) => (
          <Button
            key={value}
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => navigate({ search: { filter: value ?? 'all' } })}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="space-y-5">
        {visible.map((r) => {
          const cleanNotes = cleanOrderNotes(r.notes);
          return (
            <article key={`${r.kind}-${r.id}`} className="rounded-xl border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {r.kind === 'orders' ? 'مشتريات' : r.kind === 'bookings' ? 'حجز طبيب' : 'خدمة منزلية'} • #
                    {r.id.slice(0, 8)}
                  </p>
                  <h2 className="text-lg font-bold">
                    {catalog?.stores?.find((s) => s.id === r.store_id)?.name ?? 'متجر غير متاح حاليًا'}
                  </h2>
                  <p className="mt-2 text-xs text-muted-foreground">{dateAr(r.created_at)}</p>
                </div>
                <div className="space-y-2 text-left">
                  <StatusBadge status={r.status} />
                  <p className="text-sm font-semibold">{r.amount}</p>
                </div>
              </div>

              <OrderTimelineProgressBar kind={r.kind} status={r.status} />

              {/* أزرار الإجراءات السريعة (المحادثة الفورية، التقييم، وإلغاء الطلب) */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {r.kind === 'orders' && (r.status === 'delivered' || r.status === 'completed') && (() => {
                  const review = getOrderReview(r.id);
                  if (review) {
                    return (
                      <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs">
                        <span className="font-bold text-foreground flex items-center gap-1">
                          <Star className="size-3.5 fill-amber-400 text-amber-400" />
                          تقييمك:
                        </span>
                        <div className="flex items-center gap-0.5" dir="ltr">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`size-3.5 ${
                                star <= review.storeRating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-muted-foreground/30'
                              }`}
                            />
                          ))}
                        </div>
                        {typeof review.driverRating === 'number' && review.driverRating > 0 && (
                          <span className="text-[11px] text-muted-foreground border-r pr-2 mr-1">
                            (التوصيل: {review.driverRating} ⭐)
                          </span>
                        )}
                      </div>
                    );
                  }

                  // إذا كان العميل قد وصل لحد التقييمات لهذا المتجر (تم تقييمه مسبقاً في قاعدة البيانات أو محلياً)
                  const isStoreLimitReached = Boolean(
                    (data?.reviewedStoreIds && r.store_id && data.reviewedStoreIds.includes(r.store_id)) ||
                    (typeof window !== 'undefined' && r.store_id && localStorage.getItem('store_reviewed_' + r.store_id))
                  );

                  if (isStoreLimitReached) {
                    return (
                      <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground font-semibold">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" />
                        <span>تم تقييم هذا المتجر سابقاً ⭐</span>
                      </div>
                    );
                  }

                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 font-bold"
                      onClick={() => setReviewOrder(r)}
                    >
                      <Star className="size-4 fill-amber-400 text-amber-400" />
                      تقييم المتجر والتوصيل ⭐
                    </Button>
                  );
                })()}

                {r.kind === 'orders' && r.status === 'on_the_way' && (
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                    onClick={() => setTrackingOrderId(r.id)}
                  >
                    <Navigation className="size-4 animate-pulse" />
                    تتبع موقع الكابتن الحي 🗺️
                  </Button>
                )}

                {r.kind === 'orders' && (
                  r.status === 'cancelled' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="relative gap-1.5 text-xs font-bold border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => setChatOrderId(r.id)}
                    >
                      <ChatUnreadBadge count={getUnreadCount(r.id)} />
                      <MessageCircle className="size-3.5" />
                      المحادثة وسبب الإلغاء 💬
                    </Button>
                  ) : (r.status === 'delivered' || r.status === 'completed') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="relative gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setChatOrderId(r.id)}
                    >
                      <ChatUnreadBadge count={getUnreadCount(r.id)} />
                      <MessageCircle className="size-3.5" />
                      سجل المحادثة (مغلقة)
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className={`relative gap-2 font-bold ${
                        r.status === 'on_the_way'
                          ? 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10'
                          : 'border-primary/40 text-primary hover:bg-primary/10'
                      }`}
                      onClick={() => setChatOrderId(r.id)}
                    >
                      <ChatUnreadBadge count={getUnreadCount(r.id)} />
                      {r.status === 'on_the_way' ? (
                        <>
                          <Bike className="size-4" />
                          محادثة كابتن التوصيل 🛵
                        </>
                      ) : (
                        <>
                          <Store className="size-4" />
                          محادثة المتجر / السوبرماركت 🏪
                        </>
                      )}
                    </Button>
                  )
                )}

                {canCustomerCancel(r.kind, r.status) && (
                  <Button
                    disabled={busy === r.id}
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => cancelRow(r.kind, r.id)}
                  >
                    <X className="size-4 ml-1" />
                    إلغاء الطلب
                  </Button>
                )}
              </div>

              <details className="mt-4 border-t pt-3">
                <summary className="cursor-pointer text-sm text-primary font-medium">تفاصيل الطلب</summary>
                <div className="space-y-3 pt-3 text-sm">
                  <p>{r.description}</p>
                  {r.items.map((i) => (
                    <div className="flex justify-between border-b pb-2" key={i.id}>
                      <span>
                        {i.name} × {i.qty}
                      </span>
                      <span>{money(i.price * i.qty)}</span>
                    </div>
                  ))}
                  {r.appointment && <p>الموعد: {r.appointment}</p>}
                  <p className="flex items-start gap-2">
                    <MapPin size={15} />
                    {cleanDisplayAddress(r.address)}
                  </p>
                  <p>الهاتف: {r.phone}</p>
                  {cleanNotes && <p className="text-muted-foreground">ملاحظات: {cleanNotes}</p>}
                  {r.images > 0 && <p>الصور المرفقة: {r.images}</p>}
                </div>
              </details>
            </article>
          );
        })}
      </div>

      {!visible.length && (
        <div className="space-y-5 py-16 text-center">
          <Package className="mx-auto size-12 text-muted-foreground" />
          <p>لا توجد طلبات هنا بعد</p>
          <Button asChild>
            <Link to="/">تصفح الخدمات</Link>
          </Button>
        </div>
      )}

      {/* محادثة كابتن التوصيل والعميل */}
      <OrderChatDialog
        orderId={chatOrderId}
        open={!!chatOrderId}
        onOpenChange={(open) => !open && setChatOrderId(null)}
      />

      {/* خريطة تتبع موقع الكابتن الحي والمباشر */}
      <LiveDriverTrackingDialog
        orderId={trackingOrderId}
        open={!!trackingOrderId}
        onOpenChange={(open) => !open && setTrackingOrderId(null)}
        onOpenChat={(id) => setChatOrderId(id)}
      />

      {/* نافذة تقييم المتجر وكابتن التوصيل بعد اكتمال الطلب */}
      <OrderReviewDialog
        orderId={reviewOrder?.id ?? null}
        storeId={reviewOrder?.store_id ?? null}
        storeName={catalog?.stores?.find((s) => s.id === reviewOrder?.store_id)?.name ?? "المتجر"}
        hasDriver={!!reviewOrder?.driver_id}
        open={!!reviewOrder}
        onOpenChange={(open) => {
          if (!open) {
            if (reviewOrder?.id) {
              try {
                localStorage.setItem(`order_rating_prompted_${reviewOrder.id}`, 'true');
              } catch {}
            }
            setReviewOrder(null);
          }
        }}
        onReviewed={() => {
          setReviewsVersion((v) => v + 1);
        }}
      />
    </div>
  );
}
