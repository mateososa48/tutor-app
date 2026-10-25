// Board items: every successful tool call that puts something on the board
// gets a short id (b1, b2, …) the tutor can refer back to: point at it, ring
// it, erase it. Pure helpers here; the registry itself lives in TldrawCore.

import { latexToPlain } from "./latex-plain";
export type BoardItem = {
  id: string;
  tool: string;
  label: string;
  shapeIds: string[];
  eqItemIds: string[];
  owner: "tutor" | "student";
  createdAt: number;
  /** What the call wrote or drew, fingerprinted (board-content-rules), so it is not written twice. */
  content?: string;
  /** The live tool call that made it. */
  callId?: string;
};

export type ItemBounds = { x: number; y: number; w: number; h: number };

// Tool name → the word a tutor would use for it in a board summary.
const KIND_BY_TOOL: Record<string, string> = {
  // Board v2 (Sept 22 2026)
  start_problem: "problem",
  section: "subheading",
  write_step: "step",
  write_example: "worked example",
  ask: "question",
  note: "note",
  rule: "rule",
  start_new_problem: "heading",
  start_board_section: "subheading",
  add_problem_setup: "setup box",
  add_equation_sequence: "equation lines",
  draw_equation_step: "equation line",
  add_text_note: "note",
  add_callout: "callout",
  add_student_attempt: "student attempt",
  highlight_step: "highlight",
  cross_out_step: "cross-out",
  draw_fraction: "fraction",
  add_number_line: "number line",
  draw_figure: "figure",
  draw_angle: "angle",
  draw_array: "array",
  add_area_model: "area model",
  draw_balance: "balance",
  draw_bar_chart: "bar chart",
  add_table: "table",
  add_coordinate_axes: "axes",
  plot_points: "points",
  add_worked_example_box: "worked example",
  add_function_graph: "graph",
  draw_desmos: "graph",
  draw_data_plot: "data plot",
  add_two_column_comparison: "comparison",
  add_vector_diagram: "vector diagram",
  add_process_map: "process map",
  draw_sketch: "sketch",
  draw_tape_diagram: "tape diagram",
  draw_grid: "grid",
  draw_illustration: "illustration",
  write_vertical: "stacked arithmetic",
  draw_long_division: "long division",
  draw_transversal: "transversal",
  draw_icons: "icons",
  circle_item: "ring",
  highlight: "highlight",
};

export function itemKind(tool: string): string {
  return KIND_BY_TOOL[tool] ?? tool.replace(/^(add|draw)_/, "").replaceAll("_", " ");
}

// Turn a tool's result sentence into a label short enough to list.
export function itemLabelFrom(message: string | null | undefined, fallback: string): string {
  const raw = (message ?? "").replace(/\s+/g, " ").trim().replace(/[.]+$/, "");
  const text = raw
    .replace(/^(Cleared the board and wrote the heading|Cleared the board and wrote|Wrote the line|Wrote|Drew|Student's attempt written in their hand\.?)\s*/i, "")
    .replace(/^Student's attempt ("[^"]*") written in their hand/i, "$1")
    .replace(/\s*\(item b\d+\)$/, "")
    .trim();
  const label = text || fallback;
  if (label.length <= 90) return label;
  // Keep the caption when trimming: it is the name the tutor will use.
  const cap = /captioned "([^"]{1,60})"/.exec(label);
  if (cap) {
    const rest = label.replace(/,?\s*captioned "[^"]*"/, "").trim();
    const room = 90 - cap[1].length - 3;
    return `${cap[1]}: ${rest.length > room ? `${rest.slice(0, Math.max(0, room - 1)).trimEnd()}…` : rest}`;
  }
  return `${label.slice(0, 87).trimEnd()}…`;
}

export function isHeadingItem(item: BoardItem): boolean {
  return item.tool === "start_new_problem" || item.tool === "start_board_section" || item.tool === "start_problem" || item.tool === "section";
}

// "b3", "3", "B3 ", "item b3" all mean item b3; otherwise match label text,
// newest first; "last"/"latest" means the newest non-heading item.
export function resolveItemTarget(items: BoardItem[], target: string): BoardItem | null {
  const t = target.trim().toLowerCase();
  if (!t) return null;
  if (t === "last" || t === "latest" || t === "newest") {
    for (let i = items.length - 1; i >= 0; i--) if (!isHeadingItem(items[i])) return items[i];
    return items[items.length - 1] ?? null;
  }
  // "b3" / "item 3" is an id; a bare number may also be what a student wrote.
  const idMatch = t.match(/^(?:item\s*)?b?(\d+)$/);
  if (idMatch) {
    const byId = items.find((item) => item.id === `b${idMatch[1]}`);
    if (byId && (t.startsWith("b") || t.startsWith("item"))) return byId;
    if (byId && !items.some((item) => item.label.toLowerCase().includes(t))) return byId;
  }
  const squash = (v: string) => v.toLowerCase().replace(/\s+/g, "");
  const ts = squash(t);
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.label.toLowerCase().includes(t) || itemKind(item.tool) === t || (ts.length >= 2 && squash(item.label).includes(ts))) return item;
  }
  // The tutor's own LaTeX ("(-3)^2 = 9") against the plain label "(-3)² = 9"
  // (Sept 26 2026: a ring on a line the tutor had just written was refused).
  const tm = normalizeForMatch(target);
  if (tm.length >= 2) {
    for (let i = items.length - 1; i >= 0; i--) if (normalizeForMatch(items[i].label).includes(tm)) return items[i];
  }
  // LaTeX commands too: "\frac{du}{dx} = 2x" is the line "du/dx = 2x", and
  // "du = 2x \, dx" is "du = 2x dx"; a trailing "= ?" the line may not carry
  // ("\int 2x(x^2+1)^3 dx = ?" for the problem line) is dropped (Oct 7 2026:
  // 9 of 13 board-tool errors in a calculus session were LaTeX targets).
  const plain = normalizeForMatch(latexToPlain(target));
  for (const want of [plain, plain.replace(/=\?$/, "")]) {
    if (want.length < 2) continue;
    for (let i = items.length - 1; i >= 0; i--) if (normalizeForMatch(latexToPlain(items[i].label)).includes(want)) return items[i];
  }
  // "3 | 4" or "sides 3, 4": every token has to appear somewhere in the label.
  const tokens = t.split(/[\s|,;:]+/).filter(Boolean);
  if (tokens.length > 0) {
    for (let i = items.length - 1; i >= 0; i--) {
      const label = items[i].label.toLowerCase();
      if (tokens.every((tok) => label.includes(tok))) return items[i];
    }
  }
  // A line inside an item: a step of the worked example, a row of a table
  // (Oct 24 2026: "point_at 2x / 2 = 6 / 2" and "subtract 4 from both sides"
  // were refused while the example that holds them was on the board).
  for (const want of [tm, plain]) {
    if (want.length < 3) continue;
    for (let i = items.length - 1; i >= 0; i--) {
      const c = items[i].content;
      if (c && normalizeForMatch(latexToPlain(c.slice(c.indexOf(":") + 1))).includes(want)) return items[i];
    }
  }
  const words = t.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return null;
  let best: { item: BoardItem; score: number } | null = null;
  for (let i = items.length - 1; i >= 0; i--) {
    const label = items[i].label.toLowerCase();
    const score = words.filter((w) => label.includes(w)).length / words.length;
    if (score >= 0.5 && (!best || score > best.score)) best = { item: items[i], score };
  }
  return best?.item ?? null;
}

export function parseTargetList(input: string): string[] {
  return input
    .split(/[|;,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// The line the model reads after every tool call. Newest last, ids first, so
// "b7" is right there when it wants to point at or erase something. With
// extras it also says where each item sits and where the board is empty.
export type BoardSummaryExtras = {
  /** item id -> where it sits, e.g. "top left" */
  places?: Record<string, string>;
  /** the empty parts of the current board page, in words */
  free?: string;
  /** the board page new work goes on */
  page?: number;
  /** the board page the student is looking at, when known */
  seen?: number;
  /** item id -> what went wrong drawing it (a graph line Desmos could not read) */
  issues?: Record<string, string>;
  /**
   * The short form for tool results (Sept 24 2026): ids, kinds and a few words
   * each, only places off this page, no free space and no instructions. The
   * full list stays for look_at_board.
   */
  compact?: boolean;
};

function shortLabel(label: string, words = 6): string {
  // A picture's parts are what the tutor points at ("point_at j2"): they stay
  // whole however long the title is.
  const parts = /\s*(\(parts: [^)]*\))\s*$/.exec(label);
  const main = parts ? label.slice(0, parts.index) : label;
  const w = main.replace(/\s+/g, " ").trim().split(" ");
  const short = w.length > words ? `${w.slice(0, words).join(" ")}…` : w.join(" ");
  return parts ? `${short} ${parts[1]}` : short;
}

export function formatBoardItems(items: BoardItem[], title?: string, limit = 10, extras?: BoardSummaryExtras): string {
  if (items.length === 0) return `${title ? `"${title}". ` : ""}The board is empty.`;
  if (extras?.compact) {
    const list = items.slice(-8).map((item) => {
      const place = extras.places?.[item.id];
      const off = place && /^page \d+$/.test(place) ? ` (${place})` : "";
      const issue = extras.issues?.[item.id];
      return `${item.id} ${itemKind(item.tool)}${item.owner === "student" ? " (student)" : ""}${off} "${shortLabel(item.label)}"${issue ? ` [${issue}]` : ""}`;
    });
    return `${title ? `"${title}": ` : ""}${list.join("; ")}`;
  }
  const shown = items.slice(-limit);
  const hidden = items.length - shown.length;
  const list = shown
    .map((item) => {
      const place = extras?.places?.[item.id];
      const issue = extras?.issues?.[item.id];
      return `${item.id} ${itemKind(item.tool)}${item.owner === "student" ? " (student)" : ""}${place ? ` (${place})` : ""}: ${item.label}${issue ? ` [${issue}]` : ""}`;
    })
    .join("; ");
  const free = extras?.free ? ` Free space: ${extras.free}.` : "";
  // Items on another page read "(page 1)": the student cannot see them until
  // the tutor points at one, which turns the board there.
  const elsewhere = shown.some((item) => /^page \d+$/.test(extras?.places?.[item.id] ?? ""));
  let page = "";
  if (extras?.page && (extras.page > 1 || elsewhere)) {
    const seen = extras.seen && extras.seen !== extras.page ? `; the student is looking at page ${extras.seen}` : "";
    page = ` New work goes on board page ${extras.page}${seen}.`;
    if (elsewhere) page += " Items on another page are out of sight until you point at them.";
  }
  return `${title ? `"${title}". ` : ""}${items.length} item${items.length === 1 ? "" : "s"}${hidden > 0 ? ` (oldest ${hidden} not listed)` : ""}: ${list}.${free}${page} Refer to items by id (point_at, highlight, circle_item, erase_items).`;
}

// ── What a tool does to the board ──────────────────────────────────────────
// Only drawing tools add an item. A mark (pointing, a ring, a highlight, a
// strike) belongs to the item it marks: a highlight that became its own item
// was moved into free space and drawn around nothing (Sept 15 recording).
export type ToolRole = "draw" | "mark" | "erase" | "look" | "memory";

const TOOL_ROLES: Record<string, ToolRole> = {
  point_at: "mark",
  circle_item: "mark",
  mark_correct: "mark",
  annotate: "mark",
  settle_questions: "mark",
  highlight: "mark",
  highlight_step: "mark",
  cross_out_step: "mark",
  cross_out: "mark",
  erase: "erase",
  erase_items: "erase",
  erase_older: "erase",
  clear_whiteboard: "erase",
  look_at_board: "look",
  look_at_worksheet: "look",
  remember_about_student: "memory",
  check_answer: "memory",
  record_attempt: "memory",
};

export function toolRole(name: string): ToolRole {
  return TOOL_ROLES[name] ?? "draw";
}

/**
 * One batch of tool calls with its marks (point, ring, highlight, cross out)
 * after everything else, in their own order: a mark targets what a drawing in
 * the same batch puts up (Sept 25 2026: 3.8 ringed "38.6" one call before it
 * wrote the attempt, and the ring was refused).
 */
export function marksLast<T>(calls: T[], nameOf: (call: T) => string): T[] {
  const rank = (c: T) => (toolRole(nameOf(c)) === "mark" ? 1 : 0);
  return [...calls].sort((a, b) => rank(a) - rank(b));
}

// ── Highlighter ─────────────────────────────────────────────────────────────

/**
 * Text as it compares on the board: no spaces, one minus sign, one dot, and
 * powers without their marks, so "x^2", "x^{2}" and the board's "x²" (NFKC
 * turns it into "x2") all match.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u200b-\u200d\u2060\ufeff^_{}]+/g, "")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[\u22c5\u2219*]/g, "\u00b7");
}

/** The ways a highlight's text might appear once typeset: "3/4" is also "34" in a stacked fraction. */
export function matchVariants(text: string): string[] {
  const base = normalizeForMatch(text);
  const variants = [base];
  // A typeset fraction has no slash, and KaTeX writes the denominator first.
  const fraction = /^([^/]+)\/([^/]+)$/.exec(base);
  if (fraction) variants.push(fraction[1] + fraction[2], fraction[2] + fraction[1]);
  return [...new Set(variants)].filter(Boolean);
}

/** tldraw's highlighter widths at its default 16px theme font (16 × size factor × 1.12). */
export const HIGHLIGHT_WIDTHS = { s: 20.16, m: 26.88, l: 40.32, xl: 49.28 } as const;
export type HighlightSize = keyof typeof HIGHLIGHT_WIDTHS;

/** The stroke size that covers a line of text `height` tall, the way a real highlighter does. */
export function highlightSizeFor(height: number): { size: HighlightSize; width: number } {
  const want = height * 0.9 + 2;
  let best: HighlightSize = "m";
  for (const size of Object.keys(HIGHLIGHT_WIDTHS) as HighlightSize[]) {
    if (Math.abs(HIGHLIGHT_WIDTHS[size] - want) < Math.abs(HIGHLIGHT_WIDTHS[best] - want)) best = size;
  }
  return { size: best, width: HIGHLIGHT_WIDTHS[best] };
}

/**
 * A swipe along a line of text: the round ends land just past the words, with
 * a slight rise.
 *
 * tldraw's stroke smoothing (getStrokePoints) drops every point within a
 * third of the stroke size of either end, and skips the first three points
 * until the stroke is a full stroke-size long. A short swipe with sparse
 * points therefore collapsed to a dot at its left end (short words looked
 * shifted left). Short swipes use 1px spacing and a run long enough that
 * points survive between the two dropped zones.
 */
export function swipePoints(r: ItemBounds, strokeWidth: number): Array<{ x: number; y: number }> {
  const midY = r.y + r.h / 2;
  const size = strokeWidth + 1;
  let x0 = r.x + strokeWidth / 2 - 5;
  let x1 = r.x + r.w - strokeWidth / 2 + 5;
  const minRun = (size * 2) / 3 + 4;
  if (x1 - x0 < minRun) {
    const cx = r.x + r.w / 2;
    x0 = cx - minRun / 2;
    x1 = cx + minRun / 2;
  }
  const run = x1 - x0;
  const spacing = run < 60 ? 1 : 6;
  const n = Math.max(2, Math.ceil(run / spacing) + 1);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: x0 + run * t, y: midY + 1 - 2 * t };
  });
}

export type HighlightSwipe = { points: Array<{ x: number; y: number }>; size: HighlightSize; width: number };

/**
 * The highlighter stroke for one rectangle of text. Short wide text gets a
 * horizontal swipe as tall as the line. A tall narrow target (a stacked
 * fraction, one digit over another) gets a vertical swipe as wide as the text:
 * a horizontal stroke tall enough to cover it spilled over the signs beside it.
 */
export function highlightSwipeFor(r: ItemBounds): HighlightSwipe {
  // One glyph (the 4 in a stacked 1/4) is taller than wide but not a
  // fraction: a vertical swipe on it was a blob. A short horizontal swipe,
  // widened a little past the glyph, reads as a highlight.
  if (r.w < 22 && r.h < 30) {
    const pen = highlightSizeFor(r.h);
    return { size: pen.size, width: pen.width, points: swipePoints({ x: r.x - 3, y: r.y, w: r.w + 6, h: r.h }, pen.width) };
  }
  if (r.h > r.w * 1.3) {
    const pen = highlightSizeFor(Math.max(r.w, 12));
    const midX = r.x + r.w / 2;
    const size = pen.width + 1;
    let y0 = r.y + pen.width / 2 - 4;
    let y1 = r.y + r.h - pen.width / 2 + 4;
    const minRun = (size * 2) / 3 + 4;
    if (y1 - y0 < minRun) {
      const cy = r.y + r.h / 2;
      y0 = cy - minRun / 2;
      y1 = cy + minRun / 2;
    }
    const run = y1 - y0;
    const n = Math.max(2, Math.ceil(run) + 1);
    return { size: pen.size, width: pen.width, points: Array.from({ length: n }, (_, i) => ({ x: midX, y: y0 + (run * i) / (n - 1) })) };
  }
  const pen = highlightSizeFor(r.h);
  return { size: pen.size, width: pen.width, points: swipePoints(r, pen.width) };
}

/** Glyph rectangles merged into one rectangle per line of text, or into one overall. */
export function mergeLineRects(rects: ItemBounds[], single = false): ItemBounds[] {
  const union = (a: ItemBounds, b: ItemBounds): ItemBounds => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };
  if (rects.length === 0) return [];
  if (single) return [rects.reduce(union)];
  const lines: ItemBounds[] = [];
  for (const r of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = lines[lines.length - 1];
    const overlap = last ? Math.min(last.y + last.h, r.y + r.h) - Math.max(last.y, r.y) : 0;
    if (last && overlap > Math.min(last.h, r.h) * 0.5) lines[lines.length - 1] = union(last, r);
    else lines.push(r);
  }
  return lines;
}

// A hand-drawn ring around a box: an ellipse with a slight wobble, starting
// at the upper left and overlapping itself a little at the end.
/** How far a ring runs past its start, like a hand closing a loop (radians). */
export const RING_OVERLAP = 0.28;

export function ringPoints(b: ItemBounds, pad = 12, n = 48): Array<{ x: number; y: number }> {
  // A hand loop (Oct 14 2026: the old ring, a superellipse of exponent 6, read
  // as a thick rounded rectangle). Rounder (exponent 5; a tilt cost too much
  // width on tall items), wobbling, and spiralling in a little so its end passes just inside
  // its start the way a pen closes a loop. Its axes still grow until even the
  // wobble's inward dips clear the box's corners.
  const EXP = 5;
  const SPIRAL = 0.018;
  const WOBBLE_IN = 1 - 0.025 - 0.012 - SPIRAL;
  const TILT = 0;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let rx = b.w / 2 + pad;
  let ry = b.h / 2 + pad;
  // The tilt moves a corner outward by at most this much along each axis.
  const tw = (b.w / 2) * Math.cos(TILT) + (b.h / 2) * Math.abs(Math.sin(TILT));
  const th = (b.h / 2) * Math.cos(TILT) + (b.w / 2) * Math.abs(Math.sin(TILT));
  const reach = Math.pow(tw / (rx * WOBBLE_IN), EXP) + Math.pow(th / (ry * WOBBLE_IN), EXP);
  if (reach > 1) {
    const grow = Math.pow(reach, 1 / EXP);
    rx *= grow;
    ry *= grow;
  }
  const pts: Array<{ x: number; y: number }> = [];
  const start = -2.35; // radians, upper left
  const sweep = Math.PI * 2 + RING_OVERLAP;
  const shape = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 2 / EXP);
  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const a = start + sweep * p;
    const wobble = (1 + SPIRAL * (1 - p)) * (1 + 0.025 * Math.sin(p * 13.7 + 0.6) + 0.012 * Math.cos(p * 5.3));
    const ex = rx * wobble * shape(Math.cos(a));
    const ey = ry * wobble * shape(Math.sin(a));
    pts.push({ x: cx + ex * cosT - ey * sinT, y: cy + ex * sinT + ey * cosT });
  }
  return pts;
}

/**
 * A box drawn by hand around a right answer (Oct 14 2026): one stroke from the
 * upper left, four slightly bowed sides with soft corners, running a little
 * past where it began.
 */
export function handBoxPoints(b: ItemBounds, pad = 10): Array<{ x: number; y: number }> {
  const x0 = b.x - pad;
  const y0 = b.y - pad * 0.8;
  const x1 = b.x + b.w + pad;
  const y1 = b.y + b.h + pad * 0.8;
  const r = Math.min(10, (y1 - y0) / 3);
  const pts: Array<{ x: number; y: number }> = [];
  // Each side bows out by a little, as a quick hand stroke does.
  const side = (ax: number, ay: number, bx: number, by: number, bow: number, steps: number) => {
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const out = Math.sin(t * Math.PI) * bow;
      pts.push({ x: ax + (bx - ax) * t - nx * out, y: ay + (by - ay) * t - ny * out });
    }
  };
  const corner = (cxp: number, cyp: number, a0: number) => {
    for (let i = 0; i < 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      pts.push({ x: cxp + r * Math.cos(a), y: cyp + r * Math.sin(a) });
    }
  };
  const bow = Math.min(3, b.w / 60 + 1);
  side(x0 + r, y0, x1 - r, y0 + 1, bow, 10);
  corner(x1 - r, y0 + r + 1, -Math.PI / 2);
  side(x1, y0 + r + 1, x1 + 1, y1 - r, bow * 0.6, 5);
  corner(x1 - r + 1, y1 - r, 0);
  side(x1 - r + 1, y1, x0 + r, y1 - 1, bow, 10);
  corner(x0 + r, y1 - r - 1, Math.PI / 2);
  side(x0, y1 - r - 1, x0 - 1, y0 + r, bow * 0.6, 5);
  corner(x0 + r - 1, y0 + r, Math.PI);
  // On along the top edge a little past the start, as a pen finishes a box.
  for (let i = 1; i <= 2; i++) pts.push({ x: x0 + r + i * Math.min(6, b.w / 10), y: y0 + 0.5 + i * 0.25 });
  return pts;
}

/**
 * A strike through a line of words (Oct 14 2026): one quick pen stroke,
 * rising a little left to right with a slight bow, starting and ending just
 * past the words. It replaced a ruler-straight line that ran well past both
 * ends of the text.
 */
export function strikePoints(b: ItemBounds): Array<{ x: number; y: number }> {
  const over = Math.min(5, 2 + b.w / 80);
  const x0 = b.x - over;
  const x1 = b.x + b.w + over;
  const rise = Math.min(4, b.h * 0.12);
  const y0 = b.y + b.h * 0.56 + rise / 2;
  const y1 = b.y + b.h * 0.56 - rise / 2;
  const n = Math.max(8, Math.round((x1 - x0) / 14));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bow = Math.sin(t * Math.PI) * 1.4 + Math.sin(t * 9.1 + 0.4) * 0.35;
    pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t - bow });
  }
  return pts;
}

/** A check mark at (x, y) (its left end), `size` tall: a short drop, then a long rise. */
export function checkPoints(x: number, y: number, size = 26): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const low = { x: x + size * 0.36, y: y + size * 0.42 };
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push({ x: x + (low.x - x) * t, y: y + (low.y - y) * t + Math.sin(t * Math.PI) * 1.2 });
  }
  const top = { x: x + size * 1.02, y: y - size * 0.62 };
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    // The long stroke curves a little and eases off at the top.
    pts.push({ x: low.x + (top.x - low.x) * t, y: low.y + (top.y - low.y) * Math.pow(t, 0.9) + Math.sin(t * Math.PI) * 2.4 });
  }
  return pts;
}

/**
 * The tutor's underline (Oct 14 2026, Mateo: "a light blue scribbly line"):
 * a quick wavy pass under the words and a shorter, lower pass back, the way a
 * pen underlines in a hurry.
 */
export function scribbleUnderlinePoints(b: ItemBounds): Array<{ x: number; y: number }> {
  const y = b.y + b.h + 5;
  const x0 = b.x - 4;
  const w = b.w + 8;
  // About one wave per 44px: a short word gets a gentle line, not a coil.
  const waves = Math.max(1.5, w / 44);
  const amp = w < 60 ? 1.4 : 2.2;
  const pts: Array<{ x: number; y: number }> = [];
  const n = Math.max(12, Math.round(waves * 8));
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    pts.push({ x: x0 + w * p, y: y + amp * Math.sin(p * waves * Math.PI * 2) + p * 1.5 });
  }
  // The pass back only under longer words.
  if (w < 70) return pts;
  const back = Math.round(n * 0.75);
  for (let i = 1; i <= back; i++) {
    const p = 1 - i / n;
    pts.push({ x: x0 + w * p, y: y + 5 + amp * 0.8 * Math.sin(p * waves * Math.PI * 2 + 1.3) });
  }
  return pts;
}

/**
 * The rule under a heading (Oct 14 2026, Mateo: "this line should be
 * scribbly"): the underline's wave language, one quick pass the heading's
 * width, rising a touch. It was a straight grey ruled line.
 */
export function headingRulePoints(x: number, y: number, w: number): Array<{ x: number; y: number }> {
  const waves = Math.max(2, w / 46);
  const amp = 2.2;
  const n = Math.max(16, Math.round(waves * 8));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    pts.push({ x: x + w * p, y: y + amp * Math.sin(p * waves * Math.PI * 2 + 0.4) - p * 1.5 });
  }
  return pts;
}

export function underlinePoints(b: ItemBounds, n = 18): Array<{ x: number; y: number }> {
  const y = b.y + b.h + 6;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    pts.push({ x: b.x - 4 + (b.w + 8) * p, y: y + 1.5 * Math.sin(p * 9) });
  }
  return pts;
}
