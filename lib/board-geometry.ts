// Exact figures (Oct 31 2026, Plan B step B6). In session o8rpq1 the student
// asked for the worksheet's 12 cm by 5 cm right triangle inside its rectangle;
// the illustrator drew a 12 by 10 grid with no triangle, then a rectangle with
// no diagonal, and called both a triangle. A picture language that cannot say
// "segment from (0, 0) to (12, 5)" cannot draw that lesson. So a figure is a
// spec of points in real units, segments between them, filled polygons and
// right-angle marks, drawn to scale; its parts carry their real lengths and
// areas, so a claim about the picture can be checked against the picture.
//
// Pure: the spec, the constructions the tutor asks for, and the drawing.

import { textWidth } from "./illustration/scene";

export type GeoPoint = { id: string; x: number; y: number; label?: string };
export type GeoSegment = { id: string; from: string; to: string; label?: string; role?: "side" | "diagonal" | "height"; dashed?: boolean };
export type GeoPolygon = { id: string; points: string[]; name?: string; shade?: "sky" | "green" | "none" };
export type GeoRightAngle = { at: string; from: string; to: string };
export type GeometrySpec = {
  kind: "geometry";
  title?: string;
  unit?: string;
  points: GeoPoint[];
  segments: GeoSegment[];
  polygons: GeoPolygon[];
  rightAngles: GeoRightAngle[];
};
export type Rect = { x: number; y: number; w: number; h: number };
/** A part's own shape, for marks that follow it: a segment's two ends, a polygon's corners. */
export type PartPath = { pts: Array<[number, number]>; closed: boolean };
export type RenderedGeometry = { svg: string; w: number; h: number; parts: Record<string, Rect>; aliases: Record<string, string>; paths: Record<string, PartPath> };

const FONT = "'tldraw_sans', 'IBM Plex Sans', 'Hanken Grotesk', system-ui, sans-serif";
const INK = "#1d1d21";
const SKY_FILL = "rgba(61, 156, 255, 0.16)";
const GREEN_FILL = "rgba(21, 128, 61, 0.14)";
const LABEL = "#3a3a42";
const PX = 16;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n1 = (v: number) => Math.round(v * 10) / 10;
const fmt = (v: number) => String(Math.round(v * 100) / 100);

/** The length of a segment in the figure's units. */
export function segmentLength(spec: GeometrySpec, seg: GeoSegment): number {
  const a = spec.points.find((p) => p.id === seg.from)!;
  const b = spec.points.find((p) => p.id === seg.to)!;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The area of a polygon (shoelace), in square units. */
export function polygonArea(spec: GeometrySpec, poly: GeoPolygon): number {
  const pts = poly.points.map((id) => spec.points.find((p) => p.id === id)!);
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * A right triangle with legs `base` (along the bottom) and `height` (up the
 * right side), optionally inside its rectangle with the diagonal that cuts the
 * rectangle into two of it. The vertices are (0, 0), (base, 0), (base, height).
 */
export function rightTriangle(base: number, height: number, opts: { unit?: string; inRectangle?: boolean; shadeOther?: boolean; title?: string } = {}): GeometrySpec | { error: string } {
  if (!(base > 0) || !(height > 0) || base > 1e4 || height > 1e4) return { error: "A triangle needs a positive base and height." };
  const u = opts.unit ? ` ${opts.unit}` : "";
  const points: GeoPoint[] = [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: base, y: 0 },
    { id: "C", x: base, y: height },
  ];
  const segments: GeoSegment[] = [
    { id: "base", from: "A", to: "B", label: `${fmt(base)}${u}`, role: "side" },
    { id: "height", from: "B", to: "C", label: `${fmt(height)}${u}`, role: "height" },
  ];
  const polygons: GeoPolygon[] = [{ id: "triangle", points: ["A", "B", "C"], name: "triangle", shade: "sky" }];
  if (opts.inRectangle) {
    points.push({ id: "D", x: 0, y: height });
    segments.push({ id: "top", from: "D", to: "C", role: "side" }, { id: "left", from: "A", to: "D", role: "side" });
    if (opts.shadeOther) polygons.push({ id: "other", points: ["A", "C", "D"], name: "other triangle", shade: "green" });
  }
  segments.push({ id: "diagonal", from: "A", to: "C", role: "diagonal" });
  const rightAngles: GeoRightAngle[] = [{ at: "B", from: "A", to: "C" }];
  if (opts.inRectangle) rightAngles.push({ at: "D", from: "A", to: "C" });
  return { kind: "geometry", ...(opts.title ? { title: opts.title } : {}), ...(opts.unit ? { unit: opts.unit } : {}), points, segments, polygons, rightAngles };
}

/** A rectangle w by h, corners (0,0) to (w,h), its sides labelled. */
export function rectangle(w: number, h: number, opts: { unit?: string; diagonal?: boolean; title?: string } = {}): GeometrySpec | { error: string } {
  if (!(w > 0) || !(h > 0)) return { error: "A rectangle needs a positive width and height." };
  const u = opts.unit ? ` ${opts.unit}` : "";
  const points: GeoPoint[] = [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: w, y: 0 },
    { id: "C", x: w, y: h },
    { id: "D", x: 0, y: h },
  ];
  const segments: GeoSegment[] = [
    { id: "base", from: "A", to: "B", label: `${fmt(w)}${u}`, role: "side" },
    { id: "height", from: "B", to: "C", label: `${fmt(h)}${u}`, role: "side" },
    { id: "top", from: "C", to: "D", role: "side" },
    { id: "left", from: "D", to: "A", role: "side" },
  ];
  if (opts.diagonal) segments.push({ id: "diagonal", from: "A", to: "C", role: "diagonal" });
  return { kind: "geometry", ...(opts.title ? { title: opts.title } : {}), ...(opts.unit ? { unit: opts.unit } : {}), points, segments, polygons: [{ id: "rectangle", points: ["A", "B", "C", "D"], name: "rectangle", shade: "none" }], rightAngles: [{ at: "A", from: "B", to: "D" }, { at: "B", from: "A", to: "C" }, { at: "C", from: "B", to: "D" }, { at: "D", from: "A", to: "C" }] };
}

/** Any polygon from its vertices, sides labelled in order (blank skips one). */
export function polygon(vertices: Array<[number, number]>, opts: { labels?: string[]; unit?: string; title?: string } = {}): GeometrySpec | { error: string } {
  if (vertices.length < 3 || vertices.length > 8) return { error: "A polygon needs 3 to 8 vertices." };
  if (vertices.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return { error: "Every vertex needs two numbers." };
  const ids = "ABCDEFGH".split("");
  const points = vertices.map(([x, y], i) => ({ id: ids[i], x, y }));
  const segments = points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    const label = opts.labels?.[i]?.trim();
    return { id: `${p.id}${q.id}`, from: p.id, to: q.id, ...(label ? { label } : {}), role: "side" as const };
  });
  return { kind: "geometry", ...(opts.title ? { title: opts.title } : {}), ...(opts.unit ? { unit: opts.unit } : {}), points, segments, polygons: [{ id: "shape", points: points.map((p) => p.id), shade: "sky" }], rightAngles: [] };
}

/** Draw it to scale, the longest side at most `maxW` px; the margins grow to hold every label. */
export function renderGeometry(spec: GeometrySpec, fresh: Set<string> = new Set(), maxW = 380, maxH = 260): RenderedGeometry {
  const first = layoutGeometry(spec, fresh, maxW, maxH, { left: 0, top: 0, right: 0, bottom: 0 });
  const rects = Object.values(first.parts);
  const minX = Math.min(...rects.map((r) => r.x)), minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w)), maxY = Math.max(...rects.map((r) => r.y + r.h));
  const PAD = 10;
  return layoutGeometry(spec, fresh, maxW, maxH, { left: PAD - minX, top: PAD - minY, right: maxX - first.w + PAD, bottom: maxY - first.h + PAD });
}

function layoutGeometry(spec: GeometrySpec, fresh: Set<string>, maxW: number, maxH: number, margin: { left: number; top: number; right: number; bottom: number }): RenderedGeometry {
  const xs = spec.points.map((p) => p.x);
  const ys = spec.points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const k = Math.min(maxW / spanX, maxH / spanY);
  const top = spec.title ? 26 : 0;
  const w = spanX * k + margin.left + Math.max(0, margin.right);
  const h = spanY * k + margin.top + Math.max(0, margin.bottom) + top;
  const X = (x: number) => margin.left + (x - minX) * k;
  const Y = (y: number) => top + margin.top + (maxY - y) * k;
  const paths: Record<string, PartPath> = {};
  const P = (id: string) => spec.points.find((p) => p.id === id)!;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const svg: string[] = [];
  const parts: Record<string, Rect> = {};
  const aliases: Record<string, string> = {};
  const wrap = (id: string, inner: string) => (fresh.has(id) ? `<g data-fresh="1">${inner}</g>` : inner);
  if (spec.title) svg.push(`<text x="${n1(margin.left)}" y="18" font-family="${FONT}" font-size="15" font-weight="600" fill="#5b5b66">${esc(spec.title)}</text>`);
  for (const poly of spec.polygons) {
    const pts = poly.points.map(P);
    const fill = poly.shade === "green" ? GREEN_FILL : poly.shade === "sky" ? SKY_FILL : "none";
    // Fill only: the sides are the segments, drawn next.
    if (fill !== "none") svg.push(wrap(poly.id, `<path d="M${pts.map((p) => `${n1(X(p.x))} ${n1(Y(p.y))}`).join("L")}Z" fill="${fill}" stroke="none"/>`));
    const bx = pts.map((p) => X(p.x)), by = pts.map((p) => Y(p.y));
    parts[poly.id] = { x: Math.min(...bx), y: Math.min(...by), w: Math.max(...bx) - Math.min(...bx), h: Math.max(...by) - Math.min(...by) };
    paths[poly.id] = { pts: pts.map((p) => [X(p.x), Y(p.y)] as [number, number]), closed: true };
    if (poly.name) aliases[poly.name.toLowerCase().replace(/\s+/g, "")] = poly.id;
  }
  for (const seg of spec.segments) {
    const a = P(seg.from), b = P(seg.to);
    const x1 = X(a.x), y1 = Y(a.y), x2 = X(b.x), y2 = Y(b.y);
    let inner = `<path d="M${n1(x1)} ${n1(y1)}L${n1(x2)} ${n1(y2)}" stroke="${INK}" stroke-width="${seg.role === "diagonal" ? 2.4 : 2.6}" ${seg.dashed ? 'stroke-dasharray="7 6"' : ""} stroke-linecap="round" fill="none"/>`;
    let box: Rect = { x: Math.min(x1, x2) - 5, y: Math.min(y1, y2) - 5, w: Math.abs(x2 - x1) + 10, h: Math.abs(y2 - y1) + 10 };
    if (seg.label) {
      // Outside the figure: from the side's middle, away from the figure's centre.
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      if ((mx - X(cx)) * nx + (my - Y(cy)) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const tw = textWidth(seg.label, PX);
      const lx = mx + nx * 14 + (nx < -0.3 ? -tw : nx > 0.3 ? 0 : -tw / 2);
      const ly = my + ny * 14 + (ny > 0.3 ? PX * 0.9 : ny < -0.3 ? -2 : PX * 0.35);
      inner += `<text x="${n1(lx)}" y="${n1(ly)}" font-family="${FONT}" font-size="${PX}" font-weight="500" fill="${LABEL}">${esc(seg.label)}</text>`;
      parts[`${seg.id}.label`] = { x: lx, y: ly - PX, w: tw, h: PX + 4 };
      box = { x: Math.min(box.x, lx), y: Math.min(box.y, ly - PX), w: Math.max(box.x + box.w, lx + tw) - Math.min(box.x, lx), h: Math.max(box.y + box.h, ly + 4) - Math.min(box.y, ly - PX) };
      aliases[seg.label.toLowerCase().replace(/\s+/g, "")] = seg.id;
    }
    svg.push(wrap(seg.id, inner));
    parts[seg.id] = box;
    paths[seg.id] = { pts: [[x1, y1], [x2, y2]], closed: false };
    aliases[seg.id.toLowerCase()] = seg.id;
    aliases[`${seg.from}${seg.to}`.toLowerCase()] = seg.id;
    aliases[`${seg.to}${seg.from}`.toLowerCase()] = seg.id;
  }
  for (const ra of spec.rightAngles) {
    const o = P(ra.at), a = P(ra.from), b = P(ra.to);
    const s = 12;
    const ux = X(a.x) - X(o.x), uy = Y(a.y) - Y(o.y), vx = X(b.x) - X(o.x), vy = Y(b.y) - Y(o.y);
    const ul = Math.hypot(ux, uy) || 1, vl = Math.hypot(vx, vy) || 1;
    const p1 = [X(o.x) + (ux / ul) * s, Y(o.y) + (uy / ul) * s];
    const p3 = [X(o.x) + (vx / vl) * s, Y(o.y) + (vy / vl) * s];
    const p2 = [p1[0] + (vx / vl) * s, p1[1] + (vy / vl) * s];
    svg.push(`<path d="M${n1(p1[0])} ${n1(p1[1])}L${n1(p2[0])} ${n1(p2[1])}L${n1(p3[0])} ${n1(p3[1])}" stroke="${INK}" stroke-width="1.5" fill="none"/>`);
  }
  for (const p of spec.points) {
    parts[p.id] = { x: X(p.x) - 8, y: Y(p.y) - 8, w: 16, h: 16 };
    if (p.label) {
      svg.push(`<text x="${n1(X(p.x) + 6)}" y="${n1(Y(p.y) - 6)}" font-family="${FONT}" font-size="14" fill="${LABEL}">${esc(p.label)}</text>`);
    }
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n1(w)} ${n1(h)}" width="${n1(w)}" height="${n1(h)}">${svg.join("")}</svg>`, w, h, parts, aliases, paths };
}

/** What the figure shows, as facts: "base AB 12 cm; height BC 5 cm; diagonal AC 13 cm; triangle ABC area 30 cm²". */
export function geometryFacts(spec: GeometrySpec): string[] {
  const u = spec.unit ?? "";
  // Where each corner sits, in words a tutor says ("bottom left"): on Oct 31
  // the tutor described the drawn diagonal as running the other way.
  const xs = spec.points.map((p) => p.x);
  const ys = spec.points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const where = (id: string) => {
    const p = spec.points.find((q) => q.id === id);
    if (!p) return id;
    const v = p.y === y1 ? "top" : p.y === y0 ? "bottom" : "middle";
    const h = p.x === x0 ? "left" : p.x === x1 ? "right" : "middle";
    return `${id} (${v} ${h}, ${fmt(p.x)}, ${fmt(p.y)})`;
  };
  const facts = spec.points.length ? [`corners: ${spec.points.map((p) => where(p.id)).join(", ")}`] : [];
  for (const s of spec.segments) facts.push(`${s.role === "diagonal" ? "diagonal" : s.role === "height" ? "height" : "side"} ${s.from}${s.to} ${fmt(segmentLength(spec, s))}${u ? ` ${u}` : ""}${s.role === "diagonal" ? `, from ${where(s.from).replace(/^\w+ \(([^,]+),.*$/, "$1")} to ${where(s.to).replace(/^\w+ \(([^,]+),.*$/, "$1")}` : ""}`);
  for (const p of spec.polygons) facts.push(`${p.name ?? p.id} ${p.points.join("")} area ${fmt(polygonArea(spec, p))}${u ? ` ${u}²` : ""}${p.shade && p.shade !== "none" ? ` (shaded ${p.shade})` : ""}`);
  for (const r of spec.rightAngles) facts.push(`right angle at ${r.at}`);
  return facts;
}
