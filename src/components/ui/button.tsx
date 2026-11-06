import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { clsx as classNames, type ClassValue } from "clsx";
import { cn } from "@/lib/utils";

const buttonStyles = {
  default:
    "border-2 border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8] shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#2d5a2d] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
  primary:
    "border-2 border-[#1a1a1a] bg-[#2d5a2d] text-[#f0f0e8] shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#3a6a3a] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
  destructive:
    "border-2 border-[#1a1a1a] bg-[#dc2626] text-white shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#b91c1c] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
  outline:
    "border-2 border-[#1a1a1a] bg-transparent text-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#1a1a1a] hover:text-[#f0f0e8] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
  secondary:
    "border-2 border-[#1a1a1a] bg-[#e8e8e0] text-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#d8d8d0] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
  ghost:
    "border-2 border-transparent text-[#1a1a1a] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:border-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f0f0e8] hover:shadow-[4px_4px_0px_0px_var(--shadow-color)]",
  link: "text-[#1a1a1a] underline underline-offset-4 hover:text-[#2d5a2d]",
};

const buttonSizes = {
  default: "h-10 px-5 py-2",
  sm: "h-8 px-4 text-xs",
  lg: "h-12 px-8 text-base",
  icon: "h-10 w-10",
};

interface ButtonVariants {
  variant?: keyof typeof buttonStyles | null;
  size?: keyof typeof buttonSizes | null;
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 text-sm font-bold tracking-wider whitespace-nowrap uppercase transition-all active:translate-x-[2px] active:translate-y-[2px] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

// There are only 40 combinations, including explicitly omitted variants/sizes.
// Build their class strings once instead of flattening them on every render.
const buttonClasses = new Map(
  Object.entries({ "": "", ...buttonStyles }).map(([variant, styles]) => [
    variant,
    new Map(
      Object.entries({ "": "", ...buttonSizes }).map(([size, sizes]) => [
        size,
        classNames(buttonBase, styles, sizes),
      ]),
    ),
  ]),
);

function buttonVariants({
  variant = "default",
  size = "default",
  className,
  class: classes,
}: ButtonVariants & { className?: ClassValue; class?: ClassValue } = {}) {
  const selected = buttonClasses
    .get(variant === null ? "" : variant)
    ?.get(size === null ? "" : size);
  return classNames(selected, classes, className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariants {
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
