// The working of a problem as one column (Oct 31 2026). Mateo, on session
// 6banh2: "when it did the numbers written under the equations, it didn't use
// it to show steps. It just put -7 and then /3 in the same row even though
// they're different steps." A tutor's board reads top to bottom as the
// solution:
//
//     3x + 7 = 22
//        −7    −7      subtract 7
//     3x     = 15
//     ÷3       ÷3      divide by 3
//     x      = 5
//
// Every move sits between the line it acts on and the line it gives, written
// under both sides, and the equals signs line up. A line the student has to
// supply waits as "3x = ?" and is filled in place when they say it. The column
// is one picture on the board (the illustration shape), so it grows in place
// and only what is new is drawn in.
//
// Pure: the spec, its edits, and the drawing.

import { textWidth } from "./illustration/scene";

export type WorkLine = {
  id: string;
  /** The line as math: "3x + 7 = 22", "3x = ?", "x = 15/3". */
  text: string;
  /** Who it came from: the problem as given, the tutor, or the student's own step. */
  by: "given" | "tutor" | "student";
};

export type WorkMove = {
  id: string;
  /** The line this move acts on (the one above it). */
  after: string;
  /** What is done to each side, as written under it: "−7", "÷3". */
  left: string;
  right: string;
  /** The move in words, written beside the row: "subtract 7 from both sides". */
  note?: string;
};

export type WorkSpec = { kind: "work"; title?: string; lines: WorkLine[]; moves: WorkMove[] };

export type Rect = { x: number; y: number; w: number; h: number };
export type RenderedWork = { svg: string; w: number; h: number; parts: Record<string, Rect>; aliases: Record<string, string> };

const MATH_MAIN = "KaTeX_Main, 'Times New Roman', serif";
const MATH_ITALIC = "KaTeX_Math, 'Times New Roman', serif";
const HAND = "'tldraw_draw', 'Shantell Sans', cursive";
const INK = "#1d1d21";
const PENDING = "#1d7ee6";
const MARK = "#3d9cff";
const NOTE = "#3d9cff";
const PX = 26;
const MOVE_PX = 20;
const NOTE_PX = 17;
const LINE_H = 44;
const FRAC_H = 62;
const MOVE_H = 34;
const REL_GAP = 0.32 * PX;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n1 = (v: number) => Math.round(v * 10) / 10;

// ── Math as runs of text ────────────────────────────────────────────────

type Run =
  | { kind: "text"; text: string; italic: boolean; sup?: boolean }
  | { kind: "op"; text: string }
  | { kind: "frac"; top: Run[]; bottom: Run[] };

const BINARY = new Set(["+", "−", "×", "÷", "±"]);

/** "3x^2 - 7" as plain math text: a real minus, a times sign, the LaTeX we expect made plain. */
export function plainMath(text: string): string {
  return text
    .replace(/\$/g, "")
    .replace(/\\left|\\right|\\,|\\;|\\!/g, "")
    .replace(/\\(?:cdot|times)/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\le(?:q)?\b/g, "≤")
    .replace(/\\ge(?:q)?\b/g, "≥")
    .replace(/\\neq?\b/g, "≠")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\*/g, "×")
    .replace(/(^|[^\w)])-(?=\s*[\w(.])/g, "$1−")
    .replace(/(\w|\))\s*-\s*/g, "$1 − ")
    .replace(/\s*([+×÷±=<>≤≥≠])\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens of a side: numbers, letters, operators, powers and fractions. */
function runsOf(raw: string): Run[] {
  const s = raw.trim();
  const out: Run[] = [];
  let i = 0;
  const pushText = (text: string, italic: boolean, sup = false) => {
    const last = out[out.length - 1];
    if (last && last.kind === "text" && last.italic === italic && Boolean(last.sup) === sup) last.text += text;
    else out.push({ kind: "text", text, italic, ...(sup ? { sup } : {}) });
  };
  while (i < s.length) {
    const rest = s.slice(i);
    const frac = /^\\[dt]?frac\{([^{}]+)\}\{([^{}]+)\}/.exec(rest) ?? /^(\d+(?:\.\d+)?|[a-zA-Z])\s*\/\s*(\d+(?:\.\d+)?|[a-zA-Z])(?![\d.])/.exec(rest);
    if (frac) {
      out.push({ kind: "frac", top: runsOf(frac[1]), bottom: runsOf(frac[2]) });
      i += frac[0].length;
      continue;
    }
    const power = /^\^\{?([^{}\s]+)\}?/.exec(rest);
    if (power) {
      pushText(power[1].replace(/-/g, "−"), false, true);
      i += power[0].length;
      continue;
    }
    const ch = s[i];
    if (ch === " ") {
      i++;
      continue;
    }
    if (BINARY.has(ch) || "=<>≤≥≠".includes(ch)) {
      // A minus that starts the side, or follows an operator or bracket, is a sign.
      const prev = out[out.length - 1];
      if (ch === "−" && (!prev || prev.kind === "op" || (prev.kind === "text" && /\($/.test(prev.text)))) pushText("−", false);
      else out.push({ kind: "op", text: ch });
      i++;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      // A word of three or more letters ("cm", "sin") stays upright.
      const word = /^[a-zA-Z]+/.exec(rest)![0];
      if (word.length >= 2) {
        pushText(word, false);
        i += word.length;
        continue;
      }
      pushText(ch, true);
      i++;
      continue;
    }
    pushText(ch, false);
    i++;
  }
  return out;
}

const charW = (ch: string, italic: boolean) => (/\d/.test(ch) ? 0.5 : /[a-z]/.test(ch) ? (italic ? 0.55 : 0.5) : /[A-Z]/.test(ch) ? 0.72 : /[()]/.test(ch) ? 0.39 : /[.,]/.test(ch) ? 0.28 : ch === "?" ? 0.47 : ch === "−" ? 0.78 : 0.5);

function runsWidth(runs: Run[], px: number): number {
  let w = 0;
  for (const r of runs) {
    if (r.kind === "text") w += [...r.text].reduce((a, ch) => a + charW(ch, r.italic), 0) * px * (r.sup ? 0.7 : 1);
    else if (r.kind === "op") w += 0.78 * px + 2 * REL_GAP * (px / PX) * (BINARY.has(r.text) ? 0.7 : 1);
    else w += Math.max(runsWidth(r.top, px * 0.72), runsWidth(r.bottom, px * 0.72)) + 0.24 * px;
  }
  return w;
}

const hasFrac = (runs: Run[]) => runs.some((r) => r.kind === "frac");

/** SVG for runs, left edge at x, baseline at y. */
function drawRuns(runs: Run[], x: number, y: number, px: number, fill: string): string {
  const out: string[] = [];
  let cx = x;
  for (const r of runs) {
    if (r.kind === "text") {
      const w = [...r.text].reduce((a, ch) => a + charW(ch, r.italic), 0) * px * (r.sup ? 0.7 : 1);
      const size = r.sup ? px * 0.7 : px;
      const by = r.sup ? y - px * 0.42 : y;
      // A "?" is a blank for the student, in the deep sky.
      const color = /^\?+$/.test(r.text) ? PENDING : fill;
      out.push(`<text x="${n1(cx)}" y="${n1(by)}" font-family="${r.italic ? MATH_ITALIC : MATH_MAIN}" font-size="${n1(size)}" ${r.italic ? 'font-style="italic"' : ""} fill="${color}">${esc(r.text)}</text>`);
      cx += w;
    } else if (r.kind === "op") {
      const gap = REL_GAP * (px / PX) * (BINARY.has(r.text) ? 0.7 : 1);
      cx += gap;
      out.push(`<text x="${n1(cx)}" y="${n1(y)}" font-family="${MATH_MAIN}" font-size="${px}" fill="${fill}">${esc(r.text)}</text>`);
      cx += 0.78 * px + gap;
    } else {
      const small = px * 0.72;
      const tw = runsWidth(r.top, small);
      const bw = runsWidth(r.bottom, small);
      const w = Math.max(tw, bw) + 0.24 * px;
      const mid = y - px * 0.3;
      out.push(drawRuns(r.top, cx + (w - tw) / 2, mid - px * 0.18, small, fill));
      out.push(`<path d="M${n1(cx + 0.06 * px)} ${n1(mid)}H${n1(cx + w - 0.06 * px)}" stroke="${fill}" stroke-width="${n1(px * 0.05)}" fill="none"/>`);
      out.push(drawRuns(r.bottom, cx + (w - bw) / 2, mid + small * 0.92, small, fill));
      cx += w;
    }
  }
  return out.join("");
}

// ── The spec ────────────────────────────────────────────────────────────

/** A line's sides at its first relation: ["3x + 7", "=", "22"], or [whole, null, null]. */
export function splitLine(text: string): [string, string | null, string | null] {
  const t = plainMath(text);
  const m = /\s([=<>≤≥≠])\s/.exec(` ${t} `);
  if (!m) return [t, null, null];
  const at = (` ${t} `).indexOf(m[0]) - 1 + 1;
  return [t.slice(0, at).trim(), m[1], t.slice(at + 1).trim()];
}

const key = (s: string) => plainMath(s).replace(/\s+/g, "").replace(/[−–]/g, "-").toLowerCase();

/** A new column with the problem as its first line. */
export function startWork(problem: string, title?: string): WorkSpec {
  return { kind: "work", ...(title ? { title } : {}), lines: [{ id: "L1", text: problem, by: "given" }], moves: [] };
}

/** The newest line: where the next move goes. */
export function lastLine(spec: WorkSpec): WorkLine {
  return spec.lines[spec.lines.length - 1];
}

/** Is a line still waiting for the student ("3x = ?")? */
export const isPending = (line: WorkLine) => /\?/.test(line.text);

/**
 * A move under the newest line, and the line it gives (or a "?" line for the
 * student). Refused when the newest line is still waiting: a move is never
 * written under a line nobody has finished (Oct 26 2026: "÷3" went under the
 * first line, beside "−7").
 */
export function addStep(spec: WorkSpec, step: { left: string; right: string; note?: string; result: string | null; by?: WorkLine["by"] }): { spec: WorkSpec; fresh: Set<string>; move: string; line: string } | { error: string } {
  const above = lastLine(spec);
  if (isPending(above)) return { error: `${above.id} ("${plainMath(above.text)}") is still waiting for the student; fill it first, then the next move goes under it.` };
  if (spec.moves.some((m) => m.after === above.id)) return { error: `${above.id} already has its move under it.` };
  const [, rel] = splitLine(above.text);
  const move: WorkMove = { id: `M${spec.moves.length + 1}`, after: above.id, left: step.left.trim(), right: step.right.trim(), ...(step.note ? { note: step.note.trim().slice(0, 48) } : {}) };
  // No result: the whole line is theirs to say, written as blanks on each side.
  const resultText = step.result?.trim() || `? ${rel ?? "="} ?`;
  const line: WorkLine = { id: `L${spec.lines.length + 1}`, text: resultText, by: step.by ?? "tutor" };
  return { spec: { ...spec, lines: [...spec.lines, line], moves: [...spec.moves, move] }, fresh: new Set([move.id, line.id]), move: move.id, line: line.id };
}

/** Fill a waiting line with what the student said (same id, drawn in again). */
export function fillLine(spec: WorkSpec, lineId: string, text: string, by: WorkLine["by"] = "student"): { spec: WorkSpec; fresh: Set<string> } | { error: string } {
  const at = spec.lines.findIndex((l) => l.id === lineId);
  if (at < 0) return { error: `No line ${lineId}.` };
  const lines = spec.lines.map((l, i) => (i === at ? { ...l, text, by } : l));
  return { spec: { ...spec, lines }, fresh: new Set([lineId]) };
}

/** A line written under the newest one with no move between (a rewrite, a check). */
export function addLine(spec: WorkSpec, text: string, by: WorkLine["by"]): { spec: WorkSpec; fresh: Set<string>; line: string } {
  const line: WorkLine = { id: `L${spec.lines.length + 1}`, text, by };
  return { spec: { ...spec, lines: [...spec.lines, line] }, fresh: new Set([line.id]), line: line.id };
}

// ── The drawing ─────────────────────────────────────────────────────────

/** Draw the column: sides aligned on the relation, each move under its line. */
export function renderWork(spec: WorkSpec, fresh: Set<string> = new Set()): RenderedWork {
  const rows = spec.lines.map((l) => {
    const [left, rel, right] = splitLine(l.text);
    const lr = runsOf(left);
    const rr = right !== null ? runsOf(right) : [];
    return { line: l, lr, rel, rr, lw: runsWidth(lr, PX), rw: rr.length ? runsWidth(rr, PX) : 0, tall: hasFrac(lr) || hasFrac(rr) };
  });
  const moveOf = (id: string) => spec.moves.find((m) => m.after === id);
  const titleH = spec.title ? 30 : 0;
  const pad = 6;
  // The relation column: right of the widest left side.
  const leftW = Math.max(...rows.filter((r) => r.rel).map((r) => r.lw), ...spec.moves.map((m) => textWidth(m.left, MOVE_PX) + 8), 40);
  const relX = pad + leftW + REL_GAP;
  // Where every right side starts: as far after the relation as the left side ends before it.
  const rightX = relX + 0.78 * PX + REL_GAP;
  const rightW = Math.max(...rows.map((r) => (r.rel ? r.rw : r.lw - leftW)), ...spec.moves.map((m) => textWidth(m.right, MOVE_PX) + 8), 20);
  const noteX = rightX + rightW + 26;
  const noteW = Math.max(0, ...spec.moves.map((m) => (m.note ? textWidth(m.note, NOTE_PX) : 0)));
  const w = noteX + (noteW ? noteW + 8 : 0) + pad;
  const parts: Record<string, Rect> = {};
  const aliases: Record<string, string> = {};
  const svg: string[] = [];
  const wrap = (id: string, inner: string) => (fresh.has(id) ? `<g data-fresh="1">${inner}</g>` : inner);
  let y = titleH;
  if (spec.title) svg.push(`<text x="${pad}" y="20" font-family="'tldraw_sans', 'IBM Plex Sans', system-ui, sans-serif" font-size="15" font-weight="600" fill="#5b5b66">${esc(spec.title)}</text>`);
  for (const r of rows) {
    const h = r.tall ? FRAC_H : LINE_H;
    const base = y + h * (r.tall ? 0.62 : 0.68);
    const color = INK;
    let inner = "";
    if (r.rel) {
      inner += drawRuns(r.lr, relX - REL_GAP - r.lw, base, PX, color);
      inner += `<text x="${n1(relX)}" y="${n1(base)}" font-family="${MATH_MAIN}" font-size="${PX}" fill="${color}">${esc(r.rel)}</text>`;
      inner += drawRuns(r.rr, rightX, base, PX, color);
      parts[`${r.line.id}.left`] = { x: relX - REL_GAP - r.lw, y, w: r.lw, h };
      parts[`${r.line.id}.right`] = { x: rightX, y, w: r.rw, h };
      parts[r.line.id] = { x: relX - REL_GAP - r.lw, y, w: rightX + r.rw - (relX - REL_GAP - r.lw), h };
    } else {
      inner += drawRuns(r.lr, pad, base, PX, color);
      parts[r.line.id] = { x: pad, y, w: r.lw, h };
    }
    svg.push(wrap(r.line.id, inner));
    aliases[key(r.line.text)] = r.line.id;
    y += h;
    const m = moveOf(r.line.id);
    // A move with nothing written (a rewrite of the same line) takes no row.
    if (m && (m.left || m.right || m.note)) {
      const my = y + MOVE_H * 0.62;
      let mv = "";
      // Under each side, at its inner edge: the left move ends where the left side ends.
      mv += `<text x="${n1(relX - REL_GAP)}" y="${n1(my)}" text-anchor="end" font-family="${HAND}" font-size="${MOVE_PX}" font-weight="600" fill="${MARK}">${esc(m.left)}</text>`;
      mv += `<text x="${n1(rightX)}" y="${n1(my)}" font-family="${HAND}" font-size="${MOVE_PX}" font-weight="600" fill="${MARK}">${esc(m.right)}</text>`;
      if (m.note) mv += `<text x="${n1(noteX)}" y="${n1(my)}" font-family="${HAND}" font-size="${NOTE_PX}" fill="${NOTE}">${esc(m.note)}</text>`;
      svg.push(wrap(m.id, mv));
      const lw = textWidth(m.left, MOVE_PX);
      parts[m.id] = { x: relX - REL_GAP - lw, y, w: rightX + textWidth(m.right, MOVE_PX) - (relX - REL_GAP - lw), h: MOVE_H };
      parts[`${m.id}.left`] = { x: relX - REL_GAP - lw, y, w: lw, h: MOVE_H };
      parts[`${m.id}.right`] = { x: rightX, y, w: textWidth(m.right, MOVE_PX), h: MOVE_H };
      if (m.note) parts[`${m.id}.note`] = { x: noteX, y, w: textWidth(m.note, NOTE_PX), h: MOVE_H };
      y += MOVE_H;
    }
  }
  const h = y + 6;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n1(w)} ${n1(h)}" width="${n1(w)}" height="${n1(h)}">${svg.join("")}</svg>`, w, h, parts, aliases };
}

/** The column as the tutor reads it back: "L1 3x + 7 = 22 | M1 −7 −7 | L2 3x = ?". */
export function describeWork(spec: WorkSpec): string {
  const out: string[] = [];
  for (const l of spec.lines) {
    out.push(`${l.id} ${plainMath(l.text)}${l.by === "student" ? " (theirs)" : ""}`);
    const m = spec.moves.find((x) => x.after === l.id);
    if (m) out.push(`${m.id} ${m.left} | ${m.right}${m.note ? ` (${m.note})` : ""}`);
  }
  return out.join("; ");
}
