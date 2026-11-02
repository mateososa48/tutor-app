// What one student line shows, decided by code before any model sees it
// (Oct 31 2026, Plan B steps B2/B3): what they are asking for, every claim in
// it checked on its own, and their answer to the open question checked
// against its private expected answer. The model plans from these facts; it
// does not get to decide them.

import { checkAnswer, checkStep, spokenToDigits } from "../answer-check";
import { assessClaims, evaluate, extractClaims, verifyClaim, type ClaimAssessment } from "../math-claims";
import { looksLikeAnswer } from "../tutor-policy";
import { mathIn, numbersOf } from "./math-in";
import type { AnswerVerdict, LessonState, QuestionRecord, Signal, StudentInput } from "./types";

const SIGNALS: Array<[Signal, RegExp]> = [
  ["stop", /\b(?:bye|goodbye|gotta go|got to go|have to go|i'?m done|i am done|stop (?:here|now|for today)|that'?s all|end (?:the )?session|see you|talk later|no more)\b/i],
  ["done_understood", /\b(?:(?:i )?(?:get|got|understand) it(?: now)?|(?:it )?makes sense now|that makes sense|(?:i )?understand now|thanks?,? i (?:get|understand)|thank you,? i (?:get|understand)|i understand)\b/i],
  ["show_me", /\b(?:show me|can you (?:show|draw|graph|put)|please (?:show|draw|graph)|draw (?:it|the|a)|show (?:the|it|a)|put (?:it|that|the) on the board|on the board|see it|picture)\b/i],
  ["slower", /\b(?:slow(?:ly| down| er)?|one (?:step|thing) at a time|too fast)\b/i],
  ["already_answered", /\b(?:i (?:already|just) (?:said|answered|told you|did|gave|got)|already answered|i said that|i told you)\b/i],
  ["no_idea", /\b(?:i (?:don'?t|dont|do not) (?:know|get|understand)|no (?:clue|idea)|i'?m (?:lost|confused|stuck)|teach me|how do (?:you|i) (?:do|solve)|idk)\b/i],
  ["frustrated", /\b(?:i'?m (?:bad|dumb|stupid|terrible) at|i feel (?:bad|dumb|stupid)|i hate|this is (?:hard|impossible)|ugh|i give up|frustrat)/i],
  ["different_way", /\b(?:(?:another|different|other) way|explain (?:it )?differently|instead|doesn'?t (?:help|make sense)|i don'?t (?:get|like) the (?:analogy|picture|example))\b/i],
  ["harder", /\b(?:harder|challenge|more difficult|a tougher one)\b/i],
  ["question", /\?\s*$|^(?:why|how|what|can|could|is|does|do|would)\b/i],
];

/** What the line asks for or says about how it is going. */
export function readSignals(text: string): Signal[] {
  // The intake's own last sentence names the language, not a request.
  const t = text.replace(/\s*Please teach me in [^.]{1,40}\.\s*$/i, "").trim();
  const found = SIGNALS.filter(([, re]) => re.test(t)).map(([s]) => s);
  // "i think i get it, can i try one on my own" wants a task, not a close (Oct 31).
  return /\b(?:try (?:one|another|it)|one more|another one|give me (?:one|another))\b/i.test(t) ? found.filter((s) => s !== "done_understood") : found;
}

/** A reason was given: "because", "since", "so", "cuz". Whether it holds is the claims' business. */
export const gaveReason = (text: string) => /\b(?:because|cause|'cause|cuz|coz|since|so that|which means)\b/i.test(text);

export type InputAssessment = {
  signals: Signal[];
  claims: ClaimAssessment[];
  question: QuestionRecord | null;
  answer: { text: string; verdict: AnswerVerdict; detail?: string } | null;
  reasonGiven: boolean;
  /** Values they have said in this line (numbers and short equations), for "already answered". */
  values: string[];
  /** Their answer to the whole problem ("I got 4 hours"), checked against its solution or its equation. */
  final: { value: string; verdict: AnswerVerdict; against: string } | null;
  /** Their answer fits another problem on the sheet: the lesson moves to it. */
  switchTo?: string;
};

/** A value checked as the answer to one problem: its solution, its equation, or its arithmetic. */
export function checkFinal(p: { math?: string; solution?: { answer: string; work: string } }, value: string): { value: string; verdict: AnswerVerdict; against: string } | null {
  const pick = (r: ReturnType<typeof checkAnswer>, against: string) => (r.verdict === "cannot_check" ? null : { value, verdict: (r.verdict === "partial" ? "partial" : r.verdict) as AnswerVerdict, against });
  if (p.solution) return pick(checkAnswer(p.solution.answer.replace(/[^\d./-]+/g, " ").trim().split(" ")[0] ?? p.solution.answer, value), `${p.solution.answer} (${p.solution.work})`);
  if (p.math && /=/.test(p.math) && /[a-z]/i.test(p.math)) return pick(checkAnswer(p.math, value), p.math);
  if (p.math && !/[a-z=<>]/i.test(p.math)) return pick(checkAnswer(p.math, value), p.math);
  return null;
}

const NUM = String.raw`-?\d+(?:\.\d+)?(?:\/\d+)?`;

/** The value they give as the problem's answer ("I got 4 hours", "the answer is 12", "x = 5"), or null. */
export function statedFinal(text: string, letters = ""): string | null {
  const t = spokenToDigits(text.replace(/[−–]/g, "-"));
  const said = t.split(/\s*[,;]?\s+(?:because|cause|'cause|cuz|coz|since|bc)\b/i)[0];
  const lead = new RegExp(String.raw`\b(?:i (?:got|get|put|wrote|picked|chose|said|think (?:it'?s|it is)?|found|came up with)|(?:so )?the answer (?:is|was)|my answer (?:is|was)|answer:|(?:so )?it'?s|(?:so )?it is|is it)\s+(?:about |exactly )?(${NUM})`, "i").exec(said);
  if (lead) return lead[1];
  if (letters) {
    const v = new RegExp(String.raw`\b[${letters}]\s*(?:=|is|equals)\s*(${NUM})\b`, "i").exec(said);
    if (v) return v[1];
  }
  return null;
}

/** A solution the planner gave, kept only when its arithmetic gives its answer. */
export function verifySolution(sol: { answer: string; work: string }): boolean {
  const ans = /-?\d+(?:\.\d+)?(?:\/\d+)?/.exec(spokenToDigits(sol.answer).replace(/,/g, ""))?.[0];
  if (!ans) return false;
  const want = evaluate(ans);
  const got = evaluate(sol.work.replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-"));
  return want !== null && got !== null && Math.abs(want - got) < 1e-9;
}

/** The newest open question of the current problem (or of none). */
export function openQuestion(state: LessonState): QuestionRecord | null {
  for (let i = state.questions.length - 1; i >= 0; i--) {
    const q = state.questions[i];
    if (q.status === "open") return q;
  }
  return null;
}

/** Their answer to a question, checked against what it expects. */
export function checkResponse(q: QuestionRecord, text: string, blank?: string): { verdict: AnswerVerdict; detail?: string } {
  if (q.kind === "explain" || q.kind === "open") return { verdict: "unknown" };
  const said = text.split(/\s*[,;]?\s+(?:because|cause|'cause|cuz|coz|since|bc)\b/i)[0];
  const expectsValue = q.expects ? /^\s*(?:[a-z]\s*=\s*)?(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*$/i.exec(q.expects.replace(/[−–]/g, "-"))?.[1] : undefined;
  const tries: Array<() => { verdict: AnswerVerdict; detail?: string } | null> = [
    () => {
      // An expression that equals the answer but is not worked out yet ("3/6
      // plus 2/6" for 5/6): partly there (Oct 31: called incorrect).
      if (!expectsValue) return null;
      const expr = mathIn(said);
      if (!expr || /[a-z=]/i.test(expr)) return null;
      const v = evaluate(expr);
      const want = evaluate(expectsValue);
      if (v === null || want === null || Math.abs(v - want) > 1e-9) return null;
      if (numbersOf(said).includes(expectsValue)) return null;
      return { verdict: "partial", detail: `${expr} equals the answer but is not worked out yet` };
    },
    () => {
      // A "3x = ?" line on the board: their answer is that line filled in,
      // whether they say the whole line ("3x = 15") or just its value ("15").
      if (!blank || !q.expects || !/\?/.test(blank)) return null;
      const full = blank.replace(/\?/, expectsValue ?? q.expects);
      if (/=/.test(said) && /[a-z]/i.test(said) && /=/.test(full)) {
        const step = checkStep(full, said);
        if (step && step.verdict !== "cannot_check") return { verdict: step.verdict === "partial" ? "correct" : step.verdict, detail: step.message };
      }
      return null;
    },
    () => {
      // A value asked for, answered with an equation ("what does 3x equal?" "3x = 15"): its right side.
      if (!expectsValue || !/=/.test(said)) return null;
      const right = /=\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*[.!?]*\s*$/.exec(spokenToDigits(said))?.[1];
      if (!right) return null;
      const r = checkAnswer(expectsValue, right);
      return r.verdict === "cannot_check" ? null : { verdict: r.verdict, detail: r.message };
    },
    () => {
      if (!q.check) return null;
      // A check written as a fact ("5*5+3 = 28") is the expression it computes.
      const check = /=\s*-?\d+(?:\.\d+)?\s*$/.test(q.check) && !/[a-z]/i.test(q.check) ? q.check.replace(/=.*$/, "") : q.check;
      const r = checkAnswer(check, said);
      return r.verdict === "cannot_check" ? null : { verdict: r.verdict, detail: r.message };
    },
    () => {
      if (!q.expects) return null;
      // A step: the same equation in another form counts ("3x = 15" for "15 = 3x").
      if (/=/.test(q.expects) && /[a-z]/i.test(q.expects)) {
        const step = checkStep(q.expects, said);
        if (step && step.verdict !== "cannot_check") return { verdict: step.verdict === "partial" ? "correct" : step.verdict, detail: step.message };
      }
      const r = checkAnswer(q.expects, said);
      return r.verdict === "cannot_check" ? null : { verdict: r.verdict, detail: r.message };
    },
    () => {
      // A choice or a word answer: the expected words in their line.
      if (!q.expects || /\d/.test(q.expects)) return null;
      const want = q.expects.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
      return want && said.toLowerCase().includes(want) ? { verdict: "correct" } : null;
    },
  ];
  for (const t of tries) {
    const r = t();
    if (!r) continue;
    // A line that also says the expected value on its own ("2 over 4 is... 1/2?
    // so its 1 and 1/2?", the two roots of a quadratic) is never called wrong
    // on another reading of it (Nov 1: "1 and 1/2" read as one and a half, and
    // the tutor was made to take back a right answer). The planner judges it.
    if (r.verdict === "incorrect" && expectsValue) {
      const want = evaluate(expectsValue);
      const alone = spokenToDigits(said).replace(/\b\d+\s+and\s+\d+\/\d+\b/g, " "); // not inside a mixed number
      if (want !== null && numbersOf(alone).some((n) => Math.abs((evaluate(n) ?? NaN) - want) < 1e-9)) return { verdict: "unknown", detail: "their line also says the expected value; read the whole line" };
    }
    return r;
  }
  return { verdict: "unknown" };
}

const VALUE = /-?\d+(?:\.\d+)?(?:\/\d+)?|\b[a-z]\s*=\s*-?\d+(?:\.\d+)?(?:\/\d+)?/gi;

/** The text of a board blank ("work.L2" → "3x = ?"), when the lesson knows it. */
export function blankText(state: LessonState, fill: string | undefined): string | undefined {
  if (!fill) return undefined;
  const [head, part] = fill.split(".");
  const sid = head === "work" ? `work:${state.current ?? "none"}` : head;
  const obj = state.board.find((b) => b.sid === sid);
  const spec = obj?.spec as { kind?: string; lines?: Array<{ id: string; text: string }> } | undefined;
  return spec?.kind === "work" ? spec.lines?.find((l) => l.id === part)?.text : undefined;
}

/** Assess one committed student line against the lesson as it stands. */
export function assessInput(state: LessonState, input: StudentInput): InputAssessment {
  const signals = readSignals(input.text);
  const claims = assessClaims(input.text);
  const q = openQuestion(state);
  const digits = spokenToDigits(input.text);
  const answerLike = looksLikeAnswer(input.text) || /\d/.test(digits);
  const answer = q && answerLike && !signals.includes("stop") ? { text: input.text, ...checkResponse(q, input.text, blankText(state, q.fill)) } : null;
  // Their answer to the whole problem, when this line is not an answer to the open question.
  let final: InputAssessment["final"] = null;
  let switchTo: string | undefined;
  const p = state.problems.find((x) => x.id === state.current);
  if (!answer || answer.verdict === "unknown") {
    const letters = [...new Set(state.problems.flatMap((x) => (x.math && /=/.test(x.math) ? x.math.match(/[a-z]/gi) ?? [] : [])))].join("");
    const value = statedFinal(input.text, letters);
    if (value !== null) {
      final = p ? checkFinal(p, value) : null;
      // Right for another problem on the sheet, not this one: that is the one
      // they are on (Oct 31: -11 for "-7 - 4" was marked wrong against question 3).
      if (!final || final.verdict !== "correct") {
        for (const other of state.problems) {
          if (other.id === p?.id || other.status === "solved") continue;
          const r = checkFinal(other, value);
          if (r?.verdict === "correct") {
            final = r;
            switchTo = other.id;
            break;
          }
        }
      }
    }
  }
  return {
    ...(switchTo ? { switchTo } : {}),
    final,
    signals,
    claims,
    question: q,
    answer,
    reasonGiven: gaveReason(input.text),
    values: [...new Set((digits.match(VALUE) ?? []).map((v) => v.replace(/\s+/g, "")))],
  };
}

/**
 * The claims a verdict rests on, checked: the model may call an answer right
 * or wrong only with arithmetic the code can verify ("5*4+3 = 23", "28 > 23").
 * Returns the claims that failed or could not be read.
 */
export function checkSupport(because: string[]): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  for (const b of because) {
    const found = extractClaims(b);
    if (found.length === 0) {
      // "4 <= 4.6" style written tight, or a bare inequality the reader missed.
      const m = /^\s*(.+?)\s*(<=|>=|<|>|=|≤|≥)\s*(.+?)\s*$/.exec(b.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-"));
      const a = m ? evaluate(m[1]) : null;
      const c = m ? evaluate(m[3]) : null;
      if (!m || a === null || c === null) {
        failed.push(`${b} (not arithmetic I can check)`);
        continue;
      }
      const rel = m[2].replace("≤", "<=").replace("≥", ">=") as "<" | ">" | "<=" | ">=" | "=";
      const v = verifyClaim({ text: b, span: [0, b.length], lhs: m[1], rhs: m[3], rel, attributed: false });
      if (v.verdict !== "verified_true") failed.push(`${b}${v.correct ? ` (actually ${v.correct})` : ""}`);
      continue;
    }
    for (const c of found.map(verifyClaim)) if (c.verdict !== "verified_true") failed.push(`${c.text}${c.correct ? ` (actually ${c.correct})` : ""}`);
  }
  return { ok: failed.length === 0, failed };
}
