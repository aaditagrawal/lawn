import type { ColorAdjustmentsValue, ColorNote, ColorQualifierValue } from "@convex/colorNotes";
import {
  LUMA_B,
  LUMA_G,
  LUMA_R,
  clamp,
  hexToRgb,
  linearToSrgb,
  srgbToLinear,
  type RGB,
} from "./colorMath";

// The grade pipeline, shared by the WebGL preview (glRenderer.ts) and the JS
// mirror below (swatches, tests). `gradeUniforms` turns the note's controls
// into the numbers both implementations consume, so they can't drift apart.
//
//   linear:  gains (exposure · match · white balance) → sat/hue matrix → vibrance
//   encoded: tone (shadows/highlights/whites/blacks) → lift/gain/offset/gamma → contrast

export type ColorAdjustments = ColorAdjustmentsValue;
export type ColorQualifier = ColorQualifierValue;
export type ColorMatch = NonNullable<ColorNote["match"]>;
export type WheelKey = "lift" | "gamma" | "gain" | "offset";
export type WheelValue = { r: number; g: number; b: number };
export type ScalarAdjustmentKey = Exclude<keyof ColorAdjustments, WheelKey>;

export const NEUTRAL_WHEEL: WheelValue = { r: 0, g: 0, b: 0 };

/** Every control present, all neutral. Drafts always carry the full set. */
export const NEUTRAL_ADJUSTMENTS: Required<ColorAdjustments> = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  lift: NEUTRAL_WHEEL,
  gamma: NEUTRAL_WHEEL,
  gain: NEUTRAL_WHEEL,
  offset: NEUTRAL_WHEEL,
};

export const DEFAULT_QUALIFIER: ColorQualifier = {
  hueCenter: 0,
  hueWidth: 360,
  satLow: 0,
  satHigh: 1,
  lumaLow: 0,
  lumaHigh: 1,
  softness: 0.1,
};

export type SliderControl = {
  key: ScalarAdjustmentKey;
  label: string;
  /** Plain-language name used in beginner mode. */
  friendly: string;
  hint: string;
  min: number;
  max: number;
  step: number;
};

export const SLIDER_CONTROLS: Record<ScalarAdjustmentKey, SliderControl> = {
  exposure: {
    key: "exposure",
    label: "Exposure",
    friendly: "Brightness",
    hint: "Overall brightness, in stops",
    min: -4,
    max: 4,
    step: 0.05,
  },
  contrast: {
    key: "contrast",
    label: "Contrast",
    friendly: "Contrast",
    hint: "Separation between darks and brights",
    min: -100,
    max: 100,
    step: 1,
  },
  saturation: {
    key: "saturation",
    label: "Saturation",
    friendly: "Color intensity",
    hint: "How vivid every color is",
    min: -100,
    max: 100,
    step: 1,
  },
  vibrance: {
    key: "vibrance",
    label: "Vibrance",
    friendly: "Vibrance",
    hint: "Boosts muted colors more than already-vivid ones",
    min: -100,
    max: 100,
    step: 1,
  },
  hue: {
    key: "hue",
    label: "Hue",
    friendly: "Hue shift",
    hint: "Rotates every color around the wheel",
    min: -180,
    max: 180,
    step: 1,
  },
  temperature: {
    key: "temperature",
    label: "Temperature",
    friendly: "Warmth",
    hint: "Cooler (blue) to warmer (orange)",
    min: -100,
    max: 100,
    step: 1,
  },
  tint: {
    key: "tint",
    label: "Tint",
    friendly: "Tint",
    hint: "Greener to more magenta",
    min: -100,
    max: 100,
    step: 1,
  },
  highlights: {
    key: "highlights",
    label: "Highlights",
    friendly: "Highlights",
    hint: "Brightness of the bright areas",
    min: -100,
    max: 100,
    step: 1,
  },
  shadows: {
    key: "shadows",
    label: "Shadows",
    friendly: "Shadows",
    hint: "Brightness of the dark areas",
    min: -100,
    max: 100,
    step: 1,
  },
  whites: {
    key: "whites",
    label: "Whites",
    friendly: "Whites",
    hint: "Where the brightest tones sit",
    min: -100,
    max: 100,
    step: 1,
  },
  blacks: {
    key: "blacks",
    label: "Blacks",
    friendly: "Blacks",
    hint: "Where the deepest tones sit",
    min: -100,
    max: 100,
    step: 1,
  },
};

export const BEGINNER_SLIDERS: ScalarAdjustmentKey[] = [
  "exposure",
  "contrast",
  "saturation",
  "temperature",
  "tint",
  "highlights",
  "shadows",
];

/** One-tap nudges for beginners; each tap adds to the current value. */
export const QUICK_ADJUSTMENTS: Array<{
  label: string;
  key: ScalarAdjustmentKey;
  delta: number;
}> = [
  { label: "Brighter", key: "exposure", delta: 0.33 },
  { label: "Darker", key: "exposure", delta: -0.33 },
  { label: "Warmer", key: "temperature", delta: 15 },
  { label: "Cooler", key: "temperature", delta: -15 },
  { label: "More color", key: "saturation", delta: 15 },
  { label: "Less color", key: "saturation", delta: -15 },
  { label: "More punch", key: "contrast", delta: 12 },
  { label: "Softer", key: "contrast", delta: -12 },
  { label: "Less green", key: "tint", delta: 10 },
  { label: "Less magenta", key: "tint", delta: -10 },
  { label: "Open shadows", key: "shadows", delta: 20 },
  { label: "Tame highlights", key: "highlights", delta: -20 },
];

export const WHEEL_CONTROLS: Array<{ key: WheelKey; label: string; hint: string }> = [
  { key: "lift", label: "Lift", hint: "Shadows" },
  { key: "gamma", label: "Gamma", hint: "Midtones" },
  { key: "gain", label: "Gain", hint: "Highlights" },
  { key: "offset", label: "Offset", hint: "Everything" },
];

// sRGB code value of 18% grey; contrast pivots here so midtones hold.
export const CONTRAST_PIVOT = 0.4613;
const MATCH_GAIN_MIN = 0.25;
const MATCH_GAIN_MAX = 4;

function wheelOf(adjustments: ColorAdjustments, key: WheelKey): WheelValue {
  return adjustments[key] ?? NEUTRAL_WHEEL;
}

function isNeutralWheel(wheel: WheelValue | undefined) {
  return !wheel || (wheel.r === 0 && wheel.g === 0 && wheel.b === 0);
}

export function isNeutralAdjustments(adjustments: ColorAdjustments) {
  return (
    (Object.keys(SLIDER_CONTROLS) as ScalarAdjustmentKey[]).every(
      (key) => (adjustments[key] ?? 0) === 0,
    ) && WHEEL_CONTROLS.every(({ key }) => isNeutralWheel(adjustments[key]))
  );
}

export function isNeutralGrade(adjustments: ColorAdjustments, match?: ColorMatch | null) {
  return (
    isNeutralAdjustments(adjustments) &&
    (!match || match.from.toLowerCase() === match.to.toLowerCase())
  );
}

/** Drop neutral optional controls so stored notes stay small. */
export function compactAdjustments(adjustments: ColorAdjustments): ColorAdjustments {
  const compact: ColorAdjustments = {
    exposure: adjustments.exposure,
    contrast: adjustments.contrast,
    saturation: adjustments.saturation,
    hue: adjustments.hue,
    temperature: adjustments.temperature,
    tint: adjustments.tint,
  };
  for (const key of ["vibrance", "highlights", "shadows", "whites", "blacks"] as const) {
    if (adjustments[key]) compact[key] = adjustments[key];
  }
  for (const { key } of WHEEL_CONTROLS) {
    if (!isNeutralWheel(adjustments[key])) compact[key] = adjustments[key];
  }
  return compact;
}

/** Fill in any controls an older/compact note omitted. */
export function expandAdjustments(adjustments: ColorAdjustments): Required<ColorAdjustments> {
  return { ...NEUTRAL_ADJUSTMENTS, ...adjustments } as Required<ColorAdjustments>;
}

export function isActiveQualifier(qualifier: ColorQualifier | null | undefined) {
  if (!qualifier) return false;
  return (
    qualifier.hueWidth < 360 ||
    qualifier.satLow > 0 ||
    qualifier.satHigh < 1 ||
    qualifier.lumaLow > 0 ||
    qualifier.lumaHigh < 1
  );
}

// ── Wheels ─────────────────────────────────────────────────────────────
// A wheel is edited as a puck (x, y in the unit disc, Cb/Cr axes) plus a
// master level. Chroma is stored as zero-luma RGB offsets.

const WHEEL_CHROMA_SCALE = 0.5;

export function wheelFromPuck(x: number, y: number, master: number): WheelValue {
  const cb = x * WHEEL_CHROMA_SCALE;
  const cr = y * WHEEL_CHROMA_SCALE;
  const r = cr * 1.5748;
  const b = cb * 1.8556;
  const g = -(LUMA_R * r + LUMA_B * b) / LUMA_G;
  const round = (value: number) => Math.round(clamp(value + master, -1, 1) * 1000) / 1000;
  return { r: round(r), g: round(g), b: round(b) };
}

export function puckFromWheel(wheel: WheelValue) {
  const master = LUMA_R * wheel.r + LUMA_G * wheel.g + LUMA_B * wheel.b;
  const x = (wheel.b - master) / 1.8556 / WHEEL_CHROMA_SCALE;
  const y = (wheel.r - master) / 1.5748 / WHEEL_CHROMA_SCALE;
  return { x, y, master };
}

// ── Uniforms ───────────────────────────────────────────────────────────

/** Per-channel linear gains that take `from` to `to`. */
export function matchGains(match: ColorMatch | null | undefined): [number, number, number] {
  const from = match ? hexToRgb(match.from) : null;
  const to = match ? hexToRgb(match.to) : null;
  if (!from || !to) return [1, 1, 1];
  const gain = (source: number, target: number) => {
    const sourceLinear = srgbToLinear(source / 255);
    const targetLinear = srgbToLinear(target / 255);
    if (sourceLinear < 1e-4) return 1;
    return clamp(targetLinear / sourceLinear, MATCH_GAIN_MIN, MATCH_GAIN_MAX);
  };
  return [gain(from.r, to.r), gain(from.g, to.g), gain(from.b, to.b)];
}

function multiply3(a: number[], b: number[]) {
  const out = new Array<number>(9);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] =
        a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out;
}

export type GradeUniforms = {
  gains: [number, number, number];
  /** Row-major 3x3, applied to linear RGB after gains. */
  matrix: number[];
  vibrance: number;
  /** Additive offsets weighted by shadows, highlights, whites, blacks. */
  tone: [number, number, number, number];
  lift: [number, number, number];
  gain: [number, number, number];
  offset: [number, number, number];
  /** Exponent applied last in the wheel stage (1 = neutral). */
  gammaExponent: [number, number, number];
  contrast: number;
};

export function gradeUniforms(
  adjustments: ColorAdjustments,
  match?: ColorMatch | null,
): GradeUniforms {
  const exposureGain = Math.pow(2, adjustments.exposure);
  const [matchR, matchG, matchB] = matchGains(match);
  const temperature = adjustments.temperature / 100;
  const tint = adjustments.tint / 100;

  const s = 1 + adjustments.saturation / 100;
  const saturationMatrix = [
    LUMA_R * (1 - s) + s,
    LUMA_G * (1 - s),
    LUMA_B * (1 - s),
    LUMA_R * (1 - s),
    LUMA_G * (1 - s) + s,
    LUMA_B * (1 - s),
    LUMA_R * (1 - s),
    LUMA_G * (1 - s),
    LUMA_B * (1 - s) + s,
  ];

  // Luma-preserving hue rotation (same construction as feColorMatrix hueRotate).
  const angle = (adjustments.hue * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hueMatrix = [
    LUMA_R + cos * (1 - LUMA_R) - sin * LUMA_R,
    LUMA_G - cos * LUMA_G - sin * LUMA_G,
    LUMA_B - cos * LUMA_B + sin * (1 - LUMA_B),
    LUMA_R - cos * LUMA_R + sin * 0.143,
    LUMA_G + cos * (1 - LUMA_G) + sin * 0.14,
    LUMA_B - cos * LUMA_B - sin * 0.283,
    LUMA_R - cos * LUMA_R - sin * (1 - LUMA_R),
    LUMA_G - cos * LUMA_G + sin * LUMA_G,
    LUMA_B + cos * (1 - LUMA_B) + sin * LUMA_B,
  ];

  const lift = wheelOf(adjustments, "lift");
  const gain = wheelOf(adjustments, "gain");
  const offset = wheelOf(adjustments, "offset");
  const gamma = wheelOf(adjustments, "gamma");

  return {
    gains: [
      exposureGain * matchR * (1 + 0.25 * temperature),
      exposureGain * matchG * (1 - 0.2 * tint),
      exposureGain * matchB * (1 - 0.25 * temperature),
    ],
    matrix: multiply3(hueMatrix, saturationMatrix),
    vibrance: (adjustments.vibrance ?? 0) / 100,
    tone: [
      ((adjustments.shadows ?? 0) / 100) * 0.3,
      ((adjustments.highlights ?? 0) / 100) * 0.3,
      ((adjustments.whites ?? 0) / 100) * 0.15,
      ((adjustments.blacks ?? 0) / 100) * 0.12,
    ],
    lift: [lift.r * 0.25, lift.g * 0.25, lift.b * 0.25],
    gain: [Math.pow(2, gain.r), Math.pow(2, gain.g), Math.pow(2, gain.b)],
    offset: [offset.r * 0.2, offset.g * 0.2, offset.b * 0.2],
    // Positive gamma brightens midtones.
    gammaExponent: [Math.pow(2, -gamma.r), Math.pow(2, -gamma.g), Math.pow(2, -gamma.b)],
    contrast: 1 + adjustments.contrast / 100,
  };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** JS mirror of the shader's grade(). Input and output are 0..1 encoded sRGB. */
export function applyGrade(color: [number, number, number], u: GradeUniforms) {
  // Linear stage.
  let r = srgbToLinear(color[0]) * u.gains[0];
  let g = srgbToLinear(color[1]) * u.gains[1];
  let b = srgbToLinear(color[2]) * u.gains[2];
  const m = u.matrix;
  [r, g, b] = [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
  if (u.vibrance !== 0) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max > 0 ? (max - min) / max : 0;
    const y = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    const factor = 1 + u.vibrance * (1 - saturation);
    r = y + (r - y) * factor;
    g = y + (g - y) * factor;
    b = y + (b - y) * factor;
  }

  // Encoded stage.
  let v = [r, g, b].map((channel) => linearToSrgb(Math.max(channel, 0)));
  const luma = LUMA_R * v[0] + LUMA_G * v[1] + LUMA_B * v[2];
  const toneDelta =
    u.tone[0] * (1 - smoothstep(0, 0.55, luma)) +
    u.tone[1] * smoothstep(0.45, 1, luma) +
    u.tone[2] * smoothstep(0.75, 1, luma) +
    u.tone[3] * (1 - smoothstep(0, 0.25, luma));
  v = v.map((channel, index) => {
    let value = channel + toneDelta;
    value = value + u.lift[index] * (1 - value);
    value = value * u.gain[index] + u.offset[index];
    value = Math.pow(Math.max(value, 0), u.gammaExponent[index]);
    value = CONTRAST_PIVOT + (value - CONTRAST_PIVOT) * u.contrast;
    return clamp(value, 0, 1);
  });
  return v as [number, number, number];
}

export function gradeRgb(rgb: RGB, adjustments: ColorAdjustments, match?: ColorMatch | null): RGB {
  const [r, g, b] = applyGrade(
    [clamp(rgb.r, 0, 255) / 255, clamp(rgb.g, 0, 255) / 255, clamp(rgb.b, 0, 255) / 255],
    gradeUniforms(adjustments, match),
  );
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

// ── Descriptions ───────────────────────────────────────────────────────

function signed(value: number, digits = 0) {
  const fixed = Math.abs(value).toFixed(digits);
  return `${value >= 0 ? "+" : "−"}${fixed}`;
}

function describeWheel(label: string, wheel: WheelValue | undefined) {
  if (isNeutralWheel(wheel) || !wheel) return null;
  const { x, y, master } = puckFromWheel(wheel);
  const parts: string[] = [];
  if (Math.hypot(x, y) > 0.02) {
    const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    // Vectorscope angles of the primaries/secondaries.
    const names = [
      { name: "blue", at: 347 },
      { name: "magenta", at: 61 },
      { name: "red", at: 103 },
      { name: "yellow", at: 167 },
      { name: "green", at: 241 },
      { name: "cyan", at: 283 },
    ];
    const nearest = names.reduce(
      (best, entry) => {
        const distance = Math.min(Math.abs(entry.at - degrees), 360 - Math.abs(entry.at - degrees));
        return distance < best.distance ? { name: entry.name, distance } : best;
      },
      { name: "", distance: Infinity },
    );
    parts.push(`toward ${nearest.name}`);
  }
  if (Math.abs(master) > 0.005) parts.push(`${signed(master * 100)}`);
  return `${label} ${parts.join(" ")}`;
}

function describeQualifier(qualifier: ColorQualifier) {
  const parts: string[] = [];
  if (qualifier.hueWidth < 360) {
    parts.push(`hue ${Math.round(qualifier.hueCenter)}°±${Math.round(qualifier.hueWidth / 2)}`);
  }
  if (qualifier.satLow > 0 || qualifier.satHigh < 1) {
    parts.push(`sat ${Math.round(qualifier.satLow * 100)}–${Math.round(qualifier.satHigh * 100)}%`);
  }
  if (qualifier.lumaLow > 0 || qualifier.lumaHigh < 1) {
    parts.push(
      `luma ${Math.round(qualifier.lumaLow * 100)}–${Math.round(qualifier.lumaHigh * 100)}%`,
    );
  }
  return `Only ${parts.join(", ")}`;
}

/** Short human-readable chips, e.g. ["+0.50 EV", "Warmer 20"]. */
export function describeGrade(
  adjustments: ColorAdjustments,
  match?: ColorMatch | null,
  qualifier?: ColorQualifier | null,
) {
  const parts: string[] = [];
  if (qualifier && isActiveQualifier(qualifier)) parts.push(describeQualifier(qualifier));
  if (match && match.from.toLowerCase() !== match.to.toLowerCase()) {
    parts.push(`Match ${match.from.toUpperCase()} → ${match.to.toUpperCase()}`);
  }
  if (adjustments.exposure !== 0) parts.push(`${signed(adjustments.exposure, 2)} EV`);
  if (adjustments.contrast !== 0) parts.push(`Contrast ${signed(adjustments.contrast)}`);
  if (adjustments.saturation !== 0) parts.push(`Saturation ${signed(adjustments.saturation)}`);
  if (adjustments.vibrance) parts.push(`Vibrance ${signed(adjustments.vibrance)}`);
  if (adjustments.hue !== 0) parts.push(`Hue ${signed(adjustments.hue)}°`);
  if (adjustments.temperature !== 0) {
    parts.push(
      `${adjustments.temperature > 0 ? "Warmer" : "Cooler"} ${Math.abs(adjustments.temperature)}`,
    );
  }
  if (adjustments.tint !== 0) {
    parts.push(`${adjustments.tint > 0 ? "Magenta" : "Green"} ${Math.abs(adjustments.tint)}`);
  }
  if (adjustments.highlights) parts.push(`Highlights ${signed(adjustments.highlights)}`);
  if (adjustments.shadows) parts.push(`Shadows ${signed(adjustments.shadows)}`);
  if (adjustments.whites) parts.push(`Whites ${signed(adjustments.whites)}`);
  if (adjustments.blacks) parts.push(`Blacks ${signed(adjustments.blacks)}`);
  for (const { key, label } of WHEEL_CONTROLS) {
    const description = describeWheel(label, adjustments[key]);
    if (description) parts.push(description);
  }
  return parts;
}
