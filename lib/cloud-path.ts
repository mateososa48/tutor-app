// A cloud outline for a box of any size.
//
// Not a stretched picture and not a row of half circles: lobes are laid out
// around the inside of the box and the path traced is the *union* of them, so
// where two lobes overlap the outline runs smoothly from one into the next
// and never cusps. The lobes keep their own size whatever the box does, so a
// wide bubble grows more puffs rather than longer ones, and their radii vary
// a little (the same way every time for the same box) so the edge reads as
// weather rather than as a pattern.

export type CloudOptions = {
  /** Roughly how big one puff is, in px. Scales with the box by default. */
  lobe?: number;
  /** How much the puffs vary in size, 0 to 1. */
  vary?: number;
  /** Changes which puff is which size, without changing the look. */
  seed?: number;
};

// A repeatable 0..1 from an integer: the same box always draws the same cloud.
function wobble(i: number, seed: number): number {
  const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

type Lobe = { x: number; y: number; r: number };

// A cumulus has a billowing top and a base that is nearly flat, which is most
// of what makes a drawn cloud read as a cloud rather than as bumps. So the
// puff size runs from big at the top of the box to small at the bottom.
const TOP = 1.3;
const BASE = 0.62;

/** Where the puffs sit and how big each one is. Exported for the tests. */
export function cloudLobes(w: number, h: number, { lobe, vary = 0.22, seed = 1 }: CloudOptions = {}): Lobe[] {
  // A big cloud has big billows. Left fixed, a wide bubble came out frilly,
  // like a torn edge rather than weather, so the puff scales with the box's
  // short side and the long side only ever grows the count.
  // Also capped against the width, or a small bubble comes out as one fat
  // blob instead of a cloud with a few billows across it.
  const size = lobe ?? Math.max(6, Math.min(Math.min(w, h) * 0.26, w / 4.5, 24));
  const most = size * TOP * (1 + vary);
  // Keep every puff inside the box: the rail they sit on is inset by the
  // largest one can get, which is a top one.
  const widest = 2 * TOP * (1 + vary);
  const r0 = Math.max(2, Math.min(size, (w - 2) / widest, (h - 2) / (TOP * (1 + vary) + BASE * (1 + vary))));
  const insetX = r0 * TOP * (1 + vary);
  const insetTop = r0 * TOP * (1 + vary);
  const insetBase = r0 * BASE * (1 + vary);
  const x0 = insetX;
  const y0 = insetTop;
  const x1 = Math.max(x0, w - insetX);
  const y1 = Math.max(y0, h - insetBase);
  const across = x1 - x0;
  const down = y1 - y0;
  const round = across + down;
  if (round < 0.5) return [{ x: w / 2, y: h / 2, r: Math.max(2, Math.min(w, h) / 2) }];

  const rail = 2 * round;
  const walk = (t: number) => {
    const u = ((t % rail) + rail) % rail;
    if (u < across) return { x: x0 + u, y: y0 };
    if (u < across + down) return { x: x1, y: y0 + (u - across) };
    if (u < 2 * across + down) return { x: x1 - (u - across - down), y: y1 };
    return { x: x0, y: y1 - (u - 2 * across - down) };
  };
  // A puff's size where it sits: big at the top rail, small at the base.
  const sizeAt = (y: number) => {
    const fall = down < 0.5 ? 0 : (y - y0) / down;
    return TOP + (BASE - TOP) * fall;
  };

  // Spacing follows each puff's own size — about 1.3 of its radius — so the
  // big ones along the top stand apart and read as separate billows while the
  // small ones along the base stay tight enough never to leave a gap. Even
  // spacing cannot do both: wide enough for the top leaves holes at the base,
  // tight enough for the base smooths the top into a rounded rectangle.
  // Walking in "phase" (distance over local radius) closes the loop exactly.
  const fine = 512;
  const phase: number[] = [0];
  for (let i = 1; i <= fine; i++) {
    const t = (i / fine) * rail;
    const p = walk(t - rail / (2 * fine));
    phase.push(phase[i - 1] + rail / fine / (r0 * sizeAt(p.y)));
  }
  const total = phase[fine];
  const steps = Math.max(7, Math.round(total / 1.3));
  const lobes: Lobe[] = [];
  let cursor = 0;
  for (let i = 0; i < steps; i++) {
    const want = (i / steps) * total;
    while (cursor < fine - 1 && phase[cursor + 1] < want) cursor += 1;
    const { x, y } = walk((cursor / fine) * rail);
    let r = Math.min(r0 * sizeAt(y) * (1 - vary + 2 * vary * wobble(i, seed)), most);
    // A tall puff on a short box would hang out of the bottom.
    r = Math.min(r, x, y, w - x, h - y);
    lobes.push({ x, y, r: Math.max(r, 1.5) });
  }
  return lobes;
}

/**
 * How far the union of the puffs reaches from the middle of the box, along a
 * ray at `angle`. The puffs sit on a rect, so the shape is star-shaped around
 * the middle and a ray crosses it exactly once: taking the furthest puff the
 * ray reaches gives the outline with no bookkeeping, and a puff swallowed by
 * its neighbours simply never wins. Tracing circle-to-circle instead looked
 * right until the puffs differed in size, and then the path crossed itself
 * and drew rings inside the cloud.
 */
function reach(lobes: Lobe[], cx: number, cy: number, angle: number): number {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let far = 0;
  for (const l of lobes) {
    const px = l.x - cx;
    const py = l.y - cy;
    const along = px * ux + py * uy;
    const gap = along * along - (px * px + py * py) + l.r * l.r;
    if (gap < 0) continue;
    const t = along + Math.sqrt(gap);
    if (t > far) far = t;
  }
  return far;
}

/**
 * An SVG path for a cloud filling a `w` by `h` box. Closed, in user units,
 * with every point inside the box.
 */
export function cloudPath(w: number, h: number, opts: CloudOptions = {}): string {
  if (!(w > 0) || !(h > 0)) return "";
  const lobes = cloudLobes(w, h, opts);
  const cx = w / 2;
  const cy = h / 2;

  // Enough samples that a puff carries several, capped so the path stays small.
  const steps = Math.max(72, Math.min(240, Math.round((w + h) / 1.6)));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const d = reach(lobes, cx, cy, a);
    if (!(d > 0)) continue;
    pts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d });
  }
  if (pts.length < 8) return "";

  // Through the samples as one closed Catmull-Rom, written as cubics: the
  // curve rounds the joins between puffs a touch, which is what keeps the
  // edge from looking like a row of circles.
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n];
  const parts = [`M ${round2(pts[0].x)} ${round2(pts[0].y)}`];
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    parts.push(`C ${round2(c1x)} ${round2(c1y)} ${round2(c2x)} ${round2(c2y)} ${round2(p2.x)} ${round2(p2.y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
