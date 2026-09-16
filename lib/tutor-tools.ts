// The tutor's own tools. They draw nothing; they give the model facts.
//   check_answer   — the deterministic checker (lib/answer-check.ts), so the
//                    tutor never calls a wrong answer right.
//   record_attempt — logs the attempt into the session policy
//                    (lib/tutor-policy.ts), which counts misses and suggests
//                    a help level.
// Both answer with the [Tutor state] line, so the model reads fresh facts in
// the same turn. Declared apart from lib/whiteboard-tools.ts; the live clients
// and the GPT-Live session route add them next to the whiteboard tools.

import type { ToolCallResult } from "./live-types";
import type { OpenAIFunctionTool } from "./whiteboard-tools";
import { checkAnswer } from "./answer-check";
import { ATTEMPT_RESULTS, currentState, parseHelpLevel, recordAttempt, type AttemptResult, type TutorPolicy } from "./tutor-policy";

export const TUTOR_TOOL_DECLARATIONS = [
  {
    name: "check_answer",
    description:
      "Check the student's answer before you call it right or wrong. It evaluates the math exactly, so trust its verdict over your own arithmetic. Works for arithmetic and fractions ('1/2 + 1/3'), percent ('25% of 80'), equations to solve ('2x + 3 = 11' with answer '4', or 'x = 3 or x = -3'), and expressions to simplify or expand ('3(x + 4)' with answer '3x + 12'). Returns correct, partial, incorrect, or cannot_check (then work it out yourself). The result may give the correct value for you only: never say it.",
    parameters: {
      type: "object",
      properties: {
        problem: {
          type: "string",
          description: "What the student is answering, in digits and symbols: '1/2 + 1/3', '2x + 3 = 11', '3(x + 4)'. For one step of a longer problem, pass just that step: '21 / 3'. 300 chars max.",
        },
        student_answer: {
          type: "string",
          description: "The student's answer in digits and symbols, as they meant it: '5/6', 'x = 4', '3x + 12', '2 1/2', '0.75'. Several solutions: 'x = 3 or x = -3'. 200 chars max.",
        },
      },
      required: ["problem", "student_answer"],
    },
  },
  {
    name: "record_attempt",
    description:
      "Log the student's attempt right after you judge it, so the session can count misses and suggest how much help to give next. Draws nothing. Returns the [Tutor state] line.",
    parameters: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          description: "The skill in a few words, worded the same way each time: 'adding fractions', 'two-step equations', 'slope from two points'.",
        },
        result: {
          type: "string",
          enum: ATTEMPT_RESULTS,
          description: "correct; slip (right method, arithmetic or copying error); misconception (a wrong idea); partial (right idea, incomplete); guess; stuck (no real attempt, 'I don't know').",
        },
        help_level: {
          type: "string",
          enum: ["H0", "H1", "H2", "H3", "H4", "H5"],
          description: "How much help they had before this attempt: H0 none, H1 a nudge, H2 pointing, H3 a strategy hint, H4 a shown step, H5 a worked example.",
        },
        note: { type: "string", description: "Optional: the wrong idea or slip in a few words, e.g. 'added the denominators'. 160 chars max." },
      },
      required: ["skill", "result", "help_level"],
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

// Runs a tutor tool against the session policy. Null when `name` is not one of them.
export function runTutorTool(name: string, args: Record<string, unknown>, policy: TutorPolicy, now: number): ToolCallResult | null {
  if (name === "check_answer") {
    const problem = typeof args.problem === "string" ? args.problem.slice(0, 300) : "";
    const answer = typeof args.student_answer === "string" ? args.student_answer.slice(0, 200) : "";
    if (!problem.trim() || !answer.trim()) return { success: false, error: "check_answer needs problem and student_answer, both as strings." };
    const check = checkAnswer(problem, answer);
    const state = currentState(policy, now);
    return { success: true, message: `Verdict: ${check.verdict}. ${check.message}${state ? ` ${state}` : ""}` };
  }
  if (name === "record_attempt") {
    const skill = typeof args.skill === "string" ? args.skill : "";
    const result = typeof args.result === "string" && (ATTEMPT_RESULTS as string[]).includes(args.result) ? (args.result as AttemptResult) : null;
    const help = parseHelpLevel(args.help_level);
    if (!skill.trim() || !result || help === null) {
      return { success: false, error: "record_attempt needs skill, result (correct, slip, misconception, partial, guess, or stuck), and help_level (H0 to H5)." };
    }
    const note = typeof args.note === "string" ? args.note.slice(0, 160) : undefined;
    recordAttempt(policy, { skill, result, help, note }, now);
    return { success: true, message: `Recorded. ${currentState(policy, now)}` };
  }
  return null;
}
