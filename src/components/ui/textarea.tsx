import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border border-white/55 bg-white/40 backdrop-blur-md px-3 py-2 text-base shadow-[inset_0_1.5px_0_oklch(1_0_0/0.75),inset_0_-1px_0_oklch(0_0_0/0.04)] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary/50 focus-visible:bg-white/55 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-all",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
