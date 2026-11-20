import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  MapPin,
  Store,
  User,
  AlertCircle,
  Loader2,
  Truck,
  Bike,
  Package,
  CheckCircle2,
  X,
  Navigation,
} from "lucide-react";
import { getDeliveryOrderCallDetails, claimOrder } from "@/lib/delivery.functions";
import {
  startIncomingOrderCallRingtone,
  stopIncomingOrderCallRingtone,
  triggerSoftVibration,
} from "@/lib/order-alert";
import { cleanOrderNotes } from "@/lib/utils";
import { money } from "@/lib/labels";
import { cleanDisplayAddress, getGoogleMapsPinUrl } from "@/lib/map-utils";

interface IncomingDeliveryCallDialogProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClaimSuccess?: (orderId: string) => void;
}

/**
 * تنظيف العنوان بالكامل من أي إحداثيات GPS (أرقام خطوط الطول والعرض)
 * وإظهار نص العنوان البشري النظيف فقط
 */
function cleanAddressWithoutCoordinates(address?: string | null): string {
  if (!address) return "العنوان غير محدد";
  let cleaned = address
    .replace(/<!--\s*GPS:[\s\S]*?-->/gi, "")
    .replace(/<!--\s*DRIVER_GPS:[\s\S]*?-->/gi, "")
    .replace(/<!--\s*CHAT_V1:[\s\S]*?-->/gi, "")
    .replace(/\s*(?:📍|\(|\[)?\s*-?[0-9]{1,3}\.[0-9]{3,12}\s*,\s*-?[0-9]{1,3}\.[0-9]{3,12}(?:\)|\])?/g, "")
    .replace(/\s*(?:إحداثيات|إحداثي|Coordinates|GPS|lat|lng|latitude|longitude)[:=]?\s*[-0-9., ]+/gi, "")
    .trim();
  cleaned = cleaned.replace(/^[,\-\s]+|[,\-\s]+$/g, "");
  return cleaned || "العنوان داخل الحسينية";
}

export function IncomingDeliveryCallDialog({
  orderId,
  open,
  onOpenChange,
  onClaimSuccess,
}: IncomingDeliveryCallDialogProps) {
  const qc = useQueryClient();
  const getDetails = useServerFn(getDeliveryOrderCallDetails);
  const doClaim = useServerFn(claimOrder);

  // Start continuous telephone ringtone while incoming call is open, stop on exit
  useEffect(() => {
    if (open && orderId) {
      startIncomingOrderCallRingtone();
    } else {
      stopIncomingOrderCallRingtone();
    }
    return () => {
      stopIncomingOrderCallRingtone();
    };
  }, [open, orderId]);

  // Fetch full delivery order details
  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["delivery-order-call-details", orderId],
    queryFn: () => (orderId ? getDetails({ data: { orderId } }) : null),
    enabled: !!orderId && open,
  });

  // Auto-close call dialog if order is already claimed by someone else or cancelled
  useEffect(() => {
    if (open && order) {
      if (order.status !== "preparing" || (order.driver_id && order.driver_id !== null)) {
        stopIncomingOrderCallRingtone();
        onOpenChange(false);
        toast.info("تم استلام هذا الطلب أو تغيير حالته بالفعل.");
      }
    }
  }, [open, order?.status, order?.driver_id, onOpenChange]);

  // Claim mutation
  const claimMutation = useMutation({
    mutationFn: async (id: string) => {
      return doClaim({ data: { id } });
    },
    onSuccess: async (_, id) => {
      stopIncomingOrderCallRingtone();
      triggerSoftVibration([100, 50, 150]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["delivery-board"] }),
        qc.invalidateQueries({ queryKey: ["delivery-fleet"] }),
        qc.invalidateQueries({ queryKey: ["delivery-order-call-details", id] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["customer-orders"] }),
      ]);
      toast.success("✅ تم استلام الطلب وأصبح في عهدتك للتوصيل! تم إيقاف رنين المكالمة.");
      onClaimSuccess?.(id);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "تعذر استلام الطلب، قد يكون استلمه كابتن آخر");
      stopIncomingOrderCallRingtone();
      onOpenChange(false);
    },
  });

  const isBusy = claimMutation.isPending;

  function handleClaim() {
    if (!orderId || isBusy) return;
    claimMutation.mutate(orderId);
  }

  function handleDismiss() {
    stopIncomingOrderCallRingtone();
    onOpenChange(false);
    toast.info("تم تخطي المكالمة. الطلب ما زال متاحاً في رادار التوصيل.");
  }

  if (!open || !orderId) return null;

  const shortId = orderId.slice(0, 8);
  const cleanedNotes = order?.notes ? cleanOrderNotes(order.notes) : null;
  const storeAddressClean = cleanAddressWithoutCoordinates(order?.store_address);
  const customerAddressClean = cleanAddressWithoutCoordinates(order?.address);

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="مكالمة استلام طلب جديد للكابتن"
      className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-2xl text-white flex flex-col justify-between overflow-hidden p-4 sm:p-6 animate-in fade-in duration-300"
    >
      {/* زر إغلاق نافذة المكالمة في الشمال من فوق للمتابعة من الرادار */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="إغلاق شاشة المكالمة والمتابعة من الرادار"
        title="إغلاق نافذة المكالمة والمتابعة من الرادار"
        className="absolute top-4 left-4 sm:top-6 sm:left-6 z-50 size-11 sm:size-12 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-slate-300 hover:text-white border border-white/20 flex items-center justify-center transition-all shadow-xl backdrop-blur-md group"
      >
        <X className="size-6 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200" />
      </button>

      {/* Top Header / Incoming Call Visual Banner */}
      <div className="flex flex-col items-center text-center pt-2 sm:pt-4 shrink-0">
        <div className="relative">
          {/* Animated pulsing wave rings like an incoming telephone call */}
          <div className="absolute -inset-3 rounded-full bg-emerald-500/30 animate-ping opacity-60" />
          <div className="absolute -inset-6 rounded-full bg-emerald-500/15 animate-pulse opacity-40" />

          <div className="relative size-20 sm:size-24 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.8)]">
            <Truck className="size-10 animate-bounce" />
          </div>
        </div>

        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-4 flex items-center justify-center gap-2">
          <span>مكالمة استلام أوردر جاهز للتوصيل 🛵</span>
          <span className="size-2.5 rounded-full bg-emerald-400 animate-ping" />
        </h2>

        <p className="text-emerald-400 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 mt-1 animate-pulse">
          <PhoneCall className="size-4 animate-bounce" />
          <span>المطعم انتهى من التجهيز وجاهز للتسليم الآن...</span>
        </p>

        <div className="mt-2.5 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 text-xs font-semibold border border-white/15">
          <span className="text-slate-200">{order?.store_name || "المتجر"}</span>
          <span className="text-slate-400">•</span>
          <span className="text-emerald-300 font-mono">أوردر #{shortId}</span>
        </div>
      </div>

      {/* Middle Content: Order & Pickup/Dropoff Details Card */}
      <div className="w-full max-w-lg mx-auto flex-1 my-3 overflow-y-auto px-1 space-y-3">
        {isLoading ? (
          <div className="h-44 flex flex-col items-center justify-center gap-3 text-slate-300">
            <Loader2 className="size-8 animate-spin text-emerald-400" />
            <p className="text-xs font-bold">جاري تحميل بيانات الأوردر والمطعم والعميل...</p>
          </div>
        ) : isError || !order ? (
          <div className="h-44 flex flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="size-8 text-rose-400" />
            <p className="text-sm font-bold">تعذر تحميل تفاصيل الطلب</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="border-white/20 text-white hover:bg-white/10 text-xs font-bold"
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <>
            {/* بطاقة نقطة الاستلام: المطعم ومكانه */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-4 shadow-lg backdrop-blur-md">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-emerald-500/20">
                <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <Store className="size-4 text-emerald-400" />
                  <span>1. نقطة الاستلام (المطعم / المحل)</span>
                </span>
                {order.store_phone && (
                  <a
                    href={`tel:${order.store_phone}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-bold transition-all"
                  >
                    <Phone className="size-3" />
                    <span>اتصال بالمتجر</span>
                  </a>
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-black text-white">{order.store_name}</h3>
                <p className="text-xs text-slate-300 flex items-start gap-1.5 leading-relaxed">
                  <MapPin className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{storeAddressClean}</span>
                </p>
              </div>
            </div>

            {/* بطاقة نقطة التسليم: العميل ومكانه */}
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/40 p-4 shadow-lg backdrop-blur-md">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-amber-500/20">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <User className="size-4 text-amber-400" />
                  <span>2. نقطة التسليم (العميل)</span>
                </span>
                {order.phone && (
                  <a
                    href={`tel:${order.phone}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-bold transition-all"
                  >
                    <Phone className="size-3" />
                    <span>اتصال بالعميل</span>
                  </a>
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-black text-white">{order.customer_name}</h3>
                <p className="text-xs text-slate-300 flex items-start gap-1.5 leading-relaxed">
                  <MapPin className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{customerAddressClean}</span>
                </p>
                {order.address && (
                  <div className="pt-1.5">
                    <a
                      href={getGoogleMapsPinUrl(order.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:text-amber-200 underline"
                    >
                      <Navigation className="size-3" />
                      <span>عرض موقع العميل على الخريطة</span>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* بطاقة الماليات: أجر التوصيل والمطلوب تحصيله */}
            <div className="grid grid-cols-2 gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/20 p-2.5">
                <span className="text-[11px] font-bold text-slate-300 block">أجرك في التوصيل</span>
                <strong className="text-base sm:text-lg font-black text-emerald-300">
                  {money(order.delivery_fee)}
                </strong>
              </div>
              <div className="rounded-xl bg-rose-500/15 border border-rose-500/20 p-2.5">
                <span className="text-[11px] font-bold text-slate-300 block">المطلوب تحصيله نقدًا</span>
                <strong className="text-base sm:text-lg font-black text-rose-300">
                  {money(order.total)}
                </strong>
              </div>
            </div>

            {/* تفاصيل الأصناف */}
            {order.items && order.items.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 space-y-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Package className="size-4 text-slate-400" />
                  <span>محتويات الأوردر ({order.items.length} صنف):</span>
                </span>
                <div className="divide-y divide-white/10 text-xs">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="py-1.5 flex items-center justify-between text-slate-200">
                      <span className="font-semibold">
                        {item.qty} × {item.name}
                      </span>
                      <span className="text-slate-400">{money(item.price * item.qty)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ملاحظات الأوردر إن وجدت */}
            {cleanedNotes && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200 leading-relaxed">
                <span className="font-bold block mb-0.5">📌 ملاحظات إضافية:</span>
                <span>{cleanedNotes}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Action Buttons: رد واستلام (قبول) أو تخطي (إغلاق) */}
      <div className="w-full max-w-lg mx-auto pt-2 shrink-0 space-y-2.5">
        <Button
          type="button"
          size="lg"
          disabled={isBusy || isLoading}
          onClick={handleClaim}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.98] text-white font-black text-base shadow-[0_0_30px_rgba(16,185,129,0.5)] border border-emerald-400/40 flex items-center justify-center gap-2.5 transition-all"
        >
          {isBusy ? (
            <>
              <Loader2 className="size-6 animate-spin" />
              <span>جاري تأكيد الاستلام وبدء التوصيل...</span>
            </>
          ) : (
            <>
              <PhoneCall className="size-6 animate-bounce" />
              <span>رد واستلام الأوردر الآن (قبول التوصيل) 🛵</span>
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isBusy}
          onClick={handleDismiss}
          className="w-full h-10 rounded-xl bg-white/5 hover:bg-white/10 active:scale-[0.98] text-slate-300 hover:text-white text-xs font-bold border border-white/10 flex items-center justify-center gap-2 transition-all"
        >
          <PhoneOff className="size-4 text-slate-400" />
          <span>تخطي المكالمة (المتابعة من الرادار)</span>
        </Button>
      </div>
    </div>
  );
}
