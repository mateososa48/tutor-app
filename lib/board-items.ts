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
  circle_item: "ring",
};

export function itemKind(tool: string): string {
  return KIND_BY_TOOL[tool] ?? tool.replace(/^(add|draw)_/, "").replaceAll("_", " ");
}

// Turn a tool's result sentence into a label short enough to list.
export function itemLabelFrom(message: string | null | undefined, fallback: string): string {
  const raw = (message ?? "").replace(/\s+/g, " ").trim().replace(/[.]+$/, "");
  const text = raw
    .replace(/^(Cleared the board and wrote the heading|Cleared the board and wrote|Wrote the line|Wrote|Drew|Student's attempt written in their hand\.?)\s*/i, "")
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
  const idMatch = t.match(/^(?:item\s*)?b?(\d+)$/);
  if (idMatch) {
    const id = `b${idMatch[1]}`;
    return items.find((item) => item.id === id) ?? null;
  }
  const squash = (v: string) => v.toLowerCase().replace(/\s+/g, "");
  const ts = squash(t);
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.label.toLowerCase().includes(t) || itemKind(item.tool) === t || (ts.length >= 2 && squash(item.label).includes(ts))) return item;
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
// "b7" is right there when it wants to point at or erase something.
export function formatBoardItems(items: BoardItem[], title?: string, limit = 10): string {
  if (items.length === 0) return `${title ? `"${title}". ` : ""}The board is empty.`;
  const shown = items.slice(-limit);
  const hidden = items.length - shown.length;
  const list = shown
    .map((item) => `${item.id} ${itemKind(item.tool)}${item.owner === "student" ? " (student)" : ""}: ${item.label}`)
    .join("; ");
  return `${title ? `"${title}". ` : ""}${items.length} item${items.length === 1 ? "" : "s"}${hidden > 0 ? ` (oldest ${hidden} not listed)` : ""}: ${list}. Refer to items by id (point_at, circle_item, erase_items).`;
}

// A hand-drawn ring around a box: an ellipse with a slight wobble, starting
// at the upper left and overlapping itself a little at the end.
export function ringPoints(b: ItemBounds, pad = 12, n = 44): Array<{ x: number; y: number }> {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = b.w / 2 + pad;
  const ry = b.h / 2 + pad;
  const pts: Array<{ x: number; y: number }> = [];
  const start = -2.35; // radians, upper left
  const sweep = Math.PI * 2 + 0.55;
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const a = start + sweep * p;
    const wobble = 1 + 0.035 * Math.sin(p * 17.3) + 0.02 * Math.cos(p * 7.1);
    pts.push({ x: cx + rx * wobble * Math.cos(a), y: cy + ry * wobble * Math.sin(a) });
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
