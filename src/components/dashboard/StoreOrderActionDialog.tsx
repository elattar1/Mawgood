import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Check,
  X,
  PhoneCall,
  MapPin,
  UtensilsCrossed,
  MessageCircle,
  AlertCircle,
  Loader2,
  Clock,
  Volume2,
} from "lucide-react";
import { getStoreOrderActionDetails, updateRequest } from "@/lib/dashboard.functions";
import { stopKitchenAlarm } from "@/lib/order-alert";
import { cleanOrderNotes } from "@/lib/utils";
import { cleanDisplayAddress } from "@/lib/map-utils";
import { STATUS_LABELS } from "@/lib/labels";
import { OrderChatDialog } from "@/components/OrderChatDialog";

interface StoreOrderActionDialogProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete?: () => void;
}

const REJECTION_REASONS = [
  "الأصناف المطلوبة غير متوفرة حالياً",
  "ضغط طلبات بالمطبخ ووقت الانتظار طويل",
  "المطعم مغلق أو خارج أوقات العمل",
  "عنوان التوصيل خارج النطاق المتاح",
];

export function StoreOrderActionDialog({
  orderId,
  open,
  onOpenChange,
  onActionComplete,
}: StoreOrderActionDialogProps) {
  const qc = useQueryClient();
  const getDetails = useServerFn(getStoreOrderActionDetails);
  const doUpdate = useServerFn(updateRequest);

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [selectedReason, setSelectedReason] = useState(REJECTION_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

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
          status: "preparing",
        },
      });
    },
    onSuccess: (_, id) => {
      stopKitchenAlarm(id);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["store-order-action-details", id] });
      qc.invalidateQueries({ queryKey: ["customer-orders"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("✅ تم قبول الطلب وبدء التحضير! تم إيقاف صفارة الإنذار.");
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
        },
      });
    },
    onSuccess: (_, { id }) => {
      stopKitchenAlarm(id);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["store-order-action-details", id] });
      qc.invalidateQueries({ queryKey: ["customer-orders"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.info("❌ تم إلغاء الطلب وإشعار العميل بالاعتذار.");
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

  const shortId = orderId ? orderId.slice(0, 8) : "";
  const cleanedNotes = order?.notes ? cleanOrderNotes(order.notes) : null;
  const isPendingOrder = order?.status === "pending" || order?.status === "accepted";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!isBusy) {
            if (!next) setShowRejectForm(false);
            onOpenChange(next);
          }
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6 rounded-3xl"
        >
          <DialogHeader className="text-right space-y-1.5 pb-2 border-b border-border/60">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="size-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                  <UtensilsCrossed className="size-5" />
                </div>
                <div>
                  <DialogTitle className="text-base sm:text-lg font-black tracking-tight">
                    تفاصيل طلب جديد #{shortId}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {order?.store_name || "المتجر"}
                  </DialogDescription>
                </div>
              </div>

              {order?.status && (
                <Badge
                  variant={
                    order.status === "pending"
                      ? "destructive"
                      : order.status === "preparing"
                      ? "default"
                      : order.status === "delivered"
                      ? "outline"
                      : "secondary"
                  }
                  className="font-bold text-xs px-2.5 py-0.5"
                >
                  {STATUS_LABELS[order.status] || order.status}
                </Badge>
              )}
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-xs font-bold">جاري تحميل تفاصيل الطلب...</p>
            </div>
          ) : isError || !order ? (
            <div className="py-8 text-center space-y-3">
              <AlertCircle className="size-10 text-destructive mx-auto" />
              <p className="text-sm font-bold text-foreground">تعذر تحميل بيانات الطلب</p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                إعادة المحاولة
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              {/* Alert reminder if pending */}
              {isPendingOrder && (
                <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs">
                  <div className="flex items-center gap-2">
                    <Volume2 className="size-4 text-amber-600 animate-pulse shrink-0" />
                    <span className="font-bold">
                      طلب وارد في انتظار قرارك (قبول أو رفض)
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    رنين مستمر
                  </span>
                </div>
              )}

              {/* Customer and Contact Card */}
              <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/70 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground">بيانات العميل والتوصيل</span>
                  <a
                    href={`tel:${order.phone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-sm transition-colors"
                  >
                    <PhoneCall className="size-3.5" />
                    اتصال: <span dir="ltr">{order.phone}</span>
                  </a>
                </div>

                <div className="flex items-start gap-2 text-xs">
                  <MapPin className="size-4 text-primary shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">
                    {cleanDisplayAddress(order.address) || "العنوان غير محدد"}
                  </span>
                </div>

                {cleanedNotes && (
                  <div className="p-2.5 rounded-xl bg-background/80 border text-xs space-y-1">
                    <p className="font-bold text-foreground">ملاحظات العميل:</p>
                    <p className="text-muted-foreground leading-relaxed">{cleanedNotes}</p>
                  </div>
                )}
              </div>

              {/* Items Card */}
              <div className="p-3.5 rounded-2xl border bg-card space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-foreground">
                    الأصناف المطلوبة ({order.items.length})
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium">
                    الكمية والسعر
                  </span>
                </div>

                <div className="divide-y divide-border/60">
                  {order.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs font-medium"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="size-6 rounded-lg bg-primary/10 text-primary font-black text-xs grid place-items-center shrink-0">
                          {item.qty}×
                        </span>
                        <span className="font-bold truncate">{item.name}</span>
                      </div>
                      <span className="font-black text-foreground shrink-0">
                        {(item.price * item.qty).toFixed(2)} ج.م
                      </span>
                    </div>
                  ))}
                </div>

                {/* Subtotal, delivery, total */}
                <div className="pt-2 border-t space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>المجموع الفرعي:</span>
                    <span>{(order.subtotal ?? 0).toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span>خدمة التوصيل:</span>
                    <span>{(order.delivery_fee ?? 0).toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-dashed text-sm font-black text-foreground">
                    <span>الإجمالي الكلي:</span>
                    <span className="text-primary text-base">
                      {(order.total ?? 0).toFixed(2)} ج.م
                    </span>
                  </div>
                </div>
              </div>

              {/* Chat action button */}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setChatOpen(true)}
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground font-bold"
                >
                  <MessageCircle className="size-4" />
                  محادثة العميل أو الكابتن
                </Button>
              </div>

              {/* Rejection Form Confirmation View */}
              {showRejectForm ? (
                <div className="p-4 rounded-2xl border-2 border-destructive/40 bg-destructive/5 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-destructive font-black text-xs">
                    <AlertCircle className="size-4" />
                    <span>تأكيد رفض الطلب واعتذار المتجر</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    اختر سبب الاعتذار ليتم إرساله للعميل في الإشعار:
                  </p>

                  <div className="space-y-1.5">
                    {REJECTION_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => {
                          setSelectedReason(reason);
                          setCustomReason("");
                        }}
                        className={`w-full text-right p-2 rounded-xl text-xs font-semibold border transition-all ${
                          selectedReason === reason && !customReason
                            ? "bg-destructive text-white border-destructive"
                            : "bg-card hover:bg-muted text-foreground border-border"
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="أو اكتب سبباً آخر هنا..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="w-full h-9 rounded-xl border border-input bg-card px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      disabled={isBusy}
                      variant="destructive"
                      onClick={handleRejectConfirm}
                      className="flex-1 h-10 font-black text-xs gap-1.5 shadow-md"
                    >
                      {rejectMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <X className="size-4" />
                      )}
                      تأكيد الرفض والإلغاء
                    </Button>
                    <Button
                      type="button"
                      disabled={isBusy}
                      variant="outline"
                      onClick={() => setShowRejectForm(false)}
                      className="h-10 px-4 text-xs font-bold"
                    >
                      تراجع
                    </Button>
                  </div>
                </div>
              ) : (
                /* Primary Actions (Accept / Reject) */
                isPendingOrder && (
                  <div className="grid grid-cols-2 gap-2.5 pt-2">
                    <Button
                      type="button"
                      disabled={isBusy}
                      onClick={handleAccept}
                      className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm gap-2 rounded-2xl shadow-lg transition-transform active:scale-95"
                    >
                      {acceptMutation.isPending ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <Check className="size-5 stroke-[2.5]" />
                      )}
                      قبول الطلب وبدء التحضير
                    </Button>

                    <Button
                      type="button"
                      disabled={isBusy}
                      variant="outline"
                      onClick={() => setShowRejectForm(true)}
                      className="h-12 border-2 border-destructive/50 text-destructive hover:bg-destructive/10 font-black text-sm gap-2 rounded-2xl transition-transform active:scale-95"
                    >
                      <X className="size-5 stroke-[2.5]" />
                      رفض الطلب
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Embedded Chat Dialog if merchant wants to text customer */}
      <OrderChatDialog
        orderId={chatOpen ? orderId : null}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
    </>
  );
}
