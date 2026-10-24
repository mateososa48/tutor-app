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
          "The real things, with exact counts, how they are grouped, and every number the picture should show ('12 marbles shared into 3 jars, one jar per friend'; '3 quarters marked 25 cents and 2 dimes marked 10 cents'). Never the answer they are about to find, never 'circles' or 'shapes'.",
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
