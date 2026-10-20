import { hexToRgb, swatchTextColor } from "@/lib/color/colorMath";
import { cn } from "@/lib/utils";

/** Square color chip with an optional legible label. */
export function Swatch({
  hex,
  className,
  label,
}: {
  hex: string;
  className?: string;
  label?: string;
}) {
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center justify-center border-2 border-[#1a1a1a] font-mono text-[9px] font-bold",
        className,
      )}
      style={{ backgroundColor: hex, color: swatchTextColor(rgb) }}
      title={hex.toUpperCase()}
    >
      {label}
    </span>
  );
}
