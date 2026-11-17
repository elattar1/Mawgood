import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Check,
  X,
  Phone,
  PhoneCall,
  PhoneOff,
  MapPin,
  UtensilsCrossed,
  User,
  AlertCircle,
  Loader2,
  Volume2,
} from "lucide-react";
import { getStoreOrderActionDetails, updateRequest } from "@/lib/dashboard.functions";
import {
  startIncomingOrderCallRingtone,
  stopIncomingOrderCallRingtone,
  triggerSoftVibration,
} from "@/lib/order-alert";
import { cleanOrderNotes } from "@/lib/utils";

interface IncomingOrderCallDialogProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete?: () => void;
}

const REJECTION_REASONS = [
  "الأصناف المطلوبة غير متوفرة حالياً",
  "ضغط طلبات بالمطبخ ووقت الانتظار طويل",
  "المطعم مغلق أو خارج أوقات العمل",
  "عنوان التوصيل خارج نطاق التوصيل",
];

/**
 * تنظيف العنوان بالكامل من أي إحداثيات GPS (أرقام خطوط الطول والعرض)
 * وإظهار نص العنوان البشري النظيف فقط
 */
function cleanAddressWithoutCoordinates(address?: string | null): string {
  if (!address) return "العنوان داخل الحسينية";
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

export function IncomingOrderCallDialog({
  orderId,
  open,
  onOpenChange,
  onActionComplete,
}: IncomingOrderCallDialogProps) {
  const qc = useQueryClient();
  const getDetails = useServerFn(getStoreOrderActionDetails);
  const doUpdate = useServerFn(updateRequest);

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [selectedReason, setSelectedReason] = useState(REJECTION_REASONS[0]);
  const [customReason, setCustomReason] = useState("");

  // Start continuous telephone ringtone while incoming call is open, stop on exit
  useEffect(() => {
    if (open && orderId) {
      startIncomingOrderCallRingtone();
    } else {
      stopIncomingOrderCallRingtone();
      setShowRejectForm(false);
    }
    return () => {
      stopIncomingOrderCallRingtone();
    };
  }, [open, orderId]);

  // Fetch full order details
  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["store-order-action-details", orderId],
    queryFn: () => (orderId ? getDetails({ data: { orderId } }) : null),
    enabled: !!orderId && open,
  });

  // Accept mutation
  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      return doUpdate({
        data: {
          kind: "orders",
          id,
          status: "accepted",
        },
      });
    },
    onSuccess: (_, id) => {
      stopIncomingOrderCallRingtone();
      triggerSoftVibration([100, 50, 150]);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["store-order-action-details", id] });
      qc.invalidateQueries({ queryKey: ["customer-orders"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("✅ تم تأكيد وقبول الطلب بنجاح! تم إيقاف رنين المكالمة.");
      onActionComplete?.();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "تعذر قبول الطلب، يرجى المحاولة مرة أخرى");
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      return doUpdate({
        data: {
          kind: "orders",
          id,
          status: "cancelled",
          note,
        },
      });
    },
    onSuccess: (_, { id }) => {
      stopIncomingOrderCallRingtone();
      triggerSoftVibration([200, 100, 200]);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["store-order-action-details", id] });
      qc.invalidateQueries({ queryKey: ["customer-orders"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.info("❌ تم إلغاء الطلب وإرسال سبب الاعتذار للعميل.");
      setShowRejectForm(false);
      onActionComplete?.();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "تعذر إلغاء الطلب، يرجى المحاولة مرة أخرى");
    },
  });

  const isBusy = acceptMutation.isPending || rejectMutation.isPending;

  function handleAccept() {
    if (!orderId) return;
    acceptMutation.mutate(orderId);
  }

  function handleRejectConfirm() {
    if (!orderId) return;
    const finalReason = customReason.trim() ? customReason.trim() : selectedReason;
    rejectMutation.mutate({ id: orderId, note: finalReason });
  }

  if (!open || !orderId) return null;

  const shortId = orderId.slice(0, 8);
  const cleanedNotes = order?.notes ? cleanOrderNotes(order.notes) : null;
  const cleanedAddress = order?.address ? cleanAddressWithoutCoordinates(order.address) : "العنوان غير محدد";

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="مكالمة طلب جديد وارد للمتجر"
      className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-2xl text-white flex flex-col justify-between overflow-hidden p-4 sm:p-6 animate-in fade-in duration-300"
    >
      {/* زر إغلاق نافذة المكالمة في الشمال من فوق للمتابعة والتعامل من الموقع */}
      <button
        type="button"
        onClick={() => {
          stopIncomingOrderCallRingtone();
          onOpenChange(false);
          toast.info("تم إغلاق شاشة المكالمة، يمكنك متابعة وقبول الطلب من الموقع.", { duration: 4000 });
        }}
        aria-label="إغلاق شاشة المكالمة والمتابعة من الموقع"
        title="إغلاق نافذة المكالمة والمتابعة من الموقع"
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

          <div className="relative size-20 sm:size-24 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 text-white flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.8)]">
            <UtensilsCrossed className="size-10 animate-pulse" />
          </div>
        </div>

        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-4 flex items-center justify-center gap-2">
          <span>طلب جديد وارد للمتجر</span>
          <span className="size-2.5 rounded-full bg-emerald-400 animate-ping" />
        </h2>

        <p className="text-emerald-400 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 mt-1 animate-pulse">
          <PhoneCall className="size-4 animate-bounce" />
          <span>جاري الرنين المستمر... بانتظار الرد (قبول أو رفض)</span>
        </p>

        <div className="mt-2.5 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 text-xs font-semibold border border-white/15">
          <span className="text-slate-200">{order?.store_name || "المتجر"}</span>
          <span className="text-slate-400">•</span>
          <span className="text-emerald-300 font-mono">رقم الأوردر #{shortId}</span>
        </div>
      </div>

      {/* Middle Content: Order & Customer Details Card */}
      <div className="w-full max-w-lg mx-auto flex-1 my-3 overflow-y-auto px-1">
        {isLoading ? (
          <div className="h-44 flex flex-col items-center justify-center gap-3 text-slate-300">
            <Loader2 className="size-8 animate-spin text-emerald-400" />
            <p className="text-xs font-bold">جاري تحميل بيانات الأوردر والعميل...</p>
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
          <div className="bg-white/5 border border-white/15 rounded-3xl p-4 sm:p-5 backdrop-blur-md shadow-2xl space-y-3.5">
            {/* Customer Details */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-10 rounded-2xl bg-white/10 text-white flex items-center justify-center font-bold shrink-0">
                  <User className="size-5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-black text-sm sm:text-base text-white truncate">
                    {order.customer_name}
                  </p>
                  <p className="text-xs text-slate-400">عميل خدمات الحسينية</p>
                </div>
              </div>

              <a
                href={`tel:${order.phone}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs border border-emerald-500/30 transition-colors shrink-0 shadow-sm"
              >
                <Phone className="size-3.5" />
                <span dir="ltr">{order.phone}</span>
              </a>
            </div>

            {/* Address without coordinates */}
            <div className="flex items-start gap-2.5 text-xs sm:text-sm">
              <MapPin className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="font-bold text-slate-400 text-xs block">عنوان التوصيل:</span>
                <span className="leading-relaxed font-semibold text-slate-100">
                  {cleanedAddress}
                </span>
              </div>
            </div>

            {/* Notes if provided */}
            {cleanedNotes && (
              <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                <p className="font-bold text-amber-300">ملاحظات العميل على الطلب:</p>
                <p className="leading-relaxed text-amber-100">{cleanedNotes}</p>
              </div>
            )}

            {/* Items List */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold px-1">
                <span>الأصناف المطلوبة ({order.items.length})</span>
                <span>الكمية والسعر</span>
              </div>

              <div className="divide-y divide-white/10 rounded-2xl bg-black/25 p-2.5 border border-white/10">
                {order.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="py-2 flex items-center justify-between gap-2 text-xs sm:text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-6 rounded-lg bg-emerald-500/20 text-emerald-300 font-black text-xs grid place-items-center shrink-0">
                        {item.qty}×
                      </span>
                      <span className="font-bold truncate text-slate-100">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-black text-emerald-400 shrink-0">
                      {(item.price * item.qty).toFixed(2)} ج.م
                    </span>
                  </div>
                ))}
              </div>

              {/* Financial Breakdown */}
              <div className="pt-2 text-xs text-slate-300 space-y-1 px-1">
                <div className="flex justify-between">
                  <span>المجموع الفرعي:</span>
                  <span>{(order.subtotal ?? 0).toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span>خدمة التوصيل:</span>
                  <span>{(order.delivery_fee ?? 0).toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-white/15 text-base sm:text-lg font-black text-white">
                  <span>الإجمالي الكلي:</span>
                  <span className="text-emerald-400 text-xl font-mono">
                    {(order.total ?? 0).toFixed(2)} ج.م
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Section: Call Action Buttons or Rejection Form */}
      <div className="w-full max-w-lg mx-auto pb-4 sm:pb-6 shrink-0">
        {showRejectForm ? (
          /* Rejection Reason Form with custom reason input */
          <div className="p-4 sm:p-5 rounded-3xl bg-rose-950/80 border-2 border-rose-500/40 backdrop-blur-2xl space-y-3 animate-in fade-in slide-in-from-bottom-4 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-300 font-black text-sm">
              <AlertCircle className="size-5 text-rose-400 shrink-0" />
              <span>سبب رفض الطلب (سيصل للعميل في الإشعار):</span>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-2 gap-1.5">
              {REJECTION_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    setSelectedReason(reason);
                    setCustomReason("");
                  }}
                  className={`p-2.5 rounded-xl text-xs font-semibold text-right border transition-all ${
                    selectedReason === reason && !customReason
                      ? "bg-rose-600 text-white border-rose-400 shadow-md"
                      : "bg-white/10 hover:bg-white/15 text-slate-200 border-white/10"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <textarea
              rows={2}
              placeholder="أو اكتب سبب الرفض هنا ليتم إبلاغ العميل به..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="w-full rounded-2xl border border-white/20 bg-black/50 p-3 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-400 resize-none leading-relaxed"
            />

            <div className="flex items-center gap-2.5 pt-1">
              <Button
                type="button"
                disabled={isBusy}
                onClick={handleRejectConfirm}
                className="flex-1 h-12 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs sm:text-sm gap-2 rounded-2xl shadow-lg transition-transform active:scale-95"
              >
                {rejectMutation.isPending ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <PhoneOff className="size-5 stroke-[2.5]" />
                )}
                تأكيد الرفض وإرسال السبب للعميل
              </Button>

              <Button
                type="button"
                disabled={isBusy}
                variant="ghost"
                onClick={() => setShowRejectForm(false)}
                className="h-12 px-5 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 rounded-2xl"
              >
                تراجع
              </Button>
            </div>
          </div>
        ) : (
          /* Two Large Animated Phone Call Buttons: Accept (Green) and Reject (Red) */
          <div className="flex items-center justify-around gap-6 pt-2">
            {/* Red Decline Button */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setShowRejectForm(true)}
                aria-label="رفض الطلب"
                className="group relative size-20 sm:size-24 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-90 text-white flex items-center justify-center shadow-[0_0_30px_rgba(225,29,72,0.6)] border-4 border-rose-500/40 transition-all"
              >
                <div className="absolute inset-0 rounded-full ring-2 ring-rose-400/40 group-hover:scale-110 transition-transform" />
                <PhoneOff className="size-9 sm:size-10 stroke-[2.5]" />
              </button>
              <span className="font-black text-xs sm:text-sm text-rose-300 tracking-wide">
                رفض الطلب
              </span>
            </div>

            {/* Green Accept Button */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={handleAccept}
                aria-label="تأكيد وقبول الطلب"
                className="relative size-20 sm:size-24 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-90 text-white flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.8)] border-4 border-emerald-400/50 transition-all animate-bounce"
              >
                <span className="absolute inset-0 rounded-full ring-4 ring-emerald-400/40 animate-ping" />
                {acceptMutation.isPending ? (
                  <Loader2 className="size-10 animate-spin" />
                ) : (
                  <Check className="size-10 sm:size-11 stroke-[3.5]" />
                )}
              </button>
              <span className="font-black text-xs sm:text-sm text-emerald-400 tracking-wide">
                تأكيد وقبول الطلب
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
