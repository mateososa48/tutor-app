// The tutor's own way to ask for a picture of real things (Oct 23 2026).
//
// Until now only the planner could order one (illustrate(what | notice) in its
// order), and the live A/B drew one picture in 84 turns: the planner is asked
// on about half of spoken lines and not at all while it is paused. The voice
// model still had its own object pictures (draw_icons, draw_sketch,
// draw_tape_diagram, draw_balance), which rated 1.87 in the bake-off against
// the illustrator's 3.67 (and 4.32 with recipes, held-out cases). So the voice
// model gets `illustrate` in their place: it says what to draw, the app asks
// /api/illustrate (Haiku 5.5 with the recipe for the picture's kind) and draws
// the scene while the tutor talks. The voice model never draws it itself.
//
// Exact math pictures keep their tools: a fraction, a number line, a grid of
// squares, an area model, a figure to scale, a graph, a table.

import type { ToolDeclaration } from "../whiteboard-tools";
import { spokenToDigits } from "../answer-check";

/** The four object-picture tools `illustrate` replaces in a Live session (still replayed by the dispatcher). */
export const REPLACED_BY_ILLUSTRATE = ["draw_icons", "draw_sketch", "draw_tape_diagram", "draw_balance"] as const;

// A Live session gets only a description's first sentence (liveDeclarationOf),
// so the first sentence carries what it is for; the parameters carry the rules.
export const ILLUSTRATE_DECLARATION: ToolDeclaration = {
  name: "illustrate",
  description:
    "Have a picture of real things drawn while you talk: things to count, share or group, coins and prices, a recipe or mix, a trip, floors or temperatures, an equation as a balance, a whole cut into equal parts.",
  parameters: {
    type: "object",
    properties: {
      what: {
        type: "string",
        description:
          "The whole scene as it should look: the real things, exact counts, how they are grouped, and every number to show ('12 marbles shared into 3 jars, one jar per friend'; '5 brownies on 2 plates, 2 on each, the fifth cut in half with one half on each plate'), never a change like 'cut the last one in half'. Never the answer they are about to find, never 'circles' or 'shapes'.",
      },
      notice: {
        type: "string",
        description: "What the student should see in it ('each jar gets the same number').",
      },
    },
    required: ["what"],
  },
};

/** The request a call asks for, or null when it names nothing to draw. */
export function illustrateRequest(args: Record<string, unknown>): { what: string; notice: string } | null {
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const what = clean(args.what, 300);
  // "a picture" or "shapes" is nothing an artist can draw; the description asks for the real things.
  if (what.length < 8) return null;
  return { what, notice: clean(args.notice, 300) };
}

/**
 * How long the tutor's call waits for its picture before it answers. The
 * illustrator takes 1.3 s at the median and gives up at 7 s (/api/illustrate);
 * the call answers by then either way, and a picture still on its way lands
 * when it comes.
 */
export const ILLUSTRATE_WAIT_MS = 5_500;

export const ILLUSTRATE_PENDING = "Drawing it; it appears on the board in a moment. Its parts are in the board list once it is up.";

export function illustrateFailed(why: string): string {
  return `The picture could not be drawn (${why}). Go on without it; if you said you'd draw it, say so in a few words.`;
}

export const ILLUSTRATE_NOTHING = "Say what to draw: the real things with their counts ('12 marbles shared into 3 jars').";

// ── One picture of one thing ────────────────────────────────────────────
// Oct 23 2026, bench: the same coins were drawn twice on consecutive turns
// ("3 dimes marked 10 cents and 4 nickels marked 5 cents", then again), once by
// the planner's order and once by the tutor. A picture still on the board is
// pointed at, not drawn again.

const STOP = new Set("a an and the of in on with each for to into per one all its their them they marked labelled labeled showing show drawn picture same".split(" "));

/** The words that say what a picture is: its counts and its things. */
export function pictureWords(what: string): Set<string> {
  // "seven loose blocks" and "7 loose blocks" are the same picture (Oct 24 2026:
  // the planner asked for the balance twice in two wordings and it was drawn twice).
  const words = spokenToDigits(what.toLowerCase()).toLowerCase().replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w) && (w.length > 2 || /\d/.test(w)));
  return new Set(words.map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)));
}

/** Whether two requests ask for the same picture (most of their counts and things shared). */
export function samePicture(a: string, b: string): boolean {
  const x = pictureWords(a), y = pictureWords(b);
  if (!x.size || !y.size) return false;
  // Other counts are another picture (5 brownies is not 7 brownies).
  const nums = (s: Set<string>) => [...new Set([...s].flatMap((w) => w.match(/\d+(?:\.\d+)?/g) ?? []))].sort().join(",");
  if (nums(x) !== nums(y)) return false;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / (x.size + y.size - shared) >= 0.5;
}

/** The pictures drawn this session, by request, so one still on the board is not drawn again. */
export class PictureMemory {
  private drawn: Array<{ what: string; item: string; message: string }> = [];

  /** Note a drawn picture by the item id its result names ("(item b4)"). */
  remember(what: string, message: string): void {
    const item = /\(item (b\d+)\)/.exec(message)?.[1];
    if (item) this.drawn = [...this.drawn.filter((d) => d.item !== item), { what, item, message }].slice(-8);
  }

  /** The same picture, when it is still on the board (its id is in the board list). */
  find(what: string, board: string): { item: string; message: string } | null {
    for (const d of [...this.drawn].reverse()) {
      if (samePicture(d.what, what) && new RegExp(`(^|[\\s;:"(])${d.item}\\b`).test(board)) return { item: d.item, message: d.message };
    }
    return null;
  }
}

export function alreadyDrawn(item: string, message: string): string {
  const parts = /\(parts: ([^)]*)\)/.exec(message)?.[1];
  return `That picture is already on the board as ${item}${parts ? ` (parts: ${parts})` : ""}. Point at it or its parts instead of drawing it again.`;
}
