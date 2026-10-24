// One picture for the board, asked of the illustrator (Oct 23 2026): the
// request with the recipe for its kind, Haiku 5.5 hedged by Gemini 3.8 Flash,
// the scene read, its labels guarded, and a render check. /api/illustrate and
// the bench both call this, so the bench draws exactly what the app would (it
// had called Haiku once with no hedge, and an unreadable reply lost a picture
// the app would have drawn from Gemini).
//
// Server and scripts only: it reads the model keys from the environment.

import { hedged } from "../hedge";
import { callCost, callIllustrator } from "./model";
import { guardLabels, illustratorPrompt, partNames, type IllustrateRequest } from "./prompt";
import { pictureKind, recipeFor } from "./recipes";
import { parseScene, renderScene, type Scene } from "./scene";

export const ILLUSTRATOR_MODELS = (process.env.ILLUSTRATOR_MODELS || "claude-haiku-5-5,gemini-3.8-flash").split(",").map((s) => s.trim()).filter(Boolean);
// The tutor is talking meanwhile; a picture that comes after its question is
// still useful, but one that comes a whole turn late is confusing.
export const ILLUSTRATE_DEADLINE_MS = 7_000;
export const ILLUSTRATE_HEDGE_MS = 3_500;

export type Illustrated =
  | { ok: true; scene: Scene; parts: string[]; withheld: string[]; problems: string[]; cost: number | null; model: string; ms: number; failures: string[] }
  | { ok: false; ms: number; failures: string[] };

export async function illustrate(request: IllustrateRequest, opts: { models?: string[]; hedgeMs?: number; deadlineMs?: number } = {}): Promise<Illustrated> {
  // The recipe for this kind of picture rides at the end of the request, so the
  // system prompt stays cached (Oct 19 2026: held-out cases, blind-judged,
  // 3.75 without recipes, 4.32 with; a check-and-fix pass on top added nothing).
  const prompt = [illustratorPrompt(request), recipeFor(pictureKind(request.what, request.notice))].filter(Boolean).join("\n\n");
  // Everything the student has had: numbers in it may be labelled, others not.
  const seen = [request.conversation.map((l) => l.text).join(" "), request.board, request.what, request.notice].join(" ");
  const started = Date.now();
  const failures: string[] = [];
  const won = await hedged(
    opts.models ?? ILLUSTRATOR_MODELS,
    async (model, signal) => {
      try {
        const reply = await callIllustrator(model, prompt, signal);
        if (!reply) {
          failures.push(`${model} no key`);
          return null;
        }
        const scene = parseScene(reply.text);
        if (!scene) {
          failures.push(`${model} unreadable`);
          return null;
        }
        const guarded = guardLabels(scene, seen);
        const drawn = renderScene(guarded.scene);
        // A scene that lays out to nothing is no picture at all.
        if (!drawn.w || !drawn.h || (!Object.keys(drawn.parts).length && drawn.problems.length)) {
          failures.push(`${model} empty`);
          return null;
        }
        return { scene: guarded.scene, parts: partNames(drawn.parts), withheld: guarded.withheld, problems: drawn.problems, cost: callCost(model, reply.usage) };
      } catch (err) {
        if (!signal.aborted) failures.push(String((err as Error).message).slice(0, 80));
        return null;
      }
    },
    { hedgeMs: opts.hedgeMs ?? ILLUSTRATE_HEDGE_MS, deadlineMs: opts.deadlineMs ?? ILLUSTRATE_DEADLINE_MS },
  );
  const ms = Date.now() - started;
  if (!won) return { ok: false, ms, failures };
  return { ok: true, ...won.value, model: won.model, ms, failures };
}
