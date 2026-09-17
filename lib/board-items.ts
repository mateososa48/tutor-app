// Board items: every successful tool call that puts something on the board
// gets a short id (b1, b2, …) the tutor can refer back to: point at it, ring
// it, erase it. Pure helpers here; the registry itself lives in TldrawCore.

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
};

export type ItemBounds = { x: number; y: number; w: number; h: number };

// Tool name → the word a tutor would use for it in a board summary.
const KIND_BY_TOOL: Record<string, string> = {
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
  add_two_column_comparison: "comparison",
  add_vector_diagram: "vector diagram",
  add_process_map: "process map",
  draw_sketch: "sketch",
  draw_tape_diagram: "tape diagram",
  draw_grid: "grid",
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
  return item.tool === "start_new_problem" || item.tool === "start_board_section";
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
  // "3 | 4" or "sides 3, 4": every token has to appear somewhere in the label.
  const tokens = t.split(/[\s|,;:]+/).filter(Boolean);
  if (tokens.length > 0) {
    for (let i = items.length - 1; i >= 0; i--) {
      const label = items[i].label.toLowerCase();
      if (tokens.every((tok) => label.includes(tok))) return items[i];
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
};

export function formatBoardItems(items: BoardItem[], title?: string, limit = 10, extras?: BoardSummaryExtras): string {
  if (items.length === 0) return `${title ? `"${title}". ` : ""}The board is empty.`;
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
  highlight: "mark",
  highlight_step: "mark",
  cross_out_step: "mark",
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
export const RING_OVERLAP = 0.35;

export function ringPoints(b: ItemBounds, pad = 12, n = 48): Array<{ x: number; y: number }> {
  // A squarish oval (superellipse, exponent 6) with a slight hand wobble. Its
  // axes grow until even the wobble's inward dips clear the box's corners: a
  // plain ellipse cut through the corners of wide items, and a rounder shape
  // had to grow so much it ran into the neighbours.
  const EXP = 6;
  const WOBBLE_IN = 1 - 0.02 - 0.01;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let rx = b.w / 2 + pad;
  let ry = b.h / 2 + pad;
  const reach = Math.pow((b.w / 2) / (rx * WOBBLE_IN), EXP) + Math.pow((b.h / 2) / (ry * WOBBLE_IN), EXP);
  if (reach > 1) {
    const grow = Math.pow(reach, 1 / EXP);
    rx *= grow;
    ry *= grow;
  }
  const pts: Array<{ x: number; y: number }> = [];
  const start = -2.35; // radians, upper left
  const sweep = Math.PI * 2 + RING_OVERLAP;
  const shape = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 2 / EXP);
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const a = start + sweep * p;
    const wobble = 1 + 0.02 * Math.sin(p * 17.3) + 0.01 * Math.cos(p * 7.1);
    pts.push({ x: cx + rx * wobble * shape(Math.cos(a)), y: cy + ry * wobble * shape(Math.sin(a)) });
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
