import type { RGB } from "./colorMath";
import { clampPoint, traceShape, type FramePoint, type RegionShape } from "./shape";

/** The browser refused pixel access (cross-origin source without CORS). */
export class PixelAccessError extends Error {
  constructor() {
    super("This video source does not allow pixel reads.");
    this.name = "PixelAccessError";
  }
}

type Scratch = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
const scratchCanvases = new Map<string, Scratch>();

/** Reusable offscreen 2D contexts, keyed by purpose. */
export function getScratch(key: string, width: number, height: number): Scratch {
  let scratch = scratchCanvases.get(key);
  if (!scratch) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    scratch = { canvas, ctx };
    scratchCanvases.set(key, scratch);
  }
  if (scratch.canvas.width !== width) scratch.canvas.width = width;
  if (scratch.canvas.height !== height) scratch.canvas.height = height;
  return scratch;
}

export function hasVideoFrame(video: HTMLVideoElement | null): video is HTMLVideoElement {
  return Boolean(
    video &&
    video.videoWidth > 0 &&
    video.videoHeight > 0 &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
  );
}

/** Where the picture actually sits inside an object-fit: contain <video>. */
export function getContentRect(video: HTMLVideoElement) {
  const elementWidth = video.clientWidth;
  const elementHeight = video.clientHeight;
  const videoWidth = video.videoWidth || 16;
  const videoHeight = video.videoHeight || 9;
  const scale = Math.min(elementWidth / videoWidth, elementHeight / videoHeight) || 0;
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: video.offsetLeft + (elementWidth - width) / 2,
    top: video.offsetTop + (elementHeight - height) / 2,
    width,
    height,
  };
}

function readImageData(ctx: CanvasRenderingContext2D, width: number, height: number) {
  try {
    return ctx.getImageData(0, 0, width, height);
  } catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError") {
      throw new PixelAccessError();
    }
    throw error;
  }
}

/**
 * Draw the current frame (optionally cropped to a source rect in native video
 * pixels) and return its pixels.
 */
export function readFramePixels(
  video: HTMLVideoElement,
  options: {
    key: string;
    width: number;
    height: number;
    source?: { x: number; y: number; width: number; height: number };
  },
) {
  const { ctx } = getScratch(options.key, options.width, options.height);
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, options.width, options.height);
  if (options.source) {
    const { x, y, width, height } = options.source;
    ctx.drawImage(video, x, y, width, height, 0, 0, options.width, options.height);
  } else {
    ctx.drawImage(video, 0, 0, options.width, options.height);
  }
  return readImageData(ctx, options.width, options.height);
}

export const LOUPE_GRID = 11;

export type PixelSample = {
  rgb: RGB;
  /** Native-resolution pixel coordinate of the sample centre. */
  pixel: { x: number; y: number };
  /** LOUPE_GRID x LOUPE_GRID native pixels around the sample, for the loupe. */
  grid: ImageData;
};

/**
 * Exact native-resolution pixel read at a frame point. `size` averages an
 * N x N block (1, 3, 9...) centred on the pixel.
 */
export function samplePixel(video: HTMLVideoElement, point: FramePoint, size: number): PixelSample {
  const clamped = clampPoint(point);
  const px = Math.min(video.videoWidth - 1, Math.floor(clamped.x * video.videoWidth));
  const py = Math.min(video.videoHeight - 1, Math.floor(clamped.y * video.videoHeight));
  const half = Math.floor(LOUPE_GRID / 2);
  // drawImage clips source rects that run off the frame, so read the grid
  // from the pixel's top-left and index relative to it.
  const grid = readFramePixels(video, {
    key: "loupe",
    width: LOUPE_GRID,
    height: LOUPE_GRID,
    source: { x: px - half, y: py - half, width: LOUPE_GRID, height: LOUPE_GRID },
  });

  const radius = Math.floor(Math.min(size, LOUPE_GRID) / 2);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const sx = px + dx;
      const sy = py + dy;
      if (sx < 0 || sy < 0 || sx >= video.videoWidth || sy >= video.videoHeight) continue;
      const offset = ((half + dy) * LOUPE_GRID + (half + dx)) * 4;
      r += grid.data[offset];
      g += grid.data[offset + 1];
      b += grid.data[offset + 2];
      count += 1;
    }
  }
  count = Math.max(count, 1);
  return { rgb: { r: r / count, g: g / count, b: b / count }, pixel: { x: px, y: py }, grid };
}

export type RegionMask = {
  /** One byte of coverage (0..255) per pixel. */
  mask: Uint8ClampedArray;
  /** Pixel bounds that contain every non-zero mask value. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
};

/** Push rectangle sides that sit on the frame edge out past it. */
function padEdgeRect(shape: RegionShape, padX: number, padY: number): RegionShape {
  if (shape.kind !== "rect") return shape;
  const [a, b] = shape.points;
  const edge = (value: number, pad: number) =>
    value <= 0.001 ? -pad : value >= 0.999 ? 1 + pad : value;
  return {
    kind: "rect",
    points: [
      { x: edge(a.x, padX), y: edge(a.y, padY) },
      { x: edge(b.x, padX), y: edge(b.y, padY) },
    ],
  };
}

/** Rasterize a region into a coverage mask with a soft (blurred) edge. */
export function buildRegionMask(
  shape: RegionShape,
  width: number,
  height: number,
  options: { feather: number; invert: boolean },
): RegionMask {
  const { ctx } = getScratch("mask", width, height);
  const featherPx = options.feather * Math.min(width, height);
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (featherPx > 0.5 && "filter" in ctx) {
    ctx.filter = `blur(${featherPx / 2}px)`;
  }
  ctx.fillStyle = "#fff";
  // Pad past the frame edges so the blur doesn't darken the border.
  const pad = Math.ceil(featherPx * 2) + 1;
  const traced = padEdgeRect(shape, pad / width, pad / height);
  if (options.invert) {
    ctx.beginPath();
    ctx.rect(-pad, -pad, width + pad * 2, height + pad * 2);
    traceShape(ctx, traced, width, height);
    ctx.fill("evenodd");
  } else {
    ctx.beginPath();
    traceShape(ctx, traced, width, height);
    ctx.fill();
  }
  ctx.restore();

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8ClampedArray(width * height);
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha === 0) continue;
      mask[y * width + x] = alpha;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x >= x1) x1 = x + 1;
      if (y >= y1) y1 = y + 1;
    }
  }
  if (x1 <= x0 || y1 <= y0) return { mask, bounds: { x0: 0, y0: 0, x1: 0, y1: 0 } };
  return { mask, bounds: { x0, y0, x1, y1 } };
}

const REGION_SAMPLE_WIDTH = 480;

/** Average color inside the region's hard edge on the current frame. */
export function averageRegionColor(video: HTMLVideoElement, shape: RegionShape): RGB | null {
  const width = Math.min(REGION_SAMPLE_WIDTH, video.videoWidth);
  const height = Math.max(1, Math.round((width / video.videoWidth) * video.videoHeight));
  const frame = readFramePixels(video, { key: "region-average", width, height });
  const { mask, bounds } = buildRegionMask(shape, width, height, { feather: 0, invert: false });
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = bounds.y0; y < bounds.y1; y += 1) {
    for (let x = bounds.x0; x < bounds.x1; x += 1) {
      if (mask[y * width + x] < 128) continue;
      const offset = (y * width + x) * 4;
      r += frame.data[offset];
      g += frame.data[offset + 1];
      b += frame.data[offset + 2];
      count += 1;
    }
  }
  if (count === 0) return null;
  return { r: r / count, g: g / count, b: b / count };
}
