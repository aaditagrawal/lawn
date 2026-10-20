"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn, formatTimestamp } from "@/lib/utils";
import { formatRgb, lumaPercent, rgbToHex } from "@/lib/color/colorMath";
import {
  PixelAccessError,
  LOUPE_GRID,
  averageRegionColor,
  buildRegionMask,
  getContentRect,
  hasVideoFrame,
  samplePixel,
} from "@/lib/color/frame";
import { gradeUniforms, isNeutralGrade } from "@/lib/color/grade";
import { FrameRenderer, UnsupportedRendererError } from "@/lib/color/glRenderer";
import {
  clampPoint,
  isFullFrame,
  isUsableShape,
  shapeBounds,
  simplifyLasso,
  type FramePoint,
  type RegionShape,
} from "@/lib/color/shape";
import {
  isAreaNote,
  qualifierFromColor,
  type ColorNoteData,
  type ColorReview,
  type CompareMode,
} from "@/lib/color/useColorReview";
import { useFrameTick } from "@/lib/color/useFrameTick";

type ContentRect = { left: number; top: number; width: number; height: number };

export type FrameNote = { id: string; timestampSeconds: number; colorNote: ColorNoteData };

// Mask resolution; the GPU filters it up to display size.
const MASK_MAX_WIDTH = 640;
const RENDER_MAX_WIDTH = 3840;
// Notes within this distance of the paused frame get an outline.
const FRAME_NOTE_WINDOW_SECONDS = 0.25;

function useContentRect(video: HTMLVideoElement | null) {
  const [rect, setRect] = useState<ContentRect | null>(null);
  useLayoutEffect(() => {
    if (!video) return;
    const update = () => {
      const next = getContentRect(video);
      setRect((current) =>
        current &&
        Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.top - next.top) < 0.5 &&
        Math.abs(current.width - next.width) < 0.5 &&
        Math.abs(current.height - next.height) < 0.5
          ? current
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(video);
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("resize", update);
    };
  }, [video]);
  return rect;
}

function usePaused(video: HTMLVideoElement | null) {
  const [paused, setPaused] = useState(true);
  useEffect(() => {
    if (!video) return;
    const update = () => setPaused(video.paused);
    update();
    video.addEventListener("play", update);
    video.addEventListener("pause", update);
    return () => {
      video.removeEventListener("play", update);
      video.removeEventListener("pause", update);
    };
  }, [video]);
  return paused;
}

function shapePath(shape: RegionShape, width: number, height: number) {
  if (shape.kind === "lasso") {
    return (
      shape.points
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${(point.x * width).toFixed(1)},${(point.y * height).toFixed(1)}`,
        )
        .join(" ") + " Z"
    );
  }
  const [a, b] = shape.points;
  const x = Math.min(a.x, b.x) * width;
  const y = Math.min(a.y, b.y) * height;
  const w = Math.abs(a.x - b.x) * width;
  const h = Math.abs(a.y - b.y) * height;
  if (shape.kind === "rect") return `M${x},${y} h${w} v${h} h${-w} Z`;
  const rx = w / 2;
  const ry = h / 2;
  return `M${x},${y + ry} a${rx},${ry} 0 1,0 ${w},0 a${rx},${ry} 0 1,0 ${-w},0 Z`;
}

function RegionOutline({
  shape,
  rect,
  tone = "light",
}: {
  shape: RegionShape;
  rect: ContentRect;
  tone?: "light" | "draft" | "area";
}) {
  const d = shapePath(shape, rect.width, rect.height);
  const stroke = tone === "draft" ? "#7cb87c" : tone === "area" ? "#f0b45d" : "#f0f0e8";
  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke="#1a1a1a" strokeWidth={3} />
      <path
        d={d}
        fill={tone === "draft" ? "rgba(124,184,124,0.12)" : "none"}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray="6 4"
      />
    </svg>
  );
}

/** Outlines of saved notes on this frame; click one to open it. */
function FrameNoteOutlines({
  notes,
  rect,
  onSelect,
}: {
  notes: FrameNote[];
  rect: ContentRect;
  onSelect: (note: FrameNote) => void;
}) {
  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      {notes.map((note, index) => {
        const shape = note.colorNote.shape;
        const d = shapePath(shape, rect.width, rect.height);
        const area = isAreaNote(note.colorNote);
        const color = area ? "#f0b45d" : "#7cb87c";
        const tag = `${area ? "AREA" : "COLOR"} ${index + 1}`;
        const bounds = shapeBounds(shape);
        return (
          <g
            key={note.id}
            className="pointer-events-auto cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label={`Open ${area ? "area" : "color"} note ${index + 1}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(note);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(note);
              }
            }}
          >
            {/* Invisible hit area: the whole region plus a wide band around its edge. */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} pointerEvents="all" />
            <path d={d} fill="none" stroke="#1a1a1a" strokeWidth={2.5} />
            <path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeDasharray="3 3" />
            <g
              transform={`translate(${bounds.x * rect.width}, ${Math.max(16, bounds.y * rect.height)})`}
            >
              <rect x={0} y={-16} width={tag.length * 6 + 10} height={16} fill="#1a1a1a" />
              <text
                x={5}
                y={-4.5}
                fill={color}
                fontSize={9}
                fontWeight={700}
                fontFamily="ui-monospace, monospace"
              >
                {tag}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function Loupe({
  sample,
  position,
  bounds,
}: {
  sample: NonNullable<ColorReview["liveSample"]>;
  position: { x: number; y: number };
  bounds: { width: number; height: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cell = 14;
  const size = LOUPE_GRID * cell;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { grid } = sample;
    for (let y = 0; y < LOUPE_GRID; y += 1) {
      for (let x = 0; x < LOUPE_GRID; x += 1) {
        const offset = (y * LOUPE_GRID + x) * 4;
        ctx.fillStyle =
          grid.data[offset + 3] === 0
            ? "#000"
            : `rgb(${grid.data[offset]},${grid.data[offset + 1]},${grid.data[offset + 2]})`;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    const half = Math.floor(LOUPE_GRID / 2);
    const radius = Math.floor(sample.size / 2);
    const start = (half - radius) * cell;
    const extent = (radius * 2 + 1) * cell;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1a1a1a";
    ctx.strokeRect(start + 1, start + 1, extent - 2, extent - 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#f0f0e8";
    ctx.strokeRect(start + 0.5, start + 0.5, extent - 1, extent - 1);
  }, [sample]);

  const panelWidth = size + 4;
  const panelHeight = size + 64;
  const left =
    position.x + 24 + panelWidth > bounds.width ? position.x - 24 - panelWidth : position.x + 24;
  const top = Math.min(Math.max(position.y - panelHeight / 2, 8), bounds.height - panelHeight - 8);
  const hex = rgbToHex(sample.rgb);

  return (
    <div
      className="pointer-events-none absolute z-30 border-2 border-[#1a1a1a] bg-[#1a1a1a] text-[#f0f0e8]"
      style={{ left, top, width: panelWidth }}
    >
      <canvas ref={canvasRef} width={size} height={size} className="block" />
      <div className="flex items-stretch border-t-2 border-[#1a1a1a]">
        <div className="w-8 flex-shrink-0" style={{ backgroundColor: hex }} />
        <div className="min-w-0 flex-1 px-2 py-1 font-mono text-[10px] leading-tight">
          <div className="font-bold">{hex.toUpperCase()}</div>
          <div>RGB {formatRgb(sample.rgb)}</div>
          <div>
            Y′ {lumaPercent(sample.rgb).toFixed(1)}% · {sample.pixel.x},{sample.pixel.y}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverlayBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-auto absolute top-3 left-3 z-30 flex items-stretch border-2 border-[#1a1a1a] bg-[#1a1a1a] font-mono text-[10px] font-bold tracking-wider text-[#f0f0e8] uppercase"
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

function BarButton({
  active,
  onClick,
  children,
  label,
  danger,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "border-l border-[#f0f0e8]/20 px-2.5 py-1.5 transition-colors",
        active
          ? "bg-[#f0f0e8] text-[#1a1a1a]"
          : danger
            ? "hover:bg-[#dc2626]"
            : "hover:bg-[#2d5a2d]",
      )}
    >
      {children}
    </button>
  );
}

function SplitHandle({
  position,
  rect,
  onChange,
  toFramePoint,
  leftLabel,
  rightLabel,
  name,
}: {
  position: number;
  rect: ContentRect;
  onChange: (value: number) => void;
  toFramePoint: (x: number, y: number) => FramePoint | null;
  leftLabel: string;
  rightLabel: string;
  name: string;
}) {
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const point = toFramePoint(moveEvent.clientX, moveEvent.clientY);
      if (point) onChange(Math.min(Math.max(point.x, 0), 1));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  return (
    <div
      className="pointer-events-auto absolute z-20 w-4 -translate-x-1/2 cursor-ew-resize"
      style={{ left: rect.left + position * rect.width, top: rect.top, height: rect.height }}
      onPointerDown={startDrag}
      onClick={(event) => event.stopPropagation()}
      role="slider"
      aria-label={name}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position * 100)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onChange(Math.max(0, position - 0.02));
        if (event.key === "ArrowRight") onChange(Math.min(1, position + 0.02));
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[#f0f0e8] outline outline-1 outline-[#1a1a1a]" />
      <span className="absolute top-2 right-3 bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[10px] font-bold whitespace-nowrap text-[#f0f0e8] uppercase">
        {leftLabel}
      </span>
      <span className="absolute top-2 left-3 bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[10px] font-bold whitespace-nowrap text-[#7cb87c] uppercase">
        {rightLabel}
      </span>
    </div>
  );
}

const COMPARE_MODES: Array<{ id: CompareMode; label: string }> = [
  { id: "before", label: "Before" },
  { id: "after", label: "After" },
  { id: "split", label: "Split" },
];

export function ColorOverlay({
  review,
  notes = [],
  onSelectNote,
}: {
  review: ColorReview;
  /** Saved notes; those on the paused frame get clickable outlines. */
  notes?: FrameNote[];
  onSelectNote?: (note: FrameNote) => void;
}) {
  const {
    video,
    tool,
    eyedropper,
    activeGrade,
    compare,
    split,
    monitor,
    matte,
    pins,
    liveSample,
    sampleSize,
    compareStill,
    stillMode,
    stillSplit,
    stillOpacity,
    setRendererUnavailable,
    setPixelAccessBlocked,
    setLiveSample,
    setHoldingBefore,
  } = review;
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FrameRenderer | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState<RegionShape | null>(null);
  const [canvasVisible, setCanvasVisible] = useState(false);
  const [maskVersion, setMaskVersion] = useState(0);
  const rect = useContentRect(video);
  const isPaused = usePaused(video);

  const isSampling = tool === "probe" || eyedropper !== null;
  const isDrawing = tool === "rect" || tool === "ellipse" || tool === "lasso";
  const interactive = isSampling || isDrawing;

  const isGradeNote = activeGrade?.kind === "grade";
  const gradeIsNeutral = activeGrade
    ? isNeutralGrade(activeGrade.adjustments, activeGrade.match)
    : true;
  const showGrade = Boolean(isGradeNote && !gradeIsNeutral && compare !== "before");
  const showMatte = isGradeNote ? matte : 0;
  const needsRender = showGrade || showMatte > 0 || monitor !== "normal" || compareStill !== null;
  const needsMask = showGrade || showMatte > 0;
  const tick = useFrameTick(video, needsRender && !isPaused, 60);

  const uniforms = useMemo(
    () => (activeGrade ? gradeUniforms(activeGrade.adjustments, activeGrade.match) : null),
    [activeGrade],
  );

  const ensureRenderer = useCallback(() => {
    if (rendererRef.current) return rendererRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    try {
      rendererRef.current = new FrameRenderer(canvas);
    } catch (error) {
      if (!(error instanceof UnsupportedRendererError)) console.error(error);
      setRendererUnavailable(true);
      return null;
    }
    return rendererRef.current;
  }, [setRendererUnavailable]);

  useEffect(() => {
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // The region mask is rasterized on the CPU only when the region changes.
  const maskShape = activeGrade?.shape;
  const maskFeather = activeGrade?.feather;
  const maskInvert = activeGrade?.invert;
  const videoWidth = video?.videoWidth ?? 0;
  const videoHeight = video?.videoHeight ?? 0;
  useEffect(() => {
    if (!needsMask || !maskShape || videoWidth === 0) return;
    const renderer = ensureRenderer();
    if (!renderer) return;
    if (isFullFrame(maskShape) && !maskInvert) {
      renderer.setMask(null);
    } else {
      const width = Math.min(MASK_MAX_WIDTH, videoWidth);
      const height = Math.max(1, Math.round((width / videoWidth) * videoHeight));
      const { mask } = buildRegionMask(maskShape, width, height, {
        feather: maskFeather ?? 0,
        invert: Boolean(maskInvert),
      });
      renderer.setMask({ data: new Uint8Array(mask.buffer), width, height });
    }
    setMaskVersion((current) => current + 1);
  }, [ensureRenderer, maskFeather, maskInvert, maskShape, needsMask, videoHeight, videoWidth]);

  useEffect(() => {
    if (!compareStill) return;
    ensureRenderer()?.setStill(compareStill.bitmap);
  }, [compareStill, ensureRenderer]);

  // Draw whenever the picture or any setting changes.
  useEffect(() => {
    if (!needsRender || !video || !rect) {
      setCanvasVisible(false);
      return;
    }
    // Mid-seek there's no decoded frame; keep the last render until seeked.
    if (!hasVideoFrame(video)) return;
    const renderer = ensureRenderer();
    if (!renderer) {
      setCanvasVisible(false);
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.min(RENDER_MAX_WIDTH, Math.round(rect.width * dpr)));
    const height = Math.max(1, Math.round((width / rect.width) * rect.height));
    try {
      renderer.render(
        video,
        {
          grade:
            needsMask && uniforms && activeGrade
              ? {
                  uniforms,
                  // 2 = past the right edge: matte only, no grade.
                  gradeFrom: showGrade ? (compare === "split" ? split : 0) : 2,
                  qualifier: activeGrade.qualifier,
                }
              : null,
          matte: showMatte,
          monitor,
          still: compareStill
            ? { mode: stillMode, split: stillSplit, opacity: stillOpacity }
            : null,
        },
        width,
        height,
      );
      setCanvasVisible(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") {
        setPixelAccessBlocked(true);
      } else {
        console.error("Color render failed:", error);
      }
      setCanvasVisible(false);
    }
  }, [
    activeGrade,
    compare,
    compareStill,
    ensureRenderer,
    maskVersion,
    monitor,
    needsMask,
    needsRender,
    rect,
    setPixelAccessBlocked,
    showGrade,
    showMatte,
    split,
    stillMode,
    stillOpacity,
    stillSplit,
    tick,
    uniforms,
    video,
  ]);

  const toFramePoint = useCallback(
    (clientX: number, clientY: number): FramePoint | null => {
      const root = rootRef.current;
      if (!root || !rect || rect.width === 0) return null;
      const bounds = root.getBoundingClientRect();
      return {
        x: (clientX - bounds.left - rect.left) / rect.width,
        y: (clientY - bounds.top - rect.top) / rect.height,
      };
    },
    [rect],
  );

  const sampleAt = useCallback(
    (point: FramePoint) => {
      if (!hasVideoFrame(video)) return null;
      try {
        return samplePixel(video, point, sampleSize);
      } catch (error) {
        if (error instanceof PixelAccessError) setPixelAccessBlocked(true);
        return null;
      }
    },
    [sampleSize, setPixelAccessBlocked, video],
  );

  // Keep the live readout current when the picture changes under a still cursor.
  const liveSamplePoint = liveSample?.point;
  useEffect(() => {
    if (!isSampling || !liveSamplePoint) return;
    const sample = sampleAt(liveSamplePoint);
    if (sample) setLiveSample({ ...sample, point: liveSamplePoint, size: sampleSize });
    // Re-sample only when the frame or sample size changes, not on each move.
  }, [tick, sampleSize]);

  useEffect(() => {
    return () => {
      if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current);
    };
  }, []);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    const point = toFramePoint(event.clientX, event.clientY);
    if (!point) return;

    if (isSampling) {
      if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = requestAnimationFrame(() => {
        pointerFrameRef.current = null;
        if (point.x < 0 || point.y < 0 || point.x > 1 || point.y > 1) {
          setLiveSample(null);
          return;
        }
        const sample = sampleAt(point);
        if (sample) setLiveSample({ ...sample, point, size: sampleSize });
      });
      return;
    }

    if (drawing) {
      const clamped = clampPoint(point);
      setDrawing((current) => {
        if (!current) return current;
        if (current.kind === "lasso") {
          const last = current.points[current.points.length - 1];
          if (last && Math.hypot(last.x - clamped.x, last.y - clamped.y) < 0.002) return current;
          return { ...current, points: [...current.points, clamped] };
        }
        return { ...current, points: [current.points[0], clamped] };
      });
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const point = toFramePoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();

    if (isSampling) {
      if (point.x < 0 || point.y < 0 || point.x > 1 || point.y > 1) return;
      const sample = sampleAt(point);
      if (!sample || !video) return;
      const hex = rgbToHex(sample.rgb);
      if (eyedropper === "qualifier") {
        review.updateQualifier(qualifierFromColor(sample.rgb));
        review.setMatte(1);
        review.startEyedropper(null);
      } else if (eyedropper) {
        const currentMatch = review.draft.match;
        const from =
          eyedropper === "match-from"
            ? hex
            : (currentMatch?.from ?? review.draft.sampledColor ?? hex);
        const to = eyedropper === "match-to" ? hex : (currentMatch?.to ?? from);
        review.updateDraft({ match: { from, to } });
        review.startEyedropper(null);
      } else {
        review.addPin({
          point,
          pixel: sample.pixel,
          rgb: sample.rgb,
          size: sampleSize,
          timestampSeconds: video.currentTime,
        });
      }
      return;
    }

    if (isDrawing && tool) {
      event.currentTarget.setPointerCapture(event.pointerId);
      const start = clampPoint(point);
      setDrawing({ kind: tool, points: tool === "lasso" ? [start] : [start, start] });
    }
  };

  const finishDrawing = () => {
    if (!drawing || !video) {
      setDrawing(null);
      return;
    }
    const shape: RegionShape =
      drawing.kind === "lasso" ? { kind: "lasso", points: simplifyLasso(drawing.points) } : drawing;
    setDrawing(null);
    if (!isUsableShape(shape)) return;
    let sampled = null;
    try {
      sampled = hasVideoFrame(video) ? averageRegionColor(video, shape) : null;
    } catch (error) {
      if (error instanceof PixelAccessError) setPixelAccessBlocked(true);
    }
    review.setDraftShape(shape, video.currentTime, sampled);
    review.setTool(null);
  };

  // Hold backslash to flip to the ungraded picture.
  useEffect(() => {
    if (!isGradeNote) return;
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(target.closest("input, textarea, [contenteditable='true']"));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "\\" && !isTyping(event.target)) {
        event.preventDefault();
        setHoldingBefore(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "\\") setHoldingBefore(false);
    };
    const handleBlur = () => setHoldingBefore(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      setHoldingBefore(false);
    };
  }, [isGradeNote, setHoldingBefore]);

  // `tick` changes with every new paused frame, which keeps this current.
  const currentTime = video?.currentTime ?? 0;
  const framePins = pins.filter((pin) => Math.abs(pin.timestampSeconds - currentTime) < 0.02);
  const viewedId = review.viewed?.commentId;
  const frameNotes =
    isPaused && !interactive && !drawing
      ? notes.filter(
          (note) =>
            note.id !== viewedId &&
            Math.abs(note.timestampSeconds - currentTime) < FRAME_NOTE_WINDOW_SECONDS,
        )
      : [];
  const rootBounds = rootRef.current?.getBoundingClientRect();
  // Region outlines don't line up with the side-by-side layout.
  const sideBySide = compareStill !== null && stillMode === "side";
  const showRegion = Boolean(activeGrade && !drawing && !sideBySide);

  if (!video || !rect) return null;

  return (
    <div
      ref={rootRef}
      className={cn(
        "absolute inset-0 z-[15]",
        interactive ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
      )}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerUp={isDrawing ? finishDrawing : undefined}
      onPointerCancel={isDrawing ? () => setDrawing(null) : undefined}
      onPointerLeave={() => {
        setPointer(null);
        if (isSampling) setLiveSample(null);
      }}
      onClick={(event) => {
        if (interactive) event.stopPropagation();
      }}
    >
      <canvas
        ref={canvasRef}
        data-color-render
        className={cn("pointer-events-none absolute", canvasVisible ? "visible" : "invisible")}
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        aria-hidden="true"
      />

      {frameNotes.length > 0 && onSelectNote ? (
        <FrameNoteOutlines notes={frameNotes} rect={rect} onSelect={onSelectNote} />
      ) : null}

      {showRegion && activeGrade && !isFullFrame(activeGrade.shape) ? (
        <RegionOutline
          shape={activeGrade.shape}
          rect={rect}
          tone={
            activeGrade.kind === "area"
              ? "area"
              : activeGrade.source === "draft"
                ? "draft"
                : "light"
          }
        />
      ) : null}
      {drawing && drawing.points.length > 1 ? (
        <RegionOutline shape={drawing} rect={rect} tone="draft" />
      ) : null}

      {framePins.map((pin) => (
        <div
          key={pin.id}
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: rect.left + pin.point.x * rect.width,
            top: rect.top + pin.point.y * rect.height,
          }}
        >
          <div className="h-3 w-3 border-2 border-[#1a1a1a] bg-[#f0f0e8]" />
          <span className="absolute top-3 left-3 bg-[#1a1a1a] px-1 font-mono text-[10px] font-bold text-[#f0f0e8]">
            {pin.id}
          </span>
        </div>
      ))}

      {isGradeNote && compare === "split" && !compareStill ? (
        <SplitHandle
          position={split}
          rect={rect}
          onChange={review.setSplit}
          toFramePoint={toFramePoint}
          leftLabel="Before"
          rightLabel="After"
          name="Before and after split position"
        />
      ) : null}

      {compareStill && stillMode === "wipe" ? (
        <SplitHandle
          position={stillSplit}
          rect={rect}
          onChange={review.setStillSplit}
          toFramePoint={toFramePoint}
          leftLabel={`Still · ${compareStill.label}`}
          rightLabel="Live"
          name="Still comparison wipe position"
        />
      ) : null}
      {sideBySide && compareStill ? (
        <>
          <span
            className="pointer-events-none absolute z-20 bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#f0f0e8] uppercase"
            style={{ left: rect.left + 8, top: rect.top + rect.height * 0.25 + 8 }}
          >
            Still · {compareStill.label}
          </span>
          <span
            className="pointer-events-none absolute z-20 bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#7cb87c] uppercase"
            style={{
              left: rect.left + rect.width / 2 + 8,
              top: rect.top + rect.height * 0.25 + 8,
            }}
          >
            Live · {formatTimestamp(currentTime)}
          </span>
        </>
      ) : null}

      {interactive ? (
        <div className="pointer-events-none absolute top-3 left-3 z-30 bg-[#1a1a1a] px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-[#f0f0e8] uppercase">
          {eyedropper === "match-to"
            ? "Click the color it should become"
            : eyedropper === "match-from"
              ? "Click the color to change"
              : eyedropper === "qualifier"
                ? "Click the color to select"
                : tool === "probe"
                  ? "Click to pin a sample · Esc to exit"
                  : tool === "lasso"
                    ? "Drag to draw a freehand region"
                    : `Drag to draw a ${tool === "rect" ? "rectangle" : "ellipse"}`}
        </div>
      ) : activeGrade ? (
        <OverlayBar>
          <span
            className={cn(
              "flex items-center px-2",
              activeGrade.kind === "area" ? "text-[#f0b45d]" : "text-[#7cb87c]",
            )}
          >
            {activeGrade.kind === "area"
              ? "Area"
              : activeGrade.source === "draft"
                ? "Draft"
                : "Note"}{" "}
            · {formatTimestamp(activeGrade.timestampSeconds)}
          </span>
          {isGradeNote
            ? COMPARE_MODES.map((mode) => (
                <BarButton
                  key={mode.id}
                  active={compare === mode.id}
                  onClick={() => review.setCompare(mode.id)}
                >
                  {mode.label}
                </BarButton>
              ))
            : null}
          {activeGrade.source === "note" ? (
            <BarButton onClick={() => review.viewNote(null)} label="Close note preview" danger>
              <X className="h-3.5 w-3.5" />
            </BarButton>
          ) : null}
        </OverlayBar>
      ) : compareStill ? (
        <OverlayBar>
          <span className="flex items-center px-2 text-[#7cb87c]">Comparing still</span>
          <BarButton onClick={() => review.setCompareStillId(null)} label="Stop comparing" danger>
            <X className="h-3.5 w-3.5" />
          </BarButton>
        </OverlayBar>
      ) : null}

      {isSampling && liveSample && pointer && rootBounds ? (
        <Loupe
          sample={liveSample}
          position={pointer}
          bounds={{ width: rootBounds.width, height: rootBounds.height }}
        />
      ) : null}
    </div>
  );
}
