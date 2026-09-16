// Where new things go on the whiteboard. The board is a page the size of the
// visible board area (a "frame"). A new item takes the first free spot in
// reading order, down a column and then into the next, or sits beside or
// below an item the tutor names. Nothing overlaps, and erased space is reused.
// Pure: TldrawCore measures what a tool drew and moves it to the spot.

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

export type PlaceHint =
  /** `after`: the last thing written; work continues below it or in a later column, never in an earlier gap. */
  | { kind: "flow"; after?: Rect }
  | { kind: "beside"; anchor: Rect }
  | { kind: "below"; anchor: Rect }
  | { kind: "area"; area: "left" | "right" | "top" };

/** What the tutor asked for with a tool's `place` argument. */
export type PlaceRequest =
  | { kind: "beside" | "below"; target: string }
  | { kind: "area"; area: "left" | "right" | "top" }
  | { kind: "new_page" };

export const LAYOUT_GAP = 28;
/** Roughly the width of one column of work on the board. */
export const COLUMN_TARGET_W = 560;

export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
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
  if (hint.kind === "beside") {
    xs.add(hint.anchor.x + hint.anchor.w + gap);
    ys.add(hint.anchor.y);
  } else if (hint.kind === "below") {
    xs.add(hint.anchor.x);
    ys.add(hint.anchor.y + hint.anchor.h + gap);
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
  } else if (hint.kind === "area") {
    const mid = usable.x + usable.w / 2;
    const slack = usable.w * 0.1;
    const inArea = free.filter((p) =>
      hint.area === "left" ? p.x + size.w <= mid + slack : hint.area === "right" ? p.x >= mid - slack : true,
    );
    if (inArea.length > 0) pool = inArea;
    if (hint.area === "top") score = (p) => p.y * 10 + (p.x - usable.x) / 10;
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

/** Read a tool's `place` argument: "beside b3", "below b3", "left", "right", "top", "new page". */
export function parsePlace(value: unknown): PlaceRequest | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (/^(a\s+)?(new|next|fresh)\s+page$/i.test(v)) return { kind: "new_page" };
  const m = /^(beside|next to|to the right of|right of|below|under|underneath|beneath)\s+(.+)$/i.exec(v);
  if (m) {
    const below = /^(below|under|underneath|beneath)$/i.test(m[1]);
    return { kind: below ? "below" : "beside", target: m[2].trim() };
  }
  const area = v.toLowerCase();
  if (area === "left" || area === "right" || area === "top") return { kind: "area", area };
  return null;
}

/** Where a rectangle sits on the board, in words: "top left", "right", "middle". */
export function regionName(r: Rect, usable: Rect): string {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const col = cx < usable.x + usable.w / 3 ? "left" : cx > usable.x + (usable.w * 2) / 3 ? "right" : "";
  const row = cy < usable.y + usable.h / 3 ? "top" : cy > usable.y + (usable.h * 2) / 3 ? "bottom" : "";
  if (row && col) return `${row} ${col}`;
  return row || col || "middle";
}

/** The empty parts of the board, in words, from a 3 × 3 split of the usable area. */
export function freeSpace(occupied: Rect[], usable: Rect): string {
  const cellW = usable.w / 3;
  const cellH = usable.h / 3;
  const free: boolean[][] = [0, 1, 2].map((row) =>
    [0, 1, 2].map((col) => {
      const cell = { x: usable.x + col * cellW, y: usable.y + row * cellH, w: cellW, h: cellH };
      let covered = 0;
      for (const o of occupied) {
        const w = Math.min(cell.x + cell.w, o.x + o.w) - Math.max(cell.x, o.x);
        const h = Math.min(cell.y + cell.h, o.y + o.h) - Math.max(cell.y, o.y);
        if (w > 0 && h > 0) covered += w * h;
      }
      return covered < cell.w * cell.h * 0.12;
    }),
  );
  if (free.every((row) => row.every(Boolean))) return "the whole board";
  const names = [
    ["top left", "top", "top right"],
    ["left", "middle", "right"],
    ["bottom left", "bottom", "bottom right"],
  ];
  const used = free.map((row) => row.map(() => false));
  const parts: string[] = [];
  const colNames = ["the left third", "the middle third", "the right third"];
  const rowNames = ["the top third", "the middle band", "the bottom third"];
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
      if (free[row][col] && !used[row][col]) parts.push(names[row][col]);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "none";
}
