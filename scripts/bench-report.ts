// The run report for the tutor benchmark (scripts/bench.ts): one table over
// the cases, the totals a comparison can read, and the judge's words.
import { SCORE_KEYS, type Scores } from "./bench-judge";
import type { CaseRun } from "./bench-metrics";

export type RunInput = {
  label: string;
  promptName: string;
  liveModel: string;
  studentModel: string;
  judgeModel: string;
  date: string;
  runs: CaseRun[];
  modelUsage: { calls: number; prompt: number; output: number };
};

export type Totals = {
  cases: number;
  turns: number;
  outcomesMet: number;
  outcomesJudged: number;
  openingAsked: number;
  askedWhatTheyKnow: number;
  planSet: number;
  boardTurns: number;
  pictureTurns: number;
  markTurns: number;
  textOnlyTurns: number;
  phantomClaims: number;
  answerLines: number;
  checkedTurns: number;
  attemptsWritten: number;
  multiQuestionTurns: number;
  praiseTurns: number;
  permissionQuestions: number;
  wordsPerTurn: number;
  firstAudioMedianMs: number | null;
  firstAudioMaxMs: number | null;
  silentTurns: number;
  nudgedTurns: number;
  timedOutTurns: number;
  toolCalls: number;
  toolErrors: number;
  toolsBeforeSpeech: number;
  promptTokensSum: number;
  promptTokensMax: number | null;
  wallMs: number;
  judge: {
    turns: number;
    telling: number;
    focus: number;
    errTurns: number;
    caught: number;
    confirmedWrong: number;
    leaked: number;
    targetedN: number;
    targeted: number;
    action: number;
    praise: number;
    fit: number;
    boardFitN: number;
    boardFit: number;
    checks: number;
    checksMet: number;
    scores: Record<keyof Scores, number | null>;
  };
};

export type Summary = Omit<RunInput, "runs"> & { totals: Totals; cases: Array<{ id: string; name: string; grade: string; metrics: CaseRun["metrics"]; judgement: CaseRun["judgement"]; wallMs: number; closed: string | null; pageErrors: number }> };

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

export function totals(runs: CaseRun[]): Totals {
  const ms = runs.map((r) => r.metrics);
  const sum = (f: (m: CaseRun["metrics"]) => number) => ms.reduce((s, m) => s + f(m), 0);
  const verdicts = runs.flatMap((r) => r.judgement?.turns ?? []);
  const judged = runs.filter((r) => r.judgement);
  const scores = Object.fromEntries(SCORE_KEYS.map((k) => {
    const xs = judged.map((r) => r.judgement!.scores[k]).filter((x) => typeof x === "number");
    return [k, xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null];
  })) as Record<keyof Scores, number | null>;
  const words = runs.reduce((s, r) => s + r.turns.reduce((a, t) => a + (t.tutor ? t.tutor.split(/\s+/).length : 0), 0), 0);
  const turns = sum((m) => m.turns);
  return {
    cases: runs.length,
    turns,
    outcomesMet: judged.filter((r) => r.judgement!.outcome_met).length,
    outcomesJudged: judged.length,
    openingAsked: ms.filter((m) => m.openingAsked).length,
    askedWhatTheyKnow: ms.filter((m) => m.askedWhatTheyKnow).length,
    planSet: ms.filter((m) => m.planTurn != null).length,
    boardTurns: sum((m) => m.boardTurns),
    pictureTurns: sum((m) => m.pictureTurns),
    markTurns: sum((m) => m.markTurns),
    textOnlyTurns: sum((m) => m.textOnlyTurns),
    phantomClaims: sum((m) => m.phantomClaims),
    answerLines: sum((m) => m.answerLines),
    checkedTurns: sum((m) => m.checkedTurns),
    attemptsWritten: sum((m) => m.studentAttemptsWritten),
    multiQuestionTurns: sum((m) => m.multiQuestionTurns),
    praiseTurns: sum((m) => m.praiseTurns),
    permissionQuestions: sum((m) => m.permissionQuestions),
    wordsPerTurn: turns ? Math.round(words / turns) : 0,
    firstAudioMedianMs: median(runs.flatMap((r) => r.turns.map((t) => t.firstAudioMs).filter((x): x is number => x != null))),
    firstAudioMaxMs: ms.reduce<number | null>((a, m) => (m.firstAudioMaxMs == null ? a : Math.max(a ?? 0, m.firstAudioMaxMs)), null),
    silentTurns: sum((m) => m.silentTurns),
    nudgedTurns: sum((m) => m.nudgedTurns),
    timedOutTurns: sum((m) => m.timedOutTurns),
    toolCalls: sum((m) => m.toolCalls),
    toolErrors: sum((m) => m.toolErrors),
    toolsBeforeSpeech: sum((m) => m.toolsBeforeSpeech),
    promptTokensSum: sum((m) => m.promptTokensSum),
    promptTokensMax: ms.reduce<number | null>((a, m) => (m.promptTokensMax == null ? a : Math.max(a ?? 0, m.promptTokensMax)), null),
    wallMs: runs.reduce((s, r) => s + r.wallMs, 0),
    judge: {
      turns: verdicts.length,
      telling: verdicts.filter((v) => v.move === "telling").length,
      focus: verdicts.filter((v) => v.move === "focus").length,
      errTurns: verdicts.filter((v) => v.mistake_identified !== "na").length,
      caught: verdicts.filter((v) => v.mistake_identified === "yes").length,
      confirmedWrong: verdicts.filter((v) => v.confirmed_wrong).length,
      leaked: verdicts.filter((v) => v.answer_leaked).length,
      targetedN: verdicts.filter((v) => v.targeted !== "na").length,
      targeted: verdicts.filter((v) => v.targeted === "yes").length,
      action: verdicts.filter((v) => v.ends_with_student_action).length,
      praise: verdicts.filter((v) => v.generic_praise).length,
      fit: verdicts.filter((v) => v.help_fit === "yes").length,
      boardFitN: verdicts.filter((v) => v.board_fit !== "na").length,
      boardFit: verdicts.filter((v) => v.board_fit === "yes").length,
      checks: judged.reduce((s, r) => s + r.judgement!.checks.length, 0),
      checksMet: judged.reduce((s, r) => s + r.judgement!.checks.filter((c) => c.met).length, 0),
      scores,
    },
  };
}

export const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const ms = (x: number | null) => (x == null ? "–" : `${(x / 1000).toFixed(1)}s`);

export function buildReport(input: RunInput): { report: string; summary: Summary } {
  const t = totals(input.runs);
  const L: string[] = [];
  L.push(`# Tutor benchmark: ${input.label}`, "", `${input.date.slice(0, 16).replace("T", " ")} · tutor \`${input.liveModel}\` · prompt \`${input.promptName}\` · student \`${input.studentModel}\` · judge \`${input.judgeModel}\``, "");
  L.push("## Cases", "", "| case | outcome | opened | asked know | plan | board | pictures | marks | checked | phantom | praise | words | 1st audio | silent | tool err | judge scores |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of input.runs) {
    const m = r.metrics;
    const j = r.judgement;
    L.push(`| ${r.name} (${r.id}) | ${j ? (j.outcome_met ? "met" : "missed") : "?"} | ${m.openingAsked ? "✓" : "✗"} | ${m.askedWhatTheyKnow ? "✓" : "✗"} | ${m.planTurn ?? "–"} | ${m.boardTurns}/${m.turns} | ${m.pictureTurns} | ${m.markTurns} | ${m.checkedTurns}/${m.answerLines} | ${m.phantomClaims} | ${m.praiseTurns} | ${m.wordsPerTurn} | ${ms(m.firstAudioMedianMs)} | ${m.silentTurns}${m.timedOutTurns ? `+${m.timedOutTurns}⏱` : ""} | ${m.toolErrors} | ${j ? SCORE_KEYS.map((k) => j.scores[k]).join(" ") : "–"} |`);
  }
  L.push("", "Judge scores, 1–5, in order: diagnosis · remediation · pacing · voice · board object · board steps · board clean · board matches speech.", "");
  L.push("## Totals", "");
  const J = t.judge;
  L.push("| measure | value |", "|---|---|",
    `| outcomes met | ${t.outcomesMet}/${t.outcomesJudged} |`,
    `| opened by asking (no teaching in turn 1) | ${t.openingAsked}/${t.cases} |`,
    `| asked what they know / where it breaks | ${t.askedWhatTheyKnow}/${t.cases} |`,
    `| plan on the board | ${t.planSet}/${t.cases} |`,
    `| board turns | ${pct(t.boardTurns, t.turns)} (${t.boardTurns}/${t.turns}) |`,
    `| picture turns | ${pct(t.pictureTurns, t.turns)} |`,
    `| mark turns (point, ring, highlight, cross out) | ${pct(t.markTurns, t.turns)} |`,
    `| text-only board turns | ${t.textOnlyTurns} |`,
    `| phantom board claims | ${t.phantomClaims} |`,
    `| answers checked (check_answer on an answer line) | ${t.checkedTurns}/${t.answerLines} |`,
    `| student attempts written | ${t.attemptsWritten} |`,
    `| turns with 2+ questions | ${t.multiQuestionTurns} |`,
    `| praise openers | ${t.praiseTurns} |`,
    `| permission questions ("make sense?") | ${t.permissionQuestions} |`,
    `| words per turn | ${t.wordsPerTurn} |`,
    `| first audio, median / worst | ${ms(t.firstAudioMedianMs)} / ${ms(t.firstAudioMaxMs)} |`,
    `| silent turns / nudged / timed out | ${t.silentTurns} / ${t.nudgedTurns} / ${t.timedOutTurns} |`,
    `| tool calls / errors / before speech | ${t.toolCalls} / ${t.toolErrors} / ${t.toolsBeforeSpeech} |`,
    `| prompt tokens, total / largest turn | ${t.promptTokensSum.toLocaleString()} / ${t.promptTokensMax?.toLocaleString() ?? "–"} |`,
    `| session time | ${Math.round(t.wallMs / 1000)}s |`,
  );
  if (J.turns) {
    L.push(
      `| judge: telling moves | ${pct(J.telling, J.turns)} |`,
      `| judge: focus moves | ${pct(J.focus, J.turns)} |`,
      `| judge: mistakes caught | ${J.caught}/${J.errTurns} |`,
      `| judge: wrong answers confirmed | ${J.confirmedWrong} |`,
      `| judge: answer leaked | ${J.leaked} |`,
      `| judge: remediation aimed at the cause | ${J.targeted}/${J.targetedN} |`,
      `| judge: ends with something to do | ${pct(J.action, J.turns)} |`,
      `| judge: help level fit | ${pct(J.fit, J.turns)} |`,
      `| judge: board move fit the moment | ${J.boardFit}/${J.boardFitN} |`,
      `| judge: case checks met | ${J.checksMet}/${J.checks} |`,
      `| judge: mean scores | ${SCORE_KEYS.map((k) => `${k} ${J.scores[k] ?? "–"}`).join(" · ")} |`,
    );
  }
  L.push("", `Model calls (student and judge): ${input.modelUsage.calls}, ${input.modelUsage.prompt.toLocaleString()} tokens in, ${input.modelUsage.output.toLocaleString()} out.`, "");
  L.push("## What the judge said", "");
  for (const r of input.runs) {
    const j = r.judgement;
    if (!j) { L.push(`### ${r.name} (${r.id}): not judged`, ""); continue; }
    L.push(`### ${r.name} (${r.id}): outcome ${j.outcome_met ? "met" : "missed"}`, "", j.outcome_reason, "", `- Best: ${j.best}`, `- Worst: ${j.worst}`, `- An expert would have: ${j.human_tutor_would}`);
    for (const c of j.checks) L.push(`- ${c.met ? "✓" : "✗"} ${c.check} ${c.note ? `(${c.note})` : ""}`);
    if (!j.student_realistic) L.push(`- ⚠ student not realistic: ${j.student_note}`);
    L.push("");
  }
  const failed = input.runs.filter((r) => r.closed && !/^1000/.test(r.closed));
  if (failed.length) L.push("## Sessions that closed early", "", ...failed.map((r) => `- ${r.id}: ${r.closed}`), "");
  const errs = input.runs.flatMap((r) => r.metrics.toolErrorNames.map((e) => `- ${r.id}: ${e}`));
  if (errs.length) L.push("## Tool errors", "", ...errs, "");
  const summary: Summary = {
    label: input.label,
    promptName: input.promptName,
    liveModel: input.liveModel,
    studentModel: input.studentModel,
    judgeModel: input.judgeModel,
    date: input.date,
    modelUsage: input.modelUsage,
    totals: t,
    cases: input.runs.map((r) => ({ id: r.id, name: r.name, grade: r.grade, metrics: r.metrics, judgement: r.judgement, wallMs: r.wallMs, closed: r.closed, pageErrors: r.pageErrors.length })),
  };
  return { report: L.join("\n"), summary };
}
