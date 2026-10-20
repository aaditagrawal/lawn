// 8-bit sRGB helpers. Everything read from the browser is 8-bit sRGB after the
// browser's own decode, so that is the space readouts and notes are expressed in.

export type RGB = { r: number; g: number; b: number };

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(value: number) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

/** 8-bit code value -> linear light. */
export const SRGB_TO_LINEAR_LUT = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) lut[i] = srgbToLinear(i / 255);
  return lut;
})();

const LINEAR_TO_SRGB_LUT_SIZE = 4096;
/** Linear light (0..1, quantized to 4096 steps) -> 8-bit code value. */
export const LINEAR_TO_SRGB_LUT = (() => {
  const lut = new Uint8ClampedArray(LINEAR_TO_SRGB_LUT_SIZE + 1);
  for (let i = 0; i <= LINEAR_TO_SRGB_LUT_SIZE; i += 1) {
    lut[i] = Math.round(linearToSrgb(i / LINEAR_TO_SRGB_LUT_SIZE) * 255);
  }
  return lut;
})();

export function encodeLinear(value: number) {
  if (!(value > 0)) return 0;
  if (value >= 1) return 255;
  return LINEAR_TO_SRGB_LUT[Math.round(value * LINEAR_TO_SRGB_LUT_SIZE)];
}

export function rgbToHex({ r, g, b }: RGB) {
  const toHex = (value: number) =>
    Math.round(clamp(value, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgb(hex: string): RGB | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function normalizeHex(hex: string) {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(rgb) : null;
}

/** Hue in degrees, saturation and lightness in percent. */
export function rgbToHsl({ r, g, b }: RGB) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness * 100 };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation * 100, l: lightness * 100 };
}

// Rec.709 luma coefficients.
export const LUMA_R = 0.2126;
export const LUMA_G = 0.7152;
export const LUMA_B = 0.0722;

/** Rec.709 luma (Y') on gamma-encoded values, as a 0..100 percentage. */
export function lumaPercent({ r, g, b }: RGB) {
  return ((LUMA_R * r + LUMA_G * g + LUMA_B * b) / 255) * 100;
}

/**
 * Rec.709 Cb/Cr on gamma-encoded values, each in -0.5..0.5. This is what a
 * vectorscope plots.
 */
export function chroma({ r, g, b }: RGB) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const y = LUMA_R * rn + LUMA_G * gn + LUMA_B * bn;
  return { cb: (bn - y) / 1.8556, cr: (rn - y) / 1.5748 };
}

export function formatRgb({ r, g, b }: RGB) {
  return `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;
}

/** Readable text color (near-black or cream) for a swatch background. */
export function swatchTextColor(rgb: RGB) {
  return lumaPercent(rgb) > 55 ? "#1a1a1a" : "#f0f0e8";
}
