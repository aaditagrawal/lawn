import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center border-2 px-2 py-0.5 text-xs font-bold tracking-wider uppercase transition-colors",
  {
    variants: {
      variant: {
        default: "border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8]",
        secondary: "border-[#1a1a1a] bg-[#e8e8e0] text-[#1a1a1a]",
        destructive: "border-[#1a1a1a] bg-[#dc2626] text-white",
        outline: "border-[#1a1a1a] bg-transparent text-[#1a1a1a]",
        success: "border-[#1a1a1a] bg-[#2d5a2d] text-[#f0f0e8]",
        warning: "border-[#1a1a1a] bg-[#ca8a04] text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
