// The lesson state and its transitions (Oct 31 2026, Plan B step B2). Pure:
// every function takes a state and returns the next one. The server keeps the
// newest state per session (lib/db/lesson-state.ts) and the page never edits
// it directly; it only sends committed student lines and board receipts.

import { spokenToDigits } from "../answer-check";
import { assessInput, verifySolution, type InputAssessment } from "./assess";
import type { BoardObject, BoardOp, BoardReceipt, Fact, LearnerEvidence, LessonState, ProblemRecord, QuestionRecord, StudentInput, TurnPlan } from "./types";

const TRANSCRIPT_MAX = 60;

/** The math in a line of text, when it has one: "x^2-5x+6=0", "3x + 7 = 22", "1/2+1/3". */
export function mathIn(text: string): string | null {
  const t = spokenToDigits(text).replace(/[−–]/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  // Pieces of math: words of two or more letters break them, single letters
  // (variables) stay (Oct 31: "3(x - 2) = 3x - 6" had been cut to "3(x - 2) = 3",
  // and "y = -2x + 3" to "y = -2").
  const pieces = t
    .split(/[?!;:,]|\.(?=\s|$)/)
    .flatMap((sentence) => sentence.split(/\b[a-z]{2,}\b/i))
    .map((x) => x.replace(/\s+/g, " ").trim().replace(/^[=+*/^)]+|[-=+*/^(]+$/g, "").trim())
    .filter((x) => /\d/.test(x) && /[-+*/^=<>≤≥]/.test(x.replace(/^-/, "")));
  const relation = (x: string) => /(?:=|<|>|≤|≥)/.test(x);
  // An equation with a letter: the problem itself ("3x + 7 = 22").
  const eqs = pieces.filter((x) => relation(x) && /[a-z]/i.test(x) && /^[\d\sa-z()+\-*/^.=<>≤≥]+$/i.test(x));
  if (eqs.length) return eqs.sort((a, b) => b.length - a.length)[0];
  // Arithmetic: "42 - 27", or the left side of a claim about it ("1/2 + 1/3 = 2/5" is their answer, not the problem).
  for (const x of pieces) {
    const left = relation(x) ? x.split(/=|<|>|≤|≥/)[0].trim() : x;
    if (/^-?\d+(?:\.\d+)?(?:\/\d+)?(?:\s*[-+*/]\s*-?\d+(?:\.\d+)?(?:\/\d+)?)+$/.test(left)) return left;
  }
  return null;
}

export function newProblem(id: string, statement: string, source: ProblemRecord["source"], givens: Fact[] = []): ProblemRecord {
  const math = mathIn(statement) ?? undefined;
  return { id, revision: 1, statement: statement.trim().slice(0, 400), ...(math ? { math } : {}), givens, source, status: "open" };
}

/** A lesson from the intake: their words are the goal, any math in them is the first problem. */
/** The intake's own framing (lib/session-intake) taken off: it is not the student's words. */
export function cleanIntake(text: string): string {
  return text
    .replace(/\s*Please teach me in [^.]{1,40}\.\s*$/i, "")
    .replace(/\s*I uploaded (?:a picture|\d+ pictures) of it\.\s*$/i, "")
    .replace(/^\s*I need help with:\s*/i, "")
    .trim();
}

export function createLesson(opts: { intake: string; grade?: string; problems?: ProblemRecord[]; current?: string | null }): LessonState {
  const intake = cleanIntake(opts.intake);
  // Math in the intake, or a word problem (numbers and a question): the first problem.
  const posed = mathIn(intake) || (/\d/.test(intake) && /\?|\b(?:find|how (?:many|much|long|far)|what is|solve|work out)\b/i.test(intake));
  const problems = opts.problems?.length ? opts.problems : posed ? [newProblem("P1", intake, { kind: "utterance", id: "u0" })] : [];
  return {
    v: 1,
    revision: 0,
    epoch: 0,
    ...(opts.grade ? { grade: opts.grade } : {}),
    goal: { text: intake.slice(0, 600) || "(not said yet)", source: { kind: "utterance", id: "u0" } },
    problems,
    current: opts.current !== undefined ? opts.current : (problems[0]?.id ?? null),
    questions: [],
    evidence: [],
    requests: [],
    board: [],
    transcript: [],
    pending: null,
    closing: false,
    turns: 0,
  };
}

export const currentProblem = (s: LessonState) => s.problems.find((p) => p.id === s.current) ?? null;

/** How much help this problem has had: the largest assistance any turn gave it. */
export function assistanceOn(s: LessonState, problemId: string | null): number {
  return s.board.some((b) => b.problemId === problemId && b.sid.startsWith("example")) ? 5 : 0;
}

/**
 * A committed student line: in the transcript with its id, assessed, its
 * answer recorded against the open question, its requests kept. The epoch
 * moves on, so work planned for an older line is stale.
 */
export function commitInput(s: LessonState, input: StudentInput): { state: LessonState; assessment: InputAssessment } {
  if (input.source === "intake") input = { ...input, text: cleanIntake(input.text) || input.text };
  const assessment = assessInput(s, input);
  const transcript = [...s.transcript, { id: input.id, role: "student" as const, text: input.text, at: input.at }].slice(-TRANSCRIPT_MAX);
  const q = assessment.question;
  const ev: LearnerEvidence = {
    id: `e${s.evidence.length + 1}`,
    inputId: input.id,
    problemId: s.current,
    ...(q && assessment.answer ? { questionId: q.id, answer: assessment.answer } : assessment.final ? { answer: { text: input.text, verdict: assessment.final.verdict, detail: `the whole problem: ${assessment.final.value} against ${assessment.final.against}` } } : {}),
    claims: assessment.claims,
    reasonGiven: assessment.reasonGiven,
    assistance: assistanceOn(s, s.current),
    at: input.at,
  };
  // A response settles the question unless it could not be judged and asks something back.
  const answered = q && assessment.answer && (assessment.answer.verdict !== "unknown" || !assessment.signals.includes("question"));
  const questions = s.questions.map((x) => (answered && x.id === q!.id ? { ...x, status: "answered" as const, answeredBy: input.id } : x));
  const requests = [...s.requests, ...assessment.signals.filter((k) => k === "show_me" || k === "slower" || k === "different_way" || k === "harder" || k === "already_answered").map((k, i) => ({ id: `r${s.requests.length + i + 1}`, inputId: input.id, kind: k, text: input.text.slice(0, 160), status: "open" as const }))];
  return {
    state: {
      ...s,
      epoch: s.epoch + 1,
      transcript,
      evidence: [...s.evidence, ev],
      questions,
      requests,
      // A right answer to the whole problem solves it.
      problems: assessment.final?.verdict === "correct" ? s.problems.map((p) => (p.id === s.current ? { ...p, status: "solved" as const } : p)) : s.problems,
      closing: s.closing || assessment.signals.includes("stop"),
    },
    assessment,
  };
}

/**
 * What the student has already said on this problem and need not be asked
 * again: their right answers, the true claims they made, and the values they
 * gave (Oct 26 2026: the tutor asked for the roots the student had opened with,
 * and for 23 − 9 again after they had answered it).
 */
export function alreadySaid(s: LessonState): string[] {
  const out: string[] = [];
  const studentLines = s.transcript.filter((t) => t.role === "student");
  for (const e of s.evidence) {
    if (e.problemId !== s.current) continue;
    if (e.answer && (e.answer.verdict === "correct" || e.answer.verdict === "partial")) out.push(`answered "${e.answer.text.slice(0, 80)}" (${e.answer.verdict})`);
    for (const c of e.claims) if (c.verdict === "verified_true") out.push(`said ${c.text}`);
  }
  // The intake is evidence too: what they said they did.
  const intake = s.goal.text;
  if (intake && intake !== "(not said yet)") out.push(`in their opening words: "${intake.slice(0, 200)}"`);
  for (const l of studentLines.slice(-6)) out.push(`said "${l.text.slice(0, 120)}"`);
  return [...new Set(out)].slice(-14);
}

/** The board as the lesson knows it, for the model: each object, its id, its parts and what it shows. */
export function boardForModel(s: LessonState): string {
  if (!s.board.length) return "empty";
  return s.board
    .filter((b) => b.status !== "failed")
    .map((b) => `${b.sid} (${b.kind}${b.problemId ? `, ${b.problemId}` : ""}${b.status === "pending" ? ", not drawn yet" : ""}): ${b.facts.join("; ") || "(no facts)"}${b.parts.length ? ` | parts: ${b.parts.slice(0, 24).join(", ")}` : ""}`)
    .join("\n");
}

/**
 * The planned turn, recorded: the question it asks (open, with its private
 * answer), the tutor's words in the transcript (as approved), and the pending
 * board ops until their receipts come back.
 */
export function recordTurn(s: LessonState, turnId: string, plan: TurnPlan, ops: BoardOp[], objects: BoardObject[], at: number): LessonState {
  const questions = s.questions.map((q) => (q.status === "open" ? { ...q, status: "superseded" as const } : q));
  if (plan.question && !plan.close) {
    const q: QuestionRecord = { id: `q${s.questions.length + 1}`, problemId: s.current, text: plan.question.text, kind: plan.question.kind, ...(plan.question.expects ? { expects: plan.question.expects } : {}), ...(plan.question.check ? { check: plan.question.check } : {}), ...(plan.question.fill ? { fill: plan.question.fill } : {}), ...(plan.question.final ? { final: true } : {}), status: "open", askedTurn: turnId };
    questions.push(q);
  }
  const said = plan.speech.map((x) => x.text).join(" ");
  const board = [...s.board.filter((b) => !objects.some((o) => o.sid === b.sid)), ...objects];
  // The problem's answer, once, and only when its arithmetic checks out.
  const problems = plan.solution && verifySolution(plan.solution) ? s.problems.map((p) => (p.id === s.current && !p.solution ? { ...p, solution: plan.solution! } : p)) : s.problems;
  return {
    ...s,
    problems,
    revision: s.revision + 1,
    turns: s.turns + 1,
    questions,
    board,
    transcript: [...s.transcript, { id: turnId, role: "tutor" as const, text: said, at }].slice(-TRANSCRIPT_MAX),
    pending: { turnId, epoch: s.epoch, ops, plan },
    closing: s.closing || plan.close,
    requests: s.requests.map((r) => (r.status === "open" ? { ...r, status: "resolved" as const } : r)),
  };
}

/**
 * Receipts for the pending turn: what was really drawn. An object whose op
 * failed is marked failed (never "on the board"); an applied one gets its
 * item id and the parts actually there.
 */
export function applyReceipts(s: LessonState, turnId: string, receipts: BoardReceipt[]): LessonState {
  if (!s.pending || s.pending.turnId !== turnId) return s;
  const byOp = new Map(receipts.map((r) => [r.opId, r]));
  const board = s.board.map((b) => {
    // The last op on this object is what it ended as (a draw, then edits of it).
    const op = b.kind === "heading" && b.status === "pending" ? s.pending!.ops.find((o) => o.type === "heading") : [...s.pending!.ops].reverse().find((o) => o.type !== "heading" && o.type !== "mark" && o.sid === b.sid);
    if (!op) return b;
    const r = byOp.get(op.opId);
    if (!r) return b;
    if (r.status === "applied" || r.status === "unchanged" || r.status === "partial") return { ...b, status: "applied" as const, ...(r.itemId ? { itemId: r.itemId } : {}), ...(r.parts ? { parts: r.parts } : {}) };
    return { ...b, status: (b.itemId ? "applied" : "failed") as BoardObject["status"] };
  });
  return { ...s, board, pending: null, revision: s.revision + 1 };
}
