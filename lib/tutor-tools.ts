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
import { checkAnswer, checkBlankInPage, prepareExpression, questionMath, sameExpression, sharingProblem, spokenExpression, spokenToDigits, verbTask, withKnownRules, type CheckVerdict } from "./answer-check";
import { isNonAnswer } from "./board-content-rules";
import { detectUnknown, problemMath, pureArithmetic } from "./board-grammar";
import { latexToPlain } from "./latex-plain";
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
  numbersIn,
  type VerdictMarks,
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
  // A page headed by its topic ("Ratios and rates") has no problem to be a
  // step of (Sept 26 2026: every answer on such a page was taken for a step
  // and never ringed).
  if (!page || !/\d/.test(page)) return false;
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
const LINE_FILLER = /\b(?:oh+|um+|uh+|hmm+|so|like|wait|ok(?:ay)?|yeah|well|just|then|idk|i think|i guess|maybe|is it|it'?s|its|it is|the answer is|my bad)\b/gi;
const answerKey = (t: string) => spokenToDigits(t.toLowerCase()).replace(LINE_FILLER, " ").replace(/[\s$,]/g, "").replace(/[?.!]+$/, "");

const REPORTED = /^(.*?\d.*?)[,.;]?\s+(?:and\s+|but\s+)?i\s+(?:put|got|said|wrote|answered|did|picked)\s+(.+?)(?:\s+(?:because|cause|cuz|since)\b.*)?$/i;

// "9 minus 8 is 1", "2 times 3 is 6 not 7": arithmetic the student asserts
// is checked as itself, whatever the board asked (Sept 25 2026: 3.8 judged
// these by ear). A chained claim ("3 + 1 is 4 over 4 which is 1") is left
// alone: "is 4/4" could be (3 + 1)/4 as easily as 4/4.
const CLAIM = /(-?\d[\d.\/]*(?:\s*[-+*/^]\s*-?\d[\d.\/]*)+)\s*(?:is|=|equals|makes|gives)\s*(-?\d[\d.\/]*)(.*)$/i;

/**
 * The part of a line before its reason. A true claim given as the reason for
 * an answer ("i got 9 each cuz 12 minus 3 is 9") is how they got it, not the
 * answer: judged on its own it was called right, and "12 − 3 = 9" went up with
 * a green box and a check (Oct 23 2026, a sharing problem the checker could
 * not read; Jayden's "15 cuz 12 plus 3 is 15" was the same).
 */
// "i got 9 each", "i said 9", "i put 9", "i think it's 9", "everyone gets 9"
const GOT = /\b(?:got|get|gets|said|put|answered|think it'?s|thought it was|it'?s)\s+(-?\d[\d.\/]*)/i;

function beforeReason(text: string): string {
  return text.split(/\s+(?:because|cause|'cause|cuz|coz|since|bc)\b/i)[0];
}

function ownClaim(text: string): { problem: string; answer: string } | null {
  const m = CLAIM.exec(spokenToDigits(text.replace(/[?!]+/g, " ")));
  if (!m) return null;
  if (/\b(is|equals?|which|so|=)\b/i.test(m[3])) return null;
  // A lone fraction is a number, not a division (Oct 11 2026: "adding the
  // extra 1/4 gives 3/4" went up as "1/4 = 3/4" and was ringed as right).
  if (/^-?\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(m[1].trim())) return null;
  return { problem: m[1].trim(), answer: m[2] };
}

// ── Code-owned marks (Sept 26 2026) ─────────────────────────────────────
// The line a checked answer goes up as, in the student's hand: their claim as
// math ("9 − 8 = 1"), a value with the short thing it answers ("f(3) = 7",
// "(-3)^2 = 9"), or the core of what they said ("0.5 is bigger"), never a
// whole chatty sentence.

export function answerLine(problem: string, answer: string): string {
  // A remainder answer goes up with its division: "53 ÷ 8 = 6 R 5".
  const rem = /(\d+)\s*(?:r|rem|remainder)\s*(\d+)\b/i.exec(spokenToDigits(answer.toLowerCase()));
  const div = /(\d+)\s*(?:\\div|÷|\/|(?:is\s+)?divided by)\s*(\d+)/i.exec(spokenToDigits(problem));
  const into = /(\d+)\s+(?:go(?:es)?|fits?)\s+into\s+(\d+)/i.exec(spokenToDigits(problem));
  if (rem && div) return `${div[1]} ÷ ${div[2]} = ${rem[1]} R ${rem[2]}`;
  if (rem && into) return `${into[2]} ÷ ${into[1]} = ${rem[1]} R ${rem[2]}`;
  const own = ownClaim(answer);
  // A signed number after an operation is bracketed: "6 - -2" is written 6 − (-2).
  const pretty = (t: string) => t.replace(/([-+*/])\s*-\s*(\d[\d.]*)/g, "$1 (-$2)").replace(/\s*\*\s*/g, " × ").replace(/\s*-\s*(?=\d|\()/g, (m, off: number, all: string) => (off === 0 || /[=(]\s*$/.test(all.slice(0, off)) ? "-" : " − ")).replace(/\s+/g, " ").trim();
  if (own) return pretty(`${own.problem} = ${own.answer}`).slice(0, 60);
  const said = spokenToDigits(answer.replace(/[?!]+/g, " ").replace(/\.{2,}|…/g, " "), { the: true })
    .split(/\s+(?:because|cause|'cause|cuz|since|bc)\b/i)[0];
  const tidy = (c: string) => c.replace(LINE_FILLER, " ").replace(/\s+/g, " ").replace(/^[\s,;:.]+|[\s,;:.]+$/g, "").trim();
  const clauses = said.split(/\s*[,;]\s*|\s+so\s+/i).map(tidy).filter((c) => /\d/.test(c));
  let core = (clauses.at(-1) ?? tidy(said)).slice(0, 60);
  // A comparison carries both numbers (Sept 26 2026: "0.8 is bigger" went up
  // under 0.35 vs 0.5 and read as a wrong answer to it).
  const pair = /(-?\d[\d.]*(?:\/\d+)?)\s*(?:vs\.?|versus|or|,|and)\s*(-?\d[\d.]*(?:\/\d+)?)/i.exec(spokenToDigits(problem.replace(/\\text\{\s*vs\s*\}/g, " vs ")));
  const picked = /^(-?\d[\d.]*(?:\/\d+)?)\s+(?:is|'s)\s+(?:the\s+)?(bigger|greater|larger|more|higher|smaller|less|lower)\b(?:\s+than\s+(-?\d[\d.]*(?:\/\d+)?))?/i.exec(core);
  if (picked) {
    const other = picked[3] ?? (pair ? (pair[1] === picked[1] ? pair[2] : pair[2] === picked[1] ? pair[1] : null) : null);
    if (other) return `${picked[1]} ${/^(smaller|less|lower)$/i.test(picked[2]) ? "<" : ">"} ${other}`;
  }
  // A bare pick in a which-is-bigger question ("i put 0.35") is the comparison it claims.
  const asksWhich = /\b(bigger|greater|larger|more|higher|smaller|less|lower|fewer)\b/i.exec(problem);
  if (pair && asksWhich && /^-?\d[\d.]*(?:\/\d+)?$/.test(core) && (core === pair[1] || core === pair[2])) {
    const other = core === pair[1] ? pair[2] : pair[1];
    return `${core} ${/^(smaller|less|lower|fewer)$/i.test(asksWhich[1]) ? "<" : ">"} ${other}`;
  }
  // A sentence that ends on its value ("adding the extra 1/4 gives 3/4") goes
  // up as that value with what it answers, never as the sentence.
  // Not when the last number is the one they reject ("would be 30 not 15").
  const ending = /\b(?:not|isn'?t|instead|than|or)\b/i.test(core) ? null : /\b[a-z]{3,}\b.*?(-?\d[\d.]*(?:\/\d+)?%?)$/i.exec(core);
  if (ending) core = ending[1];
  if (/^-?\d[\d.,/]*%?$/.test(core)) {
    // A bare value: say what it answers when that is short math.
    const call = /(?<![a-z\\])([a-z]\s*\(\s*-?\d+(?:\.\d+)?\s*\))/i.exec(problem);
    if (call) return `${call[1].replace(/\s+/g, "")} = ${core}`;
    // A typeset problem reads as plain math here ("\frac{1}{2} + \frac{1}{4}" is 1/2 + 1/4).
    // A step asked on the board ("47 - 42 = ?") answers as its line: "47 − 42 = 5".
    const plain = problem.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2").replace(/\\(?:cdot|times)|×/g, "*").replace(/\\div|÷/g, "/").replace(/\s*=\s*\?\s*$/, "");
    const asked = verbTask(plain) ?? spokenToDigits((questionMath(plain.replace(/\$/g, "")) ?? plain.replace(/\$/g, "").replace(/^\s*(?:what(?:'s| is)|find|compute|work out)\s+/i, "")).replace(/\s*\?+\s*$/, "").trim());
    if (asked.length <= 24 && pureArithmetic(asked) && !asked.includes("=")) return pretty(`${asked} = ${core}`);
  }
  return core || answer.trim().slice(0, 60);
}

/** Plans the board move for a verdict when the page marks answers itself; the sentence tells the model what went up. */
function planMarks(policy: TutorPolicy, problem: string, answer: string, verdict: CheckVerdict, step: boolean): string {
  if (!policy.codeMarks || verdict === "cannot_check") return "";
  const line = answerLine(problem, answer);
  if (!line) return "";
  // Every right answer is ringed (Sept 26 2026: on a word problem the checker
  // cannot tell the final answer from a step, so no right answer was ever
  // ringed and every judge said so); a step only decides the plan box.
  const ring = verdict === "correct";
  // The same answer checked twice (the auto-check, then the model): up once.
  const key = `${line}|${ring}`;
  if (policy.markedLines.includes(key)) return `"${line}" is already on the board in their hand${ring ? " and ringed" : ""}.`;
  policy.markedLines.push(key);
  // Their wrong line is struck by a right answer to the same question (the
  // same numbers in it), or by any finished right answer after it: they have
  // moved past it. Not by a right answer to a step, which may be the fix under
  // way. (Sept 27 2026: a final right answer to the next problem used to clear
  // the wrong line without striking it, so Maya's "0.35 > 0.5" stayed up all
  // session after she said "the blue one is bigger" and got 0.8 > 0.75.)
  const sameQuestion = (a: string | null, b: string) => {
    if (!a) return false;
    const na = numbersIn(a).sort().join(",");
    return Boolean(na) && na === numbersIn(b).sort().join(",");
  };
  const strike = ring && policy.lastWrongLine && policy.lastWrongLine !== line && (sameQuestion(policy.lastWrongProblem, problem) || !step) ? policy.lastWrongLine : null;
  policy.pendingMarks = { line, ring, strike };
  if (strike || (ring && !step)) {
    policy.lastWrongLine = null;
    policy.lastWrongProblem = null;
  } else if (verdict === "incorrect" || verdict === "partial") {
    policy.lastWrongLine = line;
    policy.lastWrongProblem = problem;
  }
  return ring
    ? `"${line}" is on the board in their hand and ringed${strike ? `; their earlier "${strike}" is crossed out` : ""}.`
    : `"${line}" is on the board in their hand.`;
}

// What a line claims, for comparing two lines: the part after its last "=", or
// the whole line; comparisons compare whole.
function sayValue(line: string): string {
  const flat = line.replace(/[\s$]/g, "").replace(/−/g, "-").toLowerCase();
  return /[<>]/.test(flat) || !flat.includes("=") ? flat : flat.slice(flat.lastIndexOf("=") + 1);
}

/**
 * Runs a verdict's board move through the board's own dispatcher: the line in
 * their hand, then its ring or the strike through their earlier wrong line
 * (found by the item id it went up as, remembered in `ids`). Synchronous, so a
 * page can run it between two of the model's tool calls.
 */
export function applyVerdictMarks(
  marks: VerdictMarks,
  dispatch: (name: string, args: Record<string, unknown>) => ToolCallResult,
  ids: Map<string, string>,
): Array<{ name: string; args: Record<string, unknown>; result: ToolCallResult }> {
  const done: Array<{ name: string; args: Record<string, unknown>; result: ToolCallResult }> = [];
  const run = (name: string, args: Record<string, unknown>) => {
    const result = dispatch(name, args);
    done.push({ name, args, result });
    return result;
  };
  const wrote = run("add_student_attempt", { text: marks.line });
  let id = wrote.success ? /\b(?:item|as) (b\d+)\b/.exec(wrote.message ?? "")?.[1] ?? null : null;
  // An existing line is ringed only when it says the same thing (a guard: a
  // bad duplicate match once ringed the student's earlier wrong answer).
  const twin = wrote.success ? /Already on the board as b\d+ \("([^"]*)"\)/.exec(wrote.message ?? "")?.[1] : undefined;
  if (twin !== undefined && sayValue(twin) !== sayValue(marks.line)) id = null;
  if (id) ids.set(marks.line, id);
  // A right answer gets the green box and check (Oct 14 2026; it was a sky ring).
  if (marks.ring && id) {
    run("mark_correct", { target: id });
    run("settle_questions", {});
  }
  const struck = marks.strike ? ids.get(marks.strike) : null;
  if (struck) run("cross_out_step", { step_label: struck });
  return done;
}

// ── The board never gives the answer away (Sept 26 2026) ─────────────────
// Three runs had the tutor write "12 ÷ 2 = 6" or "0.85 × 72.25 = 61.41" in the
// turn it asked the student for that number. A tutor line of plain arithmetic
// whose result the student has not said (and the problem did not give) goes
// up as "… = ?", which is also the question the auto-check reads their answer
// against. A worked example (help at H5) shows its results.
const REMAINDER_TAIL = /^(.*=)\s*(\d+)\s*(?:\\text\{\s*[Rr]\s*\}|\\mathrm\{\s*[Rr]\s*\}|[Rr]|\\text\{\s*remainder\s*\})\s*(\d+)\s*$/;
const RESULT_TAIL = /^(.*=)\s*(-?\d+(?:\.\d+)?|-?\\[dt]?frac\{\d+\}\{\d+\}|-?\d+\s*\/\s*\d+)\s*(\\%|%)?\s*$/;

// A caption that states a result ("1 cup makes 6 cookies", "total = 60") says
// it before they do, the same way; the number after the verb goes "?".
const CAPTION_KEYS = ["label", "caption", "second_label", "total"];
const STATED_RESULT = /\b(makes?|is|are|equals?|gives?|costs?|weighs?|=)(\s+)(-?\d+(?:\.\d+)?(?:\/\d+)?)/gi;

function withholdCaptions(policy: TutorPolicy, args: Record<string, unknown>): { args: Record<string, unknown>; note: string | null } {
  let changed: string | null = null;
  const out = { ...args };
  for (const key of CAPTION_KEYS) {
    const v = out[key];
    if (typeof v !== "string") continue;
    const next = v.replace(STATED_RESULT, (m, verb: string, gap: string, num: string) => {
      const value = numbersIn(num)[0];
      if (!value || policy.saidNumbers.includes(value)) return m;
      changed = num;
      return `${verb}${gap}?`;
    });
    out[key] = next;
  }
  return changed ? { args: out, note: `The caption says "?" where it had ${changed}: that is theirs to find. Ask for it.` } : { args, note: null };
}

// A step line: a target on the left ("u", "du", "x", "f'(x)", "dy/dx"), the
// step's result on the right. In a lesson the student says each step, so a
// right side they have not said goes up as "= ?" (Oct 6 2026: "du = 2x dx" and
// "du = 3x^2 dx" went up as the tutor asked "what is du?", twice in one session).
const STEP_LINE = /^\s*(d?[a-z]|[a-z]'\s*\(\s*[a-z]\s*\)|\\frac\{d[a-z]?\}\{d[a-z]\}|d[a-z]\s*\/\s*d[a-z])\s*=\s*([^=?]+?)\s*$/i;

/** Does any sentence of `lines` say this value (whole, or after "is", "=", "equal to")? */
function saysExpression(lines: string[], rhs: string): boolean {
  for (const line of lines) {
    for (const sentence of line.split(/(?<=[.?!;])\s+/)) {
      const said = spokenExpression(sentence.replace(/[?!.;]+$/g, ""));
      const pieces = [said, said.split("=").at(-1) ?? "", ...said.split(/\b(?:is|equals|equal to|be)\b/i).slice(1), said.replace(/^.*?\b(?:make|let|set)\s+[a-z]{1,2}\s*=?\s*/i, "")];
      // "set u equal to x^2 + 1, what would…": a clause ends at a comma.
      const tails = pieces.flatMap((t) => [t, t.split(",")[0]]);
      // "is it 2x?", "it's 3x^2 dx", "so like 2x": the lead-in is not the value.
      if (tails.some((t) => t.trim() && sameExpression(t.trim().replace(/^(?:(?:is\s+)?it'?s?|it is|so|maybe|i got|just|like|um+|uh+)(?:\s+(?:like|just|maybe))?\s+/i, ""), rhs))) return true;
    }
  }
  return false;
}

/** Did the student say this, in any of their lines since the problem opened? */
export function studentSaid(policy: TutorPolicy, rhs: string): boolean {
  return saysExpression(policy.saidLines, rhs);
}

const stepKey = (lhs: string) => lhs.replace(/\s+|\\/g, "").toLowerCase();

function withholdStep(policy: TutorPolicy, latex: string): { latex: string; note: string } | null {
  const m = STEP_LINE.exec(latex);
  if (!m) return null;
  const rhs = m[2].trim();
  // "y = 2x + 1" is a function as given, not a step: a lone letter is a step's
  // target only for a value (x = 6) or a substitution (u, v, w = …).
  if (/^[a-z]$/i.test(m[1]) && !/^[uvw]$/i.test(m[1]) && /[a-z]/i.test(rhs.replace(/\\[a-z]+/gi, ""))) return null;
  // Already asked, already theirs, said aloud by the tutor in this reply
  // ("so if we set u equal to x squared plus one": nothing left to give away),
  // or part of the problem as given.
  if (/\?/.test(rhs) || studentSaid(policy, rhs) || saysExpression([policy.tutorSpeech], rhs)) return null;
  if (policy.pageProblem && policy.pageProblem.replace(/\s+/g, "").includes(latex.replace(/\s+/g, ""))) return null;
  // Only a line the board can read as math is withheld (a word label passes).
  if (!prepareExpression(rhs.replace(/\\[,;:!]/g, " ").replace(/\s*\bd\s*[a-z]\s*$/i, "")).ok) return null;
  const asked = `${m[1]} = ?`;
  policy.lastAsked = asked;
  const key = stepKey(m[1]);
  if (!policy.withheld.some((w) => w.lhs === key)) policy.withheld.push({ lhs: key, latex, rhs, item: null });
  return { latex: asked, note: `Wrote it as "${latexToPlain(asked)}": that step is theirs to say. Ask for it; don't say it.` };
}

export type ShapedCall = { args: Record<string, unknown>; note: string | null; withheld?: string; replaces?: string; refuse?: string };

/** The "= ?" lines the student has now said: their full lines go up in place of the "?" ones. */
export function filledSteps(policy: TutorPolicy): Array<{ item: string; latex: string }> {
  const done = policy.withheld.filter((w) => w.item && w.rhs && studentSaid(policy, w.rhs));
  policy.withheld = policy.withheld.filter((w) => !done.includes(w));
  return done.map((w) => ({ item: w.item!, latex: w.latex }));
}

// ── The answer on the table stays theirs (Oct 14 2026) ──────────────────
// Mateo: "it asked what the answer is but it had put the answer on the board
// already". The older guards caught a plain arithmetic line; the answer also
// went up in tags, labels, captions, table cells and annotations. So every
// number a board call is about to write is put to the checker against the
// question on the table: one that would be the right answer, which they have
// not said and the problem did not give, goes up as "?".
// An equation line's own result is the result rule's (it becomes the "= ?"
// question the auto-check reads), so `latex` is not here.
const GUARDED_KEYS = new Set(["text", "annotation", "annotations", "label", "caption", "second_label", "cells", "rows", "body", "ask", "total", "points"]);
const NUMBER_TOKEN = /(?<![\w.\/])-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?(?![\w.\/]*\d)/g;

// The words in an illustration's scene (lib/illustration/scene.ts): everything
// written on the picture. Icon names, ids, colours and counts are not words.
const SCENE_TEXT_KEYS = new Set(["title", "text", "label", "total_label", "top_label", "side_label", "labels"]);

function guardScene(node: unknown, guard: (s: string) => string, key = ""): unknown {
  if (typeof node === "string") return SCENE_TEXT_KEYS.has(key) ? guard(node) : node;
  if (Array.isArray(node)) return node.map((v) => guardScene(v, guard, key === "labels" ? "labels" : ""));
  if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, guardScene(v, guard, k)]));
  return node;
}

function answerGuard(policy: TutorPolicy, name: string, args: Record<string, unknown>): ShapedCall | null {
  if (args.__guarded || name === "add_student_attempt" || name === "set_plan" || policy.boardHelp >= 4) return null;
  const page = policy.pageProblem && /[\d=+\-−×÷*/^\\<>]/.test(policy.pageProblem) ? policy.pageProblem : null;
  const asked = policy.spokenFresh ? [policy.lastSpokenQuestion, policy.lastAsked] : [policy.lastAsked, policy.lastSpokenQuestion];
  const questions = [...new Set([...asked, page].filter((q): q is string => Boolean(q && q.trim())))];
  if (!questions.length) return null;
  const given = new Set([...policy.saidNumbers, ...policy.boardNumbers, ...questions.flatMap((q) => numbersIn(spokenToDigits(q)))]);
  const answers = (token: string) => questions.some((q) => {
    try {
      return checkAnswer(withKnownRules(q, policy.functionRules), token).verdict === "correct";
    } catch {
      return false;
    }
  });
  let changed: string | null = null;
  const guard = (value: string) =>
    value.replace(NUMBER_TOKEN, (token) => {
      const plain = token.replace(/\s+/g, "");
      if (given.has(plain) || numbersIn(plain).every((n) => given.has(n))) return token;
      if (!answers(plain)) return token;
      changed = plain;
      return "?";
    });
  const out: Record<string, unknown> = { ...args };
  // A picture's words are its labels, titles and captions, wherever they sit in
  // the scene (Oct 23 2026: the tutor writes its own picture requests now).
  if (name === "draw_illustration" && args.scene && typeof args.scene === "object") out.scene = guardScene(args.scene, guard);
  for (const [key, value] of Object.entries(args)) {
    if (!GUARDED_KEYS.has(key) || typeof value !== "string") continue;
    // A new problem's own text is its givens.
    if (name === "start_new_problem" && key !== "ask") continue;
    out[key] = guard(value);
  }
  if (!changed) return null;
  return { args: out, note: `Wrote "?" where ${changed} was: it answers the question on the table, and that is theirs to say. Ask for it.` };
}

export function withholdResult(policy: TutorPolicy, name: string, args: Record<string, unknown>): ShapedCall {
  if (policy.boardHelp >= 5) return { args, note: null };
  const guarded = answerGuard(policy, name, args);
  if (guarded) {
    if (name !== "draw_equation_step") return guarded;
    // An equation line goes on through the step and result rules below.
    const rest = withholdResult(policy, name, { ...guarded.args, __guarded: true });
    const { __guarded: _drop, ...clean } = rest.args;
    void _drop;
    return { ...rest, args: clean, note: [guarded.note, rest.note].filter(Boolean).join(" ") || null };
  }
  if (name !== "draw_equation_step" && name !== "add_student_attempt" && name !== "start_new_problem" && name !== "set_plan") {
    const captions = withholdCaptions(policy, args);
    if (captions.note) return captions;
  }
  if (name !== "draw_equation_step" || typeof args.latex !== "string") return { args, note: null };
  const latex = args.latex.trim();
  // A shown step (H4) or worked example (H5) keeps its results.
  if (policy.boardHelp < 4) {
    const step = withholdStep(policy, latex);
    if (step) return { args: { ...args, latex: step.latex }, note: step.note, withheld: stepKey(STEP_LINE.exec(latex)![1]) };
  }
  // A "= ?" step line the tutor wrote itself is tracked the same way, so its
  // full line replaces it (Oct 7 2026: "du/dx = ?" stayed beside "du/dx = 2x").
  const own = /^\s*(d?[a-z]|[a-z]'\s*\(\s*[a-z]\s*\)|\\frac\{d[a-z]?\}\{d[a-z]\}|d[a-z]\s*\/\s*d[a-z])\s*=\s*\?\s*$/i.exec(latex);
  if (own) {
    const key = stepKey(own[1]);
    if (!policy.withheld.some((w) => w.lhs === key)) policy.withheld.push({ lhs: key, latex: "", rhs: "", item: null });
    return { args, note: null, withheld: key };
  }
  // The full line, once it may be shown, takes the place of its "= ?" line.
  const full = STEP_LINE.exec(latex);
  const open = full ? policy.withheld.find((w) => w.lhs === stepKey(full[1])) : undefined;
  if (open) {
    policy.withheld = policy.withheld.filter((w) => w !== open);
    if (open.item) return { args, note: null, replaces: open.item };
  }
  // A division's "q R r" is the answer to the whole problem: it waits until
  // they have said it in that form, even when both numbers came up on the way
  // (Oct 12 2026: "47 ÷ 6 = 7 R 5" went up as the tutor asked for the answer).
  const rem = REMAINDER_TAIL.exec(latex);
  if (rem) {
    const said = [...policy.saidLines, policy.lastUtterance ?? ""].some((line) => {
      const t = spokenToDigits(line.toLowerCase());
      return new RegExp(`\\b${rem[2]}\\s*(?:r|rem|remainder|with a remainder of|left ?over)\\s*${rem[3]}\\b`).test(t);
    });
    if (said) return { args, note: null };
    const asked = `${rem[1]} ?`;
    policy.lastAsked = asked;
    return { args: { ...args, latex: asked }, note: `Wrote it as "${latexToPlain(asked)}": the result is theirs to say. Ask for it; don't say it.` };
  }
  const m = RESULT_TAIL.exec(latex);
  if (!m) return { args, note: null };
  const before = m[1].slice(0, -1);
  const lastSide = before.split("=").at(-1) ?? before;
  if (!pureArithmetic(lastSide)) return { args, note: null };
  // A false line is never written in the tutor's ink (Oct 12 2026: "53 ÷ 8 = 6"
  // went up typeset, the student's wrong answer stated as a fact).
  const holds = checkAnswer(lastSide, m[2] + (m[3] ?? ""));
  if (holds.verdict === "incorrect" || holds.verdict === "partial") {
    const shown = latexToPlain(latex);
    return { args, note: null, refuse: `"${shown}" is not true, so it was not written as your line. If it is the student's answer, it is already on the board in their hand: point at it and ask how they got it.` };
  }
  const value = numbersIn(m[2])[0];
  if (!value || policy.saidNumbers.includes(value)) return { args, note: null };
  const asked = `${m[1]} ?`;
  policy.lastAsked = asked;
  const shown = latexToPlain(asked);
  return { args: { ...args, latex: asked }, note: `Wrote it as "${shown}": the result is theirs to say. Ask for it; don't say it.` };
}

/** The problems an answer line may answer, in order, and the line's answer sentence (`t`); null when it is no answer. Pure. */
function answerCandidates(policy: TutorPolicy, text: string): { t: string; candidates: Array<{ problem: string; answer: string }> } | null {
  const whole = text.trim();
  if (!whole || isNonAnswer(whole)) return null;
  // Kids answer in long lines: "f(2) is 7 and g(2) is 6. so 7 plus 6 is 13? is
  // that right?" (Sept 27 2026: 14 of 123 answer lines got a verdict). The last
  // sentence that reads as an answer is the answer.
  const answers = looksLikeAnswer(whole) ? [whole] : whole.split(/(?<=[.?!])\s+/).reverse().map((c) => c.trim()).filter((c) => /\d/.test(spokenToDigits(c)) && looksLikeAnswer(c));
  if (!answers.length) return null;
  const t = answers[0];
  // A topic heading is not a problem; the spoken question usually is.
  const page = policy.pageProblem && /[\d=+\-−×÷*/^\\<>]/.test(policy.pageProblem) ? policy.pageProblem : null;
  const candidates: Array<{ problem: string; answer: string }> = [];
  // "which is bigger, 0.35 or 0.5, and i put 0.35": the problem and their
  // answer in one line (Sept 26 2026: no case asked how the student got an
  // answer they reported, because nothing checked it).
  const reported = REPORTED.exec(spokenToDigits(t, { the: true }));
  if (reported && /\d/.test(reported[1]) && /\d|\b(?:same|equal)\b/i.test(reported[2])) candidates.push({ problem: reported[1].replace(/^(?:it (?:was|asked|said)|the (?:problem|question) (?:was|said|asked)|like)\s+/i, "").trim(), answer: reported[2] });
  // "12 cookies shared by 3 friends. i got 9 each cuz…": a sharing story and
  // their answer to it in one line (Oct 23 2026).
  const story = whole.split(/(?<=[.?!])\s+/).find((c) => sharingProblem(c));
  const got = story ? GOT.exec(spokenToDigits(beforeReason(whole.slice(whole.indexOf(story) + story.length)), { the: true })) : null;
  if (story && got) candidates.push({ problem: story.replace(/^(?:my homework says|it says|the problem (?:says|is)|it'?s)\s+/i, "").replace(/[.?!]+$/, "").trim(), answer: got[1] });
  // A question held from before counts only while it is still the one on the
  // table: its numbers were said in the tutor's last turn, or the student says
  // them (Sept 27 2026: Sofia's "negative eleven" answered "…where do you land?"
  // about -7 - 4, the page's stale first problem -5 + 8 was checked instead,
  // and the app wrote "-5 + 8 = -11" in her hand).
  const live = (problem: string) => {
    if (!policy.lastTutorNumbers) return true;
    // The board's own question stays on the table for the next turn even when
    // the tutor only says "what does that give you?" (Sept 27 2026: Ethan's
    // right 72.25 to "85 - 12.75 = ?" went unchecked).
    if (problem === policy.lastAsked && policy.askedAge <= 1) return true;
    const said = new Set([...policy.lastTutorNumbers, ...numbersIn(spokenToDigits(t))]);
    return numbersIn(problem).every((n) => said.has(n));
  };
  const order = policy.spokenFresh ? [policy.lastSpokenQuestion, policy.lastAsked, page] : [policy.lastAsked, policy.lastSpokenQuestion, page];
  for (const c of order) if (c && c.trim() && live(c)) for (const a of answers) candidates.push({ problem: withKnownRules(c, policy.functionRules), answer: a });
  // Their own arithmetic ("9 minus 8 is 1") only when the question can't be
  // read: checked first, "3 times 4 is 12, so h(4) is 12" was called right by
  // its first step while the answer to h(x) = 3x - 1 was wrong.
  const own = ownClaim(beforeReason(t));
  if (own) candidates.push(own);
  return { t, candidates };
}

/**
 * The checker's verdict on a line before anything is recorded (the spoken
 * path plans the reply as soon as the student stops, before the tutor calls a
 * tool: lib/gemini-live speculate). Null when nothing could be checked.
 */
export function previewCheck(policy: TutorPolicy, text: string): string | null {
  const found = answerCandidates(policy, text);
  if (!found) return null;
  for (const { problem, answer } of found.candidates) {
    const check = checkAnswer(problem, answer);
    if (check.verdict !== "cannot_check") return `[Answer check, not from the student: "${found.t.length > 60 ? `${found.t.slice(0, 57)}…` : found.t}" → ${check.verdict}. ${check.message}]`;
  }
  return null;
}

export function autoCheck(policy: TutorPolicy, text: string, now: number): string | null {
  const found = answerCandidates(policy, text);
  if (!found) return null;
  const { t, candidates } = found;
  for (const candidate of candidates) {
    let { problem, answer } = candidate;
    let check = checkAnswer(problem, answer);
    if (check.verdict === "cannot_check") continue;
    // Their own whole claim about other numbers answers an earlier question,
    // not this one (Oct 13 2026: "6*7 is 42", typed after the tutor had moved
    // on to "47 - 42 = ?", was called wrong against 47 - 42).
    const own = check.verdict !== "correct" ? ownClaim(beforeReason(t)) : null;
    if (own) {
      const theirs = numbersIn(own.problem), asked = numbersIn(problem);
      const mine = checkAnswer(own.problem, own.answer);
      // About other numbers, or simply true (Oct 14 2026: "6*7 is 42" was
      // called a wrong remainder for 47 ÷ 6 because both have a 6 in them).
      if (theirs.length && mine.verdict !== "cannot_check" && (mine.verdict === "correct" || !theirs.some((n) => asked.includes(n)))) {
        problem = own.problem;
        answer = own.answer;
        check = mine;
      }
    }
    const skill = policy.currentSkill ?? policy.pageSkill ?? "unnamed skill";
    // What the board gave them on this problem, not a guess: an answer found
    // with no picture or shown step is found alone (Sept 26 2026: the old
    // floor of H1 meant no auto-checked answer ever counted toward ALONE or UP).
    const help = policy.boardHelp;
    const step = stepOfPage(policy.pageProblem, problem, answer);
    recordAttempt(policy, { skill, result: attemptFromVerdict(check.verdict), help, auto: true, problem, step }, now);
    noteAnswerChecked(policy);
    const struck = check.verdict === "correct" && !step && policy.lastWrongAttempt ? ` Cross out their earlier "${policy.lastWrongAttempt}" (cross_out_step).` : "";
    const marked = planMarks(policy, problem, answer, check.verdict, step);
    if (check.verdict === "correct" && !step) policy.lastWrongAttempt = null;
    else if (check.verdict === "incorrect" || check.verdict === "partial") policy.lastWrongAttempt = t.length > 40 ? `${t.slice(0, 37)}…` : t;
    // With code-owned marks the board part is done; the order is only what to say.
    const order = marked
      ? check.verdict === "correct"
        ? `${marked} Say what was right in a few words (not "right" alone), then the next thing to do.`
        : check.verdict === "partial"
          ? `${marked} Ask what is still missing.`
          : `${marked} Don't say right or yes. Ask how they got it before anything else; don't correct it yet and don't say the answer.`
      : check.verdict === "correct"
        ? `Write it in their hand (add_student_attempt), ring it (circle_item keep=true), then the next thing to do.${struck}`
        : check.verdict === "partial"
          ? "Write it in their hand (add_student_attempt), then ask what is still missing."
          : "Write it in their hand (add_student_attempt), then ask how they got it; don't say the answer.";
    const said = t.length > 60 ? `${t.slice(0, 57)}…` : t;
    const note = `[Answer check, not from the student: "${said}" → ${check.verdict}. ${check.message} ${order}]`;
    policy.autoChecked = { answer, verdict: check.verdict, message: check.message, problem, at: now, note, sent: false, consumed: false };
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

const COMPARATIVE = /\b(bigger|larger|greater|more|higher|smaller|less|lower|fewer)\b/i;
// Only numbers joined by words: "0.35 or 0.5", "0.35 and 0.5", "0.35, 0.5", "0.35 vs 0.5".
const PAIR_WORDS = /^\s*-?\d+(?:\.\d+)?(?:\/\d+)?\s*(?:or|and|vs\.?|versus|,)\s*-?\d+(?:\.\d+)?(?:\/\d+)?\s*\??\s*$/i;

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
  // The answer written as the problem itself proves nothing (Oct 8 2026: "x^2 + 1"
  // checked against "x^2 + 1" was stored as a right answer and froze the lesson state).
  if (answerKey(problem) === answerKey(answer)) return { success: true, message: "Verdict: cannot_check. The problem you sent is their answer itself. Send the question they were answering as problem (in digits and symbols), or judge it yourself and reply now." };
  // The same answer the code checked a moment ago: the same verdict, recorded once.
  const auto = policy.autoChecked;
  // …and only for the same problem: a model checking another problem gets a
  // fresh check (Sept 27 2026: its check of "-7 - 4" got back the auto-check's
  // stale verdict on "-5 + 8").
  const sameNumbers = (a: string, b: string) => numbersIn(a).sort().join(",") === numbersIn(b).sort().join(",");
  // The same answer in other words counts too: "2/4, so … gives 3/4" checked by
  // the app and "3/4" checked by the model are one answer (Oct 11 2026: it was
  // recorded twice, "2 of 2 right" for one answer).
  const sameAnswer = (a: { answer: string; problem: string }) => (answerKey(a.answer) === answerKey(answer) && sameNumbers(a.problem, problem)) || answerLine(a.problem, a.answer) === answerLine(problem, answer);
  const reused = auto && !auto.consumed && now - auto.at < 60_000 && sameAnswer(auto) ? auto : null;
  let check = reused ? { verdict: reused.verdict as CheckVerdict, message: reused.message } : checkAnswer(withKnownRules(problem, policy.functionRules), answer);
  if (reused) reused.consumed = true;
  // "x - 2 = ?" on the way through the page's equation: its box holds that
  // side's value at the page's solution.
  if (!reused && check.verdict === "cannot_check" && policy.pageProblem) {
    const page = problemMath(policy.pageProblem);
    const inPage = page ? checkBlankInPage(page, problem, answer) : null;
    if (inPage) check = inPage;
  }
  // Two numbers and no question ("0.35 or 0.5", "0.35 and 0.5"): which one is
  // asked is in what was said ("which is bigger? … I put 0.35"). A spoken
  // session made three blocking tries at it before its first word (Sept 27 2026).
  if (!reused && check.verdict === "cannot_check") {
    const pair = numbersIn(problem);
    const cmp = COMPARATIVE.exec(`${policy.lastUtterance ?? ""} ${policy.lastSpokenQuestion ?? ""}`)?.[1].toLowerCase();
    if (pair.length === 2 && cmp && PAIR_WORDS.test(problem)) {
      const again = checkAnswer(`which is ${cmp}, ${pair[0]} or ${pair[1]}`, answer);
      if (again.verdict !== "cannot_check") check = again;
    }
  }
  // Tried twice on one answer: judge it without the checker.
  if (!reused && check.verdict === "cannot_check") {
    const again = policy.lastCannot && answerKey(policy.lastCannot.answer) === answerKey(answer) && now - policy.lastCannot.at < 60_000;
    policy.lastCannot = { answer, at: now };
    if (again) return { success: true, message: `Verdict: cannot_check. Still can't read it. Don't call check_answer again for this answer: judge it yourself from their words and the board, and ask how they got it.` };
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
  // Code-owned marks: an answer the auto-check already put up is not written twice.
  const marked = reused
    ? policy.codeMarks && check.verdict !== "cannot_check" ? ` It is already on the board in their hand${check.verdict === "correct" && !step ? ", ringed" : ""}.` : ""
    : planMarks(policy, problem, answer, check.verdict, step);
  if (check.verdict === "correct" && !step) policy.lastWrongAttempt = null;
  else if (check.verdict === "incorrect" || check.verdict === "partial") policy.lastWrongAttempt = answer.length > 40 ? `${answer.slice(0, 37)}…` : answer;
  const onBoard = check.verdict === "cannot_check"
    ? ""
    : marked
      ? ` ${marked.trim()}${check.verdict !== "correct" ? " Don't say right or yes; ask how they got it." : ""}${check.verdict === "correct" && !step && IS_EQUATION.test(problem) ? " Have them check it by putting the value back in." : ""}`
      : check.verdict !== "correct"
        ? " Don't say right or yes. Board: add_student_attempt with their exact words; no mark on it yet."
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
