// A cloud outline for a box of any size.
//
// A handful of big circles sit round an ellipse inside the box and the path
// is the true union of them: each circle contributes the run of itself that
// no other circle covers, so the outline is real circular arcs meeting in
// real notches. The notches are the point. An earlier version sampled the
// union and smoothed the samples into one curve, which rounded the notches
// away and came out as a melted blob (Mateo, Sept 21); another traced circle
// to circle assuming neighbours, which self-intersected once the circles
// differed in size and drew rings inside the cloud.

export type CloudOptions = {
  /** Roughly how big one billow is, in px. Scales with the box by default. */
  lobe?: number;
  /** How much the billows vary in size, 0 to 1. */
  vary?: number;
  /** Changes which billow is which size, without changing the look. */
  seed?: number;
};

export type Lobe = { x: number; y: number; r: number };
/** The oval the scallops sit on: centre and half-axes. */
export type Body = { cx: number; cy: number; a: number; b: number };

// A repeatable 0..1 from an integer: the same box always draws the same cloud.
function wobble(i: number, seed: number): number {
  const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Slightly fuller on top than underneath, the way a cloud sits. Kept subtle:
// the cloud reads from clean geometry, not from randomness.
const TOP = 1.08;
const BASE = 0.86;

/** The oval body for a box. */
export function cloudBody(w: number, h: number, { lobe }: CloudOptions = {}): Body {
  const r0 = lobe ?? scallop(w, h);
  return { cx: w / 2, cy: h / 2, a: Math.max(1, w / 2 - r0), b: Math.max(1, h / 2 - r0) };
}

function scallop(w: number, h: number): number {
  return Math.max(5, Math.min(h * 0.3, w * 0.2, 36));
}

/** Where the billows sit and how big each one is. Exported for the tests. */
export function cloudLobes(w: number, h: number, { lobe, vary = 0.08, seed = 1 }: CloudOptions = {}): Lobe[] {
  // A cloud is an oval body with scallops round its edge, and the scallops
  // have to be clearly smaller than the body: at 0.4 of the height a small
  // bubble came out as two big circles glued together, a peanut with a dent
  // (Mateo, Sept 21). About 0.3 of the height leaves a real oval for them to
  // sit on; the width cap keeps a short wide bubble from getting one scallop
  // the size of its whole end.
  const r0 = lobe ?? scallop(w, h);
  const { cx, cy, a, b } = cloudBody(w, h, { lobe });

  // Walk the ring by arc length, not by angle. A flat ellipse covers far more
  // ground per degree along its sides than round its ends, so billows placed
  // at equal angles bunch at the ends and leave gaps along the top, and the
  // union falls into pieces.
  const fine = 720;
  const step: number[] = [0];
  const pointAt = (t: number) => ({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) });
  for (let i = 1; i <= fine; i++) {
    const p = pointAt(-Math.PI / 2 + ((i - 1) / fine) * TAU);
    const q = pointAt(-Math.PI / 2 + (i / fine) * TAU);
    step.push(step[i - 1] + Math.hypot(q.x - p.x, q.y - p.y));
  }
  const round = step[fine];

  const build = (n: number): Lobe[] => {
    const lobes: Lobe[] = [];
    let cursor = 0;
    for (let i = 0; i < n; i++) {
      const want = (i / n) * round;
      while (cursor < fine - 1 && step[cursor + 1] < want) cursor += 1;
      const t = -Math.PI / 2 + (cursor / fine) * TAU;
      const { x, y } = pointAt(t);
      // Straight up is 1, straight down is 0.
      const up = (1 - Math.sin(t)) / 2;
      const size = BASE + (TOP - BASE) * up;
      let r = r0 * size * (1 - vary + 2 * vary * wobble(i, seed));
      r = Math.min(r, x, y, w - x, h - y);
      lobes.push({ x, y, r: Math.max(r, 1.5) });
    }
    return lobes;
  };

  const touching = (ls: Lobe[]) =>
    ls.every((l, i) => {
      const o = ls[(i + 1) % ls.length];
      return Math.hypot(o.x - l.x, o.y - l.y) < (l.r + o.r) * 0.92;
    });

  // Spaced about 1.5 radii apart: closer and the notches between scallops
  // go shallow and the edge reads as lumpy, further and they gap. Then add
  // scallops until the ring is continuous, so the cloud is always one piece.
  let n = Math.max(5, Math.min(18, Math.round(round / (1.5 * r0))));
  let lobes = build(n);
  while (!touching(lobes) && n < 30) {
    n += 1;
    lobes = build(n);
  }
  return lobes;
}

export type Arc = { lobe: Lobe; from: number; to: number };

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

/**
 * The runs of each circle that no other circle covers: the union's outline,
 * as arcs, in order round the shape. Exported so a test can check the
 * invariant — no kept arc may lie inside another billow, which is what draws
 * a ring across the middle of the cloud when it goes wrong.
 */
export function cloudArcs(lobes: Lobe[], body?: Body): Arc[] {
  const kept: Arc[] = [];
  // Covered by another scallop, or by the body. Without the body, once the
  // scallops are small enough to leave the middle of the oval uncovered, the
  // union has a hole and the hole's rim gets traced as outline.
  const inBody = (x: number, y: number) =>
    body ? ((x - body.cx) / body.a) ** 2 + ((y - body.cy) / body.b) ** 2 < 1 - 1e-6 : false;
  const inside = (l: Lobe, x: number, y: number) =>
    inBody(x, y) || lobes.some((o) => o !== l && Math.hypot(x - o.x, y - o.y) < o.r - 1e-6);

  for (const l of lobes) {
    // Every angle at which another circle cuts this one.
    const cuts: number[] = [];
    for (const o of lobes) {
      if (o === l) continue;
      const dx = o.x - l.x;
      const dy = o.y - l.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9 || d >= l.r + o.r || d <= Math.abs(l.r - o.r)) continue;
      const mid = Math.atan2(dy, dx);
      const half = Math.acos(Math.min(1, Math.max(-1, (d * d + l.r * l.r - o.r * o.r) / (2 * d * l.r))));
      cuts.push(norm(mid - half), norm(mid + half));
    }

    if (cuts.length === 0) {
      // Untouched, so either the whole circle is the outline or it is buried.
      if (!inside(l, l.x + l.r, l.y)) kept.push({ lobe: l, from: 0, to: TAU });
      continue;
    }
    cuts.sort((p, q) => p - q);
    for (let i = 0; i < cuts.length; i++) {
      const from = cuts[i];
      const to = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + TAU;
      if (to - from < 1e-9) continue;
      const mid = (from + to) / 2;
      if (inside(l, l.x + Math.cos(mid) * l.r, l.y + Math.sin(mid) * l.r)) continue;
      kept.push({ lobe: l, from, to });
    }
  }
  if (kept.length === 0) return [];

  // Chain them end to start. Screen coordinates run y down, so walking each
  // arc from its smaller angle to its larger one goes clockwise, and the
  // whole outline comes out clockwise.
  const at = (arc: Arc, angle: number) => ({
    x: arc.lobe.x + Math.cos(angle) * arc.lobe.r,
    y: arc.lobe.y + Math.sin(angle) * arc.lobe.r,
  });
  const order: Arc[] = [kept[0]];
  const left = kept.slice(1);
  while (left.length) {
    const tail = order[order.length - 1];
    const end = at(tail, tail.to);
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < left.length; i++) {
      const start = at(left[i], left[i].from);
      const gap = Math.hypot(start.x - end.x, start.y - end.y);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    // A jump means the union is in more than one piece, and the rest is not
    // part of this outline.
    if (bestGap > 0.75) break;
    order.push(left.splice(best, 1)[0]);
  }
  return order;
}

/**
 * An SVG path for a cloud filling a `w` by `h` box. Closed, in user units,
 * with every point inside the box.
 */
export function cloudPath(w: number, h: number, opts: CloudOptions = {}): string {
  if (!(w > 0) || !(h > 0)) return "";
  const arcs = cloudArcs(cloudLobes(w, h, opts), cloudBody(w, h, opts));
  if (arcs.length === 0) return "";

  const parts: string[] = [];
  for (let i = 0; i < arcs.length; i++) {
    const { lobe: l, from, to } = arcs[i];
    const p0 = { x: l.x + Math.cos(from) * l.r, y: l.y + Math.sin(from) * l.r };
    const p1 = { x: l.x + Math.cos(to) * l.r, y: l.y + Math.sin(to) * l.r };
    if (i === 0) parts.push(`M ${r2(p0.x)} ${r2(p0.y)}`);
    const swept = to - from;
    if (swept >= TAU - 1e-9) {
      // A whole circle takes two arcs; SVG cannot draw it in one.
      parts.push(`A ${r2(l.r)} ${r2(l.r)} 0 1 1 ${r2(l.x - l.r)} ${r2(l.y)}`);
      parts.push(`A ${r2(l.r)} ${r2(l.r)} 0 1 1 ${r2(p1.x)} ${r2(p1.y)}`);
      continue;
    }
    parts.push(`A ${r2(l.r)} ${r2(l.r)} 0 ${swept > Math.PI ? 1 : 0} 1 ${r2(p1.x)} ${r2(p1.y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
