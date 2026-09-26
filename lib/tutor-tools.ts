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
import { checkAnswer, checkBlankInPage, type CheckVerdict } from "./answer-check";
import { isNonAnswer } from "./board-content-rules";
import { detectUnknown, problemMath, pureArithmetic } from "./board-grammar";
import {
  currentState,
  noteAnswerChecked,
  spokenWorking,
  parseHelpLevel,
  recordAttempt,
  suggestHelp,
  type AttemptResult,
  type TutorPolicy,
  flowStep,
  looksLikeAnswer,
} from "./tutor-policy";

const KINDS = ["slip", "misconception", "guess"] as const;
type WrongKind = (typeof KINDS)[number];

export const TEACHING_MOVE_TYPES = [
  "focusing_question",
  "point",
  "strategy_hint",
  "shown_step",
  "worked_example",
  "counterexample",
  "independent_check",
] as const;

export const REMEDIATION_STRATEGIES = [
  "counterexample",
  "visual_model",
  "simpler_case",
  "contrast_cases",
  "rebuild_prerequisite",
  "worked_example",
  "self_explanation",
  "verification",
] as const;

const MOVE_MINIMUM_HELP: Record<(typeof TEACHING_MOVE_TYPES)[number], number> = {
  focusing_question: 1,
  point: 2,
  strategy_hint: 3,
  shown_step: 4,
  worked_example: 5,
  counterexample: 3,
  independent_check: 0,
};

export function minimumHelpForMove(move: (typeof TEACHING_MOVE_TYPES)[number]): number {
  return MOVE_MINIMUM_HELP[move];
}

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
          description: "What the student is answering, in digits and symbols only, never words or your own verdict: '1/2 + 1/3', '2x + 3 = 11', '3(x + 4)', '15% of 100'. For f(3) with f(x) = 2x + 1 pass 'f(3) where f(x) = 2x + 1'. For one step of a longer problem, pass just that step: '21 / 3'. 300 chars max.",
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
          description: "Required: the most help they had before answering: H0 none, H1 a nudge, H2 pointing, H3 a strategy hint, H4 a shown step, H5 a worked example. Never call helped work H0.",
        },
        kind: {
          type: "string",
          enum: [...KINDS],
          description: "Optional, when you can tell a wrong answer's kind: slip (right method, arithmetic or copying error), misconception (a wrong idea), guess.",
        },
        moves: {
          type: "array",
          items: { type: "string", enum: [...TEACHING_MOVE_TYPES] },
          description: "Optional: the help you gave since their last answer, e.g. ['strategy_hint', 'point']. Leave out when they did it alone.",
        },
        misconception: {
          type: "string",
          description: "Optional: the wrong idea their answer shows, in a few words ('added the bottoms'). An observation, never a label.",
        },
        working: {
          type: "array",
          items: { type: "string" },
          description: "Optional: the lines of working they said, in digits and symbols, one per line ('1/3 = 3/12', '3/12 + 2/12 = 5/12'), a wrong line too. The board writes them in their hand above their answer.",
        },
      },
      required: ["problem", "student_answer", "skill", "help_level"],
    },
  },
];

// Until Sept 24 2026 a second tool recorded the help before each answer. It
// was the most-called tool (one every three turns), each call before speech
// cost the tutor about half a second and a re-read of the whole prompt, and
// the board lost pointing moves to it. check_answer's `moves` records the same
// thing in the same database rows (TutorRuntime); this stays for recordings and
// scripts that still call it.
export const LEGACY_TUTOR_TOOL_DECLARATIONS = [
  {
    name: "record_teaching_move",
    description:
      "Record meaningful help before you check the student's next answer. Use it when you give a focusing question, point to something, give a strategy hint, show a step or example, set up a counterexample, or explicitly ask for an independent check. This keeps supported work from being mislabeled as independent. Do not narrate the tool call.",
    parameters: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          description: "The same concise skill label you will pass to check_answer.",
        },
        help_level: {
          type: "string",
          enum: ["H0", "H1", "H2", "H3", "H4", "H5"],
          description: "H0 independent check, H1 nudge, H2 pointing, H3 strategy hint, H4 shown step, H5 worked example.",
        },
        move: {
          type: "string",
          enum: [...TEACHING_MOVE_TYPES],
          description: "The teaching move that just happened.",
        },
        diagnosis: {
          type: "string",
          description: "Optional short description of the student's wrong idea. Record an observation, not an ability label.",
        },
        strategy: {
          type: "string",
          enum: [...REMEDIATION_STRATEGIES],
          description: "Optional remediation strategy chosen for a misconception or repeated miss.",
        },
        intent: {
          type: "string",
          description: "Optional short reason for this move, such as 'see whether they can choose the inverse operation'.",
        },
      },
      required: ["skill", "help_level", "move"],
    },
  },
];

export const TUTOR_TOOL_NAMES: ReadonlySet<string> = new Set([...TUTOR_TOOL_DECLARATIONS, ...LEGACY_TUTOR_TOOL_DECLARATIONS].map((d) => d.name));

// GPT-Live's Responses backend takes the same JSON-schema parameters.
export const TUTOR_FUNCTION_TOOLS: OpenAIFunctionTool[] = TUTOR_TOOL_DECLARATIONS.map((decl) => ({
  type: "function",
  name: decl.name,
  description: decl.description,
  parameters: decl.parameters as Record<string, unknown>,
  strict: false,
}));

/** What the checker's verdict means for the session's record. */
// A problem with an equals sign is an equation: a right answer is checked by putting it back in.
const IS_EQUATION = /=/;

export function attemptFromVerdict(verdict: CheckVerdict, kind?: string): AttemptResult {
  if (verdict === "correct") return "correct";
  if (verdict === "partial") return "partial";
  if (verdict === "cannot_check") return "unchecked";
  return (KINDS as readonly string[]).includes(kind ?? "") ? (kind as WrongKind) : "incorrect";
}

/**
 * Whether a checked answer is a step inside the problem on the board rather
 * than the problem itself (Sept 22 2026): "25 - 7 = 18" while solving
 * 3x + 7 = 25 is a step; "6" is the problem's answer whatever line it was
 * asked on. A step never finishes the problem, so it never sends the tutor on
 * to a new one. Plain arithmetic inside an equation or a word problem is a
 * step, and so is an equation in the page's letter; "10% of 80" on a page
 * about 25% of 80 is a problem of its own (quick practice said out loud).
 */
export function stepOfPage(page: string | null, problem: string, answer: string): boolean {
  if (!page) return false;
  // An answer that is still a sum or a product ("27/90 + 10/90") is a move
  // on the way, not the answer (it was ringed green as if it were, Sept 23).
  if (/[\d)]\s*[-+×*÷]\s*[\d(]/.test(answer.replace(/\s*\/\s*/g, "/"))) return true;
  const whole = problemMath(page);
  // A word problem the checker cannot read: its arithmetic ("3 + 5", "40 / 8")
  // is steps on the way (Sept 23 2026: every one of them was ringed green and
  // counted as the problem solved). The final answer is the tutor's to mark.
  if (!whole) return pureArithmetic(problemMath(problem) ?? problem);
  const asked = problemMath(problem) ?? problem;
  const flat = (t: string) => t.replace(/[\s$]/g, "").toLowerCase();
  if (flat(whole) === flat(asked)) return false;
  if (checkAnswer(whole, answer).verdict === "correct") return false;
  // A line with a box in it ("1/2 = ?/6") is the page's working, never a
  // problem of its own (Sept 23 2026: each one was ringed green as solved).
  if (/\?/.test(problem)) return true;
  if (!pureArithmetic(whole) && pureArithmetic(asked)) return true;
  const letter = detectUnknown(`$${whole}$`);
  return Boolean(letter && whole.includes("=") && asked.includes("=") && new RegExp(`(^|[^a-z])${letter}([^a-z]|$)`, "i").test(asked));
}

// Runs a tutor tool against the session policy. Null when `name` is not one of them.
// ── The auto-check (Sept 25 2026) ─────────────────────────────────────────
// 3.8 judged short numeric answers by ear (12 of 28 answer lines never got a
// check_answer call). When a student line looks like an answer and the board
// holds what was asked (the last callout or "?" line, else the problem), the
// code checks it and hands the model the verdict: as a note before a typed
// turn, or on the first tool result of a spoken one (nextReminder).
const answerKey = (t: string) => t.toLowerCase().replace(/[\s$,]/g, "").replace(/^(isit|itis|its|it's|so|umm?|uh)+/, "").replace(/[?.!]+$/, "");

export function autoCheck(policy: TutorPolicy, text: string, now: number): string | null {
  const t = text.trim();
  if (!t || !looksLikeAnswer(t) || isNonAnswer(t)) return null;
  // A topic heading is not a problem; the spoken question usually is.
  const page = policy.pageProblem && /[\d=+\-−×÷*/^\\<>]/.test(policy.pageProblem) ? policy.pageProblem : null;
  const candidates = [policy.lastAsked, policy.lastSpokenQuestion, page].filter((c): c is string => Boolean(c && c.trim()));
  for (const problem of candidates) {
    const check = checkAnswer(problem, t);
    if (check.verdict === "cannot_check") continue;
    const skill = policy.currentSkill ?? policy.pageSkill ?? "unnamed skill";
    const help = Math.max(suggestHelp(policy)?.level ?? 1, policy.boardHelp);
    const step = stepOfPage(policy.pageProblem, problem, t);
    recordAttempt(policy, { skill, result: attemptFromVerdict(check.verdict), help, auto: true, problem, step }, now);
    noteAnswerChecked(policy);
    const struck = check.verdict === "correct" && !step && policy.lastWrongAttempt ? ` Cross out their earlier "${policy.lastWrongAttempt}" (cross_out_step).` : "";
    if (check.verdict === "correct" && !step) policy.lastWrongAttempt = null;
    else if (check.verdict === "incorrect" || check.verdict === "partial") policy.lastWrongAttempt = t.length > 40 ? `${t.slice(0, 37)}…` : t;
    const order = check.verdict === "correct"
      ? `Write it in their hand (add_student_attempt), ring it (circle_item keep=true), then the next thing to do.${struck}`
      : check.verdict === "partial"
        ? "Write it in their hand (add_student_attempt), then ask what is still missing."
        : "Write it in their hand (add_student_attempt), then point at the step it came from and ask; don't say the answer.";
    const said = t.length > 60 ? `${t.slice(0, 57)}…` : t;
    const note = `[Answer check, not from the student: "${said}" → ${check.verdict}. ${check.message} ${order}]`;
    policy.autoChecked = { answer: t, verdict: check.verdict, message: check.message, problem, at: now, note, sent: false, consumed: false };
    return note;
  }
  return null;
}

/** The auto-check's note, once, for the typed-text path; null when there is none or it went out already. */
export function takeAutoCheckNote(policy: TutorPolicy): string | null {
  const a = policy.autoChecked;
  if (!a || a.sent) return null;
  a.sent = true;
  return a.note;
}

export function runTutorTool(
  name: string,
  args: Record<string, unknown>,
  policy: TutorPolicy,
  now: number,
  callId?: string,
): ToolCallResult | null {
  if (name !== "check_answer") return null;
  // A number is fine too: "student_answer": 4 failed and cost a round trip.
  const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
  const problem = text(args.problem).slice(0, 300);
  const answer = text(args.student_answer).slice(0, 200);
  if (!problem.trim() || !answer.trim()) return { success: false, error: "check_answer needs problem and student_answer, both as strings." };
  // The same answer the code checked a moment ago: the same verdict, recorded once.
  const auto = policy.autoChecked;
  const reused = auto && !auto.consumed && now - auto.at < 60_000 && answerKey(auto.answer) === answerKey(answer) ? auto : null;
  let check = reused ? { verdict: reused.verdict as CheckVerdict, message: reused.message } : checkAnswer(problem, answer);
  if (reused) reused.consumed = true;
  // "x - 2 = ?" on the way through the page's equation: its box holds that
  // side's value at the page's solution.
  if (!reused && check.verdict === "cannot_check" && policy.pageProblem) {
    const page = problemMath(policy.pageProblem);
    const inPage = page ? checkBlankInPage(page, problem, answer) : null;
    if (inPage) check = inPage;
  }
  const skill = typeof args.skill === "string" && args.skill.trim() ? args.skill : policy.currentSkill ?? "unnamed skill";
  // The board's own help counts too: an answer found by counting the slices
  // the tutor just drew is not an answer found alone.
  const help = Math.max(parseHelpLevel(args.help_level) ?? suggestHelp(policy)?.level ?? 1, policy.boardHelp);
  const result = attemptFromVerdict(check.verdict, typeof args.kind === "string" ? args.kind : undefined);
  const step = stepOfPage(policy.pageProblem, problem, answer);
  if (!reused) recordAttempt(policy, { skill, result, help, callId, problem, step }, now);
  if (!step && result !== "unchecked") policy.boardHelp = 0;
  // Their working, said out loud, belongs on the board as lines.
  const working = spokenWorking(policy.lastUtterance);
  noteAnswerChecked(policy);
  // The tutor writes their answer itself (add_student_attempt, their exact
  // words) and rings a right final answer. Short notes, not sentences to read
  // aloud (Sept 24 2026): the board part and one instruction at most, then
  // the state.
  // A right answer after a wrong one strikes the wrong one, now that they
  // have seen it; a wrong one is remembered for that.
  const struck = check.verdict === "correct" && !step && policy.lastWrongAttempt ? ` Then cross_out_step their earlier "${policy.lastWrongAttempt}".` : "";
  if (check.verdict === "correct" && !step) policy.lastWrongAttempt = null;
  else if (check.verdict === "incorrect" || check.verdict === "partial") policy.lastWrongAttempt = answer.length > 40 ? `${answer.slice(0, 37)}…` : answer;
  const onBoard = check.verdict === "cannot_check"
    ? ""
    : check.verdict === "correct" && !step
      ? ` Board: add_student_attempt with their exact words, then circle_item on it with keep=true${IS_EQUATION.test(problem) ? ", and have them check it by putting the value back in" : ""}.${struck}`
      : " Board: add_student_attempt with their exact words; no mark on it yet.";
  const wroteWorking = Array.isArray(args.working) && args.working.some((l) => typeof l === "string" && l.trim());
  const state = currentState(policy, now);
  // The flow's next step rides in the state line; said here only without one.
  const flow = state ? null : flowStep(policy);
  const order = !wroteWorking && working
    ? ` Their working ("${working}") is not on the board: next time pass it as working.`
    : policy.boardAsk
      ? ` They asked to see it on the board: show the working now.`
      : flow
        ? ` Next: ${flow.next}.`
        : "";
  policy.boardAsk = null;
  return { success: true, message: `Verdict: ${check.verdict}. ${check.message}${onBoard}${order}${state ? ` ${state}` : ""}` };
}
