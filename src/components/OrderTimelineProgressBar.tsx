import React from 'react';
import { Check, Clock, Store, Bike, CheckCircle2, X } from 'lucide-react';
import { flows, type RequestKind } from '@/lib/dashboard-rules';
import { STATUS_LABELS } from '@/lib/labels';

export const TIMELINE_LABELS: Record<string, string> = {
  pending: 'قيد المراجعة',
  accepted: 'تم التأكيد',
  preparing: 'جاري التحضير',
  on_the_way: 'في الطريق',
  delivered: 'تم التسليم',
  confirmed: 'مؤكد',
  in_progress: 'جاري التنفيذ',
  completed: 'مكتمل',
};

export function getStatusHeadline(kind: RequestKind, status: string): string {
  if (status === 'cancelled') return 'تم إلغاء هذا الطلب ❌';

  if (kind === 'orders') {
    switch (status) {
      case 'pending':
        return 'طلبك مرسل للمتجر وفي انتظار الموافقة والبدء ⏳';
      case 'accepted':
        return 'وافق المتجر على طلبك، وجاري تحويله للتحضير ✅';
      case 'preparing':
        return 'طلبك قيد التحضير والتجهيز الآن في المتجر 🍳';
      case 'on_the_way':
        return 'الطلب مع كابتن التوصيل وفي الطريق إليك الآن 🛵💨';
      case 'delivered':
        return 'تم تسليم الطلب بنجاح، بالهناء والشفاء! 🎉';
      default:
        return TIMELINE_LABELS[status] || STATUS_LABELS[status] || status;
    }
  }

  if (kind === 'bookings') {
    switch (status) {
      case 'pending':
        return 'حجزك قيد المراجعة لدى العيادة 🩺';
      case 'confirmed':
        return 'تم تأكيد موعدك بنجاح في العيادة ✅';
      case 'completed':
        return 'تم الكشف والانتهاء من الموعد بنجاح 🏥';
      default:
        return TIMELINE_LABELS[status] || STATUS_LABELS[status] || status;
    }
  }

  if (kind === 'service_requests') {
    switch (status) {
      case 'pending':
        return 'طلبك قيد مراجعة الفني المختص 🔧';
      case 'accepted':
        return 'تم قبول الطلب وتحديد موعد الخدمة ✅';
      case 'in_progress':
        return 'الفني يعمل على تنفيذ الخدمة الآن 🛠️';
      case 'completed':
        return 'تم الانتهاء من تنفيذ الخدمة بنجاح 🌟';
      default:
        return TIMELINE_LABELS[status] || STATUS_LABELS[status] || status;
    }
  }

  return STATUS_LABELS[status] || status;
}

export function getStepIcon(step: string, className = 'size-4') {
  switch (step) {
    case 'pending':
      return <Clock className={className} />;
    case 'accepted':
    case 'confirmed':
      return <Check className={className} />;
    case 'preparing':
      return <Store className={className} />;
    case 'on_the_way':
    case 'in_progress':
      return <Bike className={className} />;
    case 'delivered':
    case 'completed':
      return <CheckCircle2 className={className} />;
    default:
      return <Check className={className} />;
  }
}

export interface OrderTimelineProgressBarProps {
  kind: RequestKind;
  status: string;
  className?: string;
}

export function OrderTimelineProgressBar({
  kind,
  status,
  className = '',
}: OrderTimelineProgressBarProps) {
  if (status === 'cancelled') {
    return (
      <div className={`my-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-center ${className}`}>
        <div className="flex items-center justify-center gap-2 text-destructive font-semibold text-xs sm:text-sm">
          <X className="size-4" />
          <span>تم إلغاء هذا الطلب</span>
        </div>
      </div>
    );
  }

  const steps = flows[kind] || flows.orders;
  const rawIndex = steps.indexOf(status);
  const activeIndex = rawIndex >= 0 ? rawIndex : 0;
  const percent = steps.length > 1 ? (activeIndex / (steps.length - 1)) * 100 : 0;
  const isComplete = status === 'delivered' || status === 'completed';

  return (
    <div className={`my-5 rounded-xl border bg-muted/20 p-3 sm:p-4 transition-all duration-300 ${className}`} dir="rtl">
      {/* Live Status Pill & Stage Counter */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-bold text-primary">
          {status === 'on_the_way' && <Bike className="size-4 animate-bounce text-emerald-600 dark:text-emerald-400" />}
          {status === 'preparing' && <Store className="size-4 animate-pulse text-amber-600 dark:text-amber-400" />}
          {status === 'pending' && <Clock className="size-4 animate-pulse text-primary" />}
          {isComplete && <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />}
          <span className="leading-snug">{getStatusHeadline(kind, status)}</span>
        </span>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
          المرحلة {activeIndex + 1} من {steps.length} ({Math.round(percent)}%)
        </span>
      </div>

      {/* Interactive Progress Bar */}
      <div className="relative py-2">
        {/* Background & Animated Active Progress Track */}
        <div className="absolute top-4 sm:top-5 right-4 sm:right-5 left-4 sm:left-5 h-1.5 -translate-y-1/2 rounded-full bg-muted overflow-hidden">
          <div
            className="absolute top-0 bottom-0 right-0 rounded-full bg-gradient-to-l from-primary via-primary/90 to-emerald-500 shadow-sm transition-all duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Steps Nodes & Labels */}
        <div className="relative flex justify-between items-start">
          {steps.map((s, idx) => {
            const isPassed = idx < activeIndex;
            const isCurrent = idx === activeIndex;

            return (
              <div key={s} className="flex flex-col items-center">
                {/* Node Circle */}
                <div
                  className={`relative z-10 flex size-8 sm:size-10 items-center justify-center rounded-full transition-all duration-500 ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground shadow-md ring-4 ring-primary/25 scale-110'
                      : isPassed
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-card border-2 border-muted text-muted-foreground/60'
                  }`}
                >
                  {isPassed ? (
                    <Check className="size-4 stroke-[3]" />
                  ) : isCurrent ? (
                    getStepIcon(s, 'size-4 sm:size-5')
                  ) : (
                    <span className="text-[11px] font-bold text-muted-foreground/70">{idx + 1}</span>
                  )}
                </div>

                {/* Step Label */}
                <span
                  className={`mt-2 block max-w-[55px] sm:max-w-[80px] text-center text-[10px] sm:text-xs leading-tight transition-colors duration-300 ${
                    isCurrent
                      ? 'font-bold text-primary scale-105'
                      : isPassed
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground/60'
                  }`}
                >
                  {TIMELINE_LABELS[s] || STATUS_LABELS[s] || s}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
