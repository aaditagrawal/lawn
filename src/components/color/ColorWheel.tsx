"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { puckFromWheel, wheelFromPuck, type WheelValue } from "@/lib/color/grade";

// Ring colors follow vectorscope placement (x = Cb, y = Cr) so pushing the
// puck toward a hue on the ring pushes the picture toward that hue.
const RING = (() => {
  const stops: string[] = [];
  for (let cssAngle = 0; cssAngle <= 360; cssAngle += 30) {
    const theta = ((90 - cssAngle) * Math.PI) / 180;
    const cb = Math.cos(theta) * 0.32;
    const cr = Math.sin(theta) * 0.32;
    const y = 0.55;
    const r = y + 1.5748 * cr;
    const b = y + 1.8556 * cb;
    const g = (y - 0.2126 * r - 0.0722 * b) / 0.7152;
    const channel = (value: number) => Math.round(Math.min(Math.max(value, 0), 1) * 255);
    stops.push(`rgb(${channel(r)},${channel(g)},${channel(b)}) ${cssAngle}deg`);
  }
  return `radial-gradient(circle, #8a8a8a 0%, rgba(138,138,138,0) 72%), conic-gradient(${stops.join(", ")})`;
})();

const SIZE = 104;

export function ColorWheel({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: WheelValue;
  onChange: (value: WheelValue) => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const { x, y, master } = puckFromWheel(value);
  const neutral = value.r === 0 && value.g === 0 && value.b === 0;

  const setFromPointer = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const bounds = pad.getBoundingClientRect();
    let px = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    let py = -(((clientY - bounds.top) / bounds.height) * 2 - 1);
    const length = Math.hypot(px, py);
    if (length > 1) {
      px /= length;
      py /= length;
    }
    onChange(wheelFromPuck(px, py, master));
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setFromPointer(event.clientX, event.clientY);
    const move = (moveEvent: PointerEvent) => setFromPointer(moveEvent.clientX, moveEvent.clientY);
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const nudge = (dx: number, dy: number) => {
    const nextX = Math.min(Math.max(x + dx, -1), 1);
    const nextY = Math.min(Math.max(y + dy, -1), 1);
    onChange(wheelFromPuck(nextX, nextY, master));
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex w-full items-baseline justify-between">
        <span className="font-mono text-[10px] font-black tracking-wider text-[#1a1a1a] uppercase">
          {label}
        </span>
        <button
          type="button"
          onClick={() => onChange({ r: 0, g: 0, b: 0 })}
          disabled={neutral}
          className="font-mono text-[9px] text-[#888] underline underline-offset-2 hover:text-[#1a1a1a] disabled:no-underline disabled:opacity-40"
        >
          Reset
        </button>
      </div>
      <div
        ref={padRef}
        role="slider"
        tabIndex={0}
        aria-label={`${label} color balance`}
        aria-valuetext={`R ${value.r.toFixed(2)}, G ${value.g.toFixed(2)}, B ${value.b.toFixed(2)}`}
        title={`${hint}. Drag toward a color; double-click to reset.`}
        className="relative cursor-crosshair touch-none rounded-full border-2 border-[#1a1a1a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d5a2d]"
        style={{ width: SIZE, height: SIZE, background: RING }}
        onPointerDown={startDrag}
        onDoubleClick={() => onChange(wheelFromPuck(0, 0, master))}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.02;
          if (event.key === "ArrowLeft") nudge(-step, 0);
          else if (event.key === "ArrowRight") nudge(step, 0);
          else if (event.key === "ArrowUp") nudge(0, step);
          else if (event.key === "ArrowDown") nudge(0, -step);
          else return;
          event.preventDefault();
        }}
      >
        <span className="pointer-events-none absolute top-1/2 left-1/2 h-px w-3 -translate-x-1/2 bg-[#1a1a1a]/40" />
        <span className="pointer-events-none absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-[#1a1a1a]/40" />
        <span
          className={cn(
            "pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 border-2 border-[#1a1a1a]",
            neutral ? "bg-[#f0f0e8]" : "bg-white",
          )}
          style={{ left: `${50 + x * 50}%`, top: `${50 - y * 50}%` }}
        />
      </div>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={Number(master.toFixed(2))}
        aria-label={`${label} level`}
        onChange={(event) => onChange(wheelFromPuck(x, y, Number(event.target.value)))}
        onDoubleClick={() => onChange(wheelFromPuck(x, y, 0))}
        className="h-1.5 w-full cursor-pointer accent-[#2d5a2d]"
      />
      <span className="font-mono text-[9px] text-[#888] tabular-nums">
        {hint} · {master >= 0 ? "+" : ""}
        {(master * 100).toFixed(0)}
      </span>
    </div>
  );
}
