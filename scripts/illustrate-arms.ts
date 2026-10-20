// The variants the illustrator test bench compares (scripts/illustrate-eval.ts).
// Each arm turns one test case into a picture the way a version of the app
// would, and reports the scene, the SVG, time, cost and engine problems.

import { callCost, callIllustrator } from "../lib/illustration/model";
import { guardLabels, illustratorPrompt, illustratorSystem } from "../lib/illustration/prompt";
import { iconHints, libraryIcon } from "../lib/illustration/icon-library";
import { setIconSource } from "../lib/illustration/scene";
import { parseScene, renderScene, type Scene } from "../lib/illustration/scene";
import type { EvalCase } from "./illustrate-eval-cases";
import * as V0 from "./illustrate-frozen/prompt-v0";
import { pictureKind, recipeFor, type PictureKind } from "../lib/illustration/recipes";
import { CHECK_PROMPT, describeScene } from "../lib/illustration/describe";

export type ArmResult = { scene?: Scene | null; svg: string | null; ms: number; cost: number | null; turns: number; problems: string[]; error?: string; notes?: string[] };
export type Arm = (c: EvalCase) => Promise<ArmResult>;

const HAIKU = "claude-haiku-5-5";

const request = (c: EvalCase) => ({ grade: c.grade, what: c.what, notice: c.why, conversation: c.conversation, board: c.board });
const seenText = (c: EvalCase) => [c.conversation.map((l) => l.text).join(" "), c.board, c.what, c.why].join(" ");

/** Today's production path: the illustrator prompt, Haiku 5.5 at low effort, the guard, the engine. */
const base: Arm = (c) => drawWith(c, illustratorPrompt(request(c)));

/** The production path with the recipe for the picture's kind at the end of the request. */
const withRecipe = (kindOf: (c: EvalCase) => PictureKind | null): Arm => (c) => {
  const kind = kindOf(c);
  const user = [illustratorPrompt(request(c)), recipeFor(kind)].filter(Boolean).join("\n\n");
  return drawWith(c, user, [`kind ${kind ?? "none"}`]);
};

async function drawWith(c: EvalCase, user: string, notes: string[] = []): Promise<ArmResult> {
  const t0 = Date.now();
  const reply = await callIllustrator(HAIKU, user);
  const ms = Date.now() - t0;
  const scene = reply ? parseScene(reply.text) : null;
  if (!scene) return { svg: null, ms, cost: callCost(HAIKU, reply?.usage), turns: 1, problems: [], error: "no scene" };
  const guarded = guardLabels(scene, seenText(c));
  const out = renderScene(guarded.scene);
  return { scene: guarded.scene, svg: out.svg, ms, cost: callCost(HAIKU, reply!.usage), turns: 1, problems: out.problems, notes };
}

/** The illustrator as it was before the Oct 19 work (frozen prompt and guard), on today's engine. */
const v0: Arm = async (c) => {
  const t0 = Date.now();
  const reply = await callIllustrator(HAIKU, V0.illustratorPrompt(request(c)), undefined, { system: V0.ILLUSTRATOR_SYSTEM });
  const ms = Date.now() - t0;
  const scene = reply ? parseScene(reply.text) : null;
  if (!scene) return { svg: null, ms, cost: callCost(HAIKU, reply?.usage), turns: 1, problems: [], error: "no scene" };
  const guarded = V0.guardLabels(scene, seenText(c));
  const out = renderScene(guarded.scene);
  return { scene: guarded.scene, svg: out.svg, ms, cost: callCost(HAIKU, reply!.usage), turns: 1, problems: out.problems };
};

/**
 * The recipe path plus one check: the scene read back as an inventory, and
 * Haiku either answers OK or sends a corrected scene (one more call).
 */
const withCheck = (kindOf: (c: EvalCase) => PictureKind | null): Arm => async (c) => {
  const kind = kindOf(c);
  const user = [illustratorPrompt(request(c)), recipeFor(kind)].filter(Boolean).join("\n\n");
  const t0 = Date.now();
  const first = await callIllustrator(HAIKU, user);
  const s1 = first ? parseScene(first.text) : null;
  if (!s1) return { svg: null, ms: Date.now() - t0, cost: callCost(HAIKU, first?.usage), turns: 1, problems: [], error: "no scene" };
  const g1 = guardLabels(s1, seenText(c));
  const r1 = renderScene(g1.scene);
  const check = await callIllustrator(HAIKU, "", undefined, {
    messages: [
      { role: "user", content: user },
      { role: "assistant", content: first!.text },
      { role: "user", content: CHECK_PROMPT(describeScene(g1.scene, r1.problems)) },
    ],
  });
  const ms = Date.now() - t0;
  const cost = (callCost(HAIKU, first!.usage) ?? 0) + (callCost(HAIKU, check?.usage) ?? 0);
  const s2 = check && !/^\s*OK\b/i.test(check.text) ? parseScene(check.text) : null;
  const scene = s2 ? guardLabels(s2, seenText(c)).scene : g1.scene;
  const out = s2 ? renderScene(scene) : r1;
  return { scene, svg: out.svg, ms, cost, turns: 2, problems: out.problems, notes: [`kind ${kind ?? "none"}`, s2 ? "revised" : "kept"] };
};

// The library arms draw from all 3,174 icons; the others keep the curated set.
setIconSource(null);

/** Your idea (Mateo): the recipe path, with the icons found in the full library for this request instead of a fixed list. */
const withLibrary = (kindOf: (c: EvalCase) => PictureKind | null, check: boolean): Arm => async (c) => {
  setIconSource(libraryIcon);
  const kind = kindOf(c);
  const user = [illustratorPrompt(request(c)), iconHints(c.what), recipeFor(kind)].filter(Boolean).join("\n\n");
  const system = illustratorSystem("request");
  const t0 = Date.now();
  const first = await callIllustrator(HAIKU, user, undefined, { system });
  const s1 = first ? parseScene(first.text) : null;
  if (!s1) return { svg: null, ms: Date.now() - t0, cost: callCost(HAIKU, first?.usage), turns: 1, problems: [], error: "no scene" };
  const g1 = guardLabels(s1, seenText(c));
  const r1 = renderScene(g1.scene);
  if (!check) return { scene: g1.scene, svg: r1.svg, ms: Date.now() - t0, cost: callCost(HAIKU, first!.usage), turns: 1, problems: r1.problems, notes: [`kind ${kind ?? "none"}`] };
  const again = await callIllustrator(HAIKU, "", undefined, {
    system,
    messages: [
      { role: "user", content: user },
      { role: "assistant", content: first!.text },
      { role: "user", content: CHECK_PROMPT(describeScene(g1.scene, r1.problems)) },
    ],
  });
  const s2 = again && !/^\s*OK\b/i.test(again.text) ? parseScene(again.text) : null;
  const scene = s2 ? guardLabels(s2, seenText(c)).scene : g1.scene;
  const out = s2 ? renderScene(scene) : r1;
  return { scene, svg: out.svg, ms: Date.now() - t0, cost: (callCost(HAIKU, first!.usage) ?? 0) + (callCost(HAIKU, again?.usage) ?? 0), turns: 2, problems: out.problems, notes: [`kind ${kind ?? "none"}`, s2 ? "revised" : "kept"] };
};

export const ARMS: Record<string, Arm> = {
  library: withLibrary((c) => pictureKind(c.what, c.why), false),
  library_check: withLibrary((c) => pictureKind(c.what, c.why), true),
  check: withCheck((c) => pictureKind(c.what, c.why)),
  base,
  v0,
  // The kind guessed from the request, as the app would; and the true kind, the ceiling.
  recipe: withRecipe((c) => pictureKind(c.what, c.why)),
  recipe_true: withRecipe((c) => c.kind as PictureKind),
};
