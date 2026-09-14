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

export const REVEAL_CAP_MS = 2400;

// A hand writes about 40 characters a second on a board, draws a stroke at
// roughly a pixel per millisecond, and drops a box or an arrow in a blink.
export function stepDuration(input: RevealInput): number {
  switch (input.kind) {
    case "text":
      return Math.min(1600, 90 + 24 * (input.chars ?? 0));
    case "eq":
      return Math.min(900, 380 + 7 * (input.chars ?? 0));
    case "stroke":
      return Math.min(700, 200 + 0.9 * (input.length ?? 0));
    case "line":
      return Math.min(420, 160 + 0.5 * (input.length ?? 0));
    case "box":
      return 170;
    case "fade":
      return 140;
  }
}

// Reading order: top to bottom in rows of about a line height, left to right
// inside a row. Total time is capped so a busy tool call never lags the voice.
export function planReveal(inputs: RevealInput[], rowHeight = 28, capMs = REVEAL_CAP_MS): RevealStep[] {
  const steps: RevealStep[] = inputs.map((input) => ({
    id: input.id,
    kind: input.kind,
    duration: stepDuration(input),
    x: input.x,
    y: input.y,
    chars: input.chars,
  }));
  steps.sort((a, b) => {
    const row = Math.round(a.y / rowHeight) - Math.round(b.y / rowHeight);
    return row !== 0 ? row : a.x - b.x;
  });
  // Each piece costs a frame or two of overhead on top of its duration.
  const overhead = 24 * steps.length;
  const total = steps.reduce((sum, s) => sum + s.duration, 0);
  const budget = Math.max(200, capMs - overhead);
  if (total > budget && total > 0) {
    const k = budget / total;
    for (const s of steps) s.duration = Math.max(30, Math.round(s.duration * k));
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
