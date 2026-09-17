// draw_desmos (Sept 17 2026): a graph from whatever the tutor writes for
// Desmos, checked item by item before anything is drawn. Items are
// relations and curves (y = mx + b, x^2 + y^2 < 9, f(x) = …), bare
// expressions in x, points and point lists, polygons, parametric curves,
// assignments, regressions over a table, and Desmos's histogram, dotplot and
// boxplot. Letters with no value become sliders (the tool result says so),
// the view comes from the data unless given, and a `settings` line switches
// grid, units, steps, axis labels, arrows, degrees and log scales. Items are
// never forced into "y = …" (a point list or a polygon would break). Pure;
// tested in desmos-free.test.ts.

import { autoYRange, compileLatex, graphFunction, graphLatexProblem, fitBounds, toDesmosLatex, vectorExtra } from "./desmos-graph";
import { formatNumber, parseNumber, parseXYPoints, type XYPoint } from "./board-diagrams";
import { linearFit } from "./desmos-data";
import { boundsAround, label, labelMarker, num, PENCIL_HEX, type XY } from "./desmos-primitives";
import {
  graphSettings,
  type GraphBounds,
  type GraphExpression,
  type GraphItem,
  type GraphMarker,
  type GraphSettings,
  type GraphSize,
  type GraphSlider,
  type GraphSpec,
  type GraphTable,
} from "./desmos-spec";

export const FREE_MAX_ITEMS = 8;
export const FREE_MAX_SLIDERS = 4;

export type FreeItemKind = "relation" | "expression" | "points" | "polygon" | "parametric" | "assignment" | "regression" | "stats";

const RELATION_RE = /(=|<|>|\\le(?![a-z])|\\ge(?![a-z])|\\ne(?![a-z]))/;
const RESTRICTION_RE = /\\left\\\{[\s\S]*?\\right\\\}|\{[^{}]*[<>][^{}]*\}/g;
const STATS_RE = /\\operatorname\{(histogram|dotplot|boxplot)\}/;
const KNOWN_LETTERS = new Set(["x", "y", "e"]);

/** "histogram(L, 2)" → the \operatorname form Desmos reads. */
function statsNames(latex: string): string {
  return latex.replace(/(^|[^\\a-zA-Z{])(histogram|dotplot|boxplot|polygon)\s*\(/g, "$1\\operatorname{$2}(");
}

/** Top-level tuple parts of "(a, b)", or null when it is not one tuple. */
function tupleParts(latex: string): string[] | null {
  const s = latex.trim().replace(/^\\left\(/, "(").replace(/\\right\)$/, ")");
  if (!s.startsWith("(") || !s.endsWith(")")) return null;
  let depth = 0;
  const parts: string[] = [];
  let start = 1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0 && i !== s.length - 1) return null;
    } else if (c === "," && depth === 1) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start, s.length - 1));
  return parts.length === 2 ? parts.map((p) => p.trim()) : null;
}

/** The letters an item uses as variables (x, y, t, e and Desmos's own names left out). */
export function itemLetters(latex: string): string[] {
  const bare = latex
    .replace(/\\operatorname\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/([a-zA-Z])_\{?(\d+)\}?/g, "$1$2")
    .replace(/\{|\}/g, " ");
  const out = new Set<string>();
  for (const m of bare.matchAll(/[a-zA-Z]\d*/g)) out.add(m[0]);
  // In polar form r goes with θ.
  const polar = /\\theta/.test(latex);
  return [...out].filter((v) => !KNOWN_LETTERS.has(v) && !(polar && v === "r"));
}

export function classifyDesmosLatex(latex: string): FreeItemKind {
  const s = latex.trim();
  if (/\\sim/.test(s)) return "regression";
  if (STATS_RE.test(s)) return "stats";
  if (/^\\operatorname\{polygon\}/.test(s)) return "polygon";
  if (/^\[\s*\(/.test(s)) return "points";
  const tuple = tupleParts(s);
  if (tuple) return itemLetters(s).includes("t") ? "parametric" : "points";
  const body = s.replace(RESTRICTION_RE, "");
  if (/^[a-zA-Z](_\{?\d+\}?)?\s*=/.test(body) && !/^[xy]\s*=/.test(body) && !/[xy]/.test(body.split("=").slice(1).join("="))) return "assignment";
  if (RELATION_RE.test(body)) return "relation";
  return "expression";
}

export type SliderSpec = GraphSlider;

/** "m=1:-5..5; b=0; k=2:0..10:0.5" → sliders (value, range, optional step). */
export function parseSliders(text: string | undefined): SliderSpec[] | { error: string } {
  if (!text?.trim()) return [];
  const out: SliderSpec[] = [];
  for (const raw of text.split(/[;\n]/)) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const m = /^([a-zA-Z])\s*=\s*([^:]+?)\s*(?::\s*([^:]+?)\s*\.\.\s*([^:]+?))?\s*(?::\s*(.+))?$/.exec(chunk);
    if (!m || KNOWN_LETTERS.has(m[1]) || m[1] === "t") return { error: `Slider "${chunk}" should look like "m=1:-5..5" (one letter other than x, y, e or t, a value, then an optional range and step).` };
    const value = parseNumber(m[2]);
    const min = m[3] !== undefined ? parseNumber(m[3]) : null;
    const max = m[4] !== undefined ? parseNumber(m[4]) : null;
    const step = m[5] !== undefined ? parseNumber(m[5]) : null;
    if (value === null || !Number.isFinite(value)) return { error: `Slider "${chunk}" needs a number for its value.` };
    const lo = min ?? Math.min(-10, value);
    const hi = max ?? Math.max(10, value);
    if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return { error: `Slider "${chunk}": the range must go from a smaller number to a bigger one.` };
    out.push({ name: m[1], value, min: lo, max: hi, ...(step && step > 0 ? { step } : {}) });
  }
  if (out.length > FREE_MAX_SLIDERS) return { error: `At most ${FREE_MAX_SLIDERS} sliders.` };
  return out;
}

export type TableData = { headers: string[]; rows: number[][] };

/** "x | y; 1 | 2; 3 | 5": the first row names the columns, the rest are numbers. */
export function parseTable(text: string | undefined): TableData | null | { error: string } {
  if (!text?.trim()) return null;
  const lines = text.split(/[;\n]/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { error: 'A table needs a header row and at least one row of numbers: "x | y; 1 | 2; 2 | 4".' };
  const headers = lines[0].split("|").map((h) => h.trim());
  if (headers.length !== 2) return { error: "A table has two columns here (x and y)." };
  const rows: number[][] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("|").map((c) => parseNumber(c));
    if (cells.length !== 2 || cells.some((c) => c === null || !Number.isFinite(c))) return { error: `Table row "${line}" should be two numbers, as "1 | 2".` };
    rows.push(cells as number[]);
  }
  if (rows.length > 40) return { error: "At most 40 table rows." };
  return { headers, rows };
}

export type FreeSettings = { settings: Partial<GraphSettings>; square: boolean };

const SETTING_WORDS =
  "'no grid', 'grid', 'square', 'no axes', 'no numbers', 'arrows', 'degrees', 'polar', 'log x', 'log y', 'x step=2', 'y step=0.5', 'x label=time (s)', 'y label=distance (m)'";

/** "no grid | square | x step=2 | x label=time (s)" → Desmos settings. */
export function parseFreeSettings(text: string | undefined): FreeSettings | { error: string } {
  const settings: Partial<GraphSettings> = {};
  let square = false;
  for (const raw of (text ?? "").split(/[|;\n]/)) {
    const phrase = raw.trim();
    if (!phrase) continue;
    const lower = phrase.toLowerCase();
    const kv = /^([xy])\s*(step|label)\s*[=:]\s*(.+)$/i.exec(phrase);
    if (kv) {
      const axis = kv[1].toLowerCase() as "x" | "y";
      if (kv[2].toLowerCase() === "step") {
        const step = parseNumber(kv[3]);
        if (step === null || !(step > 0)) return { error: `"${phrase}": a step is a positive number.` };
        settings[axis === "x" ? "xAxisStep" : "yAxisStep"] = step;
      } else {
        settings[axis === "x" ? "xAxisLabel" : "yAxisLabel"] = kv[3].trim().slice(0, 40);
      }
      continue;
    }
    if (lower === "no grid") settings.showGrid = false;
    else if (lower === "grid") settings.showGrid = true;
    else if (lower === "square" || lower === "equal units") square = true;
    else if (lower === "no axes") Object.assign(settings, { showXAxis: false, showYAxis: false });
    else if (lower === "no numbers") Object.assign(settings, { xAxisNumbers: false, yAxisNumbers: false });
    else if (lower === "arrows") Object.assign(settings, { xAxisArrowMode: "BOTH", yAxisArrowMode: "BOTH" });
    else if (lower === "degrees") settings.degreeMode = true;
    else if (lower === "polar") settings.polarMode = true;
    else if (lower === "log x") settings.xAxisScale = "logarithmic";
    else if (lower === "log y") settings.yAxisScale = "logarithmic";
    else return { error: `Unknown setting "${phrase}". Use any of ${SETTING_WORDS}, separated by '|'.` };
  }
  return { settings, square };
}

export type FreeInput = {
  expressions?: string;
  points?: string;
  table?: string;
  sliders?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  settings?: string;
  /** Pens (hex), handed out in order. */
  colors: string[];
  box: GraphSize;
};

export type FreeGraph = { spec: GraphSpec; described: string[] };

/** Splits on ';' and newlines outside brackets (a point list keeps its commas and semicolons). */
function splitItems(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of text) {
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth = Math.max(0, depth - 1);
    if ((c === ";" || c === "\n") && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** "(\cos t, \sin t) t=0..2\pi" → the curve and its domain. */
function parametricDomain(raw: string): { body: string; min: string; max: string } {
  const m = /^(.*\))\s*(?:for\s+)?t\s*(?:=|from|in)\s*([^.]+?)\s*(?:\.\.|to)\s*(.+)$/.exec(raw.trim());
  if (!m) return { body: raw, min: "0", max: "1" };
  return { body: m[1], min: toDesmosLatex(m[2]), max: toDesmosLatex(m[3]) };
}

/** Numbers of the points an item names: "(1,2)", "[(1,2),(3,4)]", a polygon's corners. */
function itemPoints(latex: string): XY[] {
  const out: XY[] = [];
  for (const m of latex.matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)) out.push({ x: Number(m[1]), y: Number(m[2]) });
  return out;
}

/** The item with each slider's letter replaced by its value (for sampling); function names are left alone. */
function withValues(latex: string, values: Map<string, number>): string {
  if (values.size === 0) return latex;
  return latex.replace(/(\\operatorname\{[^}]*\}|\\[a-zA-Z]+|[a-zA-Z])/g, (tok) => (tok.startsWith("\\") || !values.has(tok) ? tok : `(${num(values.get(tok) as number)})`));
}

export function buildFreeGraph(input: FreeInput): FreeGraph | { error: string } {
  const items = splitItems(input.expressions ?? "");
  const pointsIn = parseXYPoints(input.points);
  const table = parseTable(input.table);
  if (table && "error" in table) return table;
  const sliderList = parseSliders(input.sliders);
  if ("error" in sliderList) return sliderList;
  const settingsIn = parseFreeSettings(input.settings);
  if ("error" in settingsIn) return settingsIn;
  // An empty grid is just a view.
  const emptyGrid = input.xMin !== undefined && input.xMax !== undefined;
  if (items.length === 0 && pointsIn.length === 0 && !table && !emptyGrid) {
    return { error: 'Give draw_desmos something to draw: expressions ("y=2x+1; y>x"), points, a table, or for an empty grid x_min and x_max.' };
  }
  if (items.length > FREE_MAX_ITEMS) return { error: `At most ${FREE_MAX_ITEMS} expressions; split the rest into a second graph.` };

  const colors = input.colors.length > 0 ? input.colors : ["#4465e9"];
  let penIndex = 0;
  const nextColor = () => colors[penIndex++ % colors.length];
  const expressions: GraphItem[] = [];
  const described: string[] = [];
  const markers: GraphMarker[] = [];
  const sliders = [...sliderList];
  const defined = new Set<string>(sliders.map((s) => s.name));
  const curveSources: string[] = [];
  const dataPoints: XY[] = [];
  const regressionLetters = new Set<string>();

  // First pass: classify and check every item.
  const parsed = items.map((raw) => {
    const domain = parametricDomain(raw);
    const latex = statsNames(toDesmosLatex(domain.body.replace(/~/g, "\\sim ")));
    return { raw, latex, domain, kind: classifyDesmosLatex(latex) };
  });
  for (const item of parsed) {
    const problem = graphLatexProblem(item.latex.replace(/\\sim/g, "="));
    if (problem) return { error: `Could not read "${item.raw}": ${problem}. Write it in LaTeX, e.g. "y=\\frac{1}{x}", "(\\cos t,\\sin t)", "[(1,2),(3,4)]".` };
    if (item.kind === "regression") {
      if (!table) return { error: `"${item.raw}" is a regression: add a table ("x | y; 1 | 2; …") for it to fit.` };
      for (const v of itemLetters(item.latex)) if (!/^[xy]\d+$/.test(v)) regressionLetters.add(v);
    }
    if (item.kind === "assignment") defined.add(item.latex.trim()[0]);
    if (item.kind === "expression" && !/(^|[^a-zA-Z\\])x/.test(item.latex.replace(/\\[a-zA-Z]+/g, " "))) {
      return { error: `"${item.raw}" has nothing to draw (no x). A number goes in a label; a curve needs x, as "y=2x+1".` };
    }
    if (item.kind === "expression" && /(^|[^a-zA-Z\\])y/.test(item.latex.replace(/\\[a-zA-Z]+/g, " "))) {
      return { error: `"${item.raw}" uses y but has no =, < or >.` };
    }
  }

  // Letters with no value become sliders.
  const added: string[] = [];
  for (const item of parsed) {
    if (item.kind === "regression" || item.kind === "assignment") continue;
    for (const v of itemLetters(item.latex)) {
      if (v === "t" && item.kind === "parametric") continue;
      if (/\d/.test(v) || defined.has(v) || regressionLetters.has(v)) continue;
      if (v === "t") return { error: `"${item.raw}" uses t: write it as a point "(x(t), y(t))" for a parametric curve, or use another letter.` };
      if (sliders.length >= FREE_MAX_SLIDERS) return { error: `Too many letters without a value (${[...added, v].join(", ")}); give them values in sliders.` };
      sliders.push({ name: v, value: 1, min: -10, max: 10 });
      defined.add(v);
      added.push(v);
    }
  }
  const values = new Map(sliders.map((s) => [s.name, s.value]));

  sliders.forEach((s) => {
    expressions.push({
      id: `slider_${s.name}`,
      latex: `${s.name}=${num(s.value)}`,
      sliderBounds: { min: num(s.min), max: num(s.max), ...(s.step ? { step: num(s.step) } : {}) },
    });
  });
  if (sliders.length) {
    described.push(`slider${sliders.length === 1 ? "" : "s"} ${sliders.map((s) => `${s.name} = ${formatNumber(s.value)} (${formatNumber(s.min)} to ${formatNumber(s.max)})`).join(", ")}`);
    if (added.length) described.push(`${added.join(", ")} had no value, so ${added.length === 1 ? "it is a slider" : "they are sliders"} at 1`);
  }

  if (table && !("error" in table)) {
    const color = nextColor();
    const t: GraphTable = {
      type: "table",
      id: "table",
      columns: [
        { latex: "x_{1}", values: table.rows.map((r) => num(r[0])) },
        { latex: "y_{1}", values: table.rows.map((r) => num(r[1])), color, points: true, lines: false, pointSize: 10 },
      ],
    };
    expressions.push(t);
    for (const r of table.rows) dataPoints.push({ x: r[0], y: r[1] });
    described.push(`a table of ${table.rows.length} rows (${table.headers.join(", ")})`);
  }

  parsed.forEach((item, i) => {
    const id = `item${i + 1}`;
    if (item.kind === "regression") {
      // The table's columns are x₁ and y₁; "mx" is m times x, so every bare x and y changes.
      const latex = item.latex.replace(/\\[a-zA-Z]+|[xy](?!_)/g, (tok) => (tok === "x" ? "x_{1}" : tok === "y" ? "y_{1}" : tok));
      expressions.push({ id, latex, color: nextColor(), lineWidth: 2.5, lineStyle: "DASHED" });
      const fit = table && !("error" in table) && /m\s*x_\{1\}\s*\+\s*b/.test(latex.replace(/\\cdot/g, "")) ? linearFit(table.rows.map((r) => ({ x: r[0], y: r[1] }))) : null;
      described.push(fit ? `a best-fit line m = ${formatNumber(Math.round(fit.m * 100) / 100)}, b = ${formatNumber(Math.round(fit.b * 100) / 100)} (r = ${formatNumber(Math.round(fit.r * 100) / 100)})` : `the regression ${item.raw}`);
      return;
    }
    if (item.kind === "assignment") {
      expressions.push({ id, latex: item.latex });
      described.push(item.raw);
      return;
    }
    const color = nextColor();
    if (item.kind === "points" || item.kind === "polygon") {
      const expr: GraphExpression = { id, latex: item.latex, color, pointSize: 10 };
      if (item.kind === "polygon") Object.assign(expr, { fillOpacity: 0.15, lineWidth: 2.5 });
      expressions.push(expr);
      dataPoints.push(...itemPoints(item.latex));
      described.push(item.kind === "polygon" ? `the shape ${item.raw}` : `the point${/\],?$|\]\s*$/.test(item.latex) ? "s" : ""} ${item.raw}`);
      return;
    }
    if (item.kind === "parametric") {
      expressions.push({ id, latex: item.latex, color, lineWidth: 3, parametricDomain: { min: item.domain.min, max: item.domain.max } });
      dataPoints.push(...parametricSamples(withValues(item.latex, values), item.domain));
      described.push(`the curve ${item.raw}`);
      return;
    }
    if (item.kind === "stats") {
      expressions.push({ id, latex: item.latex, color, fillOpacity: 0.4, pointSize: 10 });
      // The list's values set the view: across them, and up to the tallest count.
      const list = /\[([^\]]*)\]/.exec(item.latex)?.[1] ?? "";
      const nums = list.split(",").map((v) => parseNumber(v)).filter((v): v is number => v !== null && Number.isFinite(v));
      const counts = new Map<number, number>();
      for (const v of nums) counts.set(v, (counts.get(v) ?? 0) + 1);
      const tallest = Math.max(1, ...counts.values());
      for (const v of nums) dataPoints.push({ x: v, y: 0 });
      if (nums.length) dataPoints.push({ x: nums[0], y: /boxplot/.test(item.latex) ? 2 : tallest });
      described.push(item.raw);
      return;
    }
    const shaded = /<|>|\\le|\\ge/.test(item.latex);
    expressions.push({ id, latex: item.latex, color, lineWidth: 3, ...(shaded ? { fillOpacity: 0.25 } : {}) });
    const valued = withValues(item.latex, values);
    curveSources.push(valued);
    // A circle's extent counts as data for the view.
    const circle = vectorExtra(valued)?.line;
    if (circle?.kind === "circle") dataPoints.push({ x: circle.cx - circle.r, y: circle.cy - circle.r }, { x: circle.cx + circle.r, y: circle.cy + circle.r });
    described.push(item.raw);
  });

  const pointColor = pointsIn.length ? nextColor() : "";
  pointsIn.forEach((p, i) => {
    const color = pointColor;
    expressions.push({ id: `point${i + 1}`, latex: `(${num(p.x)},${num(p.y)})`, color, pointSize: 10, ...(p.label ? { label: p.label, showLabel: true } : {}) });
    if (p.label) markers.push({ x: p.x, y: p.y, label: p.label, kind: "point" });
    dataPoints.push({ x: p.x, y: p.y });
  });
  if (pointsIn.length) described.push(`${pointsIn.length} point${pointsIn.length === 1 ? "" : "s"}`);
  if (described.length === 0) described.push("an empty grid");

  // The view: what was asked, else the data, else the curves over −10..10.
  const bounds = view(input, dataPoints, curveSources, settingsIn.square);
  if ("error" in bounds) return bounds;
  const settings = graphSettings(bounds, input.box, settingsIn.settings);

  // What the sliders are set to, in the corner.
  if (sliders.length) {
    const text = sliders.map((s) => `${s.name} = ${formatNumber(s.value)}`).join(",  ");
    const at = { x: bounds.left + (8 / input.box.w) * (bounds.right - bounds.left), y: bounds.top - (6 / input.box.h) * (bounds.top - bounds.bottom) };
    expressions.push(label("sliderValues", at, text, "below_right", { color: PENCIL_HEX }));
    markers.push(labelMarker(at, text, "below_right"));
  }

  const freePoints: XYPoint[] = [...pointsIn, ...(table && !("error" in table) ? table.rows.map((r) => ({ x: r[0], y: r[1] })) : [])];
  const spec: GraphSpec = {
    v: 2,
    kind: "free",
    size: { ...input.box },
    bounds,
    settings,
    expressions,
    markers,
    ...(sliders.length ? { sliders } : {}),
    source: {
      kind: "free",
      expressions: parsed.filter((p) => p.kind === "relation" || p.kind === "expression").map((p) => withValues(p.latex, values)),
      points: freePoints,
      xMin: bounds.left,
      xMax: bounds.right,
      yMin: bounds.bottom,
      yMax: bounds.top,
    },
  };
  return { spec, described };
}

/** Points along a parametric curve "(x(t), y(t))" over its domain. */
function parametricSamples(latex: string, domain: { min: string; max: string }): XY[] {
  const parts = tupleParts(latex);
  const lo = compileLatex(domain.min)?.({}) ?? NaN;
  const hi = compileLatex(domain.max)?.({}) ?? NaN;
  if (!parts || !Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return [];
  const fx = compileLatex(parts[0]);
  const fy = compileLatex(parts[1]);
  if (!fx || !fy) return [];
  const out: XY[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = lo + ((hi - lo) * i) / 48;
    const x = fx({ t });
    const y = fy({ t });
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

function view(input: FreeInput, points: XY[], curves: string[], square: boolean): GraphBounds | { error: string } {
  if (input.xMin !== undefined && input.xMax !== undefined && !(input.xMax > input.xMin)) return { error: '"x_max" must be greater than "x_min".' };
  if (input.yMin !== undefined && input.yMax !== undefined && !(input.yMax > input.yMin)) return { error: '"y_max" must be greater than "y_min".' };
  const pad = (lo: number, hi: number) => {
    const span = hi - lo || 2;
    return [lo - span * 0.12, hi + span * 0.12];
  };
  const hasData = points.length > 0;
  let [left, right] = hasData ? pad(Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x))) : [-10, 10];
  // The y-axis keeps 40px beside it for its numbers (closer, Desmos greys them against the edge).
  if (hasData && left > 0 && left < (right - left) * 0.5) left = -(right * 40) / (input.box.w - 40);
  left = input.xMin ?? left;
  right = input.xMax ?? right;
  if (!(right > left)) right = left + 10;
  const fns = curves.map((c) => graphFunction(c)).filter((f): f is (x: number) => number => Boolean(f));
  let bottom: number;
  let top: number;
  if (hasData) {
    [bottom, top] = pad(Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y)));
    // The x-axis keeps 34px under it for its numbers (closer, Desmos greys them against the edge).
    if (bottom > 0 && bottom < (top - bottom) * 0.5) bottom = -(top * 34) / (input.box.h - 34);
  } else {
    // Desmos's own view: square units around the x-axis, unless an x range
    // was asked for or the curves would be out of it; then y fits the curves.
    const span = ((right - left) * input.box.h) / input.box.w;
    [bottom, top] = [-span / 2, span / 2];
    const seen = (f: (x: number) => number) => {
      for (let i = 0; i <= 60; i++) {
        const y = f(left + ((right - left) * i) / 60);
        if (Number.isFinite(y) && y >= bottom && y <= top) return true;
      }
      return false;
    };
    const xGiven = input.xMin !== undefined || input.xMax !== undefined;
    if (fns.length && (xGiven || !fns.some(seen))) {
      const auto = autoYRange(fns, left, right);
      if (auto) [bottom, top] = [auto.bottom, auto.top];
    }
  }
  bottom = input.yMin ?? bottom;
  top = input.yMax ?? top;
  if (!(top > bottom)) top = bottom + 10;
  const box = { left, right, bottom, top };
  return square ? boundsAround(box, input.box, { top: 0, right: 0, bottom: 0, left: 0 }, true) : fitBounds(box, input.box.w, input.box.h, "auto");
}
