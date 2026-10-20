import { clamp } from "./colorMath";

/** Normalized (0..1) position within the video frame. */
export type FramePoint = { x: number; y: number };

export type RegionShapeKind = "rect" | "ellipse" | "lasso";

/**
 * rect/ellipse: two opposite corners of the bounding box.
 * lasso: a closed polygon.
 */
export type RegionShape = { kind: RegionShapeKind; points: FramePoint[] };

export const MAX_LASSO_POINTS = 256;

export const FULL_FRAME_SHAPE: RegionShape = {
  kind: "rect",
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
};

export function isFullFrame(shape: RegionShape) {
  if (shape.kind !== "rect") return false;
  const bounds = shapeBounds(shape);
  return bounds.x <= 0.001 && bounds.y <= 0.001 && bounds.width >= 0.998 && bounds.height >= 0.998;
}
/** Regions smaller than this (fraction of frame) are treated as a stray click. */
const MIN_REGION_SIZE = 0.01;

export function clampPoint(point: FramePoint): FramePoint {
  return { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
}

export function shapeBounds(shape: RegionShape) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of shape.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

export function isUsableShape(shape: RegionShape | null | undefined): shape is RegionShape {
  if (!shape) return false;
  if (shape.kind === "lasso" && shape.points.length < 3) return false;
  if (shape.kind !== "lasso" && shape.points.length !== 2) return false;
  const bounds = shapeBounds(shape);
  return bounds.width >= MIN_REGION_SIZE && bounds.height >= MIN_REGION_SIZE;
}

function perpendicularDistance(point: FramePoint, start: FramePoint, end: FramePoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function douglasPeucker(points: FramePoint[], tolerance: number): FramePoint[] {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let index = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[last]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points[last]];
  const left = douglasPeucker(points.slice(0, index + 1), tolerance);
  const right = douglasPeucker(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

/**
 * Reduce a freehand path to at most MAX_LASSO_POINTS while keeping its
 * outline, loosening the tolerance until it fits.
 */
export function simplifyLasso(points: FramePoint[], maxPoints = MAX_LASSO_POINTS): FramePoint[] {
  const clamped = points.map(clampPoint);
  let tolerance = 0.0015;
  let simplified = douglasPeucker(clamped, tolerance);
  while (simplified.length > maxPoints) {
    tolerance *= 1.5;
    simplified = douglasPeucker(clamped, tolerance);
  }
  return simplified;
}

/** Add the shape's outline to the current path, in pixel space. */
export function traceShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: RegionShape,
  width: number,
  height: number,
) {
  if (shape.kind === "lasso") {
    shape.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x * width, point.y * height);
      else ctx.lineTo(point.x * width, point.y * height);
    });
    ctx.closePath();
    return;
  }

  const bounds = shapeBounds(shape);
  const x = bounds.x * width;
  const y = bounds.y * height;
  const w = bounds.width * width;
  const h = bounds.height * height;
  if (shape.kind === "rect") {
    ctx.rect(x, y, w, h);
  } else {
    ctx.moveTo(x + w, y + h / 2);
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  }
}

export function shapeLabel(kind: RegionShapeKind, shape?: RegionShape) {
  if (shape && isFullFrame(shape)) return "Whole frame";
  switch (kind) {
    case "rect":
      return "Rectangle";
    case "ellipse":
      return "Ellipse";
    case "lasso":
      return "Lasso";
  }
}
