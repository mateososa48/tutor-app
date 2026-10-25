// A real table on the board (Oct 25 2026). Mateo: "when it was showing a
// table, it kind of improvised a table with slashes and dashes… let it make an
// actual table and let it edit it, instead of having to delete it and then
// redo everything." The old add_table typed a monospace block of pipes and
// dashes, and every new row erased it and wrote it again.
//
// Now a table is a spec (title, columns, rows of cells) drawn as SVG with
// named parts, shown by the illustration shape (it traces the lines and
// writes the cells in). Calling add_table again on the same page edits it in
// place: rows are matched by their first cell, a changed or new cell is the
// only thing written in (`data-fresh`), and the item keeps its id. A "?" is a
// cell left for the student, drawn in the deep sky.
//
// Pure: the parser, the merge and the drawing. TldrawCore shows it.

import { latexToPlain } from "./latex-plain";
import { textWidth } from "./illustration/scene";

export type TableSpec = { kind: "table"; title?: string; columns: string[]; rows: string[][] };
export type Rect = { x: number; y: number; w: number; h: number };
export type RenderedTable = { svg: string; w: number; h: number; parts: Record<string, Rect>; aliases: Record<string, string> };

const MAX_COLUMNS = 8;
const MAX_ROWS = 14;
const CELL_MAX = 24;

const FONT = "'tldraw_sans', 'IBM Plex Sans', 'Hanken Grotesk', system-ui, sans-serif";
const PX = 18;
const TITLE_PX = 15;
const ROW_H = 40;
const PAD_X = 16;
const MIN_COL = 64;
const LINE = "rgba(18, 18, 21, 0.16)";
const HEAD_FILL = "#f4f5f8";
const INK = "#1d1d21";
const PENCIL = "#5b5b66";
const SKY_DEEP = "#1d7ee6";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n1 = (v: number) => Math.round(v * 10) / 10;

/** A cell as it reads: LaTeX made plain ("x^2" → x²), a real minus. */
export function cellText(raw: string): string {
  let t = raw.trim();
  if (/[\\^_{}]/.test(t)) t = latexToPlain(t);
  return t.replace(/(^|[\s(,=])-(?=\s*[\d.(a-z])/gi, "$1−").slice(0, CELL_MAX);
}

const splitCells = (row: string) => row.split("|").map((c) => c.trim());

/** The table a call asks for, or why it can't be drawn. */
export function parseTable(columns: unknown, rows: unknown, title?: unknown): TableSpec | { error: string } {
  if (typeof columns !== "string" || !columns.trim()) return { error: 'Give "columns", split by " | ": "x | y".' };
  const cols = splitCells(columns).filter((c, i, all) => c || i < all.length - 1);
  if (cols.length < 1 || cols.length > MAX_COLUMNS) return { error: `A table takes 1 to ${MAX_COLUMNS} columns.` };
  const body = typeof rows === "string" ? rows.split(/\s*;\s*|\n/).map((r) => r.trim()).filter(Boolean) : [];
  // A row of dashes is how a text table was drawn; it is not a row.
  const cells = body.filter((r) => !/^[\s|:+-]+$/.test(r)).map((r) => {
    const c = splitCells(r).slice(0, cols.length);
    while (c.length < cols.length) c.push("");
    return c;
  });
  if (cells.length > MAX_ROWS) return { error: `That is ${cells.length} rows; a table takes ${MAX_ROWS} at most.` };
  const t = typeof title === "string" && title.trim() ? title.trim().slice(0, 80) : undefined;
  return { kind: "table", ...(t ? { title: t } : {}), columns: cols, rows: cells };
}

const key = (s: string) => s.replace(/\s+/g, "").replace(/−/g, "-").toLowerCase();

/** Whether two tables are the same table (the same columns, in order). */
export function sameColumns(a: TableSpec, b: TableSpec): boolean {
  return a.columns.length === b.columns.length && a.columns.every((c, i) => key(c) === key(b.columns[i]));
}

/**
 * The table after an edit, and which cells changed. A row is matched by its
 * first cell (x = 2 is the x = 2 row); an unmatched row is added at the end.
 * Rows the edit leaves out stay as they were.
 */
export function mergeTable(old: TableSpec, next: TableSpec): { spec: TableSpec; fresh: Set<string>; changed: number } {
  const rows = old.rows.map((r) => [...r]);
  const fresh = new Set<string>();
  for (const row of next.rows) {
    const at = rows.findIndex((r) => key(r[0]) === key(row[0]) && key(row[0]) !== "");
    if (at < 0) {
      if (rows.length >= MAX_ROWS) continue;
      rows.push([...row]);
      row.forEach((_, c) => fresh.add(`r${rows.length}c${c + 1}`));
      continue;
    }
    row.forEach((cell, c) => {
      if (key(cell) !== key(rows[at][c] ?? "") && cell.trim() !== "") {
        rows[at][c] = cell;
        fresh.add(`r${at + 1}c${c + 1}`);
      }
    });
  }
  const title = next.title ?? old.title;
  if (title !== old.title) fresh.add("title");
  return { spec: { kind: "table", ...(title ? { title } : {}), columns: old.columns, rows }, fresh, changed: fresh.size };
}

/** Is a cell left for the student? */
const isBlank = (cell: string) => /^\s*\?+\s*$/.test(cell) || cell.trim() === "";

/** Draw it: a rounded hairline table, a soft header row, the cells centred. */
export function renderTable(spec: TableSpec, fresh: Set<string> = new Set()): RenderedTable {
  const cols = spec.columns.map(cellText);
  const body = spec.rows.map((r) => r.map(cellText));
  const widths = cols.map((h, c) => Math.max(MIN_COL, Math.ceil(Math.max(textWidth(h, PX) * 1.05, ...body.map((r) => textWidth(r[c] || "?", PX))) + PAD_X * 2)));
  const tableW = widths.reduce((a, b) => a + b, 0);
  const titleH = spec.title ? 30 : 0;
  const tableH = ROW_H * (body.length + 1);
  const w = Math.max(tableW, spec.title ? textWidth(spec.title, TITLE_PX) + 4 : 0) + 3;
  const h = titleH + tableH + 3;
  const x0 = 1.5;
  const y0 = titleH + 1.5;
  const parts: Record<string, Rect> = {};
  const aliases: Record<string, string> = {};
  const svg: string[] = [];
  const wrap = (id: string, inner: string) => (fresh.has(id) ? `<g data-fresh="1">${inner}</g>` : inner);
  if (spec.title) {
    svg.push(wrap("title", `<text x="${x0}" y="${n1(TITLE_PX + 2)}" font-family="${FONT}" font-size="${TITLE_PX}" font-weight="600" fill="${PENCIL}">${esc(spec.title)}</text>`));
    parts.title = { x: 0, y: 0, w: textWidth(spec.title, TITLE_PX), h: titleH - 6 };
  }
  // The header's fill, then the frame and the rules between cells.
  svg.push(`<path d="M${x0 + 12} ${y0} H${n1(x0 + tableW - 12)} Q${n1(x0 + tableW)} ${y0} ${n1(x0 + tableW)} ${y0 + 12} V${y0 + ROW_H} H${x0} V${y0 + 12} Q${x0} ${y0} ${x0 + 12} ${y0} Z" fill="${HEAD_FILL}" stroke="none"/>`);
  svg.push(`<rect x="${x0}" y="${y0}" width="${tableW}" height="${tableH}" rx="12" fill="none" stroke="${LINE}" stroke-width="1.5"/>`);
  for (let r = 1; r <= body.length; r++) svg.push(wrap(`r${r}c1`, `<path d="M${x0} ${y0 + r * ROW_H} H${n1(x0 + tableW)}" stroke="${LINE}" stroke-width="1.5" fill="none"/>`));
  let cx = x0;
  for (let c = 0; c < cols.length - 1; c++) {
    cx += widths[c];
    svg.push(`<path d="M${n1(cx)} ${y0} V${y0 + tableH}" stroke="${LINE}" stroke-width="1.5" fill="none"/>`);
  }
  // The cells.
  let left = x0;
  cols.forEach((head, c) => {
    const mid = left + widths[c] / 2;
    svg.push(`<text x="${n1(mid)}" y="${n1(y0 + ROW_H / 2 + PX * 0.36)}" text-anchor="middle" font-family="${FONT}" font-size="${PX}" font-weight="600" fill="${INK}">${esc(head)}</text>`);
    parts[`h${c + 1}`] = { x: left, y: y0, w: widths[c], h: ROW_H };
    parts[`c${c + 1}`] = { x: left, y: y0, w: widths[c], h: tableH };
    aliases[key(head)] = `c${c + 1}`;
    body.forEach((row, r) => {
      const id = `r${r + 1}c${c + 1}`;
      const top = y0 + ROW_H * (r + 1);
      const blank = isBlank(spec.rows[r][c] ?? "");
      const text = blank ? "?" : row[c];
      svg.push(wrap(id, `<text x="${n1(mid)}" y="${n1(top + ROW_H / 2 + PX * 0.36)}" text-anchor="middle" font-family="${FONT}" font-size="${PX}" font-weight="${blank ? 600 : 400}" fill="${blank ? SKY_DEEP : INK}">${esc(text)}</text>`));
      parts[id] = { x: left, y: top, w: widths[c], h: ROW_H };
    });
    left += widths[c];
  });
  body.forEach((row, r) => {
    parts[`r${r + 1}`] = { x: x0, y: y0 + ROW_H * (r + 1), w: tableW, h: ROW_H };
    // "x = 2" or "x=2" names the row whose first cell is 2.
    if (row[0]) aliases[key(`${cols[0]}=${row[0]}`)] = `r${r + 1}`;
  });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n1(w)} ${n1(h)}" width="${n1(w)}" height="${n1(h)}">${svg.join("")}</svg>`, w, h, parts, aliases };
}

/** The table as the tutor reads it back: "x | y: 0 | −1; 1 | ?". */
export function describeTable(spec: TableSpec): string {
  const rows = spec.rows.map((r) => r.map((c) => (isBlank(c) ? "?" : cellText(c))).join(" | "));
  return `${spec.columns.map(cellText).join(" | ")}: ${rows.join("; ") || "no rows yet"}`;
}
