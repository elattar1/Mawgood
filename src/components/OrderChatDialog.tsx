import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Send,
  Phone,
  Bike,
  Store,
  User,
  RefreshCw,
  MessageCircle,
  Clock,
  CheckCheck,
  AlertCircle,
  Sparkles,
  Lock,
  MapPin,
  UtensilsCrossed,
  Receipt,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getOrderChat, sendOrderChatMessage, type OrderChatInfo } from "@/lib/chat.functions";
import { telHref } from "@/lib/phone";
import {
  useOrderChatUnreadMap,
  recordChatSeen,
  clearActiveChatOrder,
  setActiveChatOrderId,
} from "@/lib/chat-unread";
import { useAuth } from "@/lib/auth";
import { triggerSoftVibration } from "@/lib/order-alert";
import { cleanDisplayAddress } from "@/lib/map-utils";
import { cleanOrderNotes } from "@/lib/utils";
import { STATUS_LABELS, money } from "@/lib/labels";

interface OrderChatDialogProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function playReceiveSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

const CUSTOMER_TO_STORE_PRESETS = [
  "هل يمكن تعديل أو إضافة صنف؟ 🛒",
  "كم من الوقت متبقي للتجهيز؟ ⏱️",
  "رجاءً التأكد من تغليف الأصناف جيداً 👍",
  "تمام، في انتظاركم 🙏",
];

const STORE_TO_CUSTOMER_PRESETS = [
  "جاري تجهيز طلبك الآن بعناية 🛍️",
  "يوجد صنف غير متوفر، تحب نستبدله بآخر؟ 🔄",
  "طلبك جاهز وبانتظار وصول كابتن التوصيل 📦",
  "تم التأكيد، سيكون الطلب جاهزاً خلال دقائق ⏱️",
];

const CUSTOMER_TO_DRIVER_PRESETS = [
  "أنا في انتظارك أمام المنزل 👍",
  "أنا نازل أستلم منك حالاً 🏢",
  "اتصل بي أول ما توصل 📱",
  "شكراً جزيلاً يا كابتن 🙏",
];

const DRIVER_TO_CUSTOMER_PRESETS = [
  "أنا وصلت تحت البيت",
  "في الطريق إليك",
  "أرجو الرد على الهاتف 📞",
  "استلمت طلبك من المحل وفي طريقي إليك 🛍️",
  "معلش فيه زحمة دقائق وأكون عندك ⏳",
  "أنا في انتظارك أمام المدخل 👍",
];

export function OrderChatDialog({ orderId, open, onOpenChange }: OrderChatDialogProps) {
  const { user } = useAuth();
  const getChat = useServerFn(getOrderChat);
  const sendMessage = useServerFn(sendOrderChatMessage);
  const qc = useQueryClient();
  const { markChatAsRead } = useOrderChatUnreadMap();

  const [inputMessage, setInputMessage] = useState("");
  const [mobileTab, setMobileTab] = useState<"chat" | "details">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number>(0);

  // Set active chat order in global window state and mark unread messages as read immediately
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (open && orderId) {
      setActiveChatOrderId(orderId);
      recordChatSeen(orderId, user?.id);
      markChatAsRead(orderId);
    } else if (!open && orderId) {
      clearActiveChatOrder(orderId);
    }
    return () => {
      if (orderId) {
        clearActiveChatOrder(orderId);
      }
    };
  }, [open, orderId, markChatAsRead, user?.id]);

  const queryKey = ["order-chat", orderId];

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<OrderChatInfo>({
    queryKey,
    queryFn: () => getChat({ data: { orderId: orderId! } }),
    enabled: !!orderId && open,
    refetchInterval: open ? 3000 : false, // Auto-poll every 3s when chat dialog is open
  });

  // When messages load or update while chat is open, immediately mark as seen
  useEffect(() => {
    if (open && orderId && data?.messages && data.messages.length > 0) {
      recordChatSeen(orderId, user?.id);
      markChatAsRead(orderId);
    }
  }, [open, orderId, data?.messages?.length, markChatAsRead, user?.id]);

  // Sound cue when new incoming message arrives
  useEffect(() => {
    if (data?.messages) {
      if (prevCountRef.current > 0 && data.messages.length > prevCountRef.current) {
        const lastMsg = data.messages[data.messages.length - 1];
        if (lastMsg.sender_role !== data.myRole) {
          playReceiveSound();
        }
      }
      prevCountRef.current = data.messages.length;
    }
  }, [data?.messages, data?.myRole]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open && data?.messages && mobileTab === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.messages?.length, open, mobileTab]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!orderId) throw new Error("رقم الطلب مفقود");
      return sendMessage({ data: { orderId, message: text } });
    },
    onSuccess: (res) => {
      setInputMessage("");
      if (res.message) {
        qc.setQueryData<OrderChatInfo>(queryKey, (prev) => {
          if (!prev) return prev;
          const exists = prev.messages.some((m) => m.id === res.message.id);
          if (exists) return prev;
          return {
            ...prev,
            messages: [...prev.messages, res.message],
          };
        });
      }
      qc.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "تعذر إرسال الرسالة");
    },
  });

  const handleSend = (textToSend?: string) => {
    const text = (textToSend ?? inputMessage).trim();
    if (!text || sendMutation.isPending) return;
    triggerSoftVibration([60]);
    sendMutation.mutate(text);
  };

  const isCustomer = data?.myRole === "customer";
  const isStore = data?.myRole === "store";
  const isDriver = data?.myRole === "driver";
  const isDriverStage = data?.chatStage === "driver";

  // Determine active other party details
  let otherPartyTitle = "الطرف الآخر";
  let otherPartyPhone: string | null = null;
  let presets: string[] = [];

  if (isCustomer) {
    if (isDriverStage) {
      otherPartyTitle = data?.driver?.name || "كابتن التوصيل";
      otherPartyPhone = data?.driver?.phone || null;
      presets = CUSTOMER_TO_DRIVER_PRESETS;
    } else {
      otherPartyTitle = data?.store?.name || "المتجر / المطعم";
      otherPartyPhone = data?.store?.phone || null;
      presets = CUSTOMER_TO_STORE_PRESETS;
    }
  } else if (isStore) {
    otherPartyTitle = data?.customer?.name ? `العميل (${data.customer.name})` : "العميل";
    otherPartyPhone = data?.customer?.phone || null;
    presets = STORE_TO_CUSTOMER_PRESETS;
  } else if (isDriver) {
    otherPartyTitle = data?.customer?.name ? `العميل (${data.customer.name})` : "العميل";
    otherPartyPhone = data?.customer?.phone || null;
    presets = DRIVER_TO_CUSTOMER_PRESETS;
  } else {
    // Admin
    otherPartyTitle = isDriverStage ? (data?.driver?.name || "كابتن التوصيل") : (data?.store?.name || "المتجر");
    presets = ["مرحباً، للمساعدة بخصوص الطلب...", "تم التحقق من تفاصيل الطلب"];
  }

  const shortId = orderId?.slice(0, 8);
  const cleanAddress = data?.address ? cleanDisplayAddress(data.address) : "";
  const cleanNotes = data?.notes ? cleanOrderNotes(data.notes) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-3xl flex flex-col h-[90vh] max-h-[780px]">
        {/* Header - Clean, sleek, without redundant verbose descriptions */}
        <DialogHeader className="p-3.5 sm:p-4 border-b bg-card shrink-0 flex flex-row items-center justify-between text-right space-y-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {isCustomer ? (
                isDriverStage ? <Bike className="size-5" /> : <Store className="size-5" />
              ) : (
                <User className="size-5" />
              )}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm sm:text-base font-black flex items-center gap-2 truncate">
                <span className="truncate">{otherPartyTitle}</span>
                <span
                  className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
                  title="متصل الآن"
                />
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <span className="font-mono font-semibold">طلب #{shortId}</span>
                {data?.status && (
                  <>
                    <span>•</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold ${
                        data.status === "cancelled"
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          : data.status === "delivered" || data.status === "completed"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : data.status === "on_the_way"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          : "bg-primary/10 text-primary border border-primary/20"
                      }`}
                    >
                      {STATUS_LABELS[data.status] || data.status}
                    </span>
                  </>
                )}
              </DialogDescription>
            </div>
          </div>

          {/* Action buttons on header */}
          <div className="flex items-center gap-1.5 pl-8 sm:pl-10">
            {otherPartyPhone && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-bold rounded-xl"
              >
                <a href={telHref(otherPartyPhone)}>
                  <Phone className="size-3.5" />
                  <span className="hidden sm:inline">اتصال</span>
                </a>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-xl"
              onClick={() => refetch()}
              disabled={isFetching}
              title="تحديث المحادثة"
            >
              <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin text-primary" : ""}`} />
            </Button>
          </div>
        </DialogHeader>

        {/* Mobile View Tab Switcher (< md screens) */}
        <div className="flex md:hidden bg-muted/60 p-1 border-b border-border/50 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab("chat")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === "chat"
                ? "bg-background text-foreground shadow-xs font-black"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageCircle className="size-3.5" />
            <span>المحادثة المباشرة</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("details")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === "details"
                ? "bg-background text-foreground shadow-xs font-black"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Receipt className="size-3.5" />
            <span>تفاصيل الأوردر {data?.items?.length ? `(${data.items.length})` : ""}</span>
          </button>
        </div>

        {/* Main Body: Two Columns on Desktop (Chat on Right, Order Details on Left) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* 1. RIGHT COLUMN: Chat Thread (الشات على اليمين) */}
          <div
            className={`md:col-span-7 flex flex-col min-h-0 border-l border-border/50 ${
              mobileTab === "chat" ? "flex flex-1" : "hidden md:flex"
            }`}
          >
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/15">
              {isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <RefreshCw className="size-6 animate-spin text-primary" />
                  <p className="text-xs font-semibold">جاري تحميل المحادثة...</p>
                </div>
              )}

              {isError && (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 p-4 text-center">
                  <AlertCircle className="size-8 text-destructive" />
                  <p className="text-sm font-semibold text-destructive">
                    {error instanceof Error ? error.message : "تعذر تحميل المحادثة"}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    إعادة المحاولة
                  </Button>
                </div>
              )}

              {!isLoading && !isError && data && (
                <>
                  {/* Empty State for Driver */}
                  {isDriver && data.messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-6 space-y-2">
                      <div className="size-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                        <Bike className="size-6" />
                      </div>
                      <h4 className="font-bold text-foreground text-sm">محادثة جديدة مع العميل</h4>
                      <p className="text-xs max-w-xs text-muted-foreground">
                        أهلاً بك يا كابتن! يمكنك التنسيق هنا مباشرة مع العميل حول العنوان وتفاصيل الاستلام بدقة.
                      </p>
                    </div>
                  )}

                  {/* General Empty State */}
                  {!isDriver && data.messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-6 space-y-2">
                      <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                        <MessageCircle className="size-6" />
                      </div>
                      <h4 className="font-bold text-foreground text-sm">محادثة فورية مباشرة</h4>
                      <p className="text-xs max-w-xs text-muted-foreground">
                        تواصل مباشرة مع {otherPartyTitle} لتنسيق ومتابعة تفاصيل الطلب لحظة بلحظة.
                      </p>
                    </div>
                  )}

                  {/* Messages Bubble Stream */}
                  {data.messages.map((msg, idx) => {
                    const isMe = msg.sender_role === data.myRole;
                    const formattedTime = new Date(msg.created_at).toLocaleTimeString("ar-EG", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    // Check if this message marks the transition to the driver phase for the customer
                    const isTransitionPoint =
                      isCustomer &&
                      msg.stage === "driver" &&
                      (idx === 0 || data.messages[idx - 1]?.stage !== "driver");

                    // Role display badge
                    const roleBadge =
                      msg.sender_role === "store"
                        ? `🏪 ${msg.sender_name || (data.store?.name ?? "المتجر")}`
                        : msg.sender_role === "driver"
                        ? msg.sender_name || "كابتن التوصيل"
                        : msg.sender_role === "customer"
                        ? `👤 ${msg.sender_name || "العميل"}`
                        : `🛡️ ${msg.sender_name || "موجود"}`;

                    return (
                      <div key={msg.id} className="space-y-2">
                        {/* Centered Transition Banner for Customer */}
                        {isTransitionPoint && (
                          <div className="my-3 flex items-center justify-center w-full">
                            <div className="flex flex-col items-center text-center gap-1.5 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/10 p-3 shadow-xs max-w-sm">
                              <div className="grid size-8 place-items-center rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                                <Bike className="size-4" />
                              </div>
                              <span className="font-bold text-xs text-emerald-800 dark:text-emerald-200">
                                تم تحويل المحادثة الآن إلى كابتن التوصيل ({data.driver?.name || "الكابتن"})
                              </span>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                المتجر أنهى التجهيز وسلّم الطلب للكابتن. يمكنك الآن التنسيق مباشرة مع الكابتن حول موقعك والتسليم.
                              </p>
                            </div>
                          </div>
                        )}

                        <div className={`flex flex-col ${isMe ? "items-start" : "items-end"} gap-1`}>
                          <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                            <span className="font-medium">{isMe ? "أنت" : roleBadge}</span>
                            <span>•</span>
                            <span>{formattedTime}</span>
                          </div>

                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm break-words whitespace-pre-wrap leading-relaxed ${
                              isMe
                                ? "bg-primary text-primary-foreground rounded-tr-none"
                                : msg.sender_id === "system"
                                ? "bg-muted border border-primary/30 text-foreground text-center mx-auto"
                                : "bg-card border text-foreground rounded-tl-none"
                            }`}
                          >
                            {msg.message}
                          </div>

                          {isMe && (
                            <div className="flex items-center gap-1 px-1 text-[10px]">
                              {msg.is_read ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium transition-colors duration-200">
                                  <CheckCheck className="size-3.5 text-emerald-500 dark:text-emerald-400 stroke-[2.5]" />
                                  <span>تمت القراءة</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-muted-foreground/70">
                                  <CheckCheck className="size-3 text-muted-foreground/60 stroke-[1.8]" />
                                  <span>تم الإرسال</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Chat Footer: Locked if order completed/delivered/cancelled OR input form */}
            {data?.status === "cancelled" ? (
              <div className="p-3.5 border-t bg-rose-500/10 border-rose-500/20 shrink-0 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                  <AlertCircle className="size-4 text-rose-600 dark:text-rose-400" />
                  <span>تم إلغاء هذا الطلب وأُغلقت المحادثة</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  سجل المحادثة وسبب الاعتذار محفوظ لديك للاطلاع عليه.
                </p>
              </div>
            ) : data?.status === "delivered" || data?.status === "completed" ? (
              <div className="p-3.5 border-t bg-muted/40 shrink-0 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-foreground">
                  <Lock className="size-4 text-primary" />
                  <span>تم اكتمال تسليم الطلب بنجاح وأُغلقت المحادثة</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  سجل الرسائل محفوظ لديك للاطلاع عليه في أي وقت.
                </p>
              </div>
            ) : isStore && isDriverStage ? (
              <div className="p-3.5 border-t bg-muted/40 shrink-0 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-foreground">
                  <Lock className="size-4 text-primary" />
                  <span>تم تسليم الطلب لكابتن التوصيل ({data?.driver?.name || "الكابتن"})</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  أُغلقت محادثة المتجر وانتقلت المحادثة الآن بين العميل وكابتن التوصيل لتنسيق الوصول.
                </p>
              </div>
            ) : (
              <>
                {/* Quick Presets */}
                <div className="border-t bg-card/80 px-3 py-2 shrink-0">
                  {isDriver ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                        <span className="flex items-center gap-1">
                          <Bike className="size-3.5" />
                          ردود سريعة بنقرة واحدة (للكابتن أثناء القيادة):
                        </span>
                        <span className="text-[10px] text-muted-foreground font-normal">إرسال فوري ⚡</span>
                      </div>
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        {presets.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSend(preset)}
                            disabled={sendMutation.isPending}
                            className="text-xs whitespace-nowrap bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 text-emerald-800 dark:text-emerald-200 px-3 py-1.5 rounded-xl transition-all font-bold border border-emerald-500/30 shrink-0 shadow-2xs"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      <Sparkles className="size-3.5 text-primary shrink-0 ml-1" />
                      {presets.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSend(preset)}
                          disabled={sendMutation.isPending}
                          className="text-xs whitespace-nowrap bg-muted hover:bg-muted/80 active:scale-95 text-foreground px-2.5 py-1 rounded-full transition-colors font-medium border border-border/50 shrink-0"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Input Bar */}
                <div className="p-3 border-t bg-card shrink-0">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    className="flex items-center gap-2"
                  >
                    <Input
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder={
                        isCustomer
                          ? isDriverStage
                            ? "اكتب رسالة لكابتن التوصيل..."
                            : `اكتب رسالة لـ ${data?.store?.name || "المتجر"}...`
                          : "اكتب رسالتك للعميل..."
                      }
                      className="flex-1 bg-muted/30 h-10 text-sm focus-visible:ring-primary"
                      disabled={sendMutation.isPending}
                      autoFocus
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!inputMessage.trim() || sendMutation.isPending}
                      className="size-10 shrink-0 bg-primary text-primary-foreground rounded-xl"
                      title="إرسال"
                    >
                      <Send className={`size-4 ${sendMutation.isPending ? "animate-pulse" : ""}`} />
                    </Button>
                  </form>
                </div>
              </>
            )}
          </div>

          {/* 2. LEFT COLUMN: Order Details (تفاصيل الأوردر على الشمال) */}
          <div
            className={`md:col-span-5 flex flex-col min-h-0 overflow-y-auto bg-muted/20 p-4 space-y-3.5 ${
              mobileTab === "details" ? "flex flex-1" : "hidden md:flex"
            }`}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Receipt className="size-4 text-primary shrink-0" />
                <h3 className="text-sm font-extrabold text-foreground">ملخص وتفاصيل الطلب</h3>
              </div>
              <span className="text-xs font-mono font-bold text-muted-foreground">#{shortId}</span>
            </div>

            {/* If Order is Cancelled: Highlight Cancellation Notice & Reason */}
            {data?.status === "cancelled" && (
              <div className="p-3.5 rounded-2xl bg-rose-500/15 border-2 border-rose-500/40 text-rose-900 dark:text-rose-100 space-y-1.5 shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-black text-xs sm:text-sm">
                  <AlertCircle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>الطلب ملغي: سبب الاعتذار</span>
                </div>
                <p className="text-xs font-semibold leading-relaxed">
                  {cleanNotes || "تم إلغاء الطلب من قِبل المتجر/الإدارة."}
                </p>
              </div>
            )}

            {/* Store Card */}
            {data?.store && (
              <div className="p-3 rounded-2xl bg-card border border-border/60 shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Store className="size-4 text-primary shrink-0" />
                    <span className="font-bold text-xs sm:text-sm text-foreground truncate">
                      {data.store.name}
                    </span>
                  </div>
                  {data.store.phone && (
                    <a
                      href={telHref(data.store.phone)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                    >
                      <Phone className="size-3" />
                      <span dir="ltr">{data.store.phone}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Customer Details Card */}
            {data?.customer && (
              <div className="p-3 rounded-2xl bg-card border border-border/60 shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="size-4 text-primary shrink-0" />
                    <span className="font-bold text-xs sm:text-sm text-foreground truncate">
                      {data.customer.name || "العميل"}
                    </span>
                  </div>
                  {data.customer.phone && (
                    <a
                      href={telHref(data.customer.phone)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors"
                    >
                      <Phone className="size-3" />
                      <span dir="ltr">{data.customer.phone}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Driver Details Card (if assigned) */}
            {data?.driver && (
              <div className="p-3 rounded-2xl bg-card border border-border/60 shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Bike className="size-4 text-emerald-600 shrink-0" />
                    <span className="font-bold text-xs sm:text-sm text-foreground truncate">
                      {data.driver.name}
                    </span>
                  </div>
                  {data.driver.phone && (
                    <a
                      href={telHref(data.driver.phone)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors"
                    >
                      <Phone className="size-3" />
                      <span dir="ltr">{data.driver.phone}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Delivery Address */}
            {cleanAddress && (
              <div className="p-3 rounded-2xl bg-card border border-border/60 shadow-2xs flex items-start gap-2.5 text-xs">
                <MapPin className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="font-bold text-muted-foreground block text-[11px]">عنوان التوصيل:</span>
                  <span className="font-semibold text-foreground leading-relaxed">
                    {cleanAddress}
                  </span>
                </div>
              </div>
            )}

            {/* Customer Notes (when not cancelled) */}
            {cleanNotes && data?.status !== "cancelled" && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-100 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300">
                  <FileText className="size-3.5" />
                  <span>ملاحظات على الطلب:</span>
                </div>
                <p className="leading-relaxed font-medium">{cleanNotes}</p>
              </div>
            )}

            {/* Items List */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-bold px-1">
                <span>الأصناف ({data?.items?.length || 0})</span>
                <span>الكمية والسعر</span>
              </div>

              {data?.items && data.items.length > 0 ? (
                <div className="divide-y divide-border/60 rounded-2xl bg-card border border-border/60 p-2.5 shadow-2xs">
                  {data.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="size-5 rounded-md bg-primary/10 text-primary font-black text-[11px] grid place-items-center shrink-0">
                          {item.qty}×
                        </span>
                        <span className="font-bold truncate text-foreground">{item.name}</span>
                      </div>
                      <span className="font-black text-foreground shrink-0 font-mono">
                        {(item.price * item.qty).toFixed(2)} ج.م
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl bg-card border border-border/60 p-3 text-center text-xs text-muted-foreground">
                  طلب مخصص من تطبيق موجود
                </div>
              )}
            </div>

            {/* Financial Breakdown */}
            <div className="rounded-2xl bg-card border border-border/60 p-3 text-xs space-y-1.5 shadow-2xs">
              <div className="flex justify-between text-muted-foreground">
                <span>المجموع الفرعي:</span>
                <span className="font-mono font-semibold">
                  {(data?.subtotal ?? (Number(data?.total || 0) - Number(data?.deliveryFee || 0))).toFixed(2)} ج.م
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>خدمة التوصيل:</span>
                <span className="font-mono font-semibold">{(data?.deliveryFee ?? 0).toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border/60 text-sm font-black text-foreground">
                <span>الإجمالي الكلي:</span>
                <span className="text-primary text-base font-black font-mono">
                  {money(data?.total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
