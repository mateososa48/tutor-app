// The icon library (Oct 19 2026, Mateo's idea): instead of a fixed list of
// 380 names in the prompt, the illustrator gets a library it can search: all
// 3,174 Fluent Emoji Flat icons (Microsoft, MIT) plus the objects
// lib/illustration/scene.ts draws itself (coins, marbles, measuring cups…),
// which come first when both fit.
//
// Server and scripts only: it reads the icon set from node_modules, which is
// far too big (about 4 MB) to ship to the browser. A picture drawn from it is
// rendered where the library is, and the SVG goes to the board.

import fs from "node:fs";
import path from "node:path";
import { BUILTIN_NAMES, PARAM_OBJECT_NAMES } from "./scene";

type Icon = { body: string; w: number; h: number };

let LIB: Map<string, Icon> | null = null;

// Skin-tone and direction variants of the same picture: one is enough.
const VARIANT = /_(light|medium_light|medium|medium_dark|dark)$|_facing_right/;

/** All library icons by engine name (underscores), loaded once. */
export function iconLibrary(): Map<string, Icon> {
  if (LIB) return LIB;
  const file = path.join(process.cwd(), "node_modules", "@iconify-json", "fluent-emoji-flat", "icons.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as { icons: Record<string, { body: string; width?: number; height?: number }>; width?: number; height?: number };
  LIB = new Map();
  for (const [name, v] of Object.entries(json.icons)) {
    const key = name.replace(/-/g, "_");
    if (VARIANT.test(key)) continue;
    LIB.set(key, { body: v.body, w: v.width ?? json.width ?? 32, h: v.height ?? json.height ?? 32 });
  }
  return LIB;
}

/** A library icon by name ("egg", "dollar-banknote", "Dollar Banknote"), or null. */
export function libraryIcon(name: string): Icon | null {
  return iconLibrary().get(name.trim().toLowerCase().replace(/[\s-]+/g, "_")) ?? null;
}

const STOP = new Set(
  "a an the and or of in on at to for from with by each every one two three four five six seven eight nine ten one per side next beside then that this these those as is are be it its their his her them they all same equal more less than into out up down over under labelled labeled label labels marked showing shown show draw drawn row rows column columns group groups box boxes empty full half quarter left right top bottom above below middle start end first last other another both some any part parts whole kind order shaded size big small tall short long wide height heights length number numbers value values written".split(" "),
);

// Words a lesson uses for something the library calls by another name.
const SYNONYMS: Record<string, string[]> = {
  kid: ["kid", "child", "boy", "girl"], kids: ["kid", "child"], child: ["kid", "child"], children: ["kid", "child"], student: ["kid", "student"], person: ["kid", "person"], people: ["kid", "person"],
  pants: ["pants", "jeans"], trousers: ["pants", "jeans"], tshirt: ["shirt", "t_shirt"], shirt: ["shirt", "t_shirt"],
  cookie: ["cookie"], cupcake: ["cupcake"], cake: ["round_cake", "birthday_cake", "shortcake"], pizza: ["pizza"], dollar: ["dollar_banknote"], bill: ["dollar_banknote"], money: ["dollar_banknote", "coin"],
  car: ["automobile"], bike: ["bicycle"], seat: ["chair", "seat"], drawer: ["box"], tile: ["block"], tiles: ["block"], cube: ["cube", "block"], egg: ["egg"], carton: ["box"],
  juice: ["glass", "beverage_box"], water: ["glass", "droplet"], milk: ["glass_of_milk"], flour: ["measuring_cup"], scoop: ["measuring_cup"], rice: ["cooked_rice"],
  sticker: ["star"], stickers: ["star"], plant: ["potted_plant", "seedling"], bacterium: ["microbe"], bacteria: ["microbe"], diver: ["person_swimming", "diving_mask"], hiker: ["person_walking"],
  snack: ["chocolate_bar", "cookie"], battery: ["battery"], phone: ["mobile_phone"], meal: ["pot_of_food"], rug: ["block"], garden: ["seedling"], patio: ["block"],
};

const singular = (w: string) => (w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("ses") || w.endsWith("xes") ? w.slice(0, -2) : w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** The best icon names for a word or phrase, ours first, then the library's. */
export function searchIcons(query: string, k = 3): string[] {
  const words = query.toLowerCase().replace(/[^a-z\s_-]/g, " ").split(/[\s_-]+/).filter(Boolean).map(singular);
  if (!words.length) return [];
  const wanted = new Set<string>([...words, ...words.flatMap((w) => SYNONYMS[w] ?? SYNONYMS[`${w}s`] ?? [])]);
  const ours = [...BUILTIN_NAMES, ...PARAM_OBJECT_NAMES];
  const scored: Array<{ name: string; score: number }> = [];
  const consider = (name: string, own: boolean) => {
    const parts = name.split("_").map(singular);
    const hits = parts.filter((p) => wanted.has(p)).length + (wanted.has(name) ? 2 : 0);
    if (!hits) return;
    // Fewer extra words is closer ("egg" over "nest_with_eggs"); our own drawings win ties.
    scored.push({ name, score: hits * 3 - (parts.length - Math.min(parts.length, hits)) * 0.8 + (own ? 1.5 : 0) + (parts.join("_") === words.join("_") ? 2 : 0) });
  };
  for (const n of ours) consider(n, true);
  for (const n of iconLibrary().keys()) consider(n, false);
  return [...new Map(scored.sort((a, b) => b.score - a.score).map((s) => [s.name, s])).keys()].slice(0, k);
}

/** The things a request names ("20 crayons beside 5 empty boxes" → crayons, boxes), longest first. */
export function requestNouns(what: string): string[] {
  const clean = what.toLowerCase().replace(/"[^"]*"|'[^']*'/g, " ").replace(/[^a-z\s-]/g, " ");
  const words = clean.split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i + 1 < words.length && clean.includes(`${words[i]} ${words[i + 1]}`)) out.push(`${words[i]} ${words[i + 1]}`);
    out.push(words[i]);
  }
  return [...new Set(out)].slice(0, 12);
}

/**
 * The icon hint for a request: each thing it names with the icons that show
 * it, for the illustrator to use by name. Things nothing matches are left out
 * (the illustrator falls back to shapes and labels).
 */
export function iconHints(what: string): string {
  const lines: string[] = [];
  const used = new Set<string>();
  for (const noun of requestNouns(what)) {
    const hits = searchIcons(noun, 3).filter((h) => !used.has(h));
    if (!hits.length) continue;
    hits.forEach((h) => used.add(h));
    lines.push(`${noun}: ${hits.join(", ")}`);
    if (lines.length >= 8) break;
  }
  return lines.length ? `Icons for this picture (use these exact names; the first is usually best):\n${lines.join("\n")}` : "";
}
