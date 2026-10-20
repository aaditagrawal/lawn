import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColorNote } from "@convex/colorNotes";
import type { RGB } from "./colorMath";
import { rgbToHex, rgbToHsl, lumaPercent } from "./colorMath";
import {
  DEFAULT_QUALIFIER,
  NEUTRAL_ADJUSTMENTS,
  compactAdjustments,
  expandAdjustments,
  isActiveQualifier,
  isNeutralGrade,
  type ColorAdjustments,
  type ColorMatch,
  type ColorQualifier,
  type ScalarAdjustmentKey,
  type WheelKey,
  type WheelValue,
} from "./grade";
import type { FramePoint, RegionShape } from "./shape";

export type ColorTool = "probe" | "rect" | "ellipse" | "lasso";
export type CompareMode = "after" | "before" | "split";
export type MonitorMode = "normal" | "false-color" | "luma" | "red" | "green" | "blue";
export type StillCompareMode = "wipe" | "side" | "difference" | "onion";
export type ColorUiMode = "beginner" | "advanced";
/** 0 off, 1 highlight the selection, 2 black/white matte. */
export type MatteMode = 0 | 1 | 2;
/** What the eyedropper writes into. */
export type EyedropperTarget = "match-from" | "match-to" | "qualifier";
export type NoteKind = "area" | "grade";

export type ColorNoteData = ColorNote;

export type ColorDraft = {
  kind: NoteKind;
  shape: RegionShape | null;
  timestampSeconds: number;
  feather: number;
  invert: boolean;
  adjustments: Required<ColorAdjustments>;
  match: ColorMatch | null;
  qualifier: ColorQualifier | null;
  sampledColor: string | null;
};

export type LiveSample = {
  point: FramePoint;
  pixel: { x: number; y: number };
  rgb: RGB;
  grid: ImageData;
  size: number;
};

export type PinnedSample = {
  id: number;
  point: FramePoint;
  pixel: { x: number; y: number };
  timestampSeconds: number;
  rgb: RGB;
  size: number;
};

export type Still = {
  id: number;
  bitmap: ImageBitmap;
  thumbnail: string;
  label: string;
  timestampSeconds: number;
};

export type ViewedColorNote = {
  commentId: string;
  timestampSeconds: number;
  note: ColorNoteData;
};

/** Whatever region/grade is currently shown on the frame. */
export type ActiveGrade = {
  source: "draft" | "note";
  kind: NoteKind;
  shape: RegionShape;
  feather: number;
  invert: boolean;
  adjustments: ColorAdjustments;
  match: ColorMatch | null;
  qualifier: ColorQualifier | null;
  timestampSeconds: number;
};

export const DEFAULT_FEATHER = 0.03;
export const SAMPLE_SIZES = [1, 3, 9] as const;
const MAX_STILLS = 12;
const STILL_MAX_WIDTH = 1920;
const UI_MODE_STORAGE_KEY = "lawn.colorUiMode";

function emptyDraft(kind: NoteKind = "grade"): ColorDraft {
  return {
    kind,
    shape: null,
    timestampSeconds: 0,
    feather: DEFAULT_FEATHER,
    invert: false,
    adjustments: { ...NEUTRAL_ADJUSTMENTS },
    match: null,
    qualifier: null,
    sampledColor: null,
  };
}

/** A grade-free note is an "area note". */
export function isAreaNote(note: Pick<ColorNoteData, "adjustments" | "match">) {
  return isNeutralGrade(note.adjustments, note.match);
}

export function draftToColorNote(draft: ColorDraft): ColorNoteData | null {
  if (!draft.shape) return null;
  const base = {
    shape: draft.shape,
    feather: draft.feather,
    invert: draft.invert,
    sampledColor: draft.sampledColor ?? undefined,
  };
  if (draft.kind === "area") {
    return { ...base, adjustments: compactAdjustments(NEUTRAL_ADJUSTMENTS) };
  }
  return {
    ...base,
    adjustments: compactAdjustments(draft.adjustments),
    match: draft.match ?? undefined,
    qualifier: isActiveQualifier(draft.qualifier) ? (draft.qualifier ?? undefined) : undefined,
  };
}

/** A qualifier centred on a picked color with sensible default ranges. */
export function qualifierFromColor(rgb: RGB): ColorQualifier {
  const hsl = rgbToHsl(rgb);
  const saturation = hsl.s / 100;
  const luma = lumaPercent(rgb) / 100;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    hueCenter: Math.round(hsl.h) % 360,
    hueWidth: saturation < 0.08 ? 360 : 40,
    satLow: round(Math.max(0, saturation - 0.35)),
    satHigh: 1,
    lumaLow: round(Math.max(0, luma - 0.4)),
    lumaHigh: round(Math.min(1, luma + 0.4)),
    softness: 0.1,
  };
}

function readStoredUiMode(): ColorUiMode {
  if (typeof window === "undefined") return "beginner";
  try {
    return window.localStorage.getItem(UI_MODE_STORAGE_KEY) === "advanced"
      ? "advanced"
      : "beginner";
  } catch {
    return "beginner";
  }
}

export function useColorReview() {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [tool, setToolState] = useState<ColorTool | null>(null);
  const [eyedropper, setEyedropper] = useState<EyedropperTarget | null>(null);
  const [sampleSize, setSampleSize] = useState<number>(1);
  const [liveSample, setLiveSample] = useState<LiveSample | null>(null);
  const [pins, setPins] = useState<PinnedSample[]>([]);
  const [draft, setDraft] = useState<ColorDraft>(() => emptyDraft());
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewed, setViewed] = useState<ViewedColorNote | null>(null);
  const [compare, setCompare] = useState<CompareMode>("after");
  const [split, setSplit] = useState(0.5);
  const [holdingBefore, setHoldingBefore] = useState(false);
  const [monitor, setMonitor] = useState<MonitorMode>("normal");
  const [matte, setMatte] = useState<MatteMode>(0);
  const [pixelAccessBlocked, setPixelAccessBlocked] = useState(false);
  const [rendererUnavailable, setRendererUnavailable] = useState(false);
  const [uiMode, setUiModeState] = useState<ColorUiMode>(readStoredUiMode);
  const [stills, setStills] = useState<Still[]>([]);
  const [compareStillId, setCompareStillId] = useState<number | null>(null);
  const [stillMode, setStillMode] = useState<StillCompareMode>("wipe");
  const [stillSplit, setStillSplit] = useState(0.5);
  const [stillOpacity, setStillOpacity] = useState(0.5);
  const stillIdRef = useRef(0);

  const setUiMode = useCallback((mode: ColorUiMode) => {
    setUiModeState(mode);
    try {
      window.localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
    } catch {
      // Private mode / storage disabled: keep the in-memory choice.
    }
  }, []);

  const setTool = useCallback((next: ColorTool | null) => {
    setToolState(next);
    setEyedropper(null);
    if (next !== "probe") setLiveSample(null);
    if (next && next !== "probe") setViewed(null);
  }, []);

  const startEyedropper = useCallback((target: EyedropperTarget | null) => {
    setEyedropper(target);
    setToolState(null);
    setLiveSample(null);
  }, []);

  const addPin = useCallback((sample: Omit<PinnedSample, "id">) => {
    setPins((current) => [
      ...current,
      { ...sample, id: (current[current.length - 1]?.id ?? 0) + 1 },
    ]);
  }, []);

  const removePin = useCallback((id: number) => {
    setPins((current) => current.filter((pin) => pin.id !== id));
  }, []);

  const clearPins = useCallback(() => setPins([]), []);

  const beginDraft = useCallback((kind: NoteKind = "grade") => {
    setViewed(null);
    setComposerOpen(true);
    setCompare("after");
    setDraft((current) => (current.shape ? { ...current, kind } : emptyDraft(kind)));
  }, []);

  const setDraftShape = useCallback(
    (shape: RegionShape, timestampSeconds: number, sampled: RGB | null) => {
      const sampledColor = sampled ? rgbToHex(sampled) : null;
      setViewed(null);
      setComposerOpen(true);
      setDraft((current) => ({
        ...current,
        shape,
        timestampSeconds,
        sampledColor,
        // Keep the match target if one was set; re-anchor its source on the
        // freshly sampled region.
        match:
          current.match && sampledColor
            ? { from: sampledColor, to: current.match.to }
            : current.match,
      }));
    },
    [],
  );

  // Editing the draft brings it back on screen if a saved note was being viewed.
  const updateDraft = useCallback((patch: Partial<ColorDraft>) => {
    setViewed(null);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const updateAdjustment = useCallback((key: ScalarAdjustmentKey, value: number) => {
    setViewed(null);
    setDraft((current) => ({
      ...current,
      adjustments: { ...current.adjustments, [key]: value },
    }));
  }, []);

  const updateWheel = useCallback((key: WheelKey, value: WheelValue) => {
    setViewed(null);
    setDraft((current) => ({
      ...current,
      adjustments: { ...current.adjustments, [key]: value },
    }));
  }, []);

  const updateQualifier = useCallback((patch: Partial<ColorQualifier> | null) => {
    setViewed(null);
    setDraft((current) => ({
      ...current,
      qualifier: patch === null ? null : { ...(current.qualifier ?? DEFAULT_QUALIFIER), ...patch },
    }));
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(emptyDraft());
    setComposerOpen(false);
    setToolState(null);
    setEyedropper(null);
    setCompare("after");
    setMatte(0);
  }, []);

  /** Start a new draft from a saved note's region and settings. */
  const draftFromNote = useCallback((note: ColorNoteData, timestampSeconds: number) => {
    setViewed(null);
    setComposerOpen(true);
    setCompare("after");
    setDraft({
      kind: isAreaNote(note) ? "area" : "grade",
      shape: note.shape,
      timestampSeconds,
      feather: note.feather,
      invert: note.invert,
      adjustments: expandAdjustments(note.adjustments),
      match: note.match ?? null,
      qualifier: note.qualifier ?? null,
      sampledColor: note.sampledColor ?? null,
    });
  }, []);

  const viewNote = useCallback((next: ViewedColorNote | null) => {
    setViewed(next);
    setCompare("after");
    if (next) {
      setToolState(null);
      setEyedropper(null);
    }
  }, []);

  /** Open a saved note on its frame, or close it if it's already open. */
  const toggleViewedNote = useCallback(
    (
      comment: { _id: string; timestampSeconds: number; colorNote?: ColorNoteData },
      player: { pause: () => void; seekTo: (time: number) => void } | null,
    ) => {
      if (!comment.colorNote) return;
      if (viewed?.commentId === comment._id) {
        viewNote(null);
        return;
      }
      player?.pause();
      player?.seekTo(comment.timestampSeconds);
      viewNote({
        commentId: comment._id,
        timestampSeconds: comment.timestampSeconds,
        note: comment.colorNote,
      });
    },
    [viewNote, viewed?.commentId],
  );

  // ── Stills ─────────────────────────────────────────────────────────

  const grabStill = useCallback(
    async (label: string) => {
      if (!video || video.videoWidth === 0) return null;
      const scale = Math.min(1, STILL_MAX_WIDTH / video.videoWidth);
      try {
        const bitmap = await createImageBitmap(video, {
          resizeWidth: Math.round(video.videoWidth * scale),
          resizeHeight: Math.round(video.videoHeight * scale),
          resizeQuality: "high",
        });
        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = 160;
        thumbCanvas.height = Math.max(1, Math.round((160 / bitmap.width) * bitmap.height));
        thumbCanvas
          .getContext("2d")
          ?.drawImage(bitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
        // Throws on a tainted (non-CORS) source, which also rules out the GPU path.
        const thumbnail = thumbCanvas.toDataURL("image/jpeg", 0.7);
        stillIdRef.current += 1;
        const still: Still = {
          id: stillIdRef.current,
          bitmap,
          thumbnail,
          label,
          timestampSeconds: video.currentTime,
        };
        setStills((current) => {
          const next = [...current, still];
          while (next.length > MAX_STILLS) next.shift()?.bitmap.close();
          return next;
        });
        return still;
      } catch (error) {
        if (error instanceof DOMException && error.name === "SecurityError") {
          setPixelAccessBlocked(true);
        } else {
          console.error("Failed to grab still:", error);
        }
        return null;
      }
    },
    [video],
  );

  const removeStill = useCallback((id: number) => {
    setStills((current) => {
      current.find((still) => still.id === id)?.bitmap.close();
      return current.filter((still) => still.id !== id);
    });
    setCompareStillId((current) => (current === id ? null : current));
  }, []);

  const compareStill = useMemo(
    () => stills.find((still) => still.id === compareStillId) ?? null,
    [compareStillId, stills],
  );

  // A note the user explicitly opened wins over an in-progress draft.
  const activeGrade = useMemo<ActiveGrade | null>(() => {
    if (viewed) {
      return {
        source: "note",
        kind: isAreaNote(viewed.note) ? "area" : "grade",
        shape: viewed.note.shape,
        feather: viewed.note.feather,
        invert: viewed.note.invert,
        adjustments: viewed.note.adjustments,
        match: viewed.note.match ?? null,
        qualifier: viewed.note.qualifier ?? null,
        timestampSeconds: viewed.timestampSeconds,
      };
    }
    if (composerOpen && draft.shape) {
      const isGrade = draft.kind === "grade";
      return {
        source: "draft",
        kind: draft.kind,
        shape: draft.shape,
        feather: draft.feather,
        invert: draft.invert,
        adjustments: isGrade ? draft.adjustments : NEUTRAL_ADJUSTMENTS,
        match: isGrade ? draft.match : null,
        qualifier: isGrade && isActiveQualifier(draft.qualifier) ? draft.qualifier : null,
        timestampSeconds: draft.timestampSeconds,
      };
    }
    return null;
  }, [composerOpen, draft, viewed]);

  const effectiveCompare: CompareMode = holdingBefore ? "before" : compare;

  // Escape backs out of the innermost color interaction.
  useEffect(() => {
    if (!tool && !eyedropper && !viewed && compareStillId === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (eyedropper) setEyedropper(null);
      else if (tool) setTool(null);
      else if (viewed) setViewed(null);
      else setCompareStillId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [compareStillId, eyedropper, setTool, tool, viewed]);

  // Release still bitmaps when the page goes away.
  const stillsRef = useRef(stills);
  useEffect(() => {
    stillsRef.current = stills;
  }, [stills]);
  useEffect(() => () => stillsRef.current.forEach((still) => still.bitmap.close()), []);

  return {
    video,
    setVideo,
    tool,
    setTool,
    eyedropper,
    startEyedropper,
    sampleSize,
    setSampleSize,
    liveSample,
    setLiveSample,
    pins,
    addPin,
    removePin,
    clearPins,
    draft,
    composerOpen,
    beginDraft,
    setDraftShape,
    updateDraft,
    updateAdjustment,
    updateWheel,
    updateQualifier,
    resetDraft,
    draftFromNote,
    viewed,
    viewNote,
    toggleViewedNote,
    activeGrade,
    compare: effectiveCompare,
    setCompare,
    split,
    setSplit,
    holdingBefore,
    setHoldingBefore,
    monitor,
    setMonitor,
    matte,
    setMatte,
    pixelAccessBlocked,
    setPixelAccessBlocked,
    rendererUnavailable,
    setRendererUnavailable,
    uiMode,
    setUiMode,
    stills,
    grabStill,
    removeStill,
    compareStill,
    setCompareStillId,
    stillMode,
    setStillMode,
    stillSplit,
    setStillSplit,
    stillOpacity,
    setStillOpacity,
  };
}

export type ColorReview = ReturnType<typeof useColorReview>;
