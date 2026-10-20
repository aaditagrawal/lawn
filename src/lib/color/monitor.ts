import type { MonitorMode } from "./useColorReview";

/** Exposure bands for the false color view, by Rec.709 luma percent. */
export const FALSE_COLOR_BANDS: Array<{
  from: number;
  to: number;
  color: [number, number, number] | null;
  label: string;
}> = [
  { from: 0, to: 2, color: [110, 40, 160], label: "Crushed" },
  { from: 2, to: 10, color: [30, 80, 220], label: "Near black" },
  { from: 10, to: 38, color: null, label: "Shadows" },
  { from: 38, to: 44, color: [60, 170, 60], label: "18% grey" },
  { from: 44, to: 54, color: null, label: "Mids" },
  { from: 54, to: 60, color: [235, 130, 170], label: "Skin +1" },
  { from: 60, to: 94, color: null, label: "Highlights" },
  { from: 94, to: 98, color: [240, 210, 40], label: "Near clip" },
  { from: 98, to: 101, color: [220, 40, 40], label: "Clipped" },
];

export const MONITOR_MODES: Array<{ id: MonitorMode; label: string }> = [
  { id: "normal", label: "Normal" },
  { id: "false-color", label: "False color" },
  { id: "luma", label: "Luma" },
  { id: "red", label: "Red" },
  { id: "green", label: "Green" },
  { id: "blue", label: "Blue" },
];
