"use client";

import { useMemo } from "react";
import { encode } from "uqr";

// The QR code for "Use your phone", drawn as one SVG path from uqr's module
// grid (MIT, no dependencies). The data modules stay square, which is what
// phone cameras read best; only the three finder eyes are rounded, which
// scanners locate by their proportions (1:1:3:1:1), not their corners. Error
// correction M leaves room for a smudged laptop screen without making the
// code denser than a phone at arm's length can read. Nothing sits in the
// middle: a logo would cost exactly the margin the smudges need.

const EYE = 7;
/** White modules around the code, inside the SVG, on top of the card's own white. */
const QUIET = 2;

function eyePath(x: number, y: number): string {
  // Outer ring (a 7×7 rounded square with a 5×5 hole) and the 3×3 pupil, filled even-odd.
  const ring = roundedRect(x, y, EYE, EYE, 2.2) + roundedRect(x + 1, y + 1, EYE - 2, EYE - 2, 1.4);
  const pupil = roundedRect(x + 2, y + 2, 3, 3, 1);
  return ring + pupil;
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`;
}

export function PhoneQr({ value, size = 136, className }: { value: string; size?: number; className?: string }) {
  const { modules, eyes, span } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 0 });
    const n = qr.size;
    const inEye = (x: number, y: number) => (x < EYE && y < EYE) || (x >= n - EYE && y < EYE) || (x < EYE && y >= n - EYE);
    // Runs of dark modules along each row, one rectangle per run.
    let d = "";
    for (let y = 0; y < n; y += 1) {
      let x = 0;
      while (x < n) {
        if (qr.data[y][x] && !inEye(x, y)) {
          const start = x;
          while (x < n && qr.data[y][x] && !inEye(x, y)) x += 1;
          d += `M${start + QUIET} ${y + QUIET}h${x - start}v1h-${x - start}z`;
        } else x += 1;
      }
    }
    const e = eyePath(QUIET, QUIET) + eyePath(n - EYE + QUIET, QUIET) + eyePath(QUIET, n - EYE + QUIET);
    return { modules: d, eyes: e, span: n + QUIET * 2 };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label="QR code that opens the photo page on your phone"
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={span} height={span} fill="#ffffff" />
      <path d={modules} fill="#121215" />
      <path d={eyes} fill="#121215" fillRule="evenodd" shapeRendering="geometricPrecision" />
    </svg>
  );
}
