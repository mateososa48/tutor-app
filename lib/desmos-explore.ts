// Explore (Sept 17 2026): the student opens a board graph as a live Desmos
// calculator, drags its sliders and points, zooms, and types lines of their
// own; the tutor hears what changed, and the board graph takes the student's
// version when they close it. This module is the pure part: which graphs can
// be explored, what the live calculator gets (scaffolding kept on the graph
// but out of the list, a graph of points turned into named, draggable points
// its shape follows), what the student changed, in words, and the board's
// spec after the change. Tested in desmos-explore.test.ts.

import { formatNumber } from "./board-diagrams";
import { latexToPlain } from "./latex-plain";
import { label as labelItem, labelMarker, num } from "./desmos-primitives";
import { isGraphTable, type GraphBounds, type GraphExpression, type GraphItem, type GraphMarker, type GraphSize, type GraphSpec } from "./desmos-spec";

// Number lines, charts, figures and data plots are built from pieces laid out
// in pixels; a live calculator would only let the student pull them apart.
const EXPLORABLE = new Set(["function", "points", "axes", "free"]);

export function isExplorable(spec: GraphSpec | null | undefined): spec is GraphSpec {
  return Boolean(spec && EXPLORABLE.has(spec.kind));
}

/** Slider names, in order. */
function sliderNames(spec: GraphSpec): string[] {
  return spec.expressions.filter((e) => !isGraphTable(e) && e.id.startsWith("slider_")).map((e) => e.id.slice("slider_".length));
}

/** The points a student can drag: a graph of points, or the loose points of draw_desmos. */
function draggable(spec: GraphSpec): GraphMarker[] {
  if (spec.kind === "points") return spec.markers.filter((m) => m.kind !== "label");
  if (spec.kind === "free") return spec.markers.filter((m) => m.kind === "point");
  return [];
}

/** The names of the points a student can drag ("" for an unnamed one). */
function dragNames(spec: GraphSpec): string[] {
  if (spec.kind === "free") {
    return spec.expressions.filter((e): e is GraphExpression => !isGraphTable(e) && /^point\d+$/.test(e.id)).map((e) => e.label ?? "");
  }
  return draggable(spec).map((m) => m.label);
}

/** Whether the graph has something to drag (sliders or points), beyond zooming. */
export function hasExploreControls(spec: GraphSpec): boolean {
  return sliderNames(spec).length > 0 || dragNames(spec).length > 0;
}

const listWords = (words: string[]) =>
  words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** The panel's one line to the student: what they can do with this graph. */
export function exploreInvite(spec: GraphSpec): string {
  const sliders = sliderNames(spec);
  if (sliders.length) {
    return `Drag the ${listWords(sliders)} slider${sliders.length > 1 ? "s" : ""} to see what ${sliders.length > 1 ? "they change" : "it changes"}.`;
  }
  const points = dragNames(spec);
  const names = points.filter(Boolean);
  if (names.length) return `Drag ${listWords(names)} to move ${names.length > 1 ? "them" : "it"}.`;
  if (points.length) return `Drag the point${points.length > 1 ? "s" : ""} to move ${points.length > 1 ? "them" : "it"}.`;
  return "Zoom in and out, or type a line of your own.";
}

/**
 * Bounds for a live graph paper `paper` px big that show all of `bounds`
 * with the board picture's proportions, so a slope looks as steep as on the
 * board and a circle stays round. The extra room is shared on both sides.
 */
export function fitExploreBounds(bounds: GraphBounds, board: GraphSize, paper: GraphSize): GraphBounds {
  const bw = bounds.right - bounds.left;
  const bh = bounds.top - bounds.bottom;
  if (!(bw > 0 && bh > 0 && board.w > 0 && board.h > 0 && paper.w > 0 && paper.h > 0)) return bounds;
  // Math units per pixel on the board, kept on the live paper.
  const ux = bw / board.w;
  const uy = bh / board.h;
  const scale = Math.max(bw / (paper.w * ux), bh / (paper.h * uy));
  const w = paper.w * ux * scale;
  const h = paper.h * uy * scale;
  const cx = (bounds.left + bounds.right) / 2;
  const cy = (bounds.top + bounds.bottom) / 2;
  return { left: cx - w / 2, right: cx + w / 2, bottom: cy - h / 2, top: cy + h / 2 };
}

/** What the student can do with a graph, for the tutor's board summary. */
export function exploreHint(spec: GraphSpec): string {
  const sliders = sliderNames(spec);
  if (sliders.length) return `sliders ${sliders.join(", ")}`;
  const points = dragNames(spec);
  if (points.some(Boolean)) return `points ${points.filter(Boolean).join(", ")} can be dragged`;
  if (points.length) return `${points.length} point${points.length > 1 ? "s" : ""} can be dragged`;
  return "zoom and add lines";
}

const pointId = (i: number) => `pt${i + 1}`;
const pointName = (i: number) => `P_{${i + 1}}`;

/** Ids of items that are visible in the student's expression list. */
function isVisibleItem(item: GraphItem): boolean {
  if (isGraphTable(item)) return true;
  return item.id.startsWith("slider_") || /^(curve|item|student)\d+$/.test(item.id);
}

/** The live calculator's items for a graph. */
export function exploreItems(spec: GraphSpec): GraphItem[] {
  const out: GraphItem[] = [];
  if (spec.kind === "points") {
    const pts = draggable(spec);
    const first = spec.expressions.find((e): e is GraphExpression => !isGraphTable(e) && /^point\d+$/.test(e.id));
    const color = first?.color ?? "#4465e9";
    pts.forEach((p, i) => {
      out.push({ id: pointId(i), latex: `${pointName(i)}=(${num(p.x)},${num(p.y)})`, color, pointSize: 12, dragMode: "XY", ...(p.label ? { label: p.label, showLabel: true } : {}) });
    });
    const shape = spec.expressions.find((e): e is GraphExpression => !isGraphTable(e) && e.id === "shape");
    if (shape && pts.length >= 2) {
      out.push({ ...shape, latex: `\\operatorname{polygon}(${pts.map((_, i) => pointName(i)).join(",")})` });
    }
    return out;
  }
  const loose = new Set(spec.kind === "free" ? spec.expressions.filter((e) => !isGraphTable(e) && /^point\d+$/.test(e.id)).map((e) => e.id) : []);
  for (const item of spec.expressions) {
    // The slider caption is fixed text; the live calculator shows the sliders themselves.
    if (item.id === "sliderValues") continue;
    if (!isGraphTable(item) && loose.has(item.id)) {
      out.push({ ...item, dragMode: "XY" });
    } else if (isVisibleItem(item)) {
      out.push(item);
    } else {
      out.push({ ...item, secret: true });
    }
  }
  return out;
}

/** An expression as the live calculator reports it. */
export type ExploreExpressionState = { id: string; type?: string; latex?: string };

export type ExplorePoint = { x: number; y: number; label: string };

/** Where a graph stands: slider values, dragged points, and the lines in the list. */
export type ExploreSnapshot = {
  sliders: Record<string, number>;
  points: Record<string, ExplorePoint>;
  lines: Record<string, string>;
};

const POINT_RE = /\(\s*(-?[\d.]+(?:e-?\d+)?)\s*,\s*(-?[\d.]+(?:e-?\d+)?)\s*\)\s*$/;

/** Reads a snapshot from the calculator's expressions (or the graph's own, before any change). */
export function snapshotOf(list: ExploreExpressionState[], spec: GraphSpec): ExploreSnapshot {
  const snap: ExploreSnapshot = { sliders: {}, points: {}, lines: {} };
  const labels = new Map<string, string>();
  if (spec.kind === "points") draggable(spec).forEach((m, i) => labels.set(pointId(i), m.label));
  if (spec.kind === "free") {
    for (const e of spec.expressions) if (!isGraphTable(e) && /^point\d+$/.test(e.id)) labels.set(e.id, e.label ?? "");
  }
  const base = new Map(exploreItems(spec).map((i) => [i.id, i]));
  for (const e of list) {
    if (e.type && e.type !== "expression") continue;
    const latex = (e.latex ?? "").trim();
    if (!latex) continue;
    if (e.id.startsWith("slider_")) {
      const value = Number(/=\s*(-?[\d.]+(?:e-?\d+)?)\s*$/.exec(latex)?.[1]);
      if (Number.isFinite(value)) snap.sliders[e.id.slice("slider_".length)] = value;
      continue;
    }
    if (labels.has(e.id)) {
      const m = POINT_RE.exec(latex);
      if (m) snap.points[e.id] = { x: Number(m[1]), y: Number(m[2]), label: labels.get(e.id) ?? "" };
      continue;
    }
    const known = base.get(e.id);
    if (known && !isGraphTable(known) && known.secret) continue;
    snap.lines[e.id] = latex;
  }
  return snap;
}

/** The graph's own starting point, before the student changes anything. */
export function initialSnapshot(spec: GraphSpec): ExploreSnapshot {
  const items = exploreItems(spec).filter((i): i is GraphExpression => !isGraphTable(i));
  return snapshotOf(items.map((i) => ({ id: i.id, type: "expression", latex: i.latex })), spec);
}

export type ExploreChange =
  | { kind: "slider"; name: string; from: number; to: number }
  | { kind: "point"; id: string; label: string; from: ExplorePoint; to: ExplorePoint }
  | { kind: "added"; latex: string }
  | { kind: "removed"; latex: string }
  | { kind: "edited"; from: string; to: string };

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

export function diffExplore(before: ExploreSnapshot, after: ExploreSnapshot): ExploreChange[] {
  const out: ExploreChange[] = [];
  for (const [name, from] of Object.entries(before.sliders)) {
    const to = after.sliders[name];
    if (to !== undefined && !close(from, to)) out.push({ kind: "slider", name, from, to });
  }
  for (const [id, from] of Object.entries(before.points)) {
    const to = after.points[id];
    if (to && (!close(from.x, to.x) || !close(from.y, to.y))) out.push({ kind: "point", id, label: from.label, from, to });
  }
  for (const [id, latex] of Object.entries(before.lines)) {
    const now = after.lines[id];
    if (now === undefined) out.push({ kind: "removed", latex });
    else if (now !== latex) out.push({ kind: "edited", from: latex, to: now });
  }
  for (const [id, latex] of Object.entries(after.lines)) {
    if (!(id in before.lines)) out.push({ kind: "added", latex });
  }
  return out;
}

const said = (latex: string) => latexToPlain(latex).replace(/\s+/g, " ").trim();
const at = (p: { x: number; y: number }) => `(${formatNumber(round(p.x))}, ${formatNumber(round(p.y))})`;
const round = (v: number) => Math.round(v * 100) / 100;

/** The changes in words, for the tutor: "moved m from 1 to 3; moved A to (2, 5); added y = 3x". */
export function describeExploreChanges(changes: ExploreChange[]): string {
  const parts = changes.map((c) => {
    if (c.kind === "slider") return `moved ${c.name} from ${formatNumber(round(c.from))} to ${formatNumber(round(c.to))}`;
    if (c.kind === "point") return `moved ${c.label || "a point"} from ${at(c.from)} to ${at(c.to)}`;
    if (c.kind === "added") return `added ${said(c.latex)}`;
    if (c.kind === "removed") return `removed ${said(c.latex)}`;
    return `changed ${said(c.from)} to ${said(c.to)}`;
  });
  const text = parts.join("; ");
  return text.length > 320 ? `${text.slice(0, 317).trimEnd()}…` : text;
}

/** The board's graph after the student's changes: their slider values, points and lines, remembered in studentState. */
export function applyExploreSnapshot(spec: GraphSpec, snap: ExploreSnapshot): GraphSpec {
  const start = initialSnapshot(spec);
  const changes = diffExplore(start, snap);
  if (changes.length === 0) return spec;
  let expressions: GraphItem[] = spec.expressions.map((item) => {
    if (isGraphTable(item)) return item;
    const name = item.id.startsWith("slider_") ? item.id.slice("slider_".length) : null;
    if (name && snap.sliders[name] !== undefined) return { ...item, latex: `${name}=${num(snap.sliders[name])}` };
    if (spec.kind === "free" && snap.points[item.id]) {
      const p = snap.points[item.id];
      return { ...item, latex: `(${num(p.x)},${num(p.y)})` };
    }
    if (item.id in snap.lines && snap.lines[item.id] !== item.latex) return { ...item, latex: snap.lines[item.id] };
    return item;
  });
  let markers = spec.markers;
  if (spec.kind === "points") {
    const moved = draggable(spec).map((m, i) => {
      const p = snap.points[pointId(i)];
      return p ? { ...m, x: p.x, y: p.y } : m;
    });
    markers = [...moved, ...spec.markers.filter((m) => m.kind === "label")];
    const coords = moved.map((m) => `(${num(m.x)},${num(m.y)})`);
    let k = 0;
    expressions = expressions.map((item) => {
      if (isGraphTable(item)) return item;
      if (item.id === "shape") return { ...item, latex: `\\operatorname{polygon}(${coords.join(",")})` };
      if (/^point\d+$/.test(item.id)) return { ...item, latex: coords[k++] ?? item.latex };
      return item;
    });
  }
  if (spec.kind === "free") {
    markers = spec.markers.map((m) => {
      const hit = Object.values(snap.points).find((p) => p.label && p.label === m.label);
      return hit ? { ...m, x: hit.x, y: hit.y } : m;
    });
  }
  // Removed lines go; lines the student added join the graph.
  const removed = new Set(changes.filter((c) => c.kind === "removed").map((c) => (c as { latex: string }).latex));
  expressions = expressions.filter((item) => isGraphTable(item) || !removed.has(item.latex));
  const added = changes.filter((c): c is Extract<ExploreChange, { kind: "added" }> => c.kind === "added");
  // In pencil, like everything else the student writes on the board, and
  // numbered after lines kept from an earlier visit.
  const taken = new Set(expressions.map((e) => e.id));
  let n = 1;
  for (const c of added) {
    while (taken.has(`student${n}`)) n++;
    taken.add(`student${n}`);
    expressions.push({ id: `student${n}`, latex: c.latex, color: "#5b5b66", lineWidth: 3 });
  }
  // The slider caption shows the values the board now draws.
  const names = sliderNames(spec);
  if (names.length) {
    const caption = expressions.find((e) => e.id === "sliderValues");
    if (caption && !isGraphTable(caption)) {
      const text = names.map((n) => `${n} = ${formatNumber(round(snap.sliders[n] ?? 0))}`).join(",  ");
      const place = /^\((-?[\d.]+),(-?[\d.]+)\)$/.exec(caption.latex);
      const spot = place ? { x: Number(place[1]), y: Number(place[2]) } : { x: spec.bounds.left, y: spec.bounds.top };
      const fresh = labelItem("sliderValues", spot, text, "below_right", { color: caption.color ?? "#5b5b66" });
      expressions = expressions.map((e) => (e.id === "sliderValues" ? fresh : e));
      markers = [...markers.filter((m) => m.label !== caption.label), labelMarker(spot, text, "below_right")];
    }
  }
  return {
    ...spec,
    expressions,
    markers,
    ...(spec.sliders ? { sliders: spec.sliders.map((s) => (snap.sliders[s.name] !== undefined ? { ...s, value: snap.sliders[s.name] } : s)) } : {}),
    studentState: { summary: joinSummaries(spec.studentState?.summary, describeExploreChanges(changes)) },
  };
}

/** Earlier visits' changes, then this one's; the newest kept when it runs long. */
function joinSummaries(before: string | undefined, now: string): string {
  const all = [before, now].filter(Boolean).join("; ");
  return all.length > 320 ? `…${all.slice(-319).trimStart()}` : all;
}
