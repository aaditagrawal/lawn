"use client";

import { Camera, X } from "lucide-react";
import { cn, formatTimestamp } from "@/lib/utils";
import type { ColorReview, StillCompareMode } from "@/lib/color/useColorReview";
import { ToggleButton } from "./ColorNoteComposer";

const MODES: Array<{ id: StillCompareMode; label: string; hint: string }> = [
  { id: "wipe", label: "Wipe", hint: "Drag the divider across the frame" },
  { id: "side", label: "Side by side", hint: "Both frames at half size" },
  { id: "difference", label: "Difference", hint: "Bright where the frames differ" },
  { id: "onion", label: "Onion", hint: "Blend the still over the live frame" },
];

export function StillsSection({
  review,
  stillLabel,
}: {
  review: ColorReview;
  /** Prefix for new stills, e.g. "v2". */
  stillLabel?: string;
}) {
  const { stills, compareStill, stillMode } = review;
  const grab = async () => {
    const time = review.video?.currentTime ?? 0;
    const label = [stillLabel, formatTimestamp(time)].filter(Boolean).join(" · ");
    const still = await review.grabStill(label);
    if (still && !compareStill) review.setCompareStillId(still.id);
  };

  return (
    <section className="border-b-2 border-[#1a1a1a] p-4" aria-label="Compare frames">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] font-black tracking-wider text-[#1a1a1a] uppercase">
          Compare frames
        </h3>
        <button
          type="button"
          onClick={() => void grab()}
          className="inline-flex items-center gap-1.5 border-2 border-[#1a1a1a] bg-[#1a1a1a] px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-[#f0f0e8] uppercase hover:bg-[#2d5a2d]"
        >
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          Grab still
        </button>
      </div>

      {stills.length === 0 ? (
        <p className="text-xs text-[#888]">
          Grab a still, then scrub to another shot — or switch versions — to compare them against
          it.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-1.5">
            {stills.map((still) => {
              const active = compareStill?.id === still.id;
              return (
                <li key={still.id} className="relative">
                  <button
                    type="button"
                    onClick={() => review.setCompareStillId(active ? null : still.id)}
                    aria-pressed={active}
                    aria-label={`Compare with still ${still.label}`}
                    className={cn(
                      "block w-full border-2 text-left",
                      active ? "border-[#2d5a2d] outline-2 outline-[#2d5a2d]" : "border-[#1a1a1a]",
                    )}
                  >
                    <img
                      src={still.thumbnail}
                      alt=""
                      className="block aspect-video w-full object-cover"
                    />
                    <span
                      className={cn(
                        "block truncate px-1 py-0.5 font-mono text-[9px] font-bold",
                        active ? "bg-[#2d5a2d] text-[#f0f0e8]" : "bg-[#1a1a1a] text-[#f0f0e8]",
                      )}
                    >
                      {still.label}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => review.removeStill(still.id)}
                    className="absolute top-0.5 right-0.5 bg-[#1a1a1a] p-0.5 text-[#f0f0e8] hover:bg-[#dc2626]"
                    aria-label={`Remove still ${still.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>

          {compareStill ? (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {MODES.map((mode) => (
                  <ToggleButton
                    key={mode.id}
                    active={stillMode === mode.id}
                    onClick={() => review.setStillMode(mode.id)}
                    title={mode.hint}
                  >
                    {mode.label}
                  </ToggleButton>
                ))}
              </div>
              {stillMode === "onion" ? (
                <label className="block">
                  <span className="flex justify-between font-mono text-[10px] text-[#1a1a1a]">
                    <span>Still opacity</span>
                    <span className="tabular-nums">{Math.round(review.stillOpacity * 100)}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={review.stillOpacity}
                    aria-label="Still opacity"
                    onChange={(event) => review.setStillOpacity(Number(event.target.value))}
                    className="h-1.5 w-full cursor-pointer accent-[#2d5a2d]"
                  />
                </label>
              ) : null}
              <p className="font-mono text-[9px] text-[#888]">
                {MODES.find((mode) => mode.id === stillMode)?.hint}. Plays live against the still.
              </p>
            </div>
          ) : (
            <p className="mt-2 font-mono text-[9px] text-[#888]">Select a still to compare.</p>
          )}
        </>
      )}
    </section>
  );
}
