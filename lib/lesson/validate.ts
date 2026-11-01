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

import { spokenExpression, spokenToDigits } from "../answer-check";
import { assessClaims, evaluate, falseAssertions, fmtValue } from "../math-claims";

const assessClaimsText = (text: string) => assessClaims(text).map((c) => c.text);
import { checkResponse, checkSupport, verifySolution, type InputAssessment } from "./assess";
import type { Compiled } from "./compile";
import { resolveRef } from "./compile";
import { namedProblem } from "./source";
import { offPage } from "./state";
import type { LessonState, QuestionRecord, TurnPlan } from "./types";

export type Verdict = { answer: string; is: "correct" | "incorrect" | "partial"; because: string[] } | null;

const PRAISE = /^(?:(?:yes|yeah|yep|right|okay|ok|so|oh|nice|good)[,.!]?\s+)?(?:exactly|great(?: job| work| thinking)?|perfect|awesome|amazing|excellent|fantastic|spot on|well done|good job|nice work|you got it|that's (?:right|it|correct))[,.!]*\s*/i;
export const AFFIRMS = /\b(?:(?:is|was|that's|thats|it's|its|you're|you are) (?:right|correct)|you got it|you've got it|(?:that|it) (?:works|checks out)|^(?:yes|yep|yeah|right|correct)\b)/i;
export const DENIES = /\b(?:(?:is|was|that's|thats|it's|its) (?:not right|wrong|incorrect|not correct|not quite)|not quite|that's not it|isn't right)\b/i;

/** Speech made speakable: no LaTeX, no markup, no praise opener. */
/** "point sixty-three" said digit by digit: a decimal read as a whole number is the misconception itself. */
const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEEN_WORDS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS_WORDS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
export function decimalsDigitByDigit(text: string): string {
  return text.replace(/\bpoint (twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)(?:[- ](one|two|three|four|five|six|seven|eight|nine))?\b/gi, (_m, a: string, b?: string) => {
    const lo = a.toLowerCase();
    const teen = TEEN_WORDS.indexOf(lo);
    const pair = teen >= 0 ? ["one", DIGIT_WORDS[teen]] : [DIGIT_WORDS[TENS_WORDS.indexOf(lo)], b ? b.toLowerCase() : "zero"];
    return `point ${pair.join(" ")}`;
  });
}

export function cleanSpeech(text: string): string {
  // Tool-call markup a model sometimes writes into its text (Oct 31: a turn
  // said aloud began "<invoke name=…><parameter name="say">").
  text = text.replace(/<\/?(?:invoke|parameter|function_calls|antml:[a-z_]+)\b[^>]*>/gi, " ").replace(/<[^>]{1,80}>/g, " ");
  return decimalsDigitByDigit(text)
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
export function knownNumbers(state: LessonState, withBoard = true): Set<string> {
  const texts = [state.goal.text, ...state.problems.flatMap((p) => [p.statement, p.math ?? "", ...p.givens.map((f) => String(f.value))]), ...state.transcript.filter((t) => t.role === "student").map((t) => t.text), ...(withBoard ? state.board.flatMap((b) => b.facts) : [])];
  return new Set(texts.flatMap(numbersOf));
}

/** One thing wrong with a plan. Hard issues go back to the model; the rest are fixed here. */
export type Issue = { text: string; kind: "false_math" | "verdict" | "leak" | "reask" | "close" | "board" | "speech" | "question" | "ends" | "advice" };

/** A sentence that hands them a task ("Try it.", "Tell me what you get.", "Your turn."). */
export const GIVES_TASK = /\b(?:try|tell me|show me|write|work (?:it )?out|figure (?:it )?out|find|give me|go ahead|your turn|count|pick|choose|type|say|check|plug|put|start)\b/i;

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

export function validatePlan(state: LessonState, a: InputAssessment, plan: TurnPlan, verdict: Verdict, compiled: Compiled): { plan: TurnPlan; issues: string[]; detail: Issue[]; fixes: string[]; advice: string[] } {
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
  // A true claim of theirs is never called wrong (Oct 31: "7225 - 1084 = 6141"
  // got "close, but not quite").
  const trueOnes = a.claims.filter((c) => c.verdict === "verified_true" && !c.attributed);
  if (trueOnes.length && !a.claims.some((c) => c.verdict === "verified_false") && denies && !affirms) add("verdict", `their "${trueOnes[0].text}" is TRUE (checked); do not call it wrong. Say it is right, then the next step.`);
  // Their answer to the whole problem: right is said to be right, even when a reason under it is false.
  const fin = a.final?.verdict;
  if (fin === "incorrect" && affirms && !denies) add("verdict", `the checker found their answer ${a.final!.value} INCORRECT, but the speech calls it right.`);
  if (fin === "correct" && !affirms) add("verdict", `their answer ${a.final!.value} is CORRECT (checked); say it is right, and then fix any false step under it.`);
  // Repaired means one sentence says the true fact about the same numbers:
  // "five times four plus three is twenty-three", "twenty-four is more than
  // twenty-three". A true total said somewhere else ("so four hours costs
  // twenty-three") was let through on Oct 31 and repaired nothing.
  const sentences = spoken.split(/(?<=[.?!])\s+/);
  // The problem's answer, while they are still finding it: a false claim about
  // it is repaired by saying it is not their value, not by telling the answer
  // (Oct 31, T09: "1/2 + 1/3 = 2/5" had to be fixed by saying 5/6, which the
  // answer guard then cut, and the turn fell back).
  const curP = state.problems.find((x) => x.id === state.current);
  const answerKept = curP && curP.status !== "solved" && !plan.givesAnswer ? curP.solution?.answer ?? (curP.math && !/[a-z=<>]/i.test(curP.math) ? (() => { const v = evaluate(curP.math!); return v === null ? null : fmtValue(v); })() : null) : null;
  for (const c of a.claims.filter((x) => x.verdict === "verified_false")) {
    if (answerKept && c.values && numbersOf(fmtValue(c.values[0])).every((n) => numbersOf(answerKept).includes(n))) {
      const theirs = numbersOf(c.rhs);
      const denied = sentences.some((x) => theirs.every((n) => numbersOf(x).includes(n)) && (/\bnot\b|n't\b|\bisn|\bcan't\b/i.test(x) || DENIES.test(x)));
      if (!denied) add("verdict", `their claim "${c.text}" is false; say plainly that it is not ${c.rhs} (without telling them the answer).`);
      continue;
    }
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
    // Pairs of words, not single words: the topic's own words ("rectangle",
    // "diagonal", "twelve") come back in every good turn (Oct 31: single words
    // sent back five good turns in one run).
    const pairs = (t: string) => {
      const w = content(t);
      return w.slice(1).map((x, i) => `${w[i]} ${x}`);
    };
    const now = pairs(speech.map((x) => x.text).join(" "));
    const was = new Set(pairs(lastTutor));
    const shared = now.filter((w) => was.has(w)).length;
    if (now.length >= 10 && shared / now.length > 0.5) add("speech", "most of this is what you said last turn; they heard it. Say something new: a different way in (a picture, an example, the other view), or the next step.");
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
    // Answered or not: a reply that did not take it up still marks an open question answered.
    if (last.length === 2 && last.every((q) => like(q.text, plan.question!.text))) {
      add("question", `you have asked "${last[1].text}" twice already; give more help this time (show the first move, a smaller question, or a picture), or ask it a different way.`);
    }
  }

  // A new problem they are given goes on the board, not only into the air
  // (Oct 31: a pancake problem and "0.4 or 0.39" were only spoken).
  if (plan.question && (plan.move === "practice" || plan.move === "contrast")) {
    const fresh = numbersOf(plan.question.text).filter((n) => !knownNumbers(state).has(n));
    const written = compiled.objects.flatMap((o) => o.shown ?? o.facts).join(" ") + " " + compiled.ops.filter((o) => o.type === "heading").map((o) => (o as { title: string }).title).join(" ");
    if (fresh.length >= 2 && !fresh.every((n) => numbersOf(written).includes(n))) add("board", `the new problem in your question (${fresh.join(", ")}) is only spoken: write it on the board (a work_line or a table) so they can see it.`);
  }

  // Whatever the move is called: a sentence that hands them a new one ("try it
  // on a new one: x squared plus five x plus four") has it written (Oct 31,
  // two practice problems only spoken, both under move "confirm").
  const visible = [...state.board.filter((b) => b.status !== "failed" && !offPage(state, b)), ...compiled.objects].flatMap((o) => o.shown ?? o.facts).join(" ") + " " + compiled.ops.filter((o) => o.type === "heading").map((o) => (o as { title: string }).title).join(" ");
  for (const seg of speech) {
    const m = /\b(?:a new one|another one|another|the next one|next one|one more|try (?:this|these)(?: one)?|new problem|practice problem)\b[^:.?!]*[:,]?\s*(.+)$/i.exec(seg.text);
    if (!m) continue;
    const posed = numbersOf(spokenExpression(m[1]).replace(/\^\d+/g, " "));
    const missing = posed.filter((n) => !numbersOf(visible.replace(/\^\d+/g, " ")).includes(n));
    if (posed.length >= 2 && missing.length) add("advice", `the new problem ("${m[1].slice(0, 70)}") is only spoken: write it on the board (a work_line, or a table) so they can see it.`);
  }

  // Working on another problem from the sheet without moving to it piles its
  // pictures under the old heading (Oct 31: #3, #5 and #7 all sat under "−7 − 4").
  const sheet = state.problems.filter((p) => p.source.kind === "worksheet");
  if (sheet.length > 1 && !plan.problem && plan.board.some((b) => b.do !== "mark")) {
    const named = namedProblem(spokenToDigits(speech.map((x) => x.text).join(" ")), sheet);
    if (named && named !== state.current && state.problems.find((p) => p.id === named)?.status !== "solved") add("advice", `this turn works on ${named} (named in the speech) but problem is not set: set problem to "${named}" so it gets its own heading and page.`);
  }

  // A word problem needs its answer on record, so "I got 4" can be checked in code.
  const cur = state.problems.find((p) => p.id === state.current);
  const firstOnIt = state.evidence.filter((e) => e.problemId === state.current).length <= 1;
  if (cur && firstOnIt && cur.status === "open" && !cur.solution && !(cur.math && /=/.test(cur.math) && /[a-z]/i.test(cur.math)) && /\d/.test(cur.statement) && (!plan.solution || !verifySolution(plan.solution))) {
    add("question", plan.solution ? `solution: "${plan.solution.work}" does not give ${plan.solution.answer}; give the answer and plain arithmetic that computes it.` : "give solution: this problem's final answer (private) and plain arithmetic that computes it (answer \"4\", work \"(23-3)/5\").");
  }

  let askedEarly = false;
  // The same thing said twice in one turn sounds like a glitch (Oct 31: "Pick
  // one problem… tell me the numbers" and then "Can you pick one problem…?").
  // The one that asks stays.
  {
    const STOP = new Set(["the", "and", "you", "your", "that", "this", "with", "what", "for", "are", "was", "can", "its", "it's", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]);
    const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
    const sents = speech.flatMap((seg, i) => (seg.text.match(/[^.?!]+[.?!]*\s*/g) ?? [seg.text]).map((t) => ({ i, t: t.trim() })));
    const drop = new Set<string>();
    for (let x = 0; x < sents.length; x++)
      for (let y = x + 1; y < sents.length; y++) {
        const A = words(sents[x].t);
        const B = words(sents[y].t);
        // The same sentence said twice, not two sentences about one thing
        // ("Yes, five full rows." then "0.35 fills only three full rows").
        if (A.size < 4 || B.size < 4) continue;
        const shared = [...A].filter((w) => B.has(w)).length;
        if (shared / Math.max(A.size, B.size) < 0.7) continue;
        // The first item may already have been said (the early sentence): the plan goes back instead.
        // The first item may already have been said: it stays, and a repeat
        // of it goes when the first already asks or hands a task (kids12:
        // "Tell me how you decided… How did you decide…?").
        if (sents[x].i === 0) {
          if (sents[x].t.includes("?") || GIVES_TASK.test(sents[x].t)) {
            drop.add(sents[y].t);
            askedEarly = true;
          } else add("advice", `you say the same thing twice ("${sents[x].t.slice(0, 50)}" and "${sents[y].t.slice(0, 50)}"): say it once; the first sentence is already said.`);
        } else drop.add(sents[y].t.includes("?") && !sents[x].t.includes("?") ? sents[x].t : sents[y].t);
      }
    if (drop.size) {
      speech = speech.map((seg) => ({ ...seg, text: (seg.text.match(/[^.?!]+[.?!]*\s*/g) ?? [seg.text]).filter((t) => !drop.has(t.trim())).join("").trim() })).filter((seg) => seg.text);
      fixes.push(`dropped ${drop.size} sentence${drop.size === 1 ? "" : "s"} said twice in the turn`);
    }
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

  // 4b. The question still open from the last turn is theirs to answer too:
  // the tutor does not answer it for them (Oct 31: asked what five hours cost,
  // then said "twenty-eight" itself the next turn).
  const stillOpen = a.question && !a.answer && a.question.expects && (a.question.kind === "value" || a.question.kind === "step") ? a.question.expects : null;
  if (stillOpen && !plan.givesAnswer) {
    const known = knownNumbers(state);
    let cutOpen = 0;
    speech = speech.map((seg) => {
      const parts = seg.text.match(/[^.?!]+[.?!]*\s*/g) ?? [seg.text];
      const kept = parts.filter((x) => !states(x, stillOpen, known));
      cutOpen += parts.length - kept.length;
      return { ...seg, text: kept.join("").trim() };
    }).filter((seg) => seg.text);
    if (cutOpen) fixes.push(`cut ${cutOpen} sentence${cutOpen === 1 ? "" : "s"} that answered the open question (${stillOpen}) for them`);
  }

  // 4c. Talk only about what is on the board: a sentence that shows the student
  // a table, a graph, a picture or a figure needs one there, up already or drawn
  // this turn (Oct 31, judged blind: "let's make its table" with none drawn).
  const kinds = new Set([...state.board.filter((b) => b.status !== "failed").map((b) => b.kind), ...compiled.objects.map((o) => o.kind)]);
  const SHOWN: Array<[RegExp, string[], string]> = [
    [/\btable\b/i, ["table"], "a table"],
    [/\b(?:graph|curve|plotted|the line through)\b/i, ["plane"], "a graph"],
    [/\b(?:blocks?|cubes?|rods?|marbles?|the bags?|the picture|coins?|plates?|cookies?)\b/i, ["illustration", "blocks", "groups"], "a picture"],
    [/\b(?:bars?|pie)\b/i, ["fraction", "illustration"], "a fraction model"],
    [/\b(?:rectangle|triangle|diagonal)\b/i, ["geometry", "illustration"], "a figure"],
  ];
  const pointing = /\b(?:here (?:is|are)|here's|look at|on the board|i(?:'ve| have) drawn|i drew|i'll draw|let's make|see the|notice the|count the)\b/i;
  for (const seg of speech) {
    if (!pointing.test(seg.text)) continue;
    for (const [re, need, what] of SHOWN) {
      if (re.test(seg.text) && !need.some((k) => kinds.has(k as never))) {
        add("board", `the speech shows them ${what} ("${seg.text.slice(0, 70)}") but none is on the board or drawn this turn: draw it, or do not point to it.`);
        break;
      }
    }
  }

  // 4f. Numbers read off a table are on the table (Oct 31: "Look at the y
  // column: negative one, one, three, five" over a table with three rows;
  // "the three losses in the table: 15, 12.75, 10.84" over a table of values).
  const tables = [...state.board.filter((b) => b.status !== "failed" && !compiled.objects.some((o) => o.sid === b.sid)), ...compiled.objects].filter((b) => b.kind === "table");
  if (tables.length) {
    const inTable = new Set(tables.flatMap((b) => (b.shown ?? b.facts).flatMap(numbersOf)));
    for (const seg of speech) {
      for (const sentence of seg.text.split(/(?<=[.!])\s+/)) {
        if (sentence.includes("?") || !/\b(?:table|column|row)\b/i.test(sentence)) continue;
        // "the three losses", "two rows": counts, not entries.
        const said = numbersOf(sentence.replace(/\b(?:one|two|three|four|five|six|\d)\s+(?:losses|rows?|columns?|numbers|values|entries|steps|times|dots|points|lines|years?)\b/gi, " "));
        const missing = said.filter((n) => !inTable.has(n));
        if (said.length >= 2 && missing.length) add("advice", `the speech reads ${missing.join(", ")} off the table ("${sentence.slice(0, 80)}"), but the table does not show ${missing.length === 1 ? "it" : "them"}: add the row or column first, or say only what it shows.`);
      }
    }
  }
  // 4h. A grid is shaded row by row: "a whole column of ten" over it describes
  // squares that are not there (Oct 31, decimals: said twice, judged blind).
  const onBoardNow = [...state.board.filter((b) => b.status !== "failed"), ...compiled.objects];
  if (onBoardNow.some((b) => b.facts.some((f) => /shaded, row by row/.test(f))) && !onBoardNow.some((b) => b.kind === "table")) {
    const col = speech.find((x) => /\bcolumns?\b/i.test(x.text));
    if (col) add("advice", `the grid is shaded row by row from the top, but the speech says columns ("${col.text.slice(0, 70)}"): say rows.`);
  }
  // 4g. A ring goes on the point the sentence names (Oct 31: "the point is
  // three, five" with the ring on (2, 3)).
  for (const seg of speech) {
    const said = numbersOf(seg.text);
    if (said.length < 2) continue;
    for (const ref of seg.needs) {
      const hit = resolveRef(state, compiled.objects, ref);
      if (!hit || hit.obj.kind !== "plane" || !hit.part || !/^P\d+$/i.test(hit.part)) continue;
      const pts = [...hit.obj.facts.join(" ").replace(/[−–]/g, "-").matchAll(/\b(P\d+)\s*\((-?[\d.]+),\s*(-?[\d.]+)\)/g)].map((m) => ({ id: m[1], x: m[2], y: m[3] }));
      const pair = (x: string, y: string) => said.some((n, i) => n === x && said[i + 1] === y);
      const mine = pts.find((q) => q.id.toLowerCase() === hit.part!.toLowerCase());
      const other = pts.find((q) => q !== mine && pair(q.x, q.y));
      if (mine && !pair(mine.x, mine.y) && other) add("advice", `the mark on ${ref} is the point (${mine.x}, ${mine.y}), but the sentence names (${other.x}, ${other.y}), which is ${hit.obj.sid}.${other.id}: mark the point you name.`);
    }
  }

  // 4e. A question the board already answers is no question (Oct 31: "how many
  // sixths is one half?" beside a bar labelled "= 3/6"; "how many tens?" over
  // blocks labelled "4 tens").
  // Any question with a private answer: "how many tens and ones now?" may be
  // filed as open, and the blocks' labels still answer it (Oct 31, T11).
  if (plan.question?.expects && !plan.givesAnswer) {
    const onBoard = [...state.board.filter((b) => !compiled.objects.some((o) => o.sid === b.sid)), ...compiled.objects].filter((b) => b.status !== "failed");
    // Only what can be read on it: a figure's computed area or a graph's view range is not shown.
    // The options a question names are not its answer showing ("0.6 or 0.06?" beside a grid labelled 0.6).
    const known0 = new Set([...knownNumbers(state, false), ...numbersOf(plan.question.text)]);
    const shown = onBoard.find((b) => b.kind !== "heading" && (b.shown ?? []).some((f) => states(f, plan.question!.expects!, known0)));
    if (shown) add("question", `the board already shows the answer to "${plan.question.text}" (${shown.sid} reads: ${(shown.shown ?? []).join(", ").slice(0, 120)}); ask about something the board does not show, or have them explain what it shows.`);
  }

  // 4d. "Here it is, drawn fresh" over a board that did not change, and "line
  // five" on a board with no line numbers (Oct 31, reviewed blind).
  const changed = compiled.ops.some((o) => o.type === "draw" || o.type === "tool" || o.type === "illustrate" || (o.type === "edit" && JSON.stringify(o.spec) !== JSON.stringify(state.board.find((b) => b.sid === o.sid)?.spec)));
  // "Here is problem two, up on the board" with nothing new drawn (Oct 31, kids9).
  const claimsDrawing = /\b(?:(?:it'?s|it is|that'?s|that is|they'?re|they are) (?:now )?up on the board|(?:it'?s|it is) on the board now|here(?:'s| is) (?:problem|number|question|the (?:new|next|problem))\b[^.?!]*\b(?:up|on the board)\b|(?:i(?:'ve| have) )?(?:put|written|written it|put it) (?:it |that )?(?:up|on the board)\b|here it is|here's the new|i(?:'ve| have) (?:drawn|added|put)|i drew|drawn (?:it )?(?:fresh|again|now)|i'll draw|let me draw|i'm drawing|watch (?:as|while) i)\b/i;
  if (speech.some((x) => /\b(?:drawn (?:it )?(?:fresh|again)|here it is again|draw it again)\b/i.test(x.text))) add("speech", "never redraw what is already up: say it is already on the board and point at it.");
  if (!changed && speech.some((x) => claimsDrawing.test(x.text))) add("board", "the speech says you are drawing something, but nothing new is drawn this turn: say it is already on the board and point at it (a mark), or draw what is new.");
  // A curve crosses the axis where it passes through it (Oct 31: "touches" twice, despite the prompt).
  if (state.board.some((b) => b.kind === "plane") || compiled.objects.some((o) => o.kind === "plane")) {
    if (speech.some((x) => /\btouch(?:es|ing)?\b[^.?!]*\b(?:axis|zero)\b/i.test(x.text))) add("speech", 'say the curve "crosses" the axis where it passes through it; "touches" means it meets it without crossing.');
  }
  if (speech.some((x) => /\bline (?:one|two|three|four|five|six|seven|\d)\b/i.test(x.text))) add("speech", 'the board has no line numbers: name the line by what it says ("the line with negative six"), and mark it.');

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
      // Graph arrows and points count too ("right 1, down 2" up while asking what y does).
      const written = b.do === "work_step" ? b.result ?? "" : b.do === "work_line" ? b.text : b.do === "table" ? b.rows : b.do === "graph" ? [b.arrows ?? "", b.points ?? ""].join(" ") : "";
      if (written && !/\?/.test(written) && states(written, exp, known)) add("leak", `the board writes the answer to the question in the same turn (${written}). Write it with ? for them.`);
    }
    const q: QuestionRecord = { id: "probe", problemId: state.current, text: plan.question.text, kind: plan.question.kind, expects: exp, ...(plan.question.check ? { check: plan.question.check } : {}), status: "open", askedTurn: "probe" };
    const theirs = state.transcript.filter((t) => t.role === "student").map((t) => t.text);
    const lines = [state.goal.text, ...theirs];
    // A hedge between two values ("16 and 15?", "-25?? or 25") is not their
    // answer yet: asking which one is the right move (Oct 31).
    const hedge = /-?\d[\d./]*\s*\??\s*(?:or|and)\s+-?\d[\d./]*[^.!]*\?|\?\s*\??\s*or\s+-?\d/i;
    const clauses = lines.flatMap((l) => [l, ...l.split(/(?<=[.?!;])\s+|\s+(?:and then|then|so)\s+/i)]).filter((c) => /\d/.test(c) && c.length < 240 && !hedge.test(c));
    // The problem itself is not an answer to one of its steps ("3x + 7 = 22"
    // has the same solution as "3x = 15"), and a step is answered only by a
    // line that says its new value.
    const problemKey = currentMath(state).replace(/\s+/g, "").replace(/[.,;]+$/, "");
    const rhsValue = numbersOf(/=\s*([^=]+)$/.exec(exp)?.[1] ?? "").find(Boolean);
    const candidates = clauses.filter((c) => !(problemKey && c.replace(/\s+/g, "").includes(problemKey.split(" ")[0])) && (plan.question!.kind !== "step" || !rhsValue || numbersOf(c).includes(rhsValue)));
    // A factored form is answered only by a line with its brackets: the
    // problem itself is equal to it (Oct 31: "x^2 + 7x + 12" was taken as
    // having answered "the factored form").
    const needsBrackets = /\(/.test(exp);
    let hit = candidates.find((c) => (!needsBrackets || /\(/.test(c)) && checkResponse(q, c).verdict === "correct");
    // A single value they have already said on this problem (not one of the
    // problem's own numbers): asking for it again is asking what they said
    // (Oct 31 2026: "found 2 and 3", then "what is x when x − 3 = 0?").
    const single = /^\s*(?:[a-z]\s*=\s*)?(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*$/i.exec(exp)?.[1];
    if (!hit && single && plan.question.kind === "value") {
      // The problem's numbers, as they stated it too ("a is 2, b is -3, c is 1"
      // is the problem, not an answer to a later question; Oct 31).
      const statement = state.problems.find((x) => x.id === state.current)?.statement ?? "";
      const defined = [...statement.replace(/[−–]/g, "-").matchAll(/\b[a-z]\s*(?:is|=)\s*(-?\d+(?:\.\d+)?)/gi)].map((m) => m[1]);
      const own = new Set([...numbersOf(currentMath(state)), ...defined]);
      // From the opening line, only what they gave as an answer ("found 2 and 3"),
      // not the inputs the problem lists ("for x = 0, 1, 2", T13 on Oct 31).
      const theirLines = [...state.goal.text.split(/(?<=[.?!;])\s+/).filter((c) => /\b(?:got|get|found|find|is|are|equals?|think|answer)\b/i.test(c)), ...theirs.filter((l) => l.trim() !== state.goal.text.trim())];
      // "c is 1" defines a letter; it does not answer "what is b² − 4ac?" (Oct 31).
      const asValue = (l: string) => numbersOf(l.replace(/[−–]/g, "-").replace(/\b[a-z]\s*(?:is|=)\s*-?\d+(?:\.\d+)?/gi, " ")).includes(single);
      const found = theirLines.find((l) => !hedge.test(l) && asValue(l) && !own.has(single));
      if (found) hit = found;
    }
    // Asking for what they just said this line is a real re-ask and goes
    // back; a match in an older line is likely a check or a new use of it, and
    // the repair cost more than the defect (15 of 37 repairs in kids9), so it
    // is advice. Asking them to verify is never a re-ask.
    const latest = state.transcript.filter((t) => t.role === "student").at(-1)?.text ?? "";
    if (hit && !/again|check|remind|still|match|verify|confirm|sure|test/i.test(plan.question.text)) add([latest, state.goal.text].some((l) => l && (l.includes(hit) || hit.includes(l.trim()))) ? "reask" : "advice", `they already answered "${plan.question.text.slice(0, 80)}" (${exp}): "${hit.slice(0, 100)}". Use their answer instead of asking for it.`);
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
  if (plan.question && !askedEarly && !plan.close && plan.move !== "recap" && !speech.some((s) => s.text.includes("?"))) speech.push({ id: `s${speech.length + 1}`, text: cleanSpeech(plan.question.text), needs: [] });
  if (!speech.length) add("speech", "speech is empty");
  // A turn leaves them something to do: a question, or a task said as one
  // (Oct 31: "Eleven came out, and we want the number that went in." and
  // nothing else, twice in a row, to a stuck student).
  const lastLine = (speech.at(-1)?.text ?? "").split(/(?<=[.?!])\s+/).filter(Boolean).at(-1) ?? "";
  if (speech.length && !plan.close && plan.move !== "recap" && !speech.some((x) => x.text.includes("?")) && !GIVES_TASK.test(lastLine)) add("advice", "the turn ends with nothing for them to do: end on one question, or a short task (\"Try it on the board's next line.\").");
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
  // Advice never sends the plan back: a second planning call cost more than
  // these defects (Oct 31, kids8: repairs 29% → 49% of turns, turns with no
  // board change 17% → 32%, and blind judges preferred the run before them on
  // 6 of 9). The next turn's planner reads it instead.
  const advice = detail.filter((d) => d.kind === "advice").map((d) => d.text);
  const hard = detail.filter((d) => d.kind !== "advice");
  return { plan: { ...plan, speech }, issues: hard.map((d) => d.text), detail: hard, fixes, advice };
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
    // The checker and the model still disagree after a second try: the checker
    // may have read the line as an answer to a different question (Oct 31:
    // "f(2) is 5" was checked against the question about another row). Say
    // neither right nor wrong: cut the verdict sentences, keep the rest.
    if (d.kind === "verdict" && /INCORRECT|CORRECT/.test(d.text)) {
      const wrongOne = /INCORRECT, but the speech calls it right/.test(d.text) ? AFFIRMS : DENIES;
      speech = speech.map((seg) => ({ ...seg, text: (seg.text.match(/[^.?!]+[.?!]*\s*/g) ?? [seg.text]).filter((x) => !wrongOne.test(x)).join("").trim() })).filter((seg) => seg.text);
      continue;
    }
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
