// The board turning to a fresh page (Oct 14 2026). When the tutor starts a
// new problem, the board as it stands is framed (a hairline card fades in
// around it), held a beat, then slid left, off the page, as the fresh board
// is written. Finished boards keep their place in a row to the left of the
// page, newest nearest, and the student can go back to them.
//
// Pure: the shape of the transition and where things go. TldrawCore runs it.

export type Rect = { x: number; y: number; w: number; h: number };

/** How long each part takes, in ms. */
export const ARCHIVE_TIMING = {
  /** The frame fades in. */
  fade: 260,
  /** A beat with the frame on, so the eye sees the whole board as one thing. */
  hold: 140,
  /** The framed board slides off to the left. */
  slide: 560,
  /** Empty board before the new heading starts writing. */
  settle: 120,
} as const;

export const ARCHIVE_TOTAL_MS = ARCHIVE_TIMING.fade + ARCHIVE_TIMING.hold + ARCHIVE_TIMING.slide + ARCHIVE_TIMING.settle;

/** Room between a finished board and the next one in the row. */
export const ARCHIVE_GAP = 160;
/** The frame's margin around the work it holds. */
export const ARCHIVE_PAD = 28;

/** The card around a board's work: everything on it, with a margin. Null when there is nothing. */
export function archiveRect(rects: Rect[], pad = ARCHIVE_PAD): Rect | null {
  const real = rects.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && r.w >= 0 && r.h >= 0);
  if (!real.length) return null;
  const x0 = Math.min(...real.map((r) => r.x));
  const y0 = Math.min(...real.map((r) => r.y));
  const x1 = Math.max(...real.map((r) => r.x + r.w));
  const y1 = Math.max(...real.map((r) => r.y + r.h));
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/**
 * How far left a framed board moves: until its right edge sits ARCHIVE_GAP
 * left of the page's left edge (x = 0, where the next board is written).
 * Older boards move by the same distance, so the row keeps its order.
 */
export function slideDistance(card: Rect, pageLeft = 0, gap = ARCHIVE_GAP): number {
  return Math.max(0, card.x + card.w - pageLeft + gap);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - clamp01(t), 4);
export const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** Where the transition is at `elapsed` ms: the frame's opacity and how much of the slide is done (0 to 1). */
export function archiveFrameAt(elapsed: number): { opacity: number; slide: number; done: boolean } {
  const { fade, hold, slide } = ARCHIVE_TIMING;
  const opacity = easeOutQuart(elapsed / fade);
  const slideAt = easeInOutCubic((elapsed - fade - hold) / slide);
  return { opacity, slide: slideAt, done: elapsed >= fade + hold + slide };
}
