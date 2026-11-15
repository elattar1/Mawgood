import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-[0_1px_2px_oklch(0.44_0.085_196/0.30),inset_0_1px_0_oklch(1_0_0/0.20)] hover:bg-primary/80",
        secondary:
          "border-white/60 bg-white/40 backdrop-blur-sm text-secondary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.70)] hover:bg-white/55",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-[0_1px_2px_oklch(0.58_0.21_28/0.25),inset_0_1px_0_oklch(1_0_0/0.18)] hover:bg-destructive/80",
        outline:
          "border-white/60 bg-white/30 backdrop-blur-sm text-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.65)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

