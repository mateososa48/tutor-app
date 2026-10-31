// Things in containers, drawn exactly (Oct 31 2026). Reviewers found the
// illustrator's marble bag held 3 red and 2 blue with a red "set aside" beside
// it, six marbles, when the tutor meant five; a picture that miscounts is
// worse than none. These are containers (a bag, a plate, a box, a group) with
// counted coloured items, some crossed out, laid out left to right, so the
// facts say exactly what is there: marbles drawn from a bag, cookies shared
// onto plates, groups of objects.

import { textWidth } from "./illustration/scene";

export type GroupItem = { color: string; count: number; crossed?: number };
export type Group = { id: string; label?: string; shape: "bag" | "plate" | "box" | "loose"; items: GroupItem[] };
export type GroupsSpec = { kind: "groups"; groups: Group[] };
type Rect = { x: number; y: number; w: number; h: number };

const FONT = "Hanken Grotesk, system-ui, sans-serif";
const INK = "#3a3a42";
const LABEL = "#1d72dc";
const CROSS = "#d64545";
const COLORS: Record<string, [string, string]> = {
  red: ["#ef6b6b", "#c24646"],
  blue: ["#5aa9f5", "#2f7fd0"],
  green: ["#6cc47f", "#3e9a52"],
  yellow: ["#f5cd4f", "#c99c1b"],
  orange: ["#f5a04f", "#c9761b"],
  purple: ["#a98be8", "#7a5cc4"],
  white: ["#ffffff", "#9a9aa6"],
  black: ["#4a4a52", "#26262c"],
  brown: ["#c08a5a", "#8a5a30"],
  pink: ["#f39bc4", "#c96a96"],
};
const R = 9;
const STEP = 23;

/** One word for a kind of thing, whether it was said once or many times ("cookies", "cookie"). */
const sing = (w: string) => w.replace(/s$/, "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n1 = (v: number) => Math.round(v * 10) / 10;

/** "bag: 3 red, 2 blue | set aside: 1 red" ; "plate 1: 4 cookies | plate 2: 4 cookies"; "bag: 3 red, 2 blue, cross 1 red". */
export function parseGroups(text: string): GroupsSpec | { error: string } {
  const groups: Group[] = [];
  for (const [i, raw] of text.split("|").map((x) => x.trim()).filter(Boolean).entries()) {
    const m = /^(?:(.*?):\s*)?(.*)$/.exec(raw)!;
    const label = m[1]?.trim();
    const body = m[2].toLowerCase();
    // The container its label names; a later state of the same thing ("after one
    // red is drawn") keeps the one before; what was taken out lies loose.
    const l = label?.toLowerCase() ?? "";
    const named: Group["shape"] | null = /\bbag|jar\b/.test(l) ? "bag" : /plate|dish/.test(l) ? "plate" : /box|group|basket/.test(l) ? "box" : null;
    const shape: Group["shape"] = named ?? (/aside|taken|out\b|removed|loose|left over/.test(l) ? "loose" : groups[groups.length - 1]?.shape ?? "loose");
    const items: GroupItem[] = [];
    for (const part of body.split(/,|\band\b/).map((x) => x.trim()).filter(Boolean)) {
      const cross = /^cross(?:ed)?(?:\s*out)?\s+(\d+)\s+([a-z]+)/.exec(part);
      if (cross) {
        const it = items.find((x) => x.color === sing(cross[2]));
        if (!it) return { error: `groups "${raw}": cross ${cross[1]} ${cross[2]}, but there are none of those in it` };
        it.crossed = Math.min(it.count, (it.crossed ?? 0) + Number(cross[1]));
        continue;
      }
      const im = /^(\d+)\s+([a-z]+)/.exec(part);
      if (!im) return { error: `groups "${raw}": say each kind as a count and a word ("3 red, 2 blue")` };
      const word = sing(im[2]);
      items.push({ color: word, count: Number(im[1]) });
    }
    const total = items.reduce((a, x) => a + x.count, 0);
    if (!total || total > 40) return { error: `groups "${raw}": between 1 and 40 things fit in a group` };
    groups.push({ id: `G${i + 1}`, ...(label ? { label } : {}), shape, items });
  }
  if (!groups.length) return { error: "groups needs at least one group" };
  if (groups.length > 6) return { error: "groups: at most six groups" };
  return { kind: "groups", groups };
}

export function describeGroups(spec: GroupsSpec): string[] {
  return spec.groups.map((g) => {
    const items = g.items.map((x) => `${x.count} ${x.color}${x.count !== 1 && !COLORS[x.color] ? "s" : ""}${x.crossed ? ` (${x.crossed} crossed out)` : ""}`).join(", ");
    const left = g.items.reduce((a, x) => a + x.count - (x.crossed ?? 0), 0);
    return `${g.id}${g.label ? ` "${g.label}"` : ""}: ${items}${g.items.some((x) => x.crossed) ? `; ${left} not crossed out (not written)` : ""}`;
  });
}

export function renderGroups(spec: GroupsSpec): { svg: string; w: number; h: number; parts: Record<string, Rect>; aliases: Record<string, string> } {
  const out: string[] = [];
  const parts: Record<string, Rect> = {};
  const aliases: Record<string, string> = {};
  const M = 16;
  let x = M;
  let maxH = 0;
  const top = M + 24;
  for (const g of spec.groups) {
    const total = g.items.reduce((a, it) => a + it.count, 0);
    const cols = Math.min(total, total <= 6 ? 3 : total <= 12 ? 4 : 6);
    const rows = Math.ceil(total / cols);
    const innerW = cols * STEP;
    const innerH = rows * STEP;
    const pad = g.shape === "loose" ? 4 : 14;
    const w = innerW + pad * 2;
    const h = innerH + pad * 2;
    const labelW = g.label ? textWidth(g.label, 14) : 0;
    const boxW = Math.max(w, labelW);
    const bx = x + (boxW - w) / 2;
    if (g.label) {
      out.push(`<text x="${n1(x + boxW / 2)}" y="${n1(M + 14)}" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="600" fill="${INK}">${esc(g.label)}</text>`);
      aliases[g.label.toLowerCase().replace(/\s+/g, "")] = g.id;
    }
    if (g.shape === "bag") out.push(`<path d="M${n1(bx + 6)} ${n1(top + 6)}Q${n1(bx)} ${n1(top + h / 2)} ${n1(bx + 6)} ${n1(top + h - 4)}Q${n1(bx + w / 2)} ${n1(top + h + 6)} ${n1(bx + w - 6)} ${n1(top + h - 4)}Q${n1(bx + w)} ${n1(top + h / 2)} ${n1(bx + w - 6)} ${n1(top + 6)}Z" fill="#f4e6cc" stroke="#b99a62" stroke-width="1.6"/>`);
    else if (g.shape === "plate") out.push(`<ellipse cx="${n1(bx + w / 2)}" cy="${n1(top + h / 2)}" rx="${n1(w / 2)}" ry="${n1(h / 2)}" fill="#f5f6f8" stroke="#a8acb6" stroke-width="1.6"/>`);
    else if (g.shape === "box") out.push(`<rect x="${n1(bx)}" y="${n1(top)}" width="${n1(w)}" height="${n1(h)}" rx="10" fill="#f7f8fa" stroke="#a8acb6" stroke-width="1.6"/>`);
    let k = 0;
    const crossedBoxes: Rect[] = [];
    for (const it of g.items) {
      const [fill, edge] = COLORS[it.color] ?? ["#d8d8de", "#8a8a94"];
      for (let c = 0; c < it.count; c++, k++) {
        const cx = bx + pad + (k % cols) * STEP + STEP / 2;
        const cy = top + pad + Math.floor(k / cols) * STEP + STEP / 2;
        let dot = `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${R}" fill="${fill}" stroke="${edge}" stroke-width="1.4"/>`;
        // Unknown words (cookies, apples) are drawn as plain tokens, all alike.
        if (c >= it.count - (it.crossed ?? 0)) {
          dot += `<path d="M${n1(cx - R + 2)} ${n1(cy - R + 2)}L${n1(cx + R - 2)} ${n1(cy + R - 2)}M${n1(cx + R - 2)} ${n1(cy - R + 2)}L${n1(cx - R + 2)} ${n1(cy + R - 2)}" stroke="${CROSS}" stroke-width="2.4" stroke-linecap="round"/>`;
          crossedBoxes.push({ x: cx - R, y: cy - R, w: 2 * R, h: 2 * R });
        }
        out.push(dot);
      }
      const first = k - it.count;
      parts[`${g.id}.${it.color}`] = { x: bx + pad, y: top + pad + Math.floor(first / cols) * STEP, w: innerW, h: (Math.floor((k - 1) / cols) - Math.floor(first / cols) + 1) * STEP };
    }
    if (crossedBoxes.length) {
      const xs = crossedBoxes.map((b) => b.x);
      const ys = crossedBoxes.map((b) => b.y);
      parts[`${g.id}.crossed`] = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) + 2 * R - Math.min(...xs), h: Math.max(...ys) + 2 * R - Math.min(...ys) };
    }
    // The count of each kind under the group.
    const counts = g.items.map((it) => `${it.count} ${it.color}${it.count !== 1 && !COLORS[it.color] ? "s" : ""}`).join(", ");
    out.push(`<text x="${n1(x + boxW / 2)}" y="${n1(top + h + 20)}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="500" fill="${LABEL}">${esc(counts)}</text>`);
    const gw = Math.max(boxW, textWidth(counts, 13));
    parts[g.id] = { x, y: M, w: gw, h: top + h + 26 - M };
    maxH = Math.max(maxH, top + h + 30);
    x += gw + 28;
  }
  const w = Math.ceil(x - 28 + M);
  const h = Math.ceil(maxH);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${out.join("")}</svg>`, w, h, parts, aliases };
}
