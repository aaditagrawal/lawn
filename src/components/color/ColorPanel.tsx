"use client";

import { Copy, Crosshair, MapPin, Palette, Trash2 } from "lucide-react";
import { cn, formatTimestamp } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/clipboard";
import { formatRgb, lumaPercent, rgbToHex, rgbToHsl, type RGB } from "@/lib/color/colorMath";
import { FALSE_COLOR_BANDS, MONITOR_MODES } from "@/lib/color/monitor";
import {
  SAMPLE_SIZES,
  type ColorNoteData,
  type ColorReview,
  type NoteKind,
} from "@/lib/color/useColorReview";
import { ColorNoteComposer, ToggleButton } from "./ColorNoteComposer";
import { ColorScopes } from "./ColorScopes";
import { Disclosure } from "./GradeControls";
import { StillsSection } from "./StillsSection";
import { Swatch } from "./Swatch";

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="font-mono text-[11px] font-black tracking-wider text-[#1a1a1a] uppercase">
        {children}
      </h3>
      {action}
    </div>
  );
}

function ColorValues({ rgb }: { rgb: RGB }) {
  const hsl = rgbToHsl(rgb);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px] text-[#1a1a1a]">
      <dt className="text-[#888]">RGB</dt>
      <dd>{formatRgb(rgb)}</dd>
      <dt className="text-[#888]">HSL</dt>
      <dd>
        {Math.round(hsl.h)}° {Math.round(hsl.s)}% {Math.round(hsl.l)}%
      </dd>
      <dt className="text-[#888]">Y′709</dt>
      <dd>{lumaPercent(rgb).toFixed(1)}%</dd>
    </dl>
  );
}

function describeSample(rgb: RGB, timestampSeconds: number, pixel: { x: number; y: number }) {
  return `${rgbToHex(rgb).toUpperCase()}  RGB(${formatRgb(rgb)})  Y′ ${lumaPercent(rgb).toFixed(1)}%  @ ${formatTimestamp(timestampSeconds)}  px ${pixel.x},${pixel.y}`;
}

function Readout({ review, onSeek }: { review: ColorReview; onSeek: (time: number) => void }) {
  const { liveSample, pins } = review;
  const copyPins = () => {
    void copyTextToClipboard(
      pins
        .map((pin) => `#${pin.id}  ${describeSample(pin.rgb, pin.timestampSeconds, pin.pixel)}`)
        .join("\n"),
    );
  };

  return (
    <section className="border-b-2 border-[#1a1a1a] p-4" aria-label="Pixel readout">
      <SectionTitle
        action={
          <div className="flex">
            {SAMPLE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => review.setSampleSize(size)}
                aria-pressed={review.sampleSize === size}
                className={cn(
                  "border-2 border-[#1a1a1a] px-1.5 py-0.5 font-mono text-[10px] font-bold [&+&]:border-l-0",
                  review.sampleSize === size
                    ? "bg-[#1a1a1a] text-[#f0f0e8]"
                    : "text-[#1a1a1a] hover:bg-[#1a1a1a]/10",
                )}
                title={size === 1 ? "Single pixel" : `Average of ${size}×${size} pixels`}
              >
                {size === 1 ? "1px" : `${size}×${size}`}
              </button>
            ))}
          </div>
        }
      >
        Readout
      </SectionTitle>
      <ToggleButton
        active={review.tool === "probe"}
        onClick={() => review.setTool(review.tool === "probe" ? null : "probe")}
        className="mb-3 w-full"
        title="Read exact pixel values from the frame"
      >
        <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
        {review.tool === "probe" ? "Probing — Esc to stop" : "Probe pixels"}
      </ToggleButton>
      {liveSample ? (
        <div className="flex gap-3">
          <Swatch hex={rgbToHex(liveSample.rgb)} className="h-14 w-14" />
          <div className="min-w-0">
            <div className="font-mono text-lg leading-none font-black text-[#1a1a1a]">
              {rgbToHex(liveSample.rgb).toUpperCase()}
            </div>
            <div className="mt-1.5">
              <ColorValues rgb={liveSample.rgb} />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#888]">
          {review.tool === "probe"
            ? "Hover the frame to read pixels. Click to pin."
            : "Turn on the probe, then hover the frame for exact values."}
        </p>
      )}

      {pins.length > 0 ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold tracking-wider text-[#1a1a1a] uppercase">
              Pinned ({pins.length})
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={copyPins}
                className="font-mono text-[10px] text-[#1a1a1a] underline underline-offset-2 hover:text-[#2d5a2d]"
              >
                Copy all
              </button>
              <button
                type="button"
                onClick={review.clearPins}
                className="font-mono text-[10px] text-[#888] underline underline-offset-2 hover:text-[#dc2626]"
              >
                Clear
              </button>
            </div>
          </div>
          <ul className="divide-y divide-[#1a1a1a]/10 border-2 border-[#1a1a1a]">
            {pins.map((pin) => (
              <li key={pin.id} className="flex items-center gap-2 px-2 py-1.5">
                <span className="w-4 font-mono text-[10px] font-black text-[#1a1a1a]">
                  {pin.id}
                </span>
                <Swatch hex={rgbToHex(pin.rgb)} className="h-6 w-6" />
                <button
                  type="button"
                  onClick={() => onSeek(pin.timestampSeconds)}
                  className="min-w-0 flex-1 text-left font-mono text-[10px] leading-tight text-[#1a1a1a] hover:text-[#2d5a2d]"
                  title="Jump to this frame"
                >
                  <span className="font-bold">{rgbToHex(pin.rgb).toUpperCase()}</span>{" "}
                  <span className="text-[#888]">
                    Y′ {lumaPercent(pin.rgb).toFixed(1)}% · {formatTimestamp(pin.timestampSeconds)}
                  </span>
                  <br />
                  {formatRgb(pin.rgb)}
                  {pin.size > 1 ? ` · ${pin.size}×${pin.size}` : ""}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void copyTextToClipboard(
                      describeSample(pin.rgb, pin.timestampSeconds, pin.pixel),
                    )
                  }
                  className="p-1 text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f0f0e8]"
                  aria-label={`Copy sample ${pin.id}`}
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => review.removePin(pin.id)}
                  className="p-1 text-[#1a1a1a] hover:bg-[#dc2626] hover:text-white"
                  aria-label={`Remove sample ${pin.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 font-mono text-[9px] leading-snug text-[#888]">
        8-bit sRGB as decoded by this browser. For grading-grade accuracy, view on a calibrated
        display.
      </p>
    </section>
  );
}

export function ColorPanel({
  review,
  currentTime,
  onSubmitColorNote,
  onRequestPause,
  onSeek,
  canComment = true,
  stillLabel,
}: {
  review: ColorReview;
  currentTime: number;
  onSubmitColorNote?: (
    text: string,
    note: ColorNoteData,
    timestampSeconds: number,
  ) => Promise<void>;
  onRequestPause: () => void;
  onSeek: (time: number) => void;
  canComment?: boolean;
  /** Prefix for grabbed stills, e.g. the version ("v2"). */
  stillLabel?: string;
}) {
  const { monitor, uiMode } = review;
  const canCompose = canComment && Boolean(onSubmitColorNote);

  const startNote = (kind: NoteKind) => {
    onRequestPause();
    review.beginDraft(kind);
    review.setTool("rect");
  };

  return (
    <div className="flex flex-col">
      <section className="border-b-2 border-[#1a1a1a] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-bold tracking-wider text-[#888] uppercase">
            Controls
          </span>
          <div className="flex" role="radiogroup" aria-label="Control level">
            {(["beginner", "advanced"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={uiMode === mode}
                onClick={() => review.setUiMode(mode)}
                className={cn(
                  "border-2 border-[#1a1a1a] px-2 py-0.5 font-mono text-[10px] font-bold uppercase [&+&]:border-l-0",
                  uiMode === mode
                    ? "bg-[#1a1a1a] text-[#f0f0e8]"
                    : "text-[#1a1a1a] hover:bg-[#1a1a1a]/10",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        {canCompose && !review.composerOpen ? (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => startNote("area")}
              className="flex flex-col items-center gap-1 border-2 border-[#1a1a1a] px-2 py-2.5 font-mono text-[10px] font-bold tracking-wider text-[#1a1a1a] uppercase hover:bg-[#1a1a1a] hover:text-[#f0f0e8]"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Area note
            </button>
            <button
              type="button"
              onClick={() => startNote("grade")}
              className="flex flex-col items-center gap-1 border-2 border-[#1a1a1a] bg-[#2d5a2d] px-2 py-2.5 font-mono text-[10px] font-bold tracking-wider text-[#f0f0e8] uppercase hover:bg-[#3a6a3a]"
            >
              <Palette className="h-4 w-4" aria-hidden="true" />
              Color grade
            </button>
          </div>
        ) : null}
        {review.pixelAccessBlocked ? (
          <p className="mt-3 border-2 border-[#dc2626] bg-[#fef2f2] px-2 py-1.5 text-xs text-[#dc2626]">
            This source blocks pixel reads, so readouts and previews are off. Switch quality to 720p
            to enable them.
          </p>
        ) : null}
        {review.rendererUnavailable ? (
          <p className="mt-3 border-2 border-[#dc2626] bg-[#fef2f2] px-2 py-1.5 text-xs text-[#dc2626]">
            This browser has no WebGL2, so grade previews, monitors and still comparisons can’t
            render. Notes and readouts still work.
          </p>
        ) : null}
      </section>

      {canCompose && review.composerOpen && onSubmitColorNote ? (
        <ColorNoteComposer
          review={review}
          onSubmit={onSubmitColorNote}
          onSeek={onSeek}
          onRequestPause={onRequestPause}
          currentTime={currentTime}
        />
      ) : null}

      <StillsSection review={review} stillLabel={stillLabel} />

      <Readout review={review} onSeek={onSeek} />

      <section className="border-b-2 border-[#1a1a1a] p-4" aria-label="Monitor">
        <SectionTitle>Monitor</SectionTitle>
        <div className="grid grid-cols-3 gap-1.5">
          {MONITOR_MODES.map((mode) => (
            <ToggleButton
              key={mode.id}
              active={monitor === mode.id}
              onClick={() => review.setMonitor(mode.id)}
            >
              {mode.label}
            </ToggleButton>
          ))}
        </div>
        {monitor === "false-color" ? (
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {FALSE_COLOR_BANDS.filter((band) => band.color).map((band) => (
              <li key={band.label} className="flex items-center gap-1.5 font-mono text-[10px]">
                <span
                  className="h-3 w-3 border border-[#1a1a1a]"
                  style={{ backgroundColor: `rgb(${band.color!.join(",")})` }}
                />
                <span className="text-[#1a1a1a]">{band.label}</span>
                <span className="text-[#888]">
                  {band.from}–{Math.min(band.to, 100)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="p-4" aria-label="Scopes">
        {/* Scopes only sample frames while open. */}
        <Disclosure title="Scopes" defaultOpen={uiMode === "advanced"}>
          <ColorScopes
            video={review.video}
            onPixelAccessBlocked={() => review.setPixelAccessBlocked(true)}
          />
        </Disclosure>
      </section>
    </div>
  );
}

export default ColorPanel;
