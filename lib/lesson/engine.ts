// One tutoring turn, end to end on the server (Oct 31 2026, Plan B B4/B7/B8).
// A committed student line goes in; the lesson state, the speech segments and
// the board ops come out. In order:
//   1. commit the line and assess it in code (claims, the open question);
//   2. the app's own moves: a blank they answered right is filled in their
//      hand, a right final answer boxed;
//   3. the model plans the turn through the turn_plan tool;
//   4. the plan is compiled (exact drawings) and checked; a rejected plan goes
//      back once with its issues; a second failure gets an honest fallback;
//   5. the turn is recorded, waiting for the page's receipts.
// Exactly one engine owns checks, questions and lesson state for a session.

import { blankText, checkFinal, type InputAssessment } from "./assess";
import { compileBoard, fillBlank, type Compiled } from "./compile";
import { parseTurnPlan } from "./plan";
import { ENGINE_SYSTEM, turnContext } from "./prompt";
import { callPlanModel, ENGINE_MODELS, repairMessages, type PlanCall } from "./provider";
import { cleanIntake, commitInput, currentProblem, recordTurn } from "./state";
import { describeWork, renderWork, startWork } from "../board-work";
import { cleanSpeech, salvage, validatePlan, withholdOnBoard, type Issue, type Verdict } from "./validate";
import { earlySentence, scanPartial } from "./stream";
import { faithfulness } from "../engine-voice";
import type { BoardObject, BoardOp, LessonState, SpeechSegment, StudentInput, TurnPlan } from "./types";

export type TurnResult = {
  state: LessonState;
  turnId: string;
  speech: SpeechSegment[];
  ops: BoardOp[];
  log: { model?: string; ms: number; calls: number; issues: string[][]; fixes: string[]; fallback: boolean; assessment: InputAssessment; move?: string; firstTokenMs?: number; earlyMs?: number; usage?: Record<string, unknown> };
};

export type Planner = (system: string, messages: Array<{ role: "user" | "assistant"; content: unknown }>, onPartial?: (json: string) => void) => Promise<PlanCall>;

const defaultPlanner: Planner = (system, messages, onPartial) => callPlanModel(ENGINE_MODELS[0], system, messages, undefined, onPartial);

/** An honest turn when no plan passed: the checker's facts, nothing invented, one plain question. */
export function fallbackPlan(a: InputAssessment): TurnPlan {
  const say: string[] = [];
  const falseOnes = a.claims.filter((c) => c.verdict === "verified_false");
  if (a.signals.includes("stop")) return { move: "close", speech: [{ id: "s1", text: "Okay, let's stop here. Nice work today.", needs: [] }], board: [], question: null, givesAnswer: false, close: true };
  if (a.answer?.verdict === "correct" || a.final?.verdict === "correct") say.push("Your answer is right.");
  // A wrong verdict is never said by the fallback alone: the checker can misread a line.
  for (const c of falseOnes.slice(0, 2)) say.push(`One step to fix: ${c.correct?.replace(/\*/g, " times ").replace(/\//g, " divided by ")}.`);
  // Respond to their line, never a generic "what next" after a question of theirs.
  say.push(a.answer?.verdict === "incorrect" || a.final?.verdict === "incorrect" ? "Walk me through how you got it?" : a.signals.includes("question") ? "Good question. Tell me what you think so far, and we'll check it together?" : "Which part should we look at first?");
  return { move: "clarify", speech: [{ id: "s1", text: cleanSpeech(say.join(" ")), needs: [] }], board: [], question: null, givesAnswer: false, close: false };
}

/** The ops that open a problem on the board: its heading, and its working column when it is an equation. */
function openingOps(s: LessonState, prefix: string): Compiled & { adopt: string[] } {
  const p = currentProblem(s);
  if (!p || s.board.some((b) => b.problemId === p.id)) return { ops: [], objects: [], issues: [], notes: [], adopt: [] };
  // Drawn before any problem was chosen (they talked about #2 before it was
  // current): those pictures are about this one. They stay, and the page does
  // not turn; a heading would file them away mid-explanation (Oct 31, a number
  // line archived the turn its ring was due).
  const adopt = s.board.some((b) => b.kind === "heading") ? [] : s.board.filter((b) => b.problemId == null && b.status !== "failed").map((b) => b.sid);
  // The problem's math when it has one ("3x + 7 = 22"); else its first sentence, short.
  // A word problem's heading keeps its question too ("…$5 per hour. My budget is $23."), when two sentences fit.
  const sentences = p.statement.split(/(?<=[.?!])\s+/);
  const first = sentences.length > 1 && `${sentences[0]} ${sentences[1]}`.length <= 110 ? `${sentences[0]} ${sentences[1]}` : sentences[0];
  // Its math when it has any ("1/2 + 1/3", never the student's wrong "= 2/5" after it).
  const title = p.math ? p.math : first.length <= 110 ? first.replace(/[.]$/, "") : `${first.slice(0, 106).replace(/\s+\S*$/, "")}…`;
  const ops: BoardOp[] = adopt.length ? [] : [{ opId: `${prefix}.h`, type: "heading", title }];
  const objects: BoardObject[] = adopt.length ? [] : [{ sid: `heading:${p.id}`, kind: "heading", problemId: p.id, parts: [], facts: [title], status: "pending" }];
  // An equation to solve opens the working; a definition ("y = -2x + 3") does not.
  if (p.math && /[=<>]/.test(p.math) && /[a-z]/i.test(p.math) && !/^\s*[a-z]\s*=/i.test(p.math)) {
    const spec = startWork(p.math);
    const rendered = renderWork(spec);
    const sid = `work:${p.id}`;
    ops.push({ opId: `${prefix}.w`, type: "draw", sid, kind: "work", spec, rendered, label: "the working", reserveH: 320 });
    objects.push({ sid, kind: "work", problemId: p.id, spec, parts: [...new Set([...Object.keys(rendered.parts), ...Object.keys(rendered.aliases)])], facts: [describeWork(spec)], status: "pending" });
  }
  return { ops, objects, issues: [], notes: [], adopt };
}

export async function runTurn(prev: LessonState, input: StudentInput, opts: { planner?: Planner; turnId?: string; onEarly?: (text: string) => void } = {}): Promise<TurnResult> {
  const started = Date.now();
  const planner = opts.planner ?? defaultPlanner;
  const turnId = opts.turnId ?? `t${prev.turns + 1}`;
  // The intake's own framing ("I need help with:", "Please teach me in English.")
  // is not the student's words; the planner read it as a request for "plain English".
  if (input.source === "intake") input = { ...input, text: cleanIntake(input.text) || input.text };
  const { state, assessment } = commitInput(prev, input);

  // The app's own moves, before the model plans.
  const auto: BoardOp[] = [];
  const autoObjects: BoardObject[] = [];
  const notes: string[] = [];
  const open = openingOps(state, turnId);
  if (open.adopt.length) state.board = state.board.map((b) => (open.adopt.includes(b.sid) ? { ...b, problemId: state.current } : b));
  auto.push(...open.ops);
  autoObjects.push(...open.objects);
  const q = assessment.question;
  if (q?.fill && assessment.answer?.verdict === "correct") {
    // The blank's own line with its ? filled ("x = ?" with 5 is "x = 5"); a
    // line that leaves the letter alone is the problem's final answer, boxed.
    const blank = blankText(state, q.fill);
    const valueOnly = q.expects ? /^\s*(?:[a-z]\s*=\s*)?(.+?)\s*$/i.exec(q.expects)![1] : assessment.answer.text;
    const value = blank && /\?/.test(blank) ? (/=/.test(q.expects ?? "") && !/\?/.test(q.expects ?? "") && /[a-z]/i.test((q.expects ?? "").split("=")[0]) && (q.expects ?? "").split("=")[0].replace(/\s+/g, "") === blank.split("=")[0].replace(/\s+/g, "") ? q.expects! : blank.replace(/\?/, valueOnly)) : (q.expects ?? assessment.answer.text);
    const final = Boolean(q.final) || /^\s*[a-z]\s*=\s*-?[\d./]+\s*$/i.test(value);
    const filled = fillBlank(state, q.fill, value, turnId, final);
    auto.push(...filled.ops);
    autoObjects.push(...filled.objects);
    notes.push(...filled.notes.map((n) => `THE APP ALREADY: ${n} (in their hand)${final ? " and boxed it green: it is the final answer" : ""}.`));
  }
  const withAuto: LessonState = { ...state, board: [...state.board.filter((b) => !autoObjects.some((o) => o.sid === b.sid)), ...autoObjects] };

  const context = turnContext(withAuto, input, assessment, notes);
  const first = [{ role: "user" as const, content: context }];
  const issuesLog: string[][] = [];
  let calls = 0;
  let model: string | undefined;
  let chosen: { plan: TurnPlan; compiled: Compiled; base: LessonState; verdict?: Verdict } | null = null;
  let last: { plan: TurnPlan; compiled: Compiled; detail: Issue[]; base: LessonState } | null = null;
  // A plan that moves to another problem on the sheet is compiled and checked on that problem.
  const onProblem = (plan: TurnPlan): LessonState => (plan.problem && plan.problem !== withAuto.current && withAuto.problems.some((p) => p.id === plan.problem) ? { ...withAuto, current: plan.problem } : withAuto);
  let messages: Array<{ role: "user" | "assistant"; content: unknown }> = first;
  const fixes: string[] = [];
  // The first sentence, said while the rest is planned (lib/lesson/stream).
  let early: string | null = null;
  let earlyMs: number | undefined;
  let firstTokenMs: number | undefined;
  let usage: Record<string, unknown> | undefined;
  const onPartial = opts.onEarly
    ? (json: string) => {
        if (early) return;
        const text = earlySentence(withAuto, assessment, scanPartial(json));
        if (!text) return;
        early = text;
        earlyMs = Date.now() - started;
        opts.onEarly!(text);
      }
    : undefined;
  const earlyNote = () => (early ? [`Your first speech item was already said aloud: "${early}". Keep it as the first item, unchanged, and fix the rest.`] : []);
  for (let attempt = 0; attempt < 2 && !chosen; attempt++) {
    let call: PlanCall;
    try {
      call = await planner(ENGINE_SYSTEM, messages, attempt === 0 ? onPartial : undefined);
    } catch (err) {
      issuesLog.push([`model call failed: ${(err as Error).message.slice(0, 160)}`]);
      break;
    }
    calls++;
    model = call.model;
    if (attempt === 0) {
      firstTokenMs = call.firstMs;
      usage = call.usage;
    }
    const parsed = parseTurnPlan(call.input);
    if (!parsed.ok) {
      issuesLog.push(parsed.issues);
      messages = repairMessages(first, call, [...parsed.issues, ...earlyNote()]);
      continue;
    }
    const base = onProblem(parsed.plan);
    const held = withholdOnBoard(base, parsed.plan);
    const compiled = compileBoard(base, held.plan.board, turnId);
    const checked = validatePlan(base, assessment, held.plan, parsed.verdict, compiled);
    fixes.push(...held.fixes, ...checked.fixes);
    if (!checked.issues.length) {
      chosen = { plan: checked.plan, compiled, base, verdict: parsed.verdict };
      break;
    }
    last = { plan: checked.plan, compiled, detail: checked.detail, base };
    issuesLog.push(checked.issues);
    messages = repairMessages(first, call, [...checked.issues, ...earlyNote()]);
  }
  // The second try still had problems: keep what is right and cut the rest
  // (a sentence with false math, a leaked question), rather than say nothing.
  if (!chosen && last) {
    const kept = salvage(last.plan, last.detail);
    if (kept) {
      chosen = { plan: kept, compiled: last.compiled, base: last.base };
      fixes.push(`salvaged after ${calls} tries: ${last.detail.map((d) => d.kind).join(", ")}`);
    }
  }
  const fallback = !chosen;
  let plan = chosen?.plan ?? fallbackPlan(assessment);
  // What was said early leads the turn; the plan's own first item is that
  // sentence (it was told to keep it), so it is not said a second time.
  const saidEarly: string | null = early;
  if (saidEarly) {
    const head = plan.speech[0]?.text ?? "";
    const rest = chosen && head && faithfulness(saidEarly, head) >= 0.6 ? plan.speech.slice(1) : plan.speech;
    plan = { ...plan, speech: [{ id: "early", text: saidEarly, needs: [], early: true }, ...rest] };
  }
  const compiled = chosen?.compiled ?? { ops: [], objects: [], issues: [], notes: [] };
  const ops = [...auto, ...compiled.ops];
  const objects = [...autoObjects.filter((o) => !compiled.objects.some((c) => c.sid === o.sid)), ...compiled.objects];
  let next = recordTurn(chosen?.base ?? withAuto, turnId, plan, ops, objects, Date.now());
  // Their answer to the problem itself, called right with checked arithmetic:
  // the problem is solved, even when it came as an answer to a smaller
  // question (Oct 31: #3 settled in the lesson was "re-checked" at the end).
  const v = chosen?.verdict;
  const cur = next.problems.find((x) => x.id === next.current);
  if (v?.is === "correct" && cur && cur.status === "open" && checkFinal(cur, v.answer)?.verdict === "correct") next = { ...next, problems: next.problems.map((x) => (x.id === cur.id ? { ...x, status: "solved" as const } : x)) };
  return { state: next, turnId, speech: plan.speech, ops, log: { model, ms: Date.now() - started, calls, issues: issuesLog, fixes, fallback, assessment, move: plan.move, ...(firstTokenMs !== undefined ? { firstTokenMs } : {}), ...(earlyMs !== undefined ? { earlyMs } : {}), ...(usage ? { usage } : {}) } };
}
