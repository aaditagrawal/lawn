"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, Pipette, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeHex } from "@/lib/color/colorMath";
import {
  BEGINNER_SLIDERS,
  DEFAULT_QUALIFIER,
  NEUTRAL_ADJUSTMENTS,
  QUICK_ADJUSTMENTS,
  SLIDER_CONTROLS,
  WHEEL_CONTROLS,
  isNeutralAdjustments,
  type ScalarAdjustmentKey,
} from "@/lib/color/grade";
import type { ColorReview, MatteMode } from "@/lib/color/useColorReview";
import { ColorWheel } from "./ColorWheel";

export function Disclosure({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-2 border-[#1a1a1a]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[#1a1a1a]/5"
      >
        <span className="font-mono text-[10px] font-black tracking-wider text-[#1a1a1a] uppercase">
          {title}
        </span>
        {summary ? (
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[#2d5a2d]">
            {summary}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <ChevronDown
          className={cn("h-3.5 w-3.5 flex-shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? <div className="space-y-3 border-t-2 border-[#1a1a1a] p-2.5">{children}</div> : null}
    </div>
  );
}

function formatValue(key: ScalarAdjustmentKey, value: number) {
  const sign = value > 0 ? "+" : "";
  if (key === "exposure") return `${sign}${value.toFixed(2)}`;
  if (key === "hue") return `${sign}${value}°`;
  return `${sign}${value}`;
}

function SliderRow({
  controlKey,
  value,
  onChange,
  friendly,
  precise,
}: {
  controlKey: ScalarAdjustmentKey;
  value: number;
  onChange: (value: number) => void;
  friendly: boolean;
  precise: boolean;
}) {
  const control = SLIDER_CONTROLS[controlKey];
  const label = friendly ? control.friendly : control.label;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-[#1a1a1a]">
        <span title={control.hint} onDoubleClick={() => onChange(0)}>
          {label}
          {controlKey === "exposure" && !friendly ? <span className="text-[#888]"> EV</span> : null}
        </span>
        {precise ? (
          <input
            type="number"
            aria-label={`${label} value`}
            min={control.min}
            max={control.max}
            step={control.step}
            value={value}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                onChange(Math.min(Math.max(next, control.min), control.max));
              }
            }}
            className="w-16 border border-[#1a1a1a] bg-transparent px-1 py-0.5 text-right tabular-nums outline-none focus:bg-[#1a1a1a]/5"
          />
        ) : (
          <span className={cn("tabular-nums", value === 0 && "text-[#888]")}>
            {formatValue(controlKey, value)}
          </span>
        )}
      </div>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={() => onChange(0)}
        className="h-1.5 w-full cursor-pointer accent-[#2d5a2d]"
      />
      {friendly ? <p className="font-mono text-[9px] text-[#888]">{control.hint}</p> : null}
    </div>
  );
}

function HexField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
}) {
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }
  return (
    <input
      aria-label={label}
      value={text.toUpperCase()}
      placeholder="#RRGGBB"
      onChange={(event) => {
        setText(event.target.value);
        const hex = normalizeHex(event.target.value);
        if (hex) onChange(hex);
      }}
      onBlur={() => setText(value)}
      className="w-[74px] border-2 border-[#1a1a1a] bg-transparent px-1.5 py-1 font-mono text-[11px] text-[#1a1a1a] outline-none placeholder:text-[#bbb] focus:bg-[#1a1a1a]/5"
      spellCheck={false}
      maxLength={7}
    />
  );
}

function MatchColor({ review }: { review: ColorReview }) {
  const { draft } = review;
  const setMatchTo = (hex: string) => {
    review.updateDraft({
      match: { from: draft.match?.from ?? draft.sampledColor ?? hex, to: hex },
    });
  };
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            review.startEyedropper(review.eyedropper === "match-from" ? null : "match-from")
          }
          className={cn(
            "flex h-8 w-8 items-center justify-center border-2 border-[#1a1a1a]",
            review.eyedropper === "match-from" && "outline-2 outline-offset-1 outline-[#2d5a2d]",
          )}
          style={{ backgroundColor: draft.match?.from ?? draft.sampledColor ?? "transparent" }}
          title="Pick the color to change from the frame"
          aria-label="Pick source color from the frame"
        >
          <Pipette className="h-3.5 w-3.5 text-white mix-blend-difference" aria-hidden="true" />
        </button>
        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <label
          className="relative flex h-8 w-8 cursor-pointer border-2 border-[#1a1a1a]"
          style={{ backgroundColor: draft.match?.to ?? "transparent" }}
          title="Choose the target color"
        >
          {!draft.match ? (
            <span className="m-auto font-mono text-[9px] font-bold text-[#888]">?</span>
          ) : null}
          <input
            type="color"
            aria-label="Target color"
            value={draft.match?.to ?? draft.sampledColor ?? "#808080"}
            onChange={(event) => setMatchTo(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <HexField label="Target color hex" value={draft.match?.to ?? ""} onChange={setMatchTo} />
        <button
          type="button"
          onClick={() =>
            review.startEyedropper(review.eyedropper === "match-to" ? null : "match-to")
          }
          className={cn(
            "flex h-8 w-8 items-center justify-center border-2 border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f0f0e8]",
            review.eyedropper === "match-to" && "bg-[#1a1a1a] text-[#f0f0e8]",
          )}
          title="Pick the target from any frame — seek to a reference shot first"
          aria-label="Pick target color from the frame"
        >
          <Pipette className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[9px] text-[#888]">
        <span>Pick a color, then what it should become.</span>
        {draft.match ? (
          <button
            type="button"
            className="underline underline-offset-2 hover:text-[#1a1a1a]"
            onClick={() => review.updateDraft({ match: null })}
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

const HUE_BAR =
  "linear-gradient(to right, #ff0000, #ffff00 16.7%, #00ff00 33.3%, #00ffff 50%, #0000ff 66.7%, #ff00ff 83.3%, #ff0000)";

function RangeRow({
  label,
  low,
  high,
  onChange,
}: {
  label: string;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between font-mono text-[10px] text-[#1a1a1a]">
        <span>{label}</span>
        <span className="tabular-nums">
          {Math.round(low * 100)}–{Math.round(high * 100)}%
        </span>
      </div>
      <div className="flex gap-1.5">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={low}
          aria-label={`${label} minimum`}
          onChange={(event) => onChange(Math.min(Number(event.target.value), high), high)}
          className="h-1.5 w-full cursor-pointer accent-[#2d5a2d]"
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={high}
          aria-label={`${label} maximum`}
          onChange={(event) => onChange(low, Math.max(Number(event.target.value), low))}
          className="h-1.5 w-full cursor-pointer accent-[#2d5a2d]"
        />
      </div>
    </div>
  );
}

function QualifierControls({ review }: { review: ColorReview }) {
  const qualifier = review.draft.qualifier;
  const matteOptions: Array<{ id: MatteMode; label: string }> = [
    { id: 0, label: "Off" },
    { id: 1, label: "Highlight" },
    { id: 2, label: "Matte" },
  ];
  return (
    <div className="space-y-3">
      <p className="font-mono text-[9px] leading-snug text-[#888]">
        Narrow the grade to pixels of one color inside the region — e.g. only the skin, only the
        sky.
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() =>
            review.startEyedropper(review.eyedropper === "qualifier" ? null : "qualifier")
          }
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 border-2 border-[#1a1a1a] px-2 py-1.5 font-mono text-[10px] font-bold tracking-wider uppercase",
            review.eyedropper === "qualifier"
              ? "bg-[#1a1a1a] text-[#f0f0e8]"
              : "text-[#1a1a1a] hover:bg-[#1a1a1a]/10",
          )}
        >
          <Pipette className="h-3.5 w-3.5" aria-hidden="true" />
          Pick color
        </button>
        {qualifier ? (
          <button
            type="button"
            onClick={() => {
              review.updateQualifier(null);
              review.setMatte(0);
            }}
            className="border-2 border-[#1a1a1a] px-2 py-1.5 font-mono text-[10px] font-bold text-[#1a1a1a] uppercase hover:bg-[#dc2626] hover:text-white"
          >
            Remove
          </button>
        ) : (
          <button
            type="button"
            onClick={() => review.updateQualifier({ ...DEFAULT_QUALIFIER })}
            className="border-2 border-[#1a1a1a] px-2 py-1.5 font-mono text-[10px] font-bold text-[#1a1a1a] uppercase hover:bg-[#1a1a1a]/10"
          >
            Manual
          </button>
        )}
      </div>

      {qualifier ? (
        <>
          <div>
            <div className="flex justify-between font-mono text-[10px] text-[#1a1a1a]">
              <span>Hue</span>
              <span className="tabular-nums">
                {qualifier.hueWidth >= 360
                  ? "All hues"
                  : `${Math.round(qualifier.hueCenter)}° ± ${Math.round(qualifier.hueWidth / 2)}°`}
              </span>
            </div>
            <div
              className="relative mt-1 h-3 border border-[#1a1a1a]"
              style={{ background: HUE_BAR }}
            >
              {qualifier.hueWidth < 360 ? (
                <span
                  className="absolute inset-y-0 border-x-2 border-[#1a1a1a] bg-white/30"
                  style={{
                    left: `${((qualifier.hueCenter - qualifier.hueWidth / 2 + 360) % 360) / 3.6}%`,
                    width: `${qualifier.hueWidth / 3.6}%`,
                  }}
                />
              ) : null}
            </div>
            <input
              type="range"
              min={0}
              max={359}
              step={1}
              value={qualifier.hueCenter}
              aria-label="Qualifier hue center"
              onChange={(event) =>
                review.updateQualifier({ hueCenter: Number(event.target.value) })
              }
              className="h-1.5 w-full cursor-pointer accent-[#2d5a2d]"
            />
            <input
              type="range"
              min={4}
              max={360}
              step={1}
              value={qualifier.hueWidth}
              aria-label="Qualifier hue width"
              onChange={(event) => review.updateQualifier({ hueWidth: Number(event.target.value) })}
              className="h-1.5 w-full cursor-pointer accent-[#2d5a2d]"
            />
          </div>
          <RangeRow
            label="Saturation"
            low={qualifier.satLow}
            high={qualifier.satHigh}
            onChange={(satLow, satHigh) => review.updateQualifier({ satLow, satHigh })}
          />
          <RangeRow
            label="Luma"
            low={qualifier.lumaLow}
            high={qualifier.lumaHigh}
            onChange={(lumaLow, lumaHigh) => review.updateQualifier({ lumaLow, lumaHigh })}
          />
          <div>
            <div className="flex justify-between font-mono text-[10px] text-[#1a1a1a]">
              <span>Softness</span>
              <span className="tabular-nums">{Math.round(qualifier.softness * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={qualifier.softness}
              aria-label="Qualifier softness"
              onChange={(event) => review.updateQualifier({ softness: Number(event.target.value) })}
              className="h-1.5 w-full cursor-pointer accent-[#2d5a2d]"
            />
          </div>
        </>
      ) : null}

      <div>
        <span className="font-mono text-[10px] text-[#1a1a1a]">Show selection</span>
        <div className="mt-1 grid grid-cols-3 gap-1">
          {matteOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => review.setMatte(option.id)}
              aria-pressed={review.matte === option.id}
              className={cn(
                "border-2 border-[#1a1a1a] px-1 py-1 font-mono text-[10px] font-bold uppercase",
                review.matte === option.id
                  ? "bg-[#1a1a1a] text-[#f0f0e8]"
                  : "text-[#1a1a1a] hover:bg-[#1a1a1a]/10",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function countChanged(keys: ScalarAdjustmentKey[], adjustments: Record<string, unknown>) {
  const changed = keys.filter((key) => adjustments[key] !== 0).length;
  return changed > 0 ? `${changed} changed` : undefined;
}

export function GradeControls({ review }: { review: ColorReview }) {
  const { draft, uiMode } = review;
  const adjustments = draft.adjustments;
  const advanced = uiMode === "advanced";
  const set = review.updateAdjustment;
  const neutral = isNeutralAdjustments(adjustments);

  const resetButton = !neutral ? (
    <button
      type="button"
      onClick={() => review.updateDraft({ adjustments: { ...NEUTRAL_ADJUSTMENTS } })}
      className="inline-flex items-center gap-1 font-mono text-[10px] text-[#888] underline underline-offset-2 hover:text-[#1a1a1a]"
    >
      <RotateCcw className="h-3 w-3" aria-hidden="true" />
      Reset all
    </button>
  ) : null;

  if (!advanced) {
    return (
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold tracking-wider text-[#1a1a1a] uppercase">
              Quick fixes
            </span>
            {resetButton}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {QUICK_ADJUSTMENTS.map((quick) => (
              <button
                key={quick.label}
                type="button"
                onClick={() => {
                  const control = SLIDER_CONTROLS[quick.key];
                  const current = adjustments[quick.key];
                  const next = Math.min(Math.max(current + quick.delta, control.min), control.max);
                  set(quick.key, Math.round(next * 100) / 100);
                }}
                className="border border-[#1a1a1a] px-1 py-1.5 font-mono text-[10px] text-[#1a1a1a] transition-colors hover:bg-[#1a1a1a] hover:text-[#f0f0e8]"
              >
                {quick.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2.5">
          {BEGINNER_SLIDERS.map((key) => (
            <SliderRow
              key={key}
              controlKey={key}
              value={adjustments[key]}
              onChange={(value) => set(key, value)}
              friendly
              precise={false}
            />
          ))}
        </div>
        <div>
          <span className="font-mono text-[10px] font-bold tracking-wider text-[#1a1a1a] uppercase">
            Make it look like…
          </span>
          <div className="mt-1.5">
            <MatchColor review={review} />
          </div>
        </div>
      </div>
    );
  }

  const primaries: ScalarAdjustmentKey[] = [
    "exposure",
    "contrast",
    "saturation",
    "vibrance",
    "hue",
    "temperature",
    "tint",
  ];
  const tone: ScalarAdjustmentKey[] = ["highlights", "shadows", "whites", "blacks"];
  const changedWheels = WHEEL_CONTROLS.filter(({ key }) => {
    const wheel = adjustments[key];
    return wheel.r !== 0 || wheel.g !== 0 || wheel.b !== 0;
  }).length;

  return (
    <div className="space-y-2">
      <div className="flex justify-end">{resetButton}</div>
      <Disclosure title="Primaries" summary={countChanged(primaries, adjustments)} defaultOpen>
        {primaries.map((key) => (
          <SliderRow
            key={key}
            controlKey={key}
            value={adjustments[key]}
            onChange={(value) => set(key, value)}
            friendly={false}
            precise
          />
        ))}
      </Disclosure>
      <Disclosure title="Tone" summary={countChanged(tone, adjustments)}>
        {tone.map((key) => (
          <SliderRow
            key={key}
            controlKey={key}
            value={adjustments[key]}
            onChange={(value) => set(key, value)}
            friendly={false}
            precise
          />
        ))}
      </Disclosure>
      <Disclosure
        title="Color wheels"
        summary={changedWheels > 0 ? `${changedWheels} changed` : undefined}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          {WHEEL_CONTROLS.map((wheel) => (
            <ColorWheel
              key={wheel.key}
              label={wheel.label}
              hint={wheel.hint}
              value={adjustments[wheel.key]}
              onChange={(value) => review.updateWheel(wheel.key, value)}
            />
          ))}
        </div>
      </Disclosure>
      <Disclosure title="Match color" summary={draft.match ? "On" : undefined}>
        <MatchColor review={review} />
      </Disclosure>
      <Disclosure
        title="Qualifier"
        summary={draft.qualifier ? "Limited to a color" : undefined}
        defaultOpen={Boolean(draft.qualifier)}
      >
        <QualifierControls review={review} />
      </Disclosure>
    </div>
  );
}
