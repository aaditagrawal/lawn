"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
    <div
      ref={ref}
      role={decorative ? "none" : "separator"}
      aria-orientation={!decorative && orientation === "vertical" ? "vertical" : undefined}
      data-orientation={orientation}
      className={cn(
        "shrink-0 bg-[#1a1a1a]",
        orientation === "horizontal" ? "h-[2px] w-full" : "h-full w-[2px]",
        className,
      )}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";

export { Separator };
