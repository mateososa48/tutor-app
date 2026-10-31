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

import { blankText, type InputAssessment } from "./assess";
import { compileBoard, fillBlank, type Compiled } from "./compile";
import { parseTurnPlan } from "./plan";
import { ENGINE_SYSTEM, turnContext } from "./prompt";
import { callPlanModel, ENGINE_MODELS, repairMessages, type PlanCall } from "./provider";
import { commitInput, currentProblem, recordTurn } from "./state";
import { describeWork, renderWork, startWork } from "../board-work";
import { cleanSpeech, salvage, validatePlan, type Issue } from "./validate";
import type { BoardObject, BoardOp, LessonState, SpeechSegment, StudentInput, TurnPlan } from "./types";

export type TurnResult = {
  state: LessonState;
  turnId: string;
  speech: SpeechSegment[];
  ops: BoardOp[];
  log: { model?: string; ms: number; calls: number; issues: string[][]; fixes: string[]; fallback: boolean; assessment: InputAssessment; move?: string };
};

type Planner = (system: string, messages: Array<{ role: "user" | "assistant"; content: unknown }>) => Promise<PlanCall>;

const defaultPlanner: Planner = (system, messages) => callPlanModel(ENGINE_MODELS[0], system, messages);

/** An honest turn when no plan passed: the checker's facts, nothing invented, one plain question. */
export function fallbackPlan(a: InputAssessment): TurnPlan {
  const say: string[] = [];
  const falseOnes = a.claims.filter((c) => c.verdict === "verified_false");
  if (a.signals.includes("stop")) return { move: "close", speech: [{ id: "s1", text: "Okay, let's stop here. Nice work today.", needs: [] }], board: [], question: null, givesAnswer: false, close: true };
  if (a.answer?.verdict === "correct") say.push("Your answer is right.");
  else if (a.answer?.verdict === "incorrect") say.push("That one doesn't work yet.");
  for (const c of falseOnes.slice(0, 2)) say.push(`One step to fix: ${c.correct?.replace(/\*/g, " times ").replace(/\//g, " divided by ")}.`);
  say.push(a.answer?.verdict === "incorrect" ? "Walk me through how you got it?" : "What would you like to look at next?");
  return { move: "clarify", speech: [{ id: "s1", text: cleanSpeech(say.join(" ")), needs: [] }], board: [], question: null, givesAnswer: false, close: false };
}

/** The ops that open a problem on the board: its heading, and its working column when it is an equation. */
function openingOps(s: LessonState, prefix: string): Compiled {
  const p = currentProblem(s);
  if (!p || s.board.some((b) => b.problemId === p.id)) return { ops: [], objects: [], issues: [], notes: [] };
  // The problem's math when it has one ("3x + 7 = 22"); else its first sentence, short.
  const first = p.statement.split(/(?<=[.?!])\s+/)[0];
  const title = p.math && /[=<>]/.test(p.math) ? p.math : first.length <= 56 ? first.replace(/[.]$/, "") : `${first.slice(0, 52).replace(/\s+\S*$/, "")}…`;
  const ops: BoardOp[] = [{ opId: `${prefix}.h`, type: "heading", title }];
  const objects: BoardObject[] = [{ sid: `heading:${p.id}`, kind: "heading", problemId: p.id, parts: [], facts: [title], status: "pending" }];
  if (p.math && /[=<>]/.test(p.math) && /[a-z]/i.test(p.math)) {
    const spec = startWork(p.math);
    const rendered = renderWork(spec);
    const sid = `work:${p.id}`;
    ops.push({ opId: `${prefix}.w`, type: "draw", sid, kind: "work", spec, rendered, label: "the working", reserveH: 200 });
    objects.push({ sid, kind: "work", problemId: p.id, spec, parts: [...new Set([...Object.keys(rendered.parts), ...Object.keys(rendered.aliases)])], facts: [describeWork(spec)], status: "pending" });
  }
  return { ops, objects, issues: [], notes: [] };
}

export async function runTurn(prev: LessonState, input: StudentInput, opts: { planner?: Planner; turnId?: string } = {}): Promise<TurnResult> {
  const started = Date.now();
  const planner = opts.planner ?? defaultPlanner;
  const turnId = opts.turnId ?? `t${prev.turns + 1}`;
  const { state, assessment } = commitInput(prev, input);

  // The app's own moves, before the model plans.
  const auto: BoardOp[] = [];
  const autoObjects: BoardObject[] = [];
  const notes: string[] = [];
  const open = openingOps(state, turnId);
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
  let chosen: { plan: TurnPlan; compiled: Compiled } | null = null;
  let last: { plan: TurnPlan; compiled: Compiled; detail: Issue[] } | null = null;
  let messages: Array<{ role: "user" | "assistant"; content: unknown }> = first;
  const fixes: string[] = [];
  for (let attempt = 0; attempt < 2 && !chosen; attempt++) {
    let call: PlanCall;
    try {
      call = await planner(ENGINE_SYSTEM, messages);
    } catch (err) {
      issuesLog.push([`model call failed: ${(err as Error).message.slice(0, 160)}`]);
      break;
    }
    calls++;
    model = call.model;
    const parsed = parseTurnPlan(call.input);
    if (!parsed.ok) {
      issuesLog.push(parsed.issues);
      messages = repairMessages(first, call, parsed.issues);
      continue;
    }
    const compiled = compileBoard(withAuto, parsed.plan.board, turnId);
    const checked = validatePlan(withAuto, assessment, parsed.plan, parsed.verdict, compiled);
    fixes.push(...checked.fixes);
    if (!checked.issues.length) {
      chosen = { plan: checked.plan, compiled };
      break;
    }
    last = { plan: checked.plan, compiled, detail: checked.detail };
    issuesLog.push(checked.issues);
    messages = repairMessages(first, call, checked.issues);
  }
  // The second try still had problems: keep what is right and cut the rest
  // (a sentence with false math, a leaked question), rather than say nothing.
  if (!chosen && last) {
    const kept = salvage(last.plan, last.detail);
    if (kept) {
      chosen = { plan: kept, compiled: last.compiled };
      fixes.push(`salvaged after ${calls} tries: ${last.detail.map((d) => d.kind).join(", ")}`);
    }
  }
  const fallback = !chosen;
  const plan = chosen?.plan ?? fallbackPlan(assessment);
  const compiled = chosen?.compiled ?? { ops: [], objects: [], issues: [], notes: [] };
  const ops = [...auto, ...compiled.ops];
  const objects = [...autoObjects.filter((o) => !compiled.objects.some((c) => c.sid === o.sid)), ...compiled.objects];
  const next = recordTurn(withAuto, turnId, plan, ops, objects, Date.now());
  return { state: next, turnId, speech: plan.speech, ops, log: { model, ms: Date.now() - started, calls, issues: issuesLog, fixes, fallback, assessment, move: plan.move } };
}
