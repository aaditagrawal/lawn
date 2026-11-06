import * as React from "react";
import { clsx as classNames, type ClassValue } from "clsx";
import { cn } from "@/lib/utils";

const badgeStyles = {
  default: "border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8]",
  secondary: "border-[#1a1a1a] bg-[#e8e8e0] text-[#1a1a1a]",
  destructive: "border-[#1a1a1a] bg-[#dc2626] text-white",
  outline: "border-[#1a1a1a] bg-transparent text-[#1a1a1a]",
  success: "border-[#1a1a1a] bg-[#2d5a2d] text-[#f0f0e8]",
  warning: "border-[#1a1a1a] bg-[#ca8a04] text-white",
};

interface BadgeVariants {
  variant?: keyof typeof badgeStyles | null;
}

const badgeBase =
  "inline-flex items-center border-2 px-2 py-0.5 text-xs font-bold tracking-wider uppercase transition-colors";
const badgeClasses = new Map(
  Object.entries({ "": "", ...badgeStyles }).map(([variant, styles]) => [
    variant,
    classNames(badgeBase, styles),
  ]),
);

function badgeVariants({
  variant = "default",
  className,
  class: classes,
}: BadgeVariants & { className?: ClassValue; class?: ClassValue } = {}) {
  return classNames(badgeClasses.get(variant === null ? "" : variant), classes, className);
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, BadgeVariants {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
