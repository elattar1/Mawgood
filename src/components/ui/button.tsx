import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_oklch(0.2_0.04_196/0.20),0_4px_12px_-2px_oklch(0.44_0.085_196/0.35),inset_0_1px_0_oklch(1_0_0/0.25)] hover:bg-primary/90 hover:shadow-[0_2px_4px_oklch(0.2_0.04_196/0.20),0_8px_20px_-2px_oklch(0.44_0.085_196/0.45),inset_0_1px_0_oklch(1_0_0/0.30)] active:scale-[0.97]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_1px_2px_oklch(0.2_0.04_196/0.15),0_4px_12px_-2px_oklch(0.58_0.21_28/0.35),inset_0_1px_0_oklch(1_0_0/0.20)] hover:bg-destructive/90 active:scale-[0.97]",
        outline:
          "liquid-glass border border-input text-foreground hover:border-primary/40 hover:text-primary active:scale-[0.97]",
        secondary:
          "liquid-glass border border-input text-secondary-foreground hover:bg-secondary/80 active:scale-[0.97]",
        ghost:
          "hover:bg-white/40 hover:backdrop-blur-sm hover:border hover:border-white/60 hover:shadow-[inset_0_1px_0_oklch(1_0_0/0.70)] text-foreground active:scale-[0.97] transition-all duration-150",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

