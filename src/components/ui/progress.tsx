"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number | null;
  max?: number;
  getValueLabel?: (value: number, max: number) => string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, getValueLabel, ...props }, ref) => {
    const limit = Number.isFinite(max) && max > 0 ? max : 100;
    const current =
      typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= limit
        ? value
        : null;
    const state = current === null ? "indeterminate" : current === limit ? "complete" : "loading";
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={current ?? undefined}
        aria-valuetext={
          current === null
            ? undefined
            : (getValueLabel?.(current, limit) ?? `${Math.round((current / limit) * 100)}%`)
        }
        data-state={state}
        data-value={current ?? undefined}
        data-max={limit}
        className={cn(
          "relative h-2 w-full overflow-hidden border-2 border-[#1a1a1a] bg-[#e8e8e0]",
          className,
        )}
        {...props}
      >
        <div
          data-state={state}
          data-value={current ?? undefined}
          data-max={limit}
          className="h-full w-full flex-1 bg-[#2d5a2d] transition-all duration-300 ease-out"
          style={{ transform: `translateX(-${100 - ((current ?? 0) / limit) * 100}%)` }}
        />
      </div>
    );
  },
);
Progress.displayName = "Progress";

export { Progress };
