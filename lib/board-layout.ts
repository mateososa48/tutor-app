// Where new things go on the whiteboard. The board is a page the size of the
// visible board area (a "frame"). A new item takes the first free spot in
// reading order, down a column and then into the next, or sits beside or
// below an item the tutor names. Nothing overlaps, and erased space is reused.
// Pure: TldrawCore measures what a tool drew and moves it to the spot.

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

// ── Named areas (Sept 16 2026) ──────────────────────────────────────────────
// Every phrase freeSpace() and regionName() write into [Board: …] is also a
// `place` value. They used to disagree: the summary said "Free space: bottom
// left" and `place: "bottom left"` was rejected, so the tutor never used the
// room it was told about.
const T = 1 / 3;
/** Each name as a part of the writing area: [left, top, right, bottom] fractions. */
export const AREA_NAMES = {
  "the whole board": [0, 0, 1, 1],
  "the left third": [0, 0, T, 1],
  "the middle third": [T, 0, 2 * T, 1],
  "the right third": [2 * T, 0, 1, 1],
  "the top third": [0, 0, 1, T],
  "the middle band": [0, T, 1, 2 * T],
  "the bottom third": [0, 2 * T, 1, 1],
  "top left": [0, 0, T, T],
  "top middle": [T, 0, 2 * T, T],
  "top right": [2 * T, 0, 1, T],
  "middle left": [0, T, T, 2 * T],
  centre: [T, T, 2 * T, 2 * T],
  "middle right": [2 * T, T, 1, 2 * T],
  "bottom left": [0, 2 * T, T, 1],
  "bottom middle": [T, 2 * T, 2 * T, 1],
  "bottom right": [2 * T, 2 * T, 1, 1],
  // Halves: what a person means by "on the left".
  left: [0, 0, 0.5, 1],
  right: [0.5, 0, 1, 1],
  top: [0, 0, 1, 0.5],
  bottom: [0, 0.5, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type AreaName = keyof typeof AREA_NAMES;

const CELL_NAMES: AreaName[][] = [
  ["top left", "top middle", "top right"],
  ["middle left", "centre", "middle right"],
  ["bottom left", "bottom middle", "bottom right"],
];

const AREA_ALIASES: Record<string, AreaName> = {
  "whole board": "the whole board",
  "whole page": "the whole board",
  anywhere: "the whole board",
  "centre third": "the middle third",
  "middle column": "the middle third",
  "middle row": "the middle band",
  "centre band": "the middle band",
  "upper left": "top left",
  "left top": "top left",
  "top centre": "top middle",
  "middle top": "top middle",
  "centre top": "top middle",
  "upper right": "top right",
  "right top": "top right",
  "left middle": "middle left",
  "centre left": "middle left",
  "left centre": "middle left",
  middle: "centre",
  "right middle": "middle right",
  "centre right": "middle right",
  "right centre": "middle right",
  "lower left": "bottom left",
  "left bottom": "bottom left",
  "bottom centre": "bottom middle",
  "middle bottom": "bottom middle",
  "centre bottom": "bottom middle",
  "lower right": "bottom right",
  "right bottom": "bottom right",
  upper: "top",
  lower: "bottom",
};

/** A named area in words ("the bottom third", "in the top right corner", "center"), or null. */
export function areaFromWords(value: string): AreaName | null {
  let s = value
    .toLowerCase()
    .replace(/center/g, "centre")
    .replace(/[-_]/g, " ")
    .replace(/[.!,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^(?:in|on|at|into|to|over)\s+/, "");
  s = s.replace(/\s+(?:of|on) the (?:board|page)$/, "");
  s = s.replace(/\s+(?:half|side|corner|area|part|space|region|edge)$/, "");
  const bare = s.replace(/^the\s+/, "");
  for (const candidate of [s, bare, `the ${bare}`]) {
    if (Object.prototype.hasOwnProperty.call(AREA_NAMES, candidate)) return candidate as AreaName;
  }
  return AREA_ALIASES[bare] ?? null;
}

/** The part of `usable` an area name covers. */
export function areaRect(name: AreaName, usable: Rect): Rect {
  const [x0, y0, x1, y1] = AREA_NAMES[name];
  return {
    x: usable.x + usable.w * x0,
    y: usable.y + usable.h * y0,
    w: usable.w * (x1 - x0),
    h: usable.h * (y1 - y0),
  };
}

/** Whether a placed rectangle sits in a named area (its centre does). */
export function inArea(r: Rect, name: AreaName, usable: Rect): boolean {
  const a = areaRect(name, usable);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return cx >= a.x - 0.5 && cx <= a.x + a.w + 0.5 && cy >= a.y - 0.5 && cy <= a.y + a.h + 0.5;
}

export type PlaceHint =
  /** `after`: the last thing written; work continues below it or in a later column, never in an earlier gap. */
  | { kind: "flow"; after?: Rect }
  | { kind: "beside"; anchor: Rect }
  | { kind: "below"; anchor: Rect }
  | { kind: "area"; area: AreaName };

/** What the tutor asked for with a tool's `place` argument. */
export type PlaceRequest =
  | { kind: "beside" | "below"; target: string }
  | { kind: "area"; area: AreaName }
  | { kind: "new_page" };

export const LAYOUT_GAP = 28;
/** Roughly the width of one column of work on the board. */
export const COLUMN_TARGET_W = 560;

export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : null;
}

export function columnWidth(usable: Rect): number {
  const columns = Math.max(1, Math.round(usable.w / COLUMN_TARGET_W));
  return usable.w / columns;
}

/**
 * The best free top-left corner for an item of `size`, or null when it does
 * not fit anywhere in `usable`. Candidates are the corners formed by the
 * usable area, the column starts, and the edges of what is already there.
 */
export function findSpot(
  size: Size,
  occupied: Rect[],
  usable: Rect,
  hint: PlaceHint = { kind: "flow" },
  gap = LAYOUT_GAP,
): { x: number; y: number } | null {
  const colW = columnWidth(usable);
  const columns = Math.max(1, Math.round(usable.w / colW));
  const xs = new Set<number>([usable.x]);
  const ys = new Set<number>([usable.y]);
  for (let i = 1; i < columns; i++) xs.add(usable.x + i * colW);
  for (const r of occupied) {
    xs.add(r.x);
    xs.add(r.x + r.w + gap);
    ys.add(r.y);
    ys.add(r.y + r.h + gap);
  }
  const areaName = hint.kind === "area" ? hint.area : null;
  const area = areaName ? areaRect(areaName, usable) : null;
  if (hint.kind === "beside") {
    xs.add(hint.anchor.x + hint.anchor.w + gap);
    ys.add(hint.anchor.y);
  } else if (hint.kind === "below") {
    xs.add(hint.anchor.x);
    ys.add(hint.anchor.y + hint.anchor.h + gap);
  } else if (area) {
    // The area's own edges, and the item pushed against its right and bottom
    // edges (and the board's), so something wider than the area still lands on its side.
    xs.add(area.x);
    ys.add(area.y);
    xs.add(area.x + area.w - size.w);
    ys.add(area.y + area.h - size.h);
    xs.add(usable.x + usable.w - size.w);
    ys.add(usable.y + usable.h - size.h);
  }

  const right = usable.x + usable.w;
  const bottom = usable.y + usable.h;
  const free: Array<{ x: number; y: number }> = [];
  for (const x of xs) {
    for (const y of ys) {
      if (x < usable.x - 0.5 || y < usable.y - 0.5 || x + size.w > right + 0.5 || y + size.h > bottom + 0.5) continue;
      const r = { x, y, w: size.w, h: size.h };
      if (occupied.some((o) => overlaps(r, o, gap - 1))) continue;
      free.push({ x, y });
    }
  }
  if (free.length === 0) return null;

  // Reading order: column first, then down the column, then along the row.
  // An item belongs to the column its centre falls in.
  const columnOf = (p: { x: number }) => Math.min(columns - 1, Math.floor((p.x - usable.x + size.w / 2) / colW));
  let score = (p: { x: number; y: number }) => columnOf(p) * 1e6 + p.y * 10 + (p.x - usable.x) / 10;
  let pool = free;
  if (hint.kind === "beside") {
    const a = hint.anchor;
    const near = free.filter((p) => p.x >= a.x + a.w - 0.5 && p.y < a.y + a.h);
    if (near.length > 0) {
      pool = near;
      score = (p) => Math.abs(p.x - (a.x + a.w + gap)) * 2 + Math.abs(p.y - a.y);
    }
  } else if (hint.kind === "below") {
    const a = hint.anchor;
    const near = free.filter((p) => p.y >= a.y + a.h - 0.5 && p.x < a.x + a.w);
    if (near.length > 0) {
      pool = near;
      score = (p) => Math.abs(p.y - (a.y + a.h + gap)) * 2 + Math.abs(p.x - a.x);
    }
  } else if (hint.kind === "flow" && hint.after) {
    const a = hint.after;
    const afterColumn = Math.min(columns - 1, Math.floor((a.x - usable.x + a.w / 2) / colW));
    const onward = free.filter((p) => {
      const c = columnOf(p);
      return (c === afterColumn && p.y >= a.y + a.h - 0.5) || c > afterColumn;
    });
    if (onward.length > 0) pool = onward;
  } else if (area && areaName) {
    // Wholly inside the area if it fits there, else centred in it, else
    // starting in it; only then anywhere. Reading order inside the area.
    const inside = (p: { x: number; y: number }) =>
      p.x >= area.x - 0.5 && p.y >= area.y - 0.5 && p.x + size.w <= area.x + area.w + 0.5 && p.y + size.h <= area.y + area.h + 0.5;
    const centred = (p: { x: number; y: number }) => inArea({ ...p, ...size }, areaName, usable);
    const starts = (p: { x: number; y: number }) =>
      p.x >= area.x - 0.5 && p.x < area.x + area.w && p.y >= area.y - 0.5 && p.y < area.y + area.h;
    let matched: typeof free = [];
    for (const test of [inside, centred, starts]) {
      matched = free.filter(test);
      if (matched.length > 0) break;
    }
    if (matched.length > 0) {
      pool = matched;
      score = (p) => p.y * 10 + (p.x - usable.x) / 10;
    } else {
      const ax = area.x + area.w / 2;
      const ay = area.y + area.h / 2;
      score = (p) => Math.hypot(p.x + size.w / 2 - ax, p.y + size.h / 2 - ay);
    }
  }

  let best = pool[0];
  let bestScore = score(best);
  for (const p of pool) {
    const s = score(p);
    if (s < bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

/**
 * Read a tool's `place` argument: "beside b3", "below b3", a named area
 * ("right", "the bottom third", "top left"), or "new page".
 */
export function parsePlace(value: unknown): PlaceRequest | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (/^(on\s+)?(a\s+|the\s+)?(new|next|fresh|another)\s+page$/i.test(v)) return { kind: "new_page" };
  const m = /^(beside|next to|to the right of|right of|below|under|underneath|beneath)\s+(.+)$/i.exec(v);
  if (m) {
    const below = /^(below|under|underneath|beneath)$/i.test(m[1]);
    return { kind: below ? "below" : "beside", target: m[2].trim() };
  }
  const area = areaFromWords(v);
  return area ? { kind: "area", area } : null;
}

/** Where a rectangle sits on the board, in words: "top left", "middle right", "centre". */
export function regionName(r: Rect, usable: Rect): AreaName {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const col = cx < usable.x + usable.w / 3 ? 0 : cx > usable.x + (usable.w * 2) / 3 ? 2 : 1;
  const row = cy < usable.y + usable.h / 3 ? 0 : cy > usable.y + (usable.h * 2) / 3 ? 2 : 1;
  return CELL_NAMES[row][col];
}

/** Which of the 3 × 3 cells of the usable area are still (mostly) empty. */
function freeCells(occupied: Rect[], usable: Rect): boolean[][] {
  const cellW = usable.w / 3;
  const cellH = usable.h / 3;
  return [0, 1, 2].map((row) =>
    [0, 1, 2].map((col) => {
      const cell = { x: usable.x + col * cellW, y: usable.y + row * cellH, w: cellW, h: cellH };
      let covered = 0;
      for (const o of occupied) {
        const part = intersect(cell, o);
        if (part) covered += part.w * part.h;
      }
      return covered < cell.w * cell.h * 0.12;
    }),
  );
}

/** How many of the nine cells of the usable area hold something. */
export function usedCells(occupied: Rect[], usable: Rect): number {
  return freeCells(occupied, usable).flat().filter((free) => !free).length;
}

/** The empty parts of the board, in words, from a 3 × 3 split of the usable area. */
export function freeSpace(occupied: Rect[], usable: Rect): string {
  const free = freeCells(occupied, usable);
  if (free.every((row) => row.every(Boolean))) return "the whole board";
  const used = free.map((row) => row.map(() => false));
  const parts: string[] = [];
  const colNames: AreaName[] = ["the left third", "the middle third", "the right third"];
  const rowNames: AreaName[] = ["the top third", "the middle band", "the bottom third"];
  for (let col = 0; col < 3; col++) {
    if ([0, 1, 2].every((row) => free[row][col])) {
      parts.push(colNames[col]);
      for (let row = 0; row < 3; row++) used[row][col] = true;
    }
  }
  for (let row = 0; row < 3; row++) {
    if ([0, 1, 2].every((col) => free[row][col]) && ![0, 1, 2].every((col) => used[row][col])) {
      parts.push(rowNames[row]);
      for (let col = 0; col < 3; col++) used[row][col] = true;
    }
  }
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (free[row][col] && !used[row][col]) parts.push(CELL_NAMES[row][col]);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "none";
}

// ── Pages and sections (Sept 16 2026) ───────────────────────────────────────
// A recorded session ran to four pages, 4,800px wide, and at one point 8 of
// the 9 things the tutor talked about were on pages the student could not
// see. A section opened a page whenever the deepest item on this one came
// near the bottom, even with two thirds of the width empty, and every tool
// offered "new page". Now sections fill the page the way text does: side by
// side along a row while there is width, then a new row under everything,
// and a page opens only when nothing fits.

/** The narrowest and shortest a section's region may be (heading included). */
export const PANEL_MIN_W = 420;
export const SECTION_MIN_H = 240;
/** Space between side-by-side panels; wider than between items, so panels read as separate. */
export const PANEL_GUTTER = 56;

export type SectionPlan = { region: Rect; kind: "page" | "panel" | "band" };

// Whether a region still holds a minW × minH block once blocked space (the
// voice dock) is taken out: across its full width from the top, or down its
// full height from the left.
function roomy(r: Rect, blocked: Rect[], minW: number, minH: number): boolean {
  if (r.w < minW - 0.5 || r.h < minH - 0.5) return false;
  let clearH = r.h;
  let clearW = r.w;
  for (const b of blocked) {
    if (!intersect(r, b)) continue;
    clearH = Math.min(clearH, Math.max(0, b.y - r.y));
    clearW = Math.min(clearW, Math.max(0, b.x - r.x));
  }
  return clearH >= minH - 0.5 || (clearW >= minW - 0.5 && r.h >= minH - 0.5);
}

/**
 * Where the next section of work goes on this page, or null when the page is
 * full. `content` is the work already written below the page heading (a
 * section heading counts as its words, not its row), `area` the writing area
 * below that heading, `blocked` space no work may use, and `rowTop` where the
 * current row of sections starts.
 */
export function planSection(
  content: Rect[],
  area: Rect,
  blocked: Rect[] = [],
  opts: { minW?: number; minH?: number; gap?: number; rowTop?: number } = {},
): SectionPlan | null {
  const minW = opts.minW ?? PANEL_MIN_W;
  const minH = opts.minH ?? SECTION_MIN_H;
  const gap = opts.gap ?? LAYOUT_GAP;
  const right = area.x + area.w;
  const bottom = area.y + area.h;
  const work = content.filter((r) => intersect(r, area));
  if (work.length === 0) return { region: { ...area }, kind: "page" };

  // 1. A panel beside the current row of sections, down to the bottom.
  const rowTop = Math.min(bottom, Math.max(area.y, opts.rowTop ?? area.y));
  const row = work.filter((r) => r.y + r.h > rowTop + 1);
  const edge = row.length > 0 ? Math.max(...row.map((r) => r.x + r.w)) + PANEL_GUTTER : area.x;
  const panel = { x: edge, y: rowTop, w: right - edge, h: bottom - rowTop };
  if (roomy(panel, blocked, minW, minH)) return { region: panel, kind: "panel" };

  // 2. A band under all the work, across the whole width.
  const floor = Math.max(...work.map((r) => r.y + r.h));
  const bandY = floor + gap * 2;
  const band = { x: area.x, y: bandY, w: area.w, h: bottom - bandY };
  if (roomy(band, blocked, minW, minH)) return { region: band, kind: "band" };

  // 3. Under the work on the right only, where it stops higher up.
  const colW = columnWidth(area);
  const columns = Math.max(1, Math.round(area.w / colW));
  let best: Rect | null = null;
  for (let k = 1; k < columns; k++) {
    const x = area.x + k * colW;
    const above = work.filter((r) => r.x + r.w > x + 1);
    const y = above.length > 0 ? Math.max(...above.map((r) => r.y + r.h)) + gap * 2 : area.y;
    const r = { x, y, w: right - x, h: bottom - y };
    if (roomy(r, blocked, minW, minH) && (!best || r.w * r.h > best.w * best.h)) best = r;
  }
  return best ? { region: best, kind: "panel" } : null;
}

/**
 * Whether new work goes on a fresh page: only when it does not fit on this
 * one, or when the tutor asked for a new page and this one is mostly used
 * (six of its nine cells hold work; the dock's corner is not work, so that is
 * six of the eight usable ones). A page opened with room to spare hides the
 * work the tutor is about to refer back to.
 */
export function shouldOpenPage(opts: { fits: boolean; askedForNewPage?: boolean; usedCells: number }): boolean {
  if (!opts.fits) return true;
  return Boolean(opts.askedForNewPage) && opts.usedCells >= 6;
}

/** Which page (1-based) a point at page-x `x` is on, for pages `pageW` wide, `pageGap` apart. */
export function pageAt(x: number, pageW: number, pageGap: number): number {
  const pitch = pageW + pageGap;
  return Math.max(1, Math.floor((x + pageGap / 2) / pitch) + 1);
}
