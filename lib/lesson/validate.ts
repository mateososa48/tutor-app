// A plan, checked before any of it is said or drawn (Oct 31 2026, Plan B B3/B4).
// Each rule here comes from a recorded failure:
// - the tutor asserted "five times four plus three is twenty-four" (7wr9ea);
// - it called answers right or wrong with nothing checked behind the verdict;
// - it asked for the roots the student had opened with (jqw5pk) and for an
//   answer they had just given (8z4ktl);
// - it wrote a step's answer on the board in the turn that asked for it;
// - after "thanks, I understand" it started a harder problem (8z4ktl);
// - it said a diagonal was drawn when none was (o8rpq1).
// Small things are fixed in place (a praise opener, stray symbols in speech);
// anything else goes back to the model as an issue, once.

import { spokenToDigits } from "../answer-check";
import { assessClaims, falseAssertions } from "../math-claims";

const assessClaimsText = (text: string) => assessClaims(text).map((c) => c.text);
import { checkResponse, checkSupport, type InputAssessment } from "./assess";
import type { Compiled } from "./compile";
import { resolveRef } from "./compile";
import type { LessonState, QuestionRecord, TurnPlan } from "./types";

export type Verdict = { answer: string; is: "correct" | "incorrect" | "partial"; because: string[] } | null;

const PRAISE = /^(?:(?:yes|yeah|yep|right|okay|ok|so|oh|nice|good)[,.!]?\s+)?(?:exactly|great(?: job| work| thinking)?|perfect|awesome|amazing|excellent|fantastic|spot on|well done|good job|nice work|you got it|that's (?:right|it|correct))[,.!]*\s*/i;
const AFFIRMS = /\b(?:(?:is|was|that's|thats|it's|its|you're|you are) (?:right|correct)|you got it|you've got it|(?:that|it) (?:works|checks out)|^(?:yes|yep|yeah|right|correct)\b)/i;
const DENIES = /\b(?:(?:is|was|that's|thats|it's|its) (?:not right|wrong|incorrect|not correct|not quite)|not quite|that's not it|isn't right)\b/i;

/** Speech made speakable: no LaTeX, no markup, no praise opener. */
export function cleanSpeech(text: string): string {
  return text
    .replace(PRAISE, "")
    // A bare opener ("Good,", "Nice!") says nothing about what they did.
    .replace(/^(?:good|great|nice|awesome|perfect|excellent|wonderful|cool)[,.!]+\s+/i, "")
    .replace(/\$+/g, "")
    .replace(/\\[a-z]+\{([^{}]*)\}/gi, "$1")
    .replace(/\\[a-z]+/gi, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** The numbers a text states, as strings ("2", "-1", "3/4", "0.35"). */
function numbersOf(text: string): string[] {
  return (spokenToDigits(text.replace(/[−–]/g, "-")).match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) ?? []).map((n) => n.replace(/^-0$/, "0"));
}

/**
 * Does `text` state the answer `expects`? Only by a number that is new: one
 * the problem, the board and the student have not already put on the table
 * (Oct 31 2026: "three x" and the student's own roots 2 and 3 counted as
 * giving the answer away). An equation's answer is its right side's value.
 */
function states(text: string, expects: string, known: Set<string>): boolean {
  const rhs = /=\s*([^=]+)$/.exec(expects)?.[1] ?? expects;
  const target = numbersOf(rhs).filter((n) => !known.has(n));
  if (!target.length) return false;
  const have = new Set(numbersOf(text));
  return target.every((n) => have.has(n));
}

/** The current problem's own math (its numbers are not the student's). */
function currentMath(state: LessonState): string {
  const p = state.problems.find((x) => x.id === state.current);
  return p ? `${p.math ?? ""} ${p.givens.map((f) => f.value).join(" ")}` : "";
}

/** Numbers already on the table: the problem's, the board's before this turn, and every number the student has said. */
function knownNumbers(state: LessonState): Set<string> {
  const texts = [state.goal.text, ...state.problems.flatMap((p) => [p.statement, p.math ?? "", ...p.givens.map((f) => String(f.value))]), ...state.transcript.filter((t) => t.role === "student").map((t) => t.text), ...state.board.flatMap((b) => b.facts)];
  return new Set(texts.flatMap(numbersOf));
}

/** One thing wrong with a plan. Hard issues go back to the model; the rest are fixed here. */
export type Issue = { text: string; kind: "false_math" | "verdict" | "leak" | "reask" | "close" | "board" | "speech" | "question" };

/** The issues with a parsed, compiled plan; and the plan with small things fixed. */
export function validatePlan(state: LessonState, a: InputAssessment, plan: TurnPlan, verdict: Verdict, compiled: Compiled): { plan: TurnPlan; issues: string[]; detail: Issue[]; fixes: string[] } {
  const detail: Issue[] = compiled.issues.map((text) => ({ text, kind: "board" as const }));
  const fixes: string[] = [];
  const add = (kind: Issue["kind"], text: string) => detail.push({ kind, text });
  let speech = plan.speech.map((s) => ({ ...s, text: cleanSpeech(s.text), ...(s.fallback ? { fallback: cleanSpeech(s.fallback) } : {}) })).filter((s) => s.text);
  const spoken = speech.map((s) => s.text).join(" ");

  // 1. No false computation said as the tutor's own.
  for (const s of speech) for (const c of falseAssertions(s.text)) add("false_math", `speech says "${c.text}", which is false (${c.correct}). Say the true fact, or attribute the claim to the student ("you said …").`);

  // 2. A verdict on their answer never contradicts the checker; a false step
  // of theirs is never passed over (session 7wr9ea: a right answer on two
  // false claims was approved as "good reasoning").
  const affirms = AFFIRMS.test(spoken);
  const denies = DENIES.test(spoken);
  const code = a.answer?.verdict;
  if (code === "incorrect" && affirms && !denies) add("verdict", "the checker found their answer INCORRECT, but the speech calls it right.");
  if (code === "correct" && denies && !affirms) add("verdict", "the checker found their answer CORRECT, but the speech calls it wrong.");
  const said = new Set(numbersOf(spoken));
  for (const c of a.claims.filter((x) => x.verdict === "verified_false")) {
    const truth = c.values ? fmtNum(c.rel === "=" || c.rel === "!=" ? c.values[0] : NaN) : null;
    // Repaired: the true value said ("twenty-three"), or for a comparison, words of more/less.
    const repaired = c.rel === "=" || c.rel === "!=" ? truth !== null && said.has(truth) : /\b(?:more|less|bigger|smaller|greater|over|under|above|below|equal|equals|not)\b/i.test(spoken);
    if (!repaired) add("verdict", `their claim "${c.text}" is false (${c.correct}); the speech must say the true fact.`);
  }
  if (verdict && verdict.because.length) {
    const support = checkSupport(verdict.because);
    if (!support.ok) add("verdict", `the verdict's because does not hold: ${support.failed.join("; ")}.`);
  }

  // 3. Closing when they stop; no new task after they finished and understood.
  if (a.signals.includes("stop")) {
    if (!plan.close) add("close", "they want to stop: set close and end warmly.");
    if (plan.question) {
      plan = { ...plan, question: null };
      fixes.push("dropped the question: they are stopping");
    }
  }
  if (plan.close && plan.question) plan = { ...plan, question: null };
  if (a.signals.includes("done_understood") && plan.move === "practice") add("close", "they finished and said they understand: recap and offer more; do not start a new task.");

  // 4. The question: not a leak, not already answered.
  if (plan.question && plan.question.expects && !plan.givesAnswer && (plan.question.kind === "value" || plan.question.kind === "step")) {
    const exp = plan.question.expects;
    const known = knownNumbers(state);
    const outside = speech.map((s) => s.text.replace(plan.question!.text, "")).join(" ");
    if (states(outside, exp, known)) add("leak", `the speech gives away the answer to its own question (${exp}). Leave it for them, or set gives_answer if you mean to tell them.`);
    for (const b of plan.board) {
      const written = b.do === "work_step" ? b.result ?? "" : b.do === "work_line" ? b.text : b.do === "table" ? b.rows : "";
      if (written && !/\?/.test(written) && states(written, exp, known)) add("leak", `the board writes the answer to the question in the same turn (${written}). Write it with ? for them.`);
    }
    const q: QuestionRecord = { id: "probe", problemId: state.current, text: plan.question.text, kind: plan.question.kind, expects: exp, ...(plan.question.check ? { check: plan.question.check } : {}), status: "open", askedTurn: "probe" };
    const theirs = state.transcript.filter((t) => t.role === "student").map((t) => t.text);
    const lines = [state.goal.text, ...theirs];
    const clauses = lines.flatMap((l) => [l, ...l.split(/(?<=[.?!;])\s+|\s+(?:and then|then|so)\s+/i)]).filter((c) => /\d/.test(c) && c.length < 240);
    // The problem itself is not an answer to one of its steps ("3x + 7 = 22"
    // has the same solution as "3x = 15"), and a step is answered only by a
    // line that says its new value.
    const problemKey = currentMath(state).replace(/\s+/g, "").replace(/[.,;]+$/, "");
    const rhsValue = numbersOf(/=\s*([^=]+)$/.exec(exp)?.[1] ?? "").find(Boolean);
    const candidates = clauses.filter((c) => !(problemKey && c.replace(/\s+/g, "").includes(problemKey.split(" ")[0])) && (plan.question!.kind !== "step" || !rhsValue || numbersOf(c).includes(rhsValue)));
    let hit = candidates.find((c) => checkResponse(q, c).verdict === "correct");
    // A single value they have already said on this problem (not one of the
    // problem's own numbers): asking for it again is asking what they said
    // (Oct 31 2026: "found 2 and 3", then "what is x when x − 3 = 0?").
    const single = /^\s*(?:[a-z]\s*=\s*)?(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*$/i.exec(exp)?.[1];
    if (!hit && single && plan.question.kind === "value") {
      const own = new Set(numbersOf(currentMath(state)));
      const found = lines.find((l) => numbersOf(l).some((n) => n === single && !own.has(n)));
      if (found) hit = found;
    }
    if (hit && !/again|check|remind|still/i.test(plan.question.text)) add("reask", `they already answered this ("${hit.slice(0, 100)}"): use their answer instead of asking for it.`);
  }
  // The blank a question fills must exist and be waiting; otherwise the question just has no blank.
  if (plan.question?.fill) {
    const hit = resolveRef(state, compiled.objects, plan.question.fill);
    const spec = hit?.obj.spec as { kind?: string; lines?: Array<{ id: string; text: string }>; rows?: string[][] } | undefined;
    const waiting = hit?.part && spec?.kind === "work" ? spec.lines?.some((l) => l.id.toLowerCase() === hit.part!.toLowerCase() && /\?/.test(l.text)) : hit?.part && spec?.rows ? true : false;
    if (!waiting) {
      fixes.push(`question fill ${plan.question.fill} is not a waiting blank: dropped`);
      const { fill: _f, ...rest } = plan.question;
      void _f;
      plan = { ...plan, question: rest };
    }
  }
  // A question the speech never asks is added at the end; one it asks in other words is left alone.
  if (plan.question && !plan.close && plan.move !== "recap" && !speech.some((s) => s.text.includes("?"))) speech.push({ id: `s${speech.length + 1}`, text: cleanSpeech(plan.question.text), needs: [] });
  if (!speech.length) add("speech", "speech is empty");
  const asks = (speech.map((s) => s.text).join(" ").match(/\?/g) ?? []).length;
  if (asks > 1) add("question", `the speech asks ${asks} questions; ask one.`);

  // 5. A sentence waits only for real board parts; a ref to nothing is dropped, not fatal.
  speech = speech.map((s) => {
    const needs = s.needs.filter((ref) => {
      const hit = resolveRef(state, compiled.objects, ref);
      const ok = hit && (!hit.part || hit.obj.parts.some((p) => p.toLowerCase() === hit.part!.toLowerCase()));
      if (!ok) fixes.push(`dropped need "${ref}" (not on the board)`);
      return ok;
    });
    return { ...s, needs };
  });
  return { plan: { ...plan, speech }, issues: detail.map((d) => d.text), detail, fixes };
}

const fmtNum = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "");

/**
 * The plan with what is still wrong cut out, after the model's second try
 * failed: sentences with false math go, a leaked or repeated question goes,
 * board changes that failed are already not compiled. What is left must still
 * say something; if not, the caller falls back.
 */
export function salvage(plan: TurnPlan, detail: Issue[]): TurnPlan | null {
  let speech = plan.speech;
  let question = plan.question;
  for (const d of detail) {
    if (d.kind === "false_math") {
      const bad = /speech says "([^"]+)"/.exec(d.text)?.[1];
      if (bad) speech = speech.filter((s) => !mathFormIncludes(s.text, bad));
    }
    if (d.kind === "leak" || d.kind === "reask") {
      // Without the question, the sentence that asks it goes too.
      if (question) speech = speech.filter((s) => !s.text.includes("?"));
      question = null;
    }
    if (d.kind === "verdict" && /INCORRECT|CORRECT/.test(d.text)) return null;
    if (d.kind === "close") return null;
  }
  if (!speech.length) return null;
  return { ...plan, speech, question };
}

function mathFormIncludes(text: string, claim: string): boolean {
  return assessClaimsText(text).some((c) => c === claim);
}
