// Drawing pieces for pictures built on Desmos (Sept 17 2026): number lines,
// bar charts, figures and data plots are Desmos expressions laid out in math
// coordinates, with a few things sized in picture pixels (arrowheads, ticks,
// right-angle marks, label offsets). Checked against Desmos v1.12 on the board
// (see AGENTS.md "Desmos facts"): a point list with `lines: true` is a
// polyline (`segment()` does not exist here), list broadcasting draws many
// ticks in one expression, a label survives `pointSize: 0.01`, and a label in
// backticks is typeset (a stacked fraction). Pure; tested in
// desmos-primitives.test.ts.

import type { GraphBounds, GraphExpression, GraphMarker, GraphSize, LabelOrientation } from "./desmos-spec";

export const INK_HEX = "#121215";
/**
 * Our labels are set 1.25 times Desmos's size, so they read like the board's
 * own 18px text (Desmos's are about 14px, and its fontSize option does not
 * reach screenshots).
 */
export const WORD = 1.25;
/** The student's pencil and quiet labels (components/board/board-theme.ts). */
export const PENCIL_HEX = "#5b5b66";

export type XY = { x: number; y: number };

/** A number as Desmos LaTeX: rounded, never "-0", never in exponent form. */
export function num(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  if (Object.is(r, -0) || Math.abs(r) < 1e-9) return "0";
  const s = String(r);
  if (!/e/i.test(s)) return s;
  // Whole numbers past 1e21 print in exponent form even with toFixed.
  return Math.abs(r) >= 1 ? BigInt(Math.round(r)).toString() : r.toFixed(6).replace(/\.?0+$/, "");
}

export function pointLatex(p: XY): string {
  return `(${num(p.x)},${num(p.y)})`;
}

/** Math units per picture pixel, for pieces sized in pixels. */
export type Frame = { bounds: GraphBounds; size: GraphSize; ux: number; uy: number };

export function frameOf(bounds: GraphBounds, size: GraphSize): Frame {
  return { bounds, size, ux: (bounds.right - bounds.left) / size.w, uy: (bounds.top - bounds.bottom) / size.h };
}

/**
 * Bounds that show `box` (math units) inside a picture of `size` with
 * `margin` pixels on each side (top, right, bottom, left); `equal` keeps one
 * unit the same length both ways, centring the spare room.
 */
export function boundsAround(
  box: GraphBounds,
  size: GraphSize,
  margin: { top: number; right: number; bottom: number; left: number },
  equal: boolean,
): GraphBounds {
  const innerW = Math.max(1, size.w - margin.left - margin.right);
  const innerH = Math.max(1, size.h - margin.top - margin.bottom);
  let ux = Math.max(1e-9, box.right - box.left) / innerW;
  let uy = Math.max(1e-9, box.top - box.bottom) / innerH;
  let extraX = 0;
  let extraY = 0;
  if (equal) {
    const u = Math.max(ux, uy);
    extraX = (u * innerW - (box.right - box.left)) / 2;
    extraY = (u * innerH - (box.top - box.bottom)) / 2;
    ux = u;
    uy = u;
  }
  return {
    left: box.left - extraX - margin.left * ux,
    right: box.right + extraX + margin.right * ux,
    bottom: box.bottom - extraY - margin.bottom * uy,
    top: box.top + extraY + margin.top * uy,
  };
}

/** The smallest box around some points. */
export function boxOf(points: XY[]): GraphBounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
}

type Stroke = { color: string; width?: number; style?: GraphExpression["lineStyle"]; opacity?: number };

function strokeProps(s: Stroke): Partial<GraphExpression> {
  return {
    color: s.color,
    lineWidth: s.width ?? 2.5,
    ...(s.style && s.style !== "SOLID" ? { lineStyle: s.style } : {}),
    ...(s.opacity !== undefined ? { lineOpacity: s.opacity } : {}),
  };
}

/** Straight pieces through the points, in order (a point list drawn as lines). */
export function polyline(id: string, points: XY[], stroke: Stroke): GraphExpression {
  return { id, latex: `[${points.map(pointLatex).join(",")}]`, ...strokeProps(stroke), lines: true, points: false };
}

export function segment(id: string, a: XY, b: XY, stroke: Stroke): GraphExpression {
  return polyline(id, [a, b], stroke);
}

export function polygon(id: string, points: XY[], opts: { color: string; fill?: number; width?: number }): GraphExpression {
  return {
    id,
    latex: `\\operatorname{polygon}(${points.map(pointLatex).join(",")})`,
    color: opts.color,
    fillOpacity: opts.fill ?? 0,
    lineWidth: opts.width ?? 2.5,
  };
}

export function dot(id: string, p: XY, opts: { color: string; open?: boolean; size?: number }): GraphExpression {
  return { id, latex: pointLatex(p), color: opts.color, pointSize: opts.size ?? 11, ...(opts.open ? { pointStyle: "OPEN" as const } : {}) };
}

/** Several dots at once: `(x, [y1, y2, …])`. */
export function dotStack(id: string, x: number, ys: number[], opts: { color: string; size?: number }): GraphExpression {
  return { id, latex: `(${num(x)},[${ys.map(num).join(",")}])`, color: opts.color, pointSize: opts.size ?? 11 };
}

/** Typeset text for a label: fractions stack, symbols render. */
export function mathText(latex: string): string {
  return `\`${latex}\``;
}

/** "3/4" → a stacked fraction; "-1/2" keeps its sign in front; anything else as written. */
export function tickText(text: string): string {
  const m = /^(-?)(\d+)\/(\d+)$/.exec(text.trim());
  return m ? mathText(`${m[1]}\\frac{${m[2]}}{${m[3]}}`) : text;
}

/** Words set beside a spot, with no dot of their own (a dot of size 0.01 keeps its label). */
export function label(
  id: string,
  at: XY,
  text: string,
  orientation: LabelOrientation,
  opts: { color: string; size?: number },
): GraphExpression {
  return {
    id,
    latex: pointLatex(at),
    color: opts.color,
    pointSize: 0.01,
    label: text,
    showLabel: true,
    labelOrientation: orientation,
    ...((opts.size ?? WORD) !== 1 ? { labelSize: String(opts.size ?? WORD) } : {}),
  };
}

/** The label's marker, so the tutor can highlight its words (sized as drawn, at `scale`). */
export function labelMarker(at: XY, text: string, orientation: LabelOrientation, scale = WORD): GraphMarker {
  const px = labelSizePx(text, scale);
  return { x: at.x, y: at.y, label: plainLabel(text), kind: "label", orientation, w: Math.round(px.w), h: Math.round(px.h) };
}

/** What a label says, as the tutor would type it: "`\frac{3}{4}`" → "3/4". */
export function plainLabel(text: string): string {
  const m = /^`(-?)\\frac\{([^{}]+)\}\{([^{}]+)\}`$/.exec(text);
  if (m) return `${m[1]}${m[2]}/${m[3]}`;
  return text.replace(/^`|`$/g, "");
}

/** How big a label is in pixels (measured at Desmos's size: 6.8px a character, 17px a line; a stacked fraction is taller). */
export function labelSizePx(text: string, scale = WORD): { w: number; h: number } {
  const plain = plainLabel(text);
  const frac = /^`-?\\frac/.test(text);
  if (frac) {
    const [top = "", bottom = ""] = plain.replace(/^-/, "").split("/");
    return { w: (Math.max(top.length, bottom.length) * 6.8 + (plain.startsWith("-") ? 8 : 0) + 4) * scale, h: 30 * scale };
  }
  return { w: Math.max(6, plain.length * 6.8) * scale, h: 17 * scale };
}

/** The label orientation that points along `angle` (radians, 0 = right, y up). */
export function orientationFor(angle: number): LabelOrientation {
  const names: LabelOrientation[] = ["right", "above_right", "above", "above_left", "left", "below_left", "below", "below_right"];
  const k = Math.round(((angle % (2 * Math.PI)) + 2 * Math.PI) / (Math.PI / 4)) % 8;
  return names[k];
}

/** A filled arrowhead whose tip is at `tip`, pointing along `angle` (radians in picture space, y up). */
export function arrowhead(id: string, tip: XY, angle: number, frame: Frame, opts: { color: string; length?: number; width?: number }): GraphExpression {
  const L = opts.length ?? 11;
  const W = opts.width ?? 5.5;
  const back = { x: -Math.cos(angle) * L, y: -Math.sin(angle) * L };
  const side = { x: -Math.sin(angle) * W, y: Math.cos(angle) * W };
  const corner = (sign: number): XY => ({ x: tip.x + (back.x + sign * side.x) * frame.ux, y: tip.y + (back.y + sign * side.y) * frame.uy });
  return polygon(id, [tip, corner(1), corner(-1)], { color: opts.color, fill: 1, width: 1 });
}

/** Short upright ticks at each x, `half` pixels above and below `y`. */
export function ticks(id: string, xs: number[], y: number, half: number, frame: Frame, stroke: Stroke): GraphExpression {
  const h = half * frame.uy;
  return { id, latex: `x=[${xs.map(num).join(",")}]\\left\\{${num(y - h)}\\le y\\le ${num(y + h)}\\right\\}`, ...strokeProps(stroke) };
}

/** Horizontal lines at each y from x0 to x1 (gridlines). */
export function hLines(id: string, ys: number[], x0: number, x1: number, stroke: Stroke): GraphExpression {
  return { id, latex: `y=[${ys.map(num).join(",")}]\\left\\{${num(x0)}\\le x\\le ${num(x1)}\\right\\}`, ...strokeProps(stroke) };
}

/** An arc of `radius` pixels around `center` from angle a0 to a1 (radians, y up). */
export function arc(id: string, center: XY, radius: number, a0: number, a1: number, frame: Frame, stroke: Stroke): GraphExpression {
  const rx = radius * frame.ux;
  const ry = radius * frame.uy;
  return {
    id,
    latex: `(${num(center.x)}+${num(rx)}\\cos(t),${num(center.y)}+${num(ry)}\\sin(t))`,
    ...strokeProps(stroke),
    parametricDomain: { min: num(Math.min(a0, a1)), max: num(Math.max(a0, a1)) },
  };
}

/**
 * A hop from x = a to x = b over a line at height `y`: an arch `height`
 * pixels tall with an arrowhead at b. Returns the arch, the head, and where
 * its label goes (the top of the arch).
 */
export function hop(id: string, a: number, b: number, y: number, height: number, frame: Frame, color: string): { parts: GraphExpression[]; top: XY } {
  const k = height * frame.uy;
  const arch: GraphExpression = {
    id,
    latex: `(${num(a)}+${num(b - a)}t,${num(y)}+${num(k)}\\sin(\\pi t))`,
    color,
    lineWidth: 2.5,
    parametricDomain: { min: "0", max: "1" },
  };
  // The arch's direction where it lands, in pixels.
  const angle = Math.atan2(-height * Math.PI, (b - a) / frame.ux);
  const head = arrowhead(`${id}Head`, { x: b, y }, angle, frame, { color });
  return { parts: [arch, head], top: { x: (a + b) / 2, y: y + k } };
}
