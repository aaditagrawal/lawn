import { v, type Infer } from "convex/values";

// A color note is attached to a top-level comment: a region drawn on the frame
// at the comment's timestamp, optionally with the local grade the reviewer
// wants inside it. A note whose grade is neutral is a plain "area note".
// Coordinates are normalized to the video frame (0..1) so they survive any
// display size or rendition.

export const MAX_LASSO_POINTS = 256;
export const MAX_FEATHER = 0.25;

export const COLOR_ADJUSTMENT_RANGES = {
  exposure: { min: -4, max: 4 },
  contrast: { min: -100, max: 100 },
  saturation: { min: -100, max: 100 },
  hue: { min: -180, max: 180 },
  temperature: { min: -100, max: 100 },
  tint: { min: -100, max: 100 },
  vibrance: { min: -100, max: 100 },
  highlights: { min: -100, max: 100 },
  shadows: { min: -100, max: 100 },
  whites: { min: -100, max: 100 },
  blacks: { min: -100, max: 100 },
} as const;

export const COLOR_WHEEL_KEYS = ["lift", "gamma", "gain", "offset"] as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const colorNotePointValidator = v.object({
  x: v.number(),
  y: v.number(),
});

// Per-channel wheel offset, each -1..1.
const colorWheelValidator = v.object({ r: v.number(), g: v.number(), b: v.number() });

export const colorAdjustmentsValidator = v.object({
  exposure: v.number(),
  contrast: v.number(),
  saturation: v.number(),
  hue: v.number(),
  temperature: v.number(),
  tint: v.number(),
  // Advanced controls. Optional so older notes stay valid and neutral ones
  // aren't stored.
  vibrance: v.optional(v.number()),
  highlights: v.optional(v.number()),
  shadows: v.optional(v.number()),
  whites: v.optional(v.number()),
  blacks: v.optional(v.number()),
  lift: v.optional(colorWheelValidator),
  gamma: v.optional(colorWheelValidator),
  gain: v.optional(colorWheelValidator),
  offset: v.optional(colorWheelValidator),
});

// HSL key that narrows the region to pixels of a particular color.
export const colorQualifierValidator = v.object({
  hueCenter: v.number(), // degrees, 0..360
  hueWidth: v.number(), // degrees, 0..360 (360 = every hue)
  satLow: v.number(), // 0..1
  satHigh: v.number(),
  lumaLow: v.number(), // 0..1
  lumaHigh: v.number(),
  softness: v.number(), // 0..0.5
});

export const colorNoteValidator = v.object({
  shape: v.object({
    kind: v.union(v.literal("rect"), v.literal("ellipse"), v.literal("lasso")),
    points: v.array(colorNotePointValidator),
  }),
  // Edge softness as a fraction of the frame's shorter side.
  feather: v.number(),
  // When true the adjustment applies everywhere except the region.
  invert: v.boolean(),
  adjustments: colorAdjustmentsValidator,
  qualifier: v.optional(colorQualifierValidator),
  // "Make this color look like that color": per-channel gains derived from a
  // sampled source swatch and a chosen target swatch.
  match: v.optional(v.object({ from: v.string(), to: v.string() })),
  // Average color inside the region when the note was written.
  sampledColor: v.optional(v.string()),
});

export type ColorNote = Infer<typeof colorNoteValidator>;
export type ColorAdjustmentsValue = Infer<typeof colorAdjustmentsValidator>;
export type ColorQualifierValue = Infer<typeof colorQualifierValidator>;

function isFiniteInRange(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function assertValidColorNote(note: ColorNote) {
  const { shape } = note;
  const pointCountValid =
    shape.kind === "lasso"
      ? shape.points.length >= 3 && shape.points.length <= MAX_LASSO_POINTS
      : shape.points.length === 2;
  if (!pointCountValid) {
    throw new Error("Invalid color note region");
  }
  for (const point of shape.points) {
    if (!isFiniteInRange(point.x, 0, 1) || !isFiniteInRange(point.y, 0, 1)) {
      throw new Error("Invalid color note region");
    }
  }

  if (!isFiniteInRange(note.feather, 0, MAX_FEATHER)) {
    throw new Error("Invalid color note feather");
  }

  for (const key of Object.keys(COLOR_ADJUSTMENT_RANGES) as Array<
    keyof typeof COLOR_ADJUSTMENT_RANGES
  >) {
    const value = note.adjustments[key];
    if (value === undefined) continue;
    const range = COLOR_ADJUSTMENT_RANGES[key];
    if (!isFiniteInRange(value, range.min, range.max)) {
      throw new Error(`Invalid color note ${key}`);
    }
  }

  for (const key of COLOR_WHEEL_KEYS) {
    const wheel = note.adjustments[key];
    if (!wheel) continue;
    if (![wheel.r, wheel.g, wheel.b].every((value) => isFiniteInRange(value, -1, 1))) {
      throw new Error(`Invalid color note ${key}`);
    }
  }

  const qualifier = note.qualifier;
  if (qualifier) {
    const valid =
      isFiniteInRange(qualifier.hueCenter, 0, 360) &&
      isFiniteInRange(qualifier.hueWidth, 0, 360) &&
      isFiniteInRange(qualifier.satLow, 0, 1) &&
      isFiniteInRange(qualifier.satHigh, 0, 1) &&
      qualifier.satLow <= qualifier.satHigh &&
      isFiniteInRange(qualifier.lumaLow, 0, 1) &&
      isFiniteInRange(qualifier.lumaHigh, 0, 1) &&
      qualifier.lumaLow <= qualifier.lumaHigh &&
      isFiniteInRange(qualifier.softness, 0, 0.5);
    if (!valid) {
      throw new Error("Invalid color note qualifier");
    }
  }

  if (note.match && (!HEX_COLOR.test(note.match.from) || !HEX_COLOR.test(note.match.to))) {
    throw new Error("Invalid color note match");
  }
  if (note.sampledColor !== undefined && !HEX_COLOR.test(note.sampledColor)) {
    throw new Error("Invalid color note sample");
  }
}
