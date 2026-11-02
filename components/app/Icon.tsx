"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

// Hugeicons Stroke Rounded, the app's one icon family (Oct 2026; the older
// screens still draw Lucide until they move over). The stroke grows as the
// icon shrinks so every size reads at the same weight: the Paper design
// system's "Sizes and strokes" row.
const STROKE: Record<number, number> = { 12: 2, 14: 1.9, 16: 1.75, 18: 1.5, 20: 1.5, 24: 1.5 };

export function Icon({
  icon,
  size = 18,
  strokeWidth,
  className,
}: {
  icon: IconSvgElement;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth ?? STROKE[size] ?? 1.5}
      aria-hidden
      className={cn("shrink-0", className)}
    />
  );
}
