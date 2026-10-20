"use client";

import { useState } from "react";
import { ArrowRight, Circle, LassoSelect, Maximize, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatTimestamp } from "@/lib/utils";
import { hexToRgb, lumaPercent, rgbToHex } from "@/lib/color/colorMath";
import { averageRegionColor, hasVideoFrame } from "@/lib/color/frame";
import { gradeRgb, isNeutralGrade } from "@/lib/color/grade";
import { FULL_FRAME_SHAPE, isFullFrame, shapeLabel } from "@/lib/color/shape";
import {
  draftToColorNote,
  type ColorNoteData,
  type ColorReview,
  type ColorTool,
  type CompareMode,
  type NoteKind,
} from "@/lib/color/useColorReview";
import { GradeControls } from "./GradeControls";
import { Swatch } from "./Swatch";

const SHAPE_TOOLS: Array<{ id: ColorTool; label: string; icon: typeof Square }> = [
  { id: "rect", label: "Rect", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "lasso", label: "Lasso", icon: LassoSelect },
];

export function ToggleButton({
  active,
  onClick,
  children,
  className,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "flex items-center justify-center gap-1.5 border-2 border-[#1a1a1a] px-2 py-1.5 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors",
        active ? "bg-[#1a1a1a] text-[#f0f0e8]" : "text-[#1a1a1a] hover:bg-[#1a1a1a]/10",
        className,
      )}
    >
      {children}
    </button>
  );
}

function CompareControls({ review }: { review: ColorReview }) {
  const modes: Array<{ id: CompareMode; label: string }> = [
    { id: "before", label: "Before" },
    { id: "after", label: "After" },
    { id: "split", label: "Split" },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5">
        {modes.map((mode) => (
          <ToggleButton
            key={mode.id}
            active={review.compare === mode.id}
            onClick={() => review.setCompare(mode.id)}
          >
            {mode.label}
          </ToggleButton>
        ))}
      </div>
      <button
        type="button"
        onPointerDown={() => review.setHoldingBefore(true)}
        onPointerUp={() => review.setHoldingBefore(false)}
        onPointerLeave={() => review.setHoldingBefore(false)}
        className={cn(
          "mt-1.5 w-full border-2 border-dashed border-[#1a1a1a] px-2 py-1.5 font-mono text-[10px] font-bold tracking-wider text-[#1a1a1a] uppercase select-none",
          review.holdingBefore && "border-solid bg-[#1a1a1a] text-[#f0f0e8]",
        )}
      >
        Hold to flip before/after · or hold \
      </button>
    </div>
  );
}

export function ColorNoteComposer({
  review,
  onSubmit,
  onSeek,
  onRequestPause,
  currentTime,
}: {
  review: ColorReview;
  onSubmit: (text: string, note: ColorNoteData, timestampSeconds: number) => Promise<void>;
  onSeek: (time: number) => void;
  onRequestPause: () => void;
  currentTime: number;
}) {
  const { draft } = review;
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isGrade = draft.kind === "grade";
  const sampledRgb = draft.sampledColor ? hexToRgb(draft.sampledColor) : null;
  const resultRgb =
    sampledRgb && isGrade ? gradeRgb(sampledRgb, draft.adjustments, draft.match) : null;
  const neutral = isNeutralGrade(draft.adjustments, draft.match);
  const offFrame = draft.shape && Math.abs(currentTime - draft.timestampSeconds) > 0.02;
  const canPost =
    Boolean(draft.shape) && (isGrade ? !neutral || Boolean(text.trim()) : Boolean(text.trim()));

  const selectShapeTool = (tool: ColorTool) => {
    onRequestPause();
    review.setTool(review.tool === tool ? null : tool);
  };

  const useWholeFrame = () => {
    const video = review.video;
    if (!video) return;
    onRequestPause();
    let sampled = null;
    try {
      sampled = hasVideoFrame(video) ? averageRegionColor(video, FULL_FRAME_SHAPE) : null;
    } catch {
      review.setPixelAccessBlocked(true);
    }
    review.setDraftShape(FULL_FRAME_SHAPE, video.currentTime, sampled);
    review.setTool(null);
  };

  const setKind = (kind: NoteKind) => {
    review.updateDraft({
      kind,
      // Area notes are about a spot, not the whole picture.
      shape: kind === "area" && draft.shape && isFullFrame(draft.shape) ? null : draft.shape,
    });
    if (kind === "area") review.setMatte(0);
  };

  const submit = async () => {
    const note = draftToColorNote(draft);
    if (!note || !canPost) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(text.trim(), note, draft.timestampSeconds);
      setText("");
      review.resetDraft();
    } catch (submitError) {
      console.error("Failed to post note:", submitError);
      setError("Couldn't post the note. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="border-b-2 border-[#1a1a1a] bg-[#e8e8e0] p-4" aria-label="Note composer">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] font-black tracking-wider text-[#1a1a1a] uppercase">
          {draft.shape
            ? `${isGrade ? "Color note" : "Area note"} · ${formatTimestamp(draft.timestampSeconds)}`
            : "New note"}
        </h3>
        <button
          type="button"
          onClick={review.resetDraft}
          className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-[#888] uppercase underline underline-offset-2 hover:text-[#dc2626]"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Discard
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Note type">
        <ToggleButton
          active={!isGrade}
          onClick={() => setKind("area")}
          title="Point at a spot and write about it"
        >
          Area note
        </ToggleButton>
        <ToggleButton
          active={isGrade}
          onClick={() => setKind("grade")}
          title="Show the color change you want"
        >
          Color grade
        </ToggleButton>
      </div>

      {/* Region */}
      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-[10px] text-[#888] uppercase">
          <span>
            {draft.shape
              ? `Region: ${shapeLabel(draft.shape.kind, draft.shape)}${draft.invert ? " · outside" : ""}`
              : "Draw a region on the paused frame"}
          </span>
          {offFrame ? (
            <button
              type="button"
              className="font-bold text-[#2d5a2d] underline underline-offset-2"
              onClick={() => onSeek(draft.timestampSeconds)}
            >
              Back to frame
            </button>
          ) : null}
        </div>
        <div className={cn("grid gap-1.5", isGrade ? "grid-cols-4" : "grid-cols-3")}>
          {SHAPE_TOOLS.map((tool) => (
            <ToggleButton
              key={tool.id}
              active={review.tool === tool.id}
              onClick={() => selectShapeTool(tool.id)}
              className="flex-col gap-1 px-1"
              title={draft.shape ? `Redraw as ${tool.label.toLowerCase()}` : undefined}
            >
              <tool.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tool.label}
            </ToggleButton>
          ))}
          {isGrade ? (
            <ToggleButton
              active={Boolean(draft.shape && isFullFrame(draft.shape))}
              onClick={useWholeFrame}
              className="flex-col gap-1 px-1"
              title="Apply to the whole frame"
            >
              <Maximize className="h-3.5 w-3.5" aria-hidden="true" />
              Frame
            </ToggleButton>
          ) : null}
        </div>
        {draft.shape && isGrade ? (
          <div className="flex items-end gap-3">
            <label className="block flex-1">
              <span className="flex items-center justify-between font-mono text-[10px] text-[#1a1a1a]">
                <span>Edge softness</span>
                <span className="tabular-nums">{Math.round(draft.feather * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={0.25}
                step={0.005}
                value={draft.feather}
                aria-label="Edge softness"
                onChange={(event) => review.updateDraft({ feather: Number(event.target.value) })}
                className="h-1.5 w-full cursor-pointer accent-[#2d5a2d]"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-0.5 font-mono text-[10px] text-[#1a1a1a]">
              <input
                type="checkbox"
                checked={draft.invert}
                onChange={(event) => review.updateDraft({ invert: event.target.checked })}
                className="h-3.5 w-3.5 accent-[#2d5a2d]"
              />
              Outside
            </label>
          </div>
        ) : null}
      </div>

      {draft.shape && isGrade ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              {draft.sampledColor ? (
                <Swatch hex={draft.sampledColor} className="h-10 w-10" />
              ) : (
                <span className="h-10 w-10 border-2 border-dashed border-[#888]" />
              )}
              <span className="font-mono text-[9px] text-[#888] uppercase">Now</span>
            </div>
            <ArrowRight className="h-4 w-4 text-[#1a1a1a]" aria-hidden="true" />
            <div className="flex flex-col items-center gap-1">
              {resultRgb ? (
                <Swatch hex={rgbToHex(resultRgb)} className="h-10 w-10" />
              ) : (
                <span className="h-10 w-10 border-2 border-dashed border-[#888]" />
              )}
              <span className="font-mono text-[9px] text-[#888] uppercase">Result</span>
            </div>
            <div className="ml-auto text-right font-mono text-[10px] leading-snug text-[#1a1a1a]">
              <div>{draft.sampledColor?.toUpperCase() ?? "—"}</div>
              <div className="font-bold">{resultRgb ? rgbToHex(resultRgb).toUpperCase() : "—"}</div>
              {sampledRgb && resultRgb ? (
                <div className="text-[#888]">
                  Y′ {lumaPercent(sampledRgb).toFixed(0)}→{lumaPercent(resultRgb).toFixed(0)}%
                </div>
              ) : null}
            </div>
          </div>

          <GradeControls review={review} />
          <CompareControls review={review} />
        </div>
      ) : null}

      {draft.shape ? (
        <div className="mt-4">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              isGrade
                ? "Describe the look, e.g. “skin feels too yellow here”"
                : "What should change in this area?"
            }
            aria-label="Note text"
            rows={3}
            className="block w-full resize-none border-2 border-[#1a1a1a] bg-[#f0f0e8] px-3 py-2 text-sm text-[#1a1a1a] outline-none placeholder:text-[#888]"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {error ? <p className="mt-1 text-xs text-[#dc2626]">{error}</p> : null}
          <Button
            variant="primary"
            size="sm"
            className="mt-2 w-full"
            disabled={isSubmitting || !canPost}
            onClick={() => void submit()}
          >
            {isSubmitting ? "Posting..." : isGrade ? "Post color note" : "Post area note"}
          </Button>
          {!canPost ? (
            <p className="mt-1 font-mono text-[10px] text-[#888]">
              {isGrade ? "Adjust the grade or write a note to post." : "Write a note to post."}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
