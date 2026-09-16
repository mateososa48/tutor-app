// Planning for the "being written" reveal: given what one tool call created,
// decide the order things appear in and how long each takes, so the board
// looks written by a hand rather than pasted. Pure; the runtime that drives
// tldraw lives in TldrawCore.

export type RevealKind = "text" | "stroke" | "line" | "box" | "fade" | "eq";

export type RevealStep = {
  /** tldraw shape id, or an EqItem id for kind "eq" */
  id: string;
  kind: RevealKind;
  /** ms */
  duration: number;
  /** reading-order key */
  x: number;
  y: number;
  /** characters to type, for text-bearing shapes */
  chars?: number;
};

export type RevealInput = {
  id: string;
  kind: RevealKind;
  x: number;
  y: number;
  chars?: number;
  /** stroke length in page px, for strokes and lines */
  length?: number;
};

export const REVEAL_CAP_MS = 4500;

// An unhurried hand at a board, so a student can follow along: about 20
// characters a second, strokes at roughly half a pixel per millisecond, and
// boxes and arrows eased in rather than blinked in. (Sept 14 2026: the first
// pace, 50 characters a second under a 1.8 s cap, read as rushed.)
export function stepDuration(input: RevealInput): number {
  switch (input.kind) {
    case "text":
      return Math.min(3600, 180 + 48 * (input.chars ?? 0));
    case "eq":
      return Math.min(2400, 700 + 22 * (input.chars ?? 0));
    case "stroke":
      return Math.min(1500, 380 + 1.9 * (input.length ?? 0));
    case "line":
      return Math.min(900, 300 + 1.1 * (input.length ?? 0));
    case "box":
      return 320;
    case "fade":
      return 280;
  }
}

/**
 * How much faster to write when tool calls arrive faster than they can be
 * written: the board should never trail the voice by much. `queued` is the
 * number of jobs already waiting.
 */
export function catchUpPace(queued: number): number {
  if (queued >= 3) return 0.45;
  if (queued === 2) return 0.65;
  if (queued === 1) return 0.85;
  return 1;
}

// Reading order: top to bottom in rows of about a line height, left to right
// inside a row. Total time is capped so one busy tool call stays reasonable;
// `pace` below 1 speeds the whole call up.
export function planReveal(inputs: RevealInput[], rowHeight = 28, capMs = REVEAL_CAP_MS, pace = 1): RevealStep[] {
  const steps: RevealStep[] = inputs.map((input) => ({
    id: input.id,
    kind: input.kind,
    duration: Math.round(stepDuration(input) * pace),
    x: input.x,
    y: input.y,
    chars: input.chars,
  }));
  steps.sort((a, b) => {
    const row = Math.round(a.y / rowHeight) - Math.round(b.y / rowHeight);
    return row !== 0 ? row : a.x - b.x;
  });
  // Each piece costs a pen glide or a pause on top of its duration.
  const overhead = 90 * steps.length;
  const total = steps.reduce((sum, s) => sum + s.duration, 0);
  const budget = Math.max(700 * pace, capMs * pace - overhead);
  if (total > budget && total > 0) {
    const k = budget / total;
    for (const s of steps) s.duration = Math.max(40, Math.round(s.duration * k));
  }
  return steps;
}

// Characters typed by time `p` in [0, 1], landing on whole words near the end
// of each word so the text does not flicker mid-glyph in narrow boxes.
export function typedPrefix(text: string, p: number): string {
  if (p >= 1) return text;
  if (p <= 0) return "";
  const n = Math.floor(text.length * p);
  return text.slice(0, n);
}

// Index of the last point to show at time `p` along a polyline.
export function pointsShown(total: number, p: number): number {
  if (total <= 2) return total;
  return Math.max(2, Math.min(total, Math.ceil(total * p)));
}

export function polylineLength(points: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return len;
}
