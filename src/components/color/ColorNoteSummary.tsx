import { ArrowRight, Copy, Eye } from "lucide-react";
import { hexToRgb, rgbToHex } from "@/lib/color/colorMath";
import { describeGrade, gradeRgb } from "@/lib/color/grade";
import { shapeLabel } from "@/lib/color/shape";
import { isAreaNote, type ColorNoteData } from "@/lib/color/useColorReview";
import { cn } from "@/lib/utils";
import { Swatch } from "./Swatch";

export function colorNoteResultHex(note: ColorNoteData) {
  const sampled = note.sampledColor ? hexToRgb(note.sampledColor) : null;
  return sampled ? rgbToHex(gradeRgb(sampled, note.adjustments, note.match)) : null;
}

export function ColorNoteSummary({
  note,
  onView,
  onRemix,
  isViewing = false,
}: {
  note: ColorNoteData;
  onView?: () => void;
  /** Start a new grade from this note's region and settings. */
  onRemix?: () => void;
  isViewing?: boolean;
}) {
  const area = isAreaNote(note);
  const chips = area ? [] : describeGrade(note.adjustments, note.match, note.qualifier);
  const resultHex = area ? null : colorNoteResultHex(note);

  return (
    <div
      className={cn(
        "mt-2 border-2 border-[#1a1a1a] bg-[#f0f0e8]",
        isViewing && (area ? "bg-[#f0b45d]/15" : "border-[#2d5a2d] bg-[#2d5a2d]/10"),
      )}
    >
      <div className="flex items-center gap-2 border-b border-[#1a1a1a]/15 px-2 py-1.5">
        <span
          className={cn(
            "font-mono text-[10px] font-black tracking-wider uppercase",
            area ? "text-[#a86a12]" : "text-[#2d5a2d]",
          )}
        >
          {area ? "Area note" : "Color note"}
        </span>
        <span className="font-mono text-[10px] text-[#888]">
          {shapeLabel(note.shape.kind, note.shape)}
          {note.invert ? " · outside" : ""}
          {!area && note.feather > 0 ? ` · soft ${Math.round(note.feather * 100)}%` : ""}
        </span>
      </div>
      {!area ? (
        <div className="flex items-center gap-2 px-2 py-2">
          {note.sampledColor ? (
            <>
              <Swatch hex={note.sampledColor} className="h-7 w-7" />
              <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-[#1a1a1a]" aria-hidden="true" />
              {resultHex ? <Swatch hex={resultHex} className="h-7 w-7" /> : null}
              <span className="min-w-0 truncate font-mono text-[10px] text-[#1a1a1a]">
                {note.sampledColor.toUpperCase()} → {resultHex?.toUpperCase()}
              </span>
            </>
          ) : (
            <span className="font-mono text-[10px] text-[#888]">No sample</span>
          )}
        </div>
      ) : null}
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className="border border-[#1a1a1a] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#1a1a1a]"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
      {onView || onRemix ? (
        <div className="flex border-t-2 border-[#1a1a1a]">
          {onView ? (
            <button
              type="button"
              onClick={onView}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors",
                isViewing
                  ? "bg-[#2d5a2d] text-[#f0f0e8] hover:bg-[#3a6a3a]"
                  : "text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f0f0e8]",
              )}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {isViewing ? "Viewing on frame" : "View on frame"}
            </button>
          ) : null}
          {onRemix ? (
            <button
              type="button"
              onClick={onRemix}
              className="flex items-center justify-center gap-1.5 border-l-2 border-[#1a1a1a] px-2 py-1.5 font-mono text-[10px] font-bold tracking-wider text-[#1a1a1a] uppercase transition-colors hover:bg-[#1a1a1a] hover:text-[#f0f0e8]"
              title="Start a new note from this region and grade"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Start from this
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
