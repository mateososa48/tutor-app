// The variants the illustrator test bench compares (scripts/illustrate-eval.ts).
// Each arm turns one test case into a picture the way a version of the app
// would, and reports the scene, the SVG, time, cost and engine problems.

import { callCost, callIllustrator } from "../lib/illustration/model";
import { guardLabels, illustratorPrompt } from "../lib/illustration/prompt";
import { parseScene, renderScene, type Scene } from "../lib/illustration/scene";
import type { EvalCase } from "./illustrate-eval-cases";
import * as V0 from "./illustrate-frozen/prompt-v0";
import { pictureKind, recipeFor, type PictureKind } from "../lib/illustration/recipes";

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

export const ARMS: Record<string, Arm> = {
  base,
  v0,
  // The kind guessed from the request, as the app would; and the true kind, the ceiling.
  recipe: withRecipe((c) => pictureKind(c.what, c.why)),
  recipe_true: withRecipe((c) => c.kind as PictureKind),
};
