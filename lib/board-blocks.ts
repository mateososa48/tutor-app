// Base-ten blocks drawn exactly (Oct 31 2026). Reviewers of the engine's
// sessions found the illustrator's place-value pictures did not match what
// the tutor said ("forty-two after the trade" over a picture of 42, twelve
// cubes described while sticks were drawn). Place value is too central for
// "close": these are rods of ten and single cubes, counted from numbers, in
// rows that show one state each (42, then after a trade, then with seven taken
// away). The facts say exactly what each row shows, so the speech can match it.

import { textWidth } from "./illustration/scene";

export type BlocksRow = {
  id: string;
  label?: string;
  tens: number;
  ones: number;
  /** Ones that came from breaking a ten, drawn in sky (counted in `ones`). */
  newOnes?: number;
  crossTens?: number;
  crossOnes?: number;
};
export type BlocksSpec = { kind: "blocks"; title?: string; rows: BlocksRow[] };
type Rect = { x: number; y: number; w: number; h: number };

const FONT = "Hanken Grotesk, system-ui, sans-serif";
const CELL = 13;
const ROD_W = 16;
const GAP = 8;
const WOOD = "#f2d49a";
const WOOD_EDGE = "#b98a3e";
const NEW = "#cfe6ff";
const NEW_EDGE = "#3d9cff";
const CROSS = "#d64545";
const INK = "#3a3a42";
const LABEL = "#1d72dc";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n1 = (v: number) => Math.round(v * 10) / 10;

/** "42: 4 tens 2 ones | after the trade: 3 tens 12 ones (10 new) | take away 7: 3 tens 12 ones, cross 7 ones". */
export function parseBlocks(text: string): BlocksSpec | { error: string } {
  const rows: BlocksRow[] = [];
  for (const [i, raw] of text.split("|").map((x) => x.trim()).filter(Boolean).entries()) {
    const m = /^(?:(.*?):\s*)?(.*)$/.exec(raw)!;
    const label = m[1]?.trim();
    const body = m[2].toLowerCase();
    const num = (re: RegExp) => Number(re.exec(body)?.[1] ?? 0);
    const tens = num(/(\d+)\s*tens?\b/);
    const ones = num(/(\d+)\s*ones?\b/);
    const newOnes = num(/\((\d+)\s*new\)/) || num(/(\d+)\s*new\b/);
    const crossOnes = num(/cross(?:ed)?(?:\s*out)?\s*(\d+)\s*ones?/);
    const crossTens = num(/cross(?:ed)?(?:\s*out)?\s*(\d+)\s*tens?/);
    if (!/\d+\s*tens?\b|\d+\s*ones?\b/.test(body)) return { error: `blocks row "${raw}": say how many tens and ones ("4 tens 2 ones")` };
    if (tens > 12 || ones > 20) return { error: `blocks row "${raw}": at most 12 tens and 20 ones fit` };
    if (newOnes > ones || crossOnes > ones || crossTens > tens) return { error: `blocks row "${raw}": the new or crossed ones are more than the ones there` };
    // A row named by a number shows that number.
    const named = label && /^\d+$/.test(label) ? Number(label) : null;
    if (named !== null && named !== tens * 10 + ones) return { error: `blocks row "${raw}": ${tens} tens and ${ones} ones is ${tens * 10 + ones}, not ${named}` };
    rows.push({ id: `R${i + 1}`, ...(label ? { label } : {}), tens, ones, ...(newOnes ? { newOnes } : {}), ...(crossOnes ? { crossOnes } : {}), ...(crossTens ? { crossTens } : {}) });
  }
  if (!rows.length) return { error: "blocks needs at least one row" };
  if (rows.length > 3) return { error: "blocks: at most three rows" };
  return { kind: "blocks", rows };
}

export function describeBlocks(spec: BlocksSpec): string[] {
  return spec.rows.map((r) => {
    const parts = [`${r.tens} tens rods and ${r.ones} ones cubes`];
    if (r.newOnes) parts.push(`${r.newOnes} of the ones are new from breaking a ten (drawn in blue)`);
    if (r.crossOnes) parts.push(`${r.crossOnes} ones crossed out`);
    if (r.crossTens) parts.push(`${r.crossTens} tens crossed out`);
    const left = r.tens * 10 + r.ones - (r.crossOnes ?? 0) - 10 * (r.crossTens ?? 0);
    return `row ${r.id}${r.label ? ` "${r.label}"` : ""}: ${parts.join(", ")}${r.crossOnes || r.crossTens ? ` (${left} left, not written)` : ""}`;
  });
}

const crossLines = (x: number, y: number, w: number, h: number) =>
  `<path d="M${n1(x + 2)} ${n1(y + 2)}L${n1(x + w - 2)} ${n1(y + h - 2)}M${n1(x + w - 2)} ${n1(y + 2)}L${n1(x + 2)} ${n1(y + h - 2)}" stroke="${CROSS}" stroke-width="2.4" stroke-linecap="round"/>`;

export function renderBlocks(spec: BlocksSpec): { svg: string; w: number; h: number; parts: Record<string, Rect>; aliases: Record<string, string> } {
  const out: string[] = [];
  const parts: Record<string, Rect> = {};
  const aliases: Record<string, string> = {};
  const M = 16;
  // States side by side, left to right, an arrow between them.
  let left = M;
  let width = 0;
  const top = M + 24;
  const bottom = top + CELL * 10;
  spec.rows.forEach((r, i) => {
    if (i > 0) {
      const ax = left - 34;
      out.push(`<path d="M${n1(ax)} ${n1(top + CELL * 5)}H${n1(ax + 22)}M${n1(ax + 15)} ${n1(top + CELL * 5 - 6)}L${n1(ax + 22)} ${n1(top + CELL * 5)}L${n1(ax + 15)} ${n1(top + CELL * 5 + 6)}" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    if (r.label) {
      out.push(`<text x="${n1(left)}" y="${n1(M + 14)}" font-family="${FONT}" font-size="15" font-weight="600" fill="${INK}">${esc(r.label)}</text>`);
      aliases[r.label.toLowerCase().replace(/\s+/g, "")] = r.id;
    }
    let x = left;
    const tensStart = x;
    for (let t = 0; t < r.tens; t++) {
      const crossed = t >= r.tens - (r.crossTens ?? 0);
      let rod = `<rect x="${n1(x)}" y="${n1(top)}" width="${ROD_W}" height="${CELL * 10}" rx="2" fill="${WOOD}" stroke="${WOOD_EDGE}" stroke-width="1.3"/>`;
      for (let c = 1; c < 10; c++) rod += `<path d="M${n1(x)} ${n1(top + c * CELL)}H${n1(x + ROD_W)}" stroke="${WOOD_EDGE}" stroke-width="0.8" opacity="0.7"/>`;
      if (crossed) rod += crossLines(x, top, ROD_W, CELL * 10);
      out.push(`<g data-part="${r.id}.t${t + 1}">${rod}</g>`);
      parts[`${r.id}.t${t + 1}`] = { x, y: top, w: ROD_W, h: CELL * 10 };
      x += ROD_W + 6;
    }
    if (r.tens) {
      parts[`${r.id}.tens`] = { x: tensStart, y: top, w: x - 6 - tensStart, h: CELL * 10 };
      out.push(`<text x="${n1(tensStart)}" y="${n1(bottom + 18)}" font-family="${FONT}" font-size="13" font-weight="500" fill="${LABEL}">${r.tens} ten${r.tens === 1 ? "" : "s"}</text>`);
    }
    const tensLabelEnd = r.tens ? tensStart + textWidth(`${r.tens} tens`, 13) : tensStart;
    // Ones: cubes in columns of five from the bottom, the new ones (from a trade) last, in blue.
    const onesStart = Math.max(x + (r.tens ? GAP : 0), tensLabelEnd + 10);
    const per = 5;
    const plain = r.ones - (r.newOnes ?? 0);
    for (let o = 0; o < r.ones; o++) {
      const cx = onesStart + Math.floor(o / per) * (CELL + 5);
      const cy = bottom - ((o % per) + 1) * (CELL + 5) + 5;
      const fresh = o >= plain;
      const crossed = o >= r.ones - (r.crossOnes ?? 0);
      let cube = `<rect x="${n1(cx)}" y="${n1(cy)}" width="${CELL}" height="${CELL}" rx="2" fill="${fresh ? NEW : WOOD}" stroke="${fresh ? NEW_EDGE : WOOD_EDGE}" stroke-width="1.3"/>`;
      if (crossed) cube += crossLines(cx, cy, CELL, CELL);
      out.push(`<g data-part="${r.id}.o${o + 1}">${cube}</g>`);
      parts[`${r.id}.o${o + 1}`] = { x: cx, y: cy, w: CELL, h: CELL };
    }
    const onesW = r.ones ? Math.ceil(r.ones / per) * (CELL + 5) - 5 : 0;
    let right = x;
    if (r.ones) {
      const lab = `${r.ones} one${r.ones === 1 ? "" : "s"}`;
      parts[`${r.id}.ones`] = { x: onesStart, y: bottom - Math.min(r.ones, per) * (CELL + 5) + 5, w: onesW, h: Math.min(r.ones, per) * (CELL + 5) - 5 };
      out.push(`<text x="${n1(onesStart)}" y="${n1(bottom + 18)}" font-family="${FONT}" font-size="13" font-weight="500" fill="${LABEL}">${lab}</text>`);
      right = onesStart + Math.max(onesW, textWidth(lab, 13));
      const group = (from: number, n: number) => {
        const bs = Array.from({ length: n }, (_, k) => parts[`${r.id}.o${from + k + 1}`]);
        const xs = bs.map((b) => b.x);
        const ys = bs.map((b) => b.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) + CELL - Math.min(...xs), h: Math.max(...ys) + CELL - Math.min(...ys) };
      };
      if (r.crossOnes) parts[`${r.id}.crossed`] = group(r.ones - r.crossOnes, r.crossOnes);
      if (r.newOnes) parts[`${r.id}.new`] = group(plain, r.newOnes);
    }
    right = Math.max(right, r.label ? left + textWidth(r.label, 15) : 0);
    parts[r.id] = { x: left, y: M, w: right - left, h: bottom + 22 - M };
    width = right;
    left = right + 48;
  });
  const y = bottom + 30;
  const w = Math.ceil(width + M);
  const h = Math.ceil(y - 4);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${out.join("")}</svg>`, w, h, parts, aliases };
}
