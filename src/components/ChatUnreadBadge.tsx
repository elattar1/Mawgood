// src/components/ChatUnreadBadge.tsx
// مؤشر وبادج الرسائل غير المقروءة في الشات
import { cn } from "@/lib/utils";

interface ChatUnreadBadgeProps {
  count?: number;
  className?: string;
  showDotOnly?: boolean;
}

export function ChatUnreadBadge({ count = 0, className, showDotOnly = false }: ChatUnreadBadgeProps) {
  if (!count || count <= 0) return null;

  if (showDotOnly) {
    return (
      <span
        className={cn(
          "absolute -top-1 -left-1 flex size-3 pointer-events-none z-10",
          className
        )}
        aria-label="رسائل غير مقروءة"
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex size-3 rounded-full bg-destructive ring-2 ring-background shadow-xs" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "absolute -top-2 -left-2 z-10 pointer-events-none flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-extrabold text-destructive-foreground shadow-sm ring-2 ring-background animate-in zoom-in-75 duration-200",
        className
      )}
      aria-label={`${count} رسائل غير مقروءة`}
      title={`${count} رسائل غير مقروءة في الشات`}
    >
      <span className="tabular-nums leading-none">{count > 9 ? "+9" : count}</span>
    </span>
  );
}
