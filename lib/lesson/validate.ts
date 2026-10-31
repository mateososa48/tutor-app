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
import { assessClaims, evaluate, falseAssertions, fmtValue } from "../math-claims";

const assessClaimsText = (text: string) => assessClaims(text).map((c) => c.text);
import { checkResponse, checkSupport, verifySolution, type InputAssessment } from "./assess";
import type { Compiled } from "./compile";
import { resolveRef } from "./compile";
import type { LessonState, QuestionRecord, TurnPlan } from "./types";

export type Verdict = { answer: string; is: "correct" | "incorrect" | "partial"; because: string[] } | null;

const PRAISE = /^(?:(?:yes|yeah|yep|right|okay|ok|so|oh|nice|good)[,.!]?\s+)?(?:exactly|great(?: job| work| thinking)?|perfect|awesome|amazing|excellent|fantastic|spot on|well done|good job|nice work|you got it|that's (?:right|it|correct))[,.!]*\s*/i;
export const AFFIRMS = /\b(?:(?:is|was|that's|thats|it's|its|you're|you are) (?:right|correct)|you got it|you've got it|(?:that|it) (?:works|checks out)|^(?:yes|yep|yeah|right|correct)\b)/i;
export const DENIES = /\b(?:(?:is|was|that's|thats|it's|its) (?:not right|wrong|incorrect|not correct|not quite)|not quite|that's not it|isn't right)\b/i;

/** Speech made speakable: no LaTeX, no markup, no praise opener. */
export function cleanSpeech(text: string): string {
  // Tool-call markup a model sometimes writes into its text (Oct 31: a turn
  // said aloud began "<invoke name=…><parameter name="say">").
  text = text.replace(/<\/?(?:invoke|parameter|function_calls|antml:[a-z_]+)\b[^>]*>/gi, " ").replace(/<[^>]{1,80}>/g, " ");
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
export function numbersOf(text: string): string[] {
  return (spokenToDigits(text.replace(/[−–]/g, "-")).match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) ?? []).map((n) => n.replace(/^-0$/, "0"));
}

/**
 * Does `text` state the answer `expects`? Only by a number that is new: one
 * the problem, the board and the student have not already put on the table
 * (Oct 31 2026: "three x" and the student's own roots 2 and 3 counted as
 * giving the answer away). An equation's answer is its right side's value.
 */
export function states(text: string, expects: string, known: Set<string>): boolean {
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
export function knownNumbers(state: LessonState): Set<string> {
  const texts = [state.goal.text, ...state.problems.flatMap((p) => [p.statement, p.math ?? "", ...p.givens.map((f) => String(f.value))]), ...state.transcript.filter((t) => t.role === "student").map((t) => t.text), ...state.board.flatMap((b) => b.facts)];
  return new Set(texts.flatMap(numbersOf));
}

/** One thing wrong with a plan. Hard issues go back to the model; the rest are fixed here. */
export type Issue = { text: string; kind: "false_math" | "verdict" | "leak" | "reask" | "close" | "board" | "speech" | "question" };

/** The issues with a parsed, compiled plan; and the plan with small things fixed. */
/** The right side of a line, written as "?" ("5h ≤ 20" → "5h ≤ ?"). */
function blankRight(line: string): string {
  const m = /^(.*?)(<=|>=|≤|≥|≠|=|<|>)([^=<>≤≥≠]*)$/.exec(line);
  return m ? `${m[1].trimEnd()} ${m[2]} ?` : line;
}

/**
 * A board line that writes the answer to this turn's own question is written
 * with "?" instead, before it is compiled: the blank their answer fills. Was a
 * second model call every time (Oct 31 2026, the first engine runs).
 */
export function withholdOnBoard(state: LessonState, plan: TurnPlan): { plan: TurnPlan; fixes: string[] } {
  const q = plan.question;
  if (!q?.expects || plan.givesAnswer || !(q.kind === "value" || q.kind === "step")) return { plan, fixes: [] };
  const known = knownNumbers(state);
  const fixes: string[] = [];
  const board = plan.board.map((b) => {
    if (b.do === "work_step" && b.result && !/\?/.test(b.result) && states(b.result, q.expects!, known)) {
      fixes.push(`wrote "${blankRight(b.result)}" instead of "${b.result}": it is the answer they are asked for`);
      return { ...b, result: blankRight(b.result) };
    }
    if (b.do === "work_line" && !/\?/.test(b.text) && states(b.text, q.expects!, known)) {
      fixes.push(`wrote "${blankRight(b.text)}" instead of "${b.text}": it is the answer they are asked for`);
      return { ...b, text: blankRight(b.text) };
    }
    return b;
  });
  return { plan: fixes.length ? { ...plan, board } : plan, fixes };
}

export const SPEECH_WORDS_MAX = 95;

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A whole number in words, below a million ("23" → "twenty-three"). */
function intWords(n: number): string {
  if (n < 0) return `negative ${intWords(-n)}`;
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`;
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${intWords(n % 100)}` : ""}`;
  return `${intWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${intWords(n % 1000)}` : ""}`;
}

function numberWords(token: string): string {
  const neg = token.startsWith("-");
  const t = neg ? token.slice(1) : token;
  let out: string;
  if (/^\d+\/\d+$/.test(t)) out = t.split("/").map((x) => intWords(Number(x))).join(" over ");
  else if (/^\d+\.\d+$/.test(t)) {
    const [w, d] = t.split(".");
    out = `${intWords(Number(w))} point ${[...d].map((c) => ONES[Number(c)]).join(" ")}`;
  } else if (/^\d+$/.test(t) && Number(t) < 1_000_000) out = intWords(Number(t));
  else out = t;
  return neg ? `negative ${out}` : out;
}

/** A checked fact said aloud: "5 × 4 + 3 = 23" → "five times four plus three is twenty-three". */
export function factInWords(fact: string): string {
  const ops: Record<string, string> = { "×": "times", "*": "times", "·": "times", "+": "plus", "-": "minus", "−": "minus", "/": "divided by", "÷": "divided by", "=": "is", "<": "is less than", ">": "is more than", "≤": "is at most", "≥": "is at least", "<=": "is at most", ">=": "is at least", "≠": "is not" };
  return fact
    .replace(/(\d)\s*-\s*(\d)/g, "$1 - $2")
    .split(/\s+/)
    .map((w) => (ops[w] ?? (/^-?\d+(?:\.\d+)?(?:\/\d+)?$/.test(w) ? numberWords(w) : w)))
    .join(" ");
}

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
  // Their answer to the whole problem: right is said to be right, even when a reason under it is false.
  const fin = a.final?.verdict;
  if (fin === "incorrect" && affirms && !denies) add("verdict", `the checker found their answer ${a.final!.value} INCORRECT, but the speech calls it right.`);
  if (fin === "correct" && !affirms) add("verdict", `their answer ${a.final!.value} is CORRECT (checked); say it is right, and then fix any false step under it.`);
  // Repaired means one sentence says the true fact about the same numbers:
  // "five times four plus three is twenty-three", "twenty-four is more than
  // twenty-three". A true total said somewhere else ("so four hours costs
  // twenty-three") was let through on Oct 31 and repaired nothing.
  const sentences = spoken.split(/(?<=[.?!])\s+/);
  for (const c of a.claims.filter((x) => x.verdict === "verified_false")) {
    const lhsNums = numbersOf(c.lhs);
    const rhsNums = numbersOf(c.rhs);
    const truth = c.values ? fmtNum(c.rel === "=" || c.rel === "!=" ? c.values[0] : NaN) : null;
    const repaired = sentences.some((x) => {
      const has = new Set(numbersOf(x));
      if (c.rel === "=" || c.rel === "!=") return truth !== null && has.has(truth) && lhsNums.every((n) => has.has(n));
      return [...lhsNums, ...rhsNums].every((n) => has.has(n)) && /\b(?:more|less|bigger|smaller|greater|larger|over|under|above|below|higher|lower)\b/i.test(x);
    });
    if (!repaired) add("verdict", `their claim "${c.text}" is false (${c.correct}); one sentence of the speech must say the true fact with the same numbers ("${c.correct}" in words).`);
  }
  if (verdict && verdict.because.length) {
    const support = checkSupport(verdict.because);
    if (!support.ok) add("verdict", `the verdict's because does not hold: ${support.failed.join("; ")}.`);
  }

  // Not the last turn again: when the student pushes back ("I already know
  // how to factor"), the same explanation word for word is the wrong move
  // (Oct 31, judged blind: "repeats its T1 explanation almost word for word").
  const lastTutor = [...state.transcript].reverse().find((t) => t.role === "tutor")?.text ?? "";
  if (lastTutor) {
    const STOP = new Set(["the", "and", "that", "this", "you", "your", "with", "for", "are", "was", "what", "when", "then", "they", "them", "one", "its", "it's", "can", "have", "here", "there", "now", "just", "only", "into", "from", "each"]);
    const content = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
    const now = content(speech.map((x) => x.text).join(" "));
    const was = new Set(content(lastTutor));
    const shared = now.filter((w) => was.has(w)).length;
    if (now.length >= 12 && shared / now.length > 0.7) add("speech", "most of this is what you said last turn; they heard it. Say something new: a different way in (a picture, an example, the other view), or the next step.");
  }

  // The same question, unanswered twice, is not asked a third time the same
  // way (Oct 31: "what is five h less than or equal to?" three turns running).
  if (plan.question && !plan.close) {
    const wordsOf = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));
    const like = (x: string, y: string) => {
      const A = wordsOf(x);
      const B = wordsOf(y);
      const inter = [...A].filter((w) => B.has(w)).length;
      return inter / Math.max(1, Math.min(A.size, B.size)) >= 0.7;
    };
    const last = state.questions.filter((q) => q.problemId === state.current).slice(-2);
    if (last.length === 2 && last.every((q) => q.status !== "answered" && like(q.text, plan.question!.text))) {
      add("question", `you have asked "${last[1].text}" twice and they have not answered it; give more help this time (show the first move, a smaller question, or a picture), or ask it a different way.`);
    }
  }

  // A word problem needs its answer on record, so "I got 4" can be checked in code.
  const cur = state.problems.find((p) => p.id === state.current);
  const firstOnIt = state.evidence.filter((e) => e.problemId === state.current).length <= 1;
  if (cur && firstOnIt && cur.status === "open" && !cur.solution && !(cur.math && /=/.test(cur.math) && /[a-z]/i.test(cur.math)) && /\d/.test(cur.statement) && (!plan.solution || !verifySolution(plan.solution))) {
    add("question", plan.solution ? `solution: "${plan.solution.work}" does not give ${plan.solution.answer}; give the answer and plain arithmetic that computes it.` : "give solution: this problem's final answer (private) and plain arithmetic that computes it (answer \"4\", work \"(23-3)/5\").");
  }

  // A turn is heard: past this many words it is a lecture (Oct 31: 90-127 words a turn on T05).
  const wordCount = speech.map((x) => x.text).join(" ").split(/\s+/).filter(Boolean).length;
  if (wordCount > SPEECH_WORDS_MAX) add("speech", `the speech is ${wordCount} words; say it in at most about 75 (one idea, the next one next turn).`);

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

  // 4a. The problem's own answer is theirs to find: a sentence that says it
  // goes, unless this turn means to tell them (Oct 31: "one half plus one
  // third is five over six" in the very first reply).
  const prob = state.problems.find((x) => x.id === state.current);
  const probAnswer = prob?.solution?.answer ?? (prob?.math && !/[a-z=<>]/i.test(prob.math) ? (() => {
    const v = evaluate(prob.math!);
    return v === null ? null : fmtValue(v);
  })() : null);
  if (probAnswer && !plan.givesAnswer && prob?.status !== "solved") {
    const known = knownNumbers(state);
    const repairsClaim = (x: string) => a.claims.some((c) => c.verdict === "verified_false" && numbersOf(c.lhs).every((n) => numbersOf(x).includes(n)));
    let cutAns = 0;
    speech = speech.map((seg) => {
      const parts = seg.text.match(/[^.?!]+[.?!]*\s*/g) ?? [seg.text];
      const kept = parts.filter((x) => repairsClaim(x) || !states(x, probAnswer, known));
      cutAns += parts.length - kept.length;
      return { ...seg, text: kept.join("").trim() };
    }).filter((seg) => seg.text);
    if (cutAns) fixes.push(`cut ${cutAns} sentence${cutAns === 1 ? "" : "s"} that told the problem's answer (${probAnswer}) before they found it`);
    if (!speech.length) add("leak", `the speech only tells them the problem's answer (${probAnswer}); let them get there.`);
  }

  // 4. The question: not a leak, not already answered.
  if (plan.question && plan.question.expects && !plan.givesAnswer && (plan.question.kind === "value" || plan.question.kind === "step")) {
    const exp = plan.question.expects;
    const known = knownNumbers(state);
    // A sentence that tells the answer before the question asks it goes (the
    // question stays); a question that holds its own answer is a real leak.
    // A sentence that corrects one of their false claims is never cut, even
    // when its numbers include this question's answer (Oct 31: "five times
    // four is twenty, plus three is twenty-three" was cut for its 20).
    const repairs = (x: string) => a.claims.some((c) => c.verdict === "verified_false" && numbersOf(c.lhs).every((n) => numbersOf(x).includes(n)));
    let cut = 0;
    speech = speech.map((seg) => {
      const parts = seg.text.match(/[^.?!]+[.?!]*\s*/g) ?? [seg.text];
      const kept = parts.filter((x) => /\?/.test(x) || repairs(x) || !states(x, exp, known));
      cut += parts.length - kept.length;
      return { ...seg, text: kept.join("").trim() };
    }).filter((seg) => seg.text);
    if (cut) fixes.push(`cut ${cut} sentence${cut === 1 ? "" : "s"} that told the answer (${exp}) before asking for it`);
    const asking = speech.filter((seg) => /\?/.test(seg.text)).map((seg) => seg.text.replace(plan.question!.text, "")).join(" ");
    if (!speech.length || states(asking, exp, known)) add("leak", `the speech gives away the answer to its own question (${exp}). Leave it for them, or set gives_answer if you mean to tell them.`);
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
    // A right answer not called right: the code says so first.
    const right = /their answer (\S+) is CORRECT \(checked\)/.exec(d.text);
    if (d.kind === "verdict" && right) {
      speech = [{ id: "ok", text: `Your answer, ${numberWords(right[1])}, is right.`, needs: [] }, ...speech];
      continue;
    }
    if (d.kind === "verdict" && /INCORRECT|CORRECT/.test(d.text)) return null;
    // A false claim of theirs still not corrected: the code says the true fact itself.
    const claim = /their claim "([^"]+)" is false \(([^)]+)\)/.exec(d.text);
    if (d.kind === "verdict" && claim) {
      const fix = { id: `fix${speech.length + 1}`, text: `${factInWords(claim[2]).replace(/^\w/, (c) => c.toUpperCase())}.`, needs: [] as string[] };
      speech = speech.length > 1 ? [speech[0], fix, ...speech.slice(1)] : [fix, ...speech];
    }
    if (d.kind === "close") return null;
  }
  if (!speech.length) return null;
  return { ...plan, speech, question };
}

function mathFormIncludes(text: string, claim: string): boolean {
  return assessClaimsText(text).some((c) => c === claim);
}
