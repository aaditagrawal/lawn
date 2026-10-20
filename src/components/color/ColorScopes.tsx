"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { LUMA_B, LUMA_G, LUMA_R, chroma } from "@/lib/color/colorMath";
import { PixelAccessError, hasVideoFrame, readFramePixels } from "@/lib/color/frame";
import { useFrameTick } from "@/lib/color/useFrameTick";

type ScopeMode = "waveform" | "parade" | "vectorscope";

const SCOPE_MODES: Array<{ id: ScopeMode; label: string }> = [
  { id: "waveform", label: "Waveform" },
  { id: "parade", label: "Parade" },
  { id: "vectorscope", label: "Vector" },
];

const SAMPLE_WIDTH = 256;
const WAVE_HEIGHT = 160;
const VECTOR_SIZE = 200;
const SCOPE_BG = [26, 26, 26];

// 75% primaries/secondaries, the classic vectorscope targets.
const VECTOR_TARGETS = [
  { label: "R", rgb: { r: 191, g: 0, b: 0 } },
  { label: "Mg", rgb: { r: 191, g: 0, b: 191 } },
  { label: "B", rgb: { r: 0, g: 0, b: 191 } },
  { label: "Cy", rgb: { r: 0, g: 191, b: 191 } },
  { label: "G", rgb: { r: 0, g: 191, b: 0 } },
  { label: "Yl", rgb: { r: 191, g: 191, b: 0 } },
];

function vectorPosition(cb: number, cr: number) {
  // cb/cr span ±0.5; leave a small margin around the 100% ring.
  const scale = VECTOR_SIZE * 0.9;
  return { x: VECTOR_SIZE / 2 + cb * scale, y: VECTOR_SIZE / 2 - cr * scale };
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  frame: ImageData,
  channels: Array<"luma" | "r" | "g" | "b">,
) {
  const segmentWidth = Math.floor(ctx.canvas.width / channels.length);
  const width = segmentWidth * channels.length;
  const output = ctx.createImageData(ctx.canvas.width, WAVE_HEIGHT);
  const bins = new Float32Array(segmentWidth * WAVE_HEIGHT);
  const tints: Record<string, [number, number, number]> = {
    luma: [124, 184, 124],
    r: [235, 80, 80],
    g: [100, 210, 100],
    b: [90, 140, 255],
  };
  const gain = 18 / frame.height;

  for (let i = 0; i < output.data.length; i += 4) {
    output.data[i] = SCOPE_BG[0];
    output.data[i + 1] = SCOPE_BG[1];
    output.data[i + 2] = SCOPE_BG[2];
    output.data[i + 3] = 255;
  }

  channels.forEach((channel, segment) => {
    bins.fill(0);
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        const offset = (y * frame.width + x) * 4;
        const r = frame.data[offset];
        const g = frame.data[offset + 1];
        const b = frame.data[offset + 2];
        const value =
          channel === "luma"
            ? LUMA_R * r + LUMA_G * g + LUMA_B * b
            : channel === "r"
              ? r
              : channel === "g"
                ? g
                : b;
        const column = Math.min(segmentWidth - 1, Math.floor((x / frame.width) * segmentWidth));
        const row = Math.round((1 - value / 255) * (WAVE_HEIGHT - 1));
        bins[row * segmentWidth + column] += 1;
      }
    }
    const tint = tints[channel];
    for (let row = 0; row < WAVE_HEIGHT; row += 1) {
      for (let column = 0; column < segmentWidth; column += 1) {
        const count = bins[row * segmentWidth + column];
        if (count === 0) continue;
        const intensity = Math.min(1, 0.25 + count * gain);
        const offset = (row * ctx.canvas.width + segment * segmentWidth + column) * 4;
        output.data[offset] = SCOPE_BG[0] + (tint[0] - SCOPE_BG[0]) * intensity;
        output.data[offset + 1] = SCOPE_BG[1] + (tint[1] - SCOPE_BG[1]) * intensity;
        output.data[offset + 2] = SCOPE_BG[2] + (tint[2] - SCOPE_BG[2]) * intensity;
      }
    }
  });
  ctx.putImageData(output, 0, 0);

  // Graticule: 0 / 25 / 50 / 75 / 100 %.
  ctx.strokeStyle = "rgba(240,240,232,0.18)";
  ctx.fillStyle = "rgba(240,240,232,0.45)";
  ctx.lineWidth = 1;
  ctx.font = "9px ui-monospace, monospace";
  for (const percent of [0, 25, 50, 75, 100]) {
    const y = Math.round((1 - percent / 100) * (WAVE_HEIGHT - 1)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillText(String(percent), 2, Math.min(Math.max(y - 2, 9), WAVE_HEIGHT - 2));
  }
  for (let segment = 1; segment < channels.length; segment += 1) {
    const x = segment * segmentWidth + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WAVE_HEIGHT);
    ctx.stroke();
  }
}

function drawVectorscope(ctx: CanvasRenderingContext2D, frame: ImageData) {
  const size = VECTOR_SIZE;
  const counts = new Float32Array(size * size);
  const sums = new Float32Array(size * size * 3);
  for (let offset = 0; offset < frame.data.length; offset += 4) {
    const r = frame.data[offset];
    const g = frame.data[offset + 1];
    const b = frame.data[offset + 2];
    const { cb, cr } = chroma({ r, g, b });
    const { x, y } = vectorPosition(cb, cr);
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= size || py >= size) continue;
    const bin = py * size + px;
    counts[bin] += 1;
    sums[bin * 3] += r;
    sums[bin * 3 + 1] += g;
    sums[bin * 3 + 2] += b;
  }

  const output = ctx.createImageData(size, size);
  const gain = 40 / (frame.width * frame.height) ** 0.5;
  for (let bin = 0; bin < counts.length; bin += 1) {
    const offset = bin * 4;
    const count = counts[bin];
    output.data[offset + 3] = 255;
    if (count === 0) {
      output.data[offset] = SCOPE_BG[0];
      output.data[offset + 1] = SCOPE_BG[1];
      output.data[offset + 2] = SCOPE_BG[2];
      continue;
    }
    const intensity = Math.min(1, 0.35 + count * gain);
    // Brighten the pixel's own color so dark chroma stays visible.
    const r = sums[bin * 3] / count;
    const g = sums[bin * 3 + 1] / count;
    const b = sums[bin * 3 + 2] / count;
    const lift = 255 / Math.max(r, g, b, 1);
    output.data[offset] = SCOPE_BG[0] + (Math.min(255, r * lift) - SCOPE_BG[0]) * intensity;
    output.data[offset + 1] = SCOPE_BG[1] + (Math.min(255, g * lift) - SCOPE_BG[1]) * intensity;
    output.data[offset + 2] = SCOPE_BG[2] + (Math.min(255, b * lift) - SCOPE_BG[2]) * intensity;
  }
  ctx.putImageData(output, 0, 0);

  const center = size / 2;
  ctx.strokeStyle = "rgba(240,240,232,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(center, center, size * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(center, 4);
  ctx.lineTo(center, size - 4);
  ctx.moveTo(4, center);
  ctx.lineTo(size - 4, center);
  ctx.stroke();

  // Skin tone line (≈123°, between R and Yl).
  ctx.strokeStyle = "rgba(235,160,120,0.55)";
  ctx.beginPath();
  const skinAngle = (123 * Math.PI) / 180;
  ctx.moveTo(center, center);
  ctx.lineTo(
    center + Math.cos(skinAngle) * size * 0.45,
    center - Math.sin(skinAngle) * size * 0.45,
  );
  ctx.stroke();

  ctx.font = "bold 9px ui-monospace, monospace";
  for (const target of VECTOR_TARGETS) {
    const { cb, cr } = chroma(target.rgb);
    const { x, y } = vectorPosition(cb, cr);
    ctx.strokeStyle = "rgba(240,240,232,0.6)";
    ctx.strokeRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = "rgba(240,240,232,0.7)";
    ctx.fillText(target.label, x + 6, y + 3);
  }
}

export function ColorScopes({
  video,
  onPixelAccessBlocked,
}: {
  video: HTMLVideoElement | null;
  onPixelAccessBlocked: () => void;
}) {
  const [mode, setMode] = useState<ScopeMode>("waveform");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tick = useFrameTick(video, true, 10);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !hasVideoFrame(video)) return;
    const width = Math.min(SAMPLE_WIDTH, video.videoWidth);
    const height = Math.max(1, Math.round((width / video.videoWidth) * video.videoHeight));
    let frame: ImageData;
    try {
      frame = readFramePixels(video, { key: "scope", width, height });
    } catch (error) {
      if (error instanceof PixelAccessError) onPixelAccessBlocked();
      return;
    }
    if (mode === "vectorscope") drawVectorscope(ctx, frame);
    else drawWaveform(ctx, frame, mode === "parade" ? ["r", "g", "b"] : ["luma"]);
  }, [mode, onPixelAccessBlocked, tick, video]);

  const isVector = mode === "vectorscope";

  return (
    <div className="border-2 border-[#1a1a1a] bg-[#1a1a1a]">
      <div className="flex border-b-2 border-[#1a1a1a]">
        {SCOPE_MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setMode(option.id)}
            aria-pressed={mode === option.id}
            className={cn(
              "flex-1 px-2 py-1.5 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors",
              mode === option.id
                ? "bg-[#f0f0e8] text-[#1a1a1a]"
                : "text-[#f0f0e8]/70 hover:bg-[#2d5a2d] hover:text-[#f0f0e8]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex justify-center p-2">
        <canvas
          key={mode}
          ref={canvasRef}
          width={isVector ? VECTOR_SIZE : 384}
          height={isVector ? VECTOR_SIZE : WAVE_HEIGHT}
          className={cn("block", isVector ? "h-[200px] w-[200px]" : "h-[160px] w-full")}
          role="img"
          aria-label={`${SCOPE_MODES.find((option) => option.id === mode)?.label} scope of the current frame`}
        />
      </div>
    </div>
  );
}
