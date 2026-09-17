// The tutor's own tools. They draw nothing; they give the model facts.
//   check_answer — the deterministic checker (lib/answer-check.ts), so the
//                  tutor never calls a wrong answer right. It also records the
//                  attempt in the session policy (lib/tutor-policy.ts), which
//                  counts misses and suggests a help level. Until Sept 16 2026
//                  that was a second tool, record_attempt, which no recorded
//                  session ever called.
// It answers with the [Tutor state] line, so the model reads fresh facts in the
// same turn. Declared apart from lib/whiteboard-tools.ts; the live clients and
// the GPT-Live session route add it next to the whiteboard tools.

import type { ToolCallResult } from "./live-types";
import type { OpenAIFunctionTool } from "./whiteboard-tools";
import { checkAnswer, type CheckVerdict } from "./answer-check";
import {
  currentState,
  noteAnswerChecked,
  parseHelpLevel,
  recordAttempt,
  suggestHelp,
  type AttemptResult,
  type TutorPolicy,
} from "./tutor-policy";

const KINDS = ["slip", "misconception", "guess"] as const;
type WrongKind = (typeof KINDS)[number];

export const TUTOR_TOOL_DECLARATIONS = [
  {
    name: "check_answer",
    description:
      "Check the student's answer before you call it right or wrong; it also records the attempt for the session. It evaluates the math exactly, so trust its verdict over your own arithmetic. Works for arithmetic and fractions ('1/2 + 1/3'), percent ('25% of 80'), equations ('2x + 3 = 11' with answer '4', or 'x = 3 or x = -3'), and expressions to simplify or expand ('3(x + 4)' with answer '3x + 12'). Returns correct, partial, incorrect, or cannot_check (then work it out yourself). The result may give the correct value for you only: never say it.",
    parameters: {
      type: "object",
      properties: {
        problem: {
          type: "string",
          description: "What the student is answering, in digits and symbols: '1/2 + 1/3', '2x + 3 = 11', '3(x + 4)'. For one step of a longer problem, pass just that step: '21 / 3'. 300 chars max.",
        },
        student_answer: {
          type: "string",
          description: "Their answer in digits and symbols, as they meant it: '5/6', 'x = 4', '3x + 12', '2 1/2'. Several solutions: 'x = 3 or x = -3'. 200 chars max.",
        },
        skill: {
          type: "string",
          description: "The skill in a few words, worded the same way each time: 'adding fractions', 'two-step equations'.",
        },
        help_level: {
          type: "string",
          enum: ["H0", "H1", "H2", "H3", "H4", "H5"],
          description: "Optional: help they had before answering: H0 none, H1 a nudge, H2 pointing, H3 a strategy hint, H4 a shown step, H5 a worked example.",
        },
        kind: {
          type: "string",
          enum: [...KINDS],
          description: "Optional, when you can tell a wrong answer's kind: slip (right method, arithmetic or copying error), misconception (a wrong idea), guess.",
        },
      },
      required: ["problem", "student_answer", "skill"],
    },
  },
];

export const TUTOR_TOOL_NAMES: ReadonlySet<string> = new Set(TUTOR_TOOL_DECLARATIONS.map((d) => d.name));

// GPT-Live's Responses backend takes the same JSON-schema parameters.
export const TUTOR_FUNCTION_TOOLS: OpenAIFunctionTool[] = TUTOR_TOOL_DECLARATIONS.map((decl) => ({
  type: "function",
  name: decl.name,
  description: decl.description,
  parameters: decl.parameters as Record<string, unknown>,
  strict: false,
}));

/** What the checker's verdict means for the session's record. */
export function attemptFromVerdict(verdict: CheckVerdict, kind?: string): AttemptResult {
  if (verdict === "correct") return "correct";
  if (verdict === "partial") return "partial";
  if (verdict === "cannot_check") return "unchecked";
  return (KINDS as readonly string[]).includes(kind ?? "") ? (kind as WrongKind) : "incorrect";
}

// An equation's answer is worth checking on the board: put the value back in.
const IS_EQUATION = /=/;

// Runs a tutor tool against the session policy. Null when `name` is not one of them.
export function runTutorTool(
  name: string,
  args: Record<string, unknown>,
  policy: TutorPolicy,
  now: number,
  callId?: string,
): ToolCallResult | null {
  if (name !== "check_answer") return null;
  const problem = typeof args.problem === "string" ? args.problem.slice(0, 300) : "";
  const answer = typeof args.student_answer === "string" ? args.student_answer.slice(0, 200) : "";
  if (!problem.trim() || !answer.trim()) return { success: false, error: "check_answer needs problem and student_answer, both as strings." };
  const check = checkAnswer(problem, answer);
  const skill = typeof args.skill === "string" && args.skill.trim() ? args.skill : policy.currentSkill ?? "unnamed skill";
  const help = parseHelpLevel(args.help_level) ?? suggestHelp(policy)?.level ?? 1;
  const result = attemptFromVerdict(check.verdict, typeof args.kind === "string" ? args.kind : undefined);
  recordAttempt(policy, { skill, result, help, callId }, now);
  noteAnswerChecked(policy);
  const next =
    check.verdict === "correct"
      ? ` Mark it: circle_item on their answer with keep=true${IS_EQUATION.test(problem) ? ", and have them check it by putting the value back in" : ""}.`
      : "";
  const state = currentState(policy, now);
  return { success: true, message: `Verdict: ${check.verdict}. ${check.message}${next}${state ? ` ${state}` : ""}` };
}
