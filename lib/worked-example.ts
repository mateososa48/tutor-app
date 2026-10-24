// show_example: a worked example beside the student's problem (Oct 24 2026).
//
// "Teach me" got smaller and smaller questions in Mateo's session, because the
// tutor had no way to show a method without giving their problem away: every
// step it wrote of their own problem went up as "= ?" (rightly), and a worked
// example box held three short lines of handwriting. The evidence for a
// novice is a worked example on a parallel problem, a reason on every step,
// then their own problem with the help faded (the IES algebra practice
// guide; Booth 2013; Ashman, Kalyuga & Sweller 2020). This tool is that move:
// another problem of the same kind, other numbers, typeset beside theirs,
// each line with why it works. Their problem stays theirs: an example with
// the same numbers is refused.
//
// Pure: the declaration, the parser and the guard. The dispatcher draws it
// as one equation block (lib/whiteboard-tool-dispatch.ts).

import type { ToolDeclaration } from "./whiteboard-tools";
import { normalizeLatex } from "./latex-normalize";
import { splitSteps } from "./board-content-rules";

export const SHOW_EXAMPLE_DECLARATION: ToolDeclaration = {
  name: "show_example",
  description:
    "Work an example like theirs, with other numbers, beside their problem, every step with why it works: how you teach a method they don't have yet, while their own problem stays theirs to do.",
  parameters: {
    type: "object",
    properties: {
      problem: { type: "string", description: "The example: the same kind of problem with different, easier numbers ('2x + 3 = 11'), never their problem." },
      steps: { type: "string", description: "Each line of the working, split by ' | ' ('2x = 8 | x = 4'), at most 5." },
      why: { type: "string", description: "Why each step works, one short reason per step, split by ' | ' ('take 3 off both sides | split 8 into 2 equal groups')." },
    },
    required: ["problem", "steps", "why"],
  },
};

export const EXAMPLE_MAX_STEPS = 5;

export type WorkedExample = { problem: string; steps: string[]; why: string[] };

/** The example a call asks for, or an error to send back. */
export function parseExample(args: Record<string, unknown>): WorkedExample | { error: string } {
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string).trim() : "");
  const problem = normalizeLatex(str("problem"));
  if (!problem) return { error: 'Give "problem": the example, a problem like theirs with other numbers.' };
  const steps = splitSteps(str("steps")).map((s) => normalizeLatex(s.trim())).filter(Boolean);
  if (!steps.length) return { error: 'Give "steps": each line of the working, split by " | ".' };
  if (steps.length > EXAMPLE_MAX_STEPS) return { error: `That is ${steps.length} steps; an example shows at most ${EXAMPLE_MAX_STEPS}. Keep the ones that teach the move.` };
  const why = str("why").split("|").map((s) => s.trim().slice(0, 60));
  return { problem, steps, why: steps.map((_, i) => why[i] ?? "") };
}

const numbersOf = (text: string) => (text.replace(/\\[a-z]+/gi, " ").match(/\d+(?:\.\d+)?/g) ?? []).sort();

/**
 * Whether the example is the student's own problem: the same numbers in it
 * (in any order). A teacher shows the method on 2x + 3 = 11, never on the
 * 3x + 7 = 22 the student has to do.
 */
export function isTheirProblem(example: string, page: string | null | undefined): boolean {
  if (!page) return false;
  const a = numbersOf(example);
  const b = numbersOf(page);
  if (!a.length || !b.length) return example.replace(/\s+/g, "") === page.replace(/\s+/g, "");
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

export const THEIR_PROBLEM =
  "Not written: that is their own problem, and its working is theirs to do. Show the method on the same kind of problem with other, easier numbers (for 3x + 7 = 22, 2x + 3 = 11).";

export function exampleWritten(example: WorkedExample): string {
  return `Worked the example ${example.problem} beside their problem, ${example.steps.length} ${example.steps.length === 1 ? "step" : "steps"} with reasons. Point at each step as you say why; then ask them for the first step of their own problem.`;
}
