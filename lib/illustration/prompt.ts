// The illustrator's prompt and the guard on what it returns (Oct 2026).
//
// The illustrator is a second, small model (Haiku 5.5; Gemini as a fallback)
// that turns "what to draw | what they should notice" into one scene for
// lib/illustration/scene.ts. The bake-off (bench/illustrate/g1, 10 cases, three
// blind raters) put Haiku on this scene language first of nine approaches
// (3.67 of 5, against 1.87 for today's picture tools), at about $0.0003 a
// picture. Model-written SVG and model-written objects (`defs`) both rated
// lower, so the production prompt offers neither.
//
// Pure: the prompt text, the request it is built from, and the label guard.

import { BOARD_ICON_NAMES } from "../board-icon-names.generated";
import { BUILTIN_NAMES, type Scene, type SceneNode } from "./scene";

export type IllustrateRequest = {
  grade: string;
  /** What to draw, in the planner's words ("12 marbles shared into 3 jars"). */
  what: string;
  /** What the student should notice ("each jar gets the same number"). */
  notice: string;
  /** The last few lines of the lesson, oldest first. */
  conversation: Array<{ who: "student" | "tutor"; text: string }>;
  /** The board as the tutor reads it (compact). */
  board: string;
};

const DESIGN = `How the picture should be:
- One idea, the one asked for. Nothing decorative.
- Quantities exactly as stated: count every object; equal parts are exactly equal.
- Words are labels of one to four words, never sentences.
- Never show a result the student has not said yet: no totals, no answers, no "= 4". Label what is given; use "?" for the unknown. The tutor asks for it next.
- Draw every object the request names, all of them: "12 marbles" means twelve marbles in the picture. If putting them into groups would show the answer, draw them loose beside the empty containers.
- Up and down (floors, temperature, height, depth) is a vertical axis with marks and moves, never objects in a row.
- A pie or a grid stands on its own, never inside a container.
- Say each thing once: a bracket or an edge label, never both with the same words.
- Arrows only between parts you gave an id, and only when something moves or turns into something; a label or a bracket says the rest.
- Readable on a phone: few labels, big enough objects.`;

const ICONS = BOARD_ICON_NAMES.join(" ");

const SCENE_DOC = `Reply with one JSON scene and nothing else. A layout engine places everything, so you never give coordinates. The scene:
{ "title"?: string,
  "root": node,
  "arrows"?: [{ "from": id, "to": id, "label"?: string }],
  "brackets"?: [{ "over": id or [ids], "side": "top"|"bottom"|"left"|"right", "label"?: string }] }
A node is one of:
  { "type": "row" | "column", "children": [nodes], "gap"?: px, "id"? }
  { "type": "items", "icon": name, "count": n, "per_row"?: n, "crossed"?: n (the last n get a red X), "highlight"?: n (the first n get a sky halo), "size"?: "s"|"m"|"l", "id"? }
  { "type": "icon", "icon": name, "size"?, "id"? }
  { "type": "container", "shape": "box"|"jar"|"bag"|"plate"|"circle"|"none", "child": node, "label"?: string, "label_side"?: "top"|"bottom", "id"? }
  { "type": "label", "text": string, "size"?, "tone"?: "ink"|"pencil"|"sky"|"green"|"red", "id"? }
  { "type": "bar", "parts": [{ "value"?: n, "label"?: string, "shade"?: bool }], "total_label"?: string, "id"? }   // equal parts unless values are given
  { "type": "grid", "rows": n, "cols": n, "shaded"?: n, "top_label"?: string, "side_label"?: string, "id"? }
  { "type": "pie", "slices": n, "shaded"?: n, "style"?: "plain"|"pizza", "label"?: string, "id"? }   // exactly equal slices
  { "type": "balance", "left": node, "right": node, "tilt"?: -1|0|1, "id"? }
  { "type": "axis", "min": n, "max": n, "step"?: n, "orientation"?: "horizontal"|"vertical", "unit"?: string, "marks"?: [{ "at": n, "icon"?: name, "label"?: string }], "moves"?: [{ "from": n, "to": n, "label"?: string }], "id"? }   // moves are arrows along the axis
  { "type": "bundles", "bundles": n, "size"?: 10, "loose"?: n, "id"? }   // place value: tied bundles of sticks and loose sticks; parts id.bundle1…, id.loose
  { "type": "spacer", "w"?: px, "h"?: px }
Give an id to every part the tutor may point at, short and plain ("jar1", "left", "total").
Objects drawn for you: ${BUILTIN_NAMES.join(" ")}. Emoji icons: ${ICONS}

Example (not this lesson): 8 apples shared into 2 baskets, each basket labelled:
{"root":{"type":"row","gap":40,"children":[{"type":"container","shape":"box","id":"b1","label":"Basket 1","child":{"type":"items","icon":"apple","count":4,"per_row":2}},{"type":"container","shape":"box","id":"b2","label":"Basket 2","child":{"type":"items","icon":"apple","count":4,"per_row":2}}]},"brackets":[{"over":["b1","b2"],"side":"top","label":"8 apples"}]}`;

export const ILLUSTRATOR_SYSTEM = `You draw one picture on a math tutor's shared whiteboard, in a live voice lesson with a student in grades 5-12. The tutor has just said "let me draw that" and is talking while you draw, so the picture has to be right the first time.

${DESIGN}

${SCENE_DOC}`;

export function illustratorPrompt(r: IllustrateRequest): string {
  const convo = r.conversation.slice(-6).map((l) => `${l.who === "tutor" ? "Tutor" : "Student"}: ${l.text.slice(0, 300)}`).join("\n");
  return [
    `Student: ${r.grade || "grade unknown"}.`,
    convo ? `The conversation so far:\n${convo}` : "",
    `On the board already: ${r.board.slice(0, 700) || "nothing"}`,
    `Draw: ${r.what.slice(0, 240)}`,
    r.notice ? `What the student should notice: ${r.notice.slice(0, 240)}` : "",
  ].filter(Boolean).join("\n\n");
}

// ── The guard ───────────────────────────────────────────────────────────

const NUMBER = /-?\d+(?:[.,]\d+)?(?:\/\d+)?%?/g;
// A word right before the number that makes it a name ("Jar 3"), and the words
// that make a number a result whatever comes before it ("total 12").
const NAMING = /\b[A-Za-z]{2,}\s*#?\s*$/;
const RESULT_WORD = /\b(?:total|sum|each|left|answer|altogether|all|makes|equals|is|are|gets?|per)\s*#?\s*$/i;

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  half: 2, third: 3, thirds: 3, fourth: 4, fourths: 4, quarter: 4, quarters: 4, fifth: 5, fifths: 5, sixth: 6, sixths: 6, eighth: 8, eighths: 8, tens: 10,
};

/** Every number written anywhere in `text` ("1/2" counts as 1/2, 1 and 2; "ten" counts as 10). */
function numbersIn(raw: string): Set<string> {
  const out = new Set<string>();
  // "bundles of ten" has seen 10 as surely as "10" (Oct 17 2026: a bundle labelled 10 became "?").
  const text = raw.replace(/\b[a-z]+\b/gi, (w) => (w.toLowerCase() in WORD_NUMBERS ? `${w} ${WORD_NUMBERS[w.toLowerCase()]}` : w));
  for (const m of text.matchAll(NUMBER)) {
    const n = m[0].replace(",", ".").replace(/%$/, "");
    out.add(n);
    out.add(n.replace(/^-/, ""));
    for (const piece of n.split("/")) out.add(piece.replace(/^-/, ""));
  }
  return out;
}

/**
 * The scene with every label number the student has not seen turned into "?".
 * `seen` is everything the student has had: the lesson so far, the board, and
 * the planner's own what/notice (which the illustrator was asked to draw).
 * Counts of objects are not labels and are left alone: drawing 12 marbles is
 * the point; writing "4 each" under them before the student says it is not.
 */
export function guardLabels(scene: Scene, seen: string): { scene: Scene; withheld: string[] } {
  const known = numbersIn(seen);
  const withheld: string[] = [];
  const fix = (text: string | undefined): string | undefined => {
    if (!text) return text;
    return text.replace(NUMBER, (n, at: number) => {
      const v = n.replace(",", ".").replace(/%$/, "").replace(/^-/, "");
      if (known.has(v)) return n;
      // Scaffolding, never an answer: zero (the ground), a whole (100%), and a
      // unit fraction of a whole already cut that way (1/8 on each eighth).
      if (v === "0" || n === "100%") return n;
      const unit = /^1\/(\d+)$/.exec(v);
      if (unit && known.has(unit[1])) return n;
      // "Jar 3", "Day 2", "Step 1": a number that names a part, not a result.
      const before = text.slice(0, at);
      if (/^\d{1,2}$/.test(v) && NAMING.test(before) && !RESULT_WORD.test(before)) return n;
      withheld.push(n);
      return "?";
    });
  };
  const walk = (node: SceneNode): SceneNode => {
    switch (node.type) {
      case "row":
      case "column":
        return { ...node, children: (node.children ?? []).map(walk) };
      case "container":
        return { ...node, label: fix(node.label), child: node.child ? walk(node.child) : node.child };
      case "label":
        return { ...node, text: fix(node.text) ?? "" };
      case "bar":
        return { ...node, total_label: fix(node.total_label), parts: (node.parts ?? []).map((p) => ({ ...p, label: fix(p.label) })) };
      case "grid":
        return { ...node, top_label: fix(node.top_label), side_label: fix(node.side_label) };
      case "pie":
        return { ...node, label: fix(node.label) };
      case "balance":
        return { ...node, left: walk(node.left), right: walk(node.right) };
      case "axis":
        return { ...node, marks: node.marks?.map((m) => ({ ...m, label: fix(m.label) })), moves: node.moves?.map((m) => ({ ...m, label: fix(m.label) })) };
      default:
        return node;
    }
  };
  const out: Scene = {
    ...scene,
    title: fix(scene.title),
    root: walk(scene.root),
    arrows: scene.arrows?.map((a) => ({ ...a, label: fix(a.label) })),
    brackets: scene.brackets?.map((b) => ({ ...b, label: fix(b.label) })),
  };
  delete out.defs;
  return { scene: out, withheld };
}

/** The ids the tutor can point at, for the tool result ("jar1, jar2, total"). */
export function partNames(parts: Record<string, unknown>): string[] {
  return Object.keys(parts).slice(0, 12);
}
