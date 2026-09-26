// Two or more benchmark runs side by side (scripts/bench.ts writes them).
//
//   npx tsx scripts/bench-compare.ts old new [more…]   → bench/runs/compare-old-vs-new.md
//
// Labels are folders under bench/runs/ (or paths to summary.json files).
import fs from "node:fs";
import path from "node:path";
import { SCORE_KEYS } from "./bench-judge";
import { pct, type Summary } from "./bench-report";

function load(label: string): Summary {
  const file = label.endsWith(".json") ? label : path.join("bench", "runs", label, "summary.json");
  if (!fs.existsSync(file)) throw new Error(`No summary at ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as Summary;
}

const ms = (x: number | null) => (x == null ? "–" : `${(x / 1000).toFixed(1)}s`);

type Row = { name: string; cell: (s: Summary) => string; num?: (s: Summary) => number | null; up?: "good" | "bad" };

const ROWS: Row[] = [
  { name: "outcomes met", cell: (s) => `${s.totals.outcomesMet}/${s.totals.outcomesJudged}`, num: (s) => s.totals.outcomesMet, up: "good" },
  { name: "opened by asking", cell: (s) => `${s.totals.openingAsked}/${s.totals.cases}`, num: (s) => s.totals.openingAsked, up: "good" },
  { name: "asked what they know", cell: (s) => `${s.totals.askedWhatTheyKnow}/${s.totals.cases}`, num: (s) => s.totals.askedWhatTheyKnow, up: "good" },
  { name: "plan on the board", cell: (s) => `${s.totals.planSet}/${s.totals.cases}`, num: (s) => s.totals.planSet, up: "good" },
  { name: "board turns", cell: (s) => pct(s.totals.boardTurns, s.totals.turns), num: (s) => Math.round((100 * s.totals.boardTurns) / Math.max(1, s.totals.turns)), up: "good" },
  { name: "picture turns", cell: (s) => pct(s.totals.pictureTurns, s.totals.turns), num: (s) => Math.round((100 * s.totals.pictureTurns) / Math.max(1, s.totals.turns)), up: "good" },
  { name: "mark turns", cell: (s) => pct(s.totals.markTurns, s.totals.turns), num: (s) => Math.round((100 * s.totals.markTurns) / Math.max(1, s.totals.turns)), up: "good" },
  { name: "text-only board turns", cell: (s) => String(s.totals.textOnlyTurns), num: (s) => s.totals.textOnlyTurns, up: "bad" },
  { name: "phantom board claims", cell: (s) => String(s.totals.phantomClaims), num: (s) => s.totals.phantomClaims, up: "bad" },
  { name: "answers checked", cell: (s) => `${s.totals.checkedTurns}/${s.totals.answerLines}`, num: (s) => Math.round((100 * s.totals.checkedTurns) / Math.max(1, s.totals.answerLines)), up: "good" },
  { name: "student attempts written", cell: (s) => String(s.totals.attemptsWritten), num: (s) => s.totals.attemptsWritten, up: "good" },
  { name: "turns with 2+ questions", cell: (s) => String(s.totals.multiQuestionTurns), num: (s) => s.totals.multiQuestionTurns, up: "bad" },
  { name: "praise openers", cell: (s) => String(s.totals.praiseTurns), num: (s) => s.totals.praiseTurns, up: "bad" },
  { name: "permission questions", cell: (s) => String(s.totals.permissionQuestions), num: (s) => s.totals.permissionQuestions, up: "bad" },
  { name: "words per turn", cell: (s) => String(s.totals.wordsPerTurn), num: (s) => s.totals.wordsPerTurn },
  { name: "first audio, median", cell: (s) => ms(s.totals.firstAudioMedianMs), num: (s) => s.totals.firstAudioMedianMs, up: "bad" },
  { name: "first audio, worst", cell: (s) => ms(s.totals.firstAudioMaxMs), num: (s) => s.totals.firstAudioMaxMs, up: "bad" },
  { name: "silent / nudged / timed out", cell: (s) => `${s.totals.silentTurns} / ${s.totals.nudgedTurns} / ${s.totals.timedOutTurns}`, num: (s) => s.totals.silentTurns + s.totals.timedOutTurns, up: "bad" },
  { name: "tool calls / errors", cell: (s) => `${s.totals.toolCalls} / ${s.totals.toolErrors}`, num: (s) => s.totals.toolErrors, up: "bad" },
  { name: "tool calls before speech", cell: (s) => String(s.totals.toolsBeforeSpeech), num: (s) => s.totals.toolsBeforeSpeech, up: "bad" },
  { name: "prompt tokens, total", cell: (s) => s.totals.promptTokensSum.toLocaleString(), num: (s) => s.totals.promptTokensSum, up: "bad" },
  { name: "estimated Live cost", cell: (s) => (s.totals.costUsd == null ? "–" : `$${s.totals.costUsd.toFixed(2)}`), num: (s) => s.totals.costUsd, up: "bad" },
  { name: "tool calls a turn", cell: (s) => String(s.totals.callsPerTurn ?? "–"), num: (s) => s.totals.callsPerTurn ?? null },
  { name: "turns over 8 s to first sound", cell: (s) => String(s.totals.slowTurns ?? "–"), num: (s) => s.totals.slowTurns ?? null, up: "bad" },
  { name: "transcript leaks", cell: (s) => String(s.totals.leakTurns ?? "–"), num: (s) => s.totals.leakTurns ?? null, up: "bad" },
  { name: "turns that repeat a sentence", cell: (s) => String(s.totals.repeatTurns ?? "–"), num: (s) => s.totals.repeatTurns ?? null, up: "bad" },
  { name: "attempts written as raw LaTeX", cell: (s) => String(s.totals.rawLatexAttempts ?? "–"), num: (s) => s.totals.rawLatexAttempts ?? null, up: "bad" },
  { name: "judge: telling moves", cell: (s) => pct(s.totals.judge.telling, s.totals.judge.turns), num: (s) => Math.round((100 * s.totals.judge.telling) / Math.max(1, s.totals.judge.turns)), up: "bad" },
  { name: "judge: focus moves", cell: (s) => pct(s.totals.judge.focus, s.totals.judge.turns), num: (s) => Math.round((100 * s.totals.judge.focus) / Math.max(1, s.totals.judge.turns)), up: "good" },
  { name: "judge: mistakes caught", cell: (s) => `${s.totals.judge.caught}/${s.totals.judge.errTurns}`, num: (s) => Math.round((100 * s.totals.judge.caught) / Math.max(1, s.totals.judge.errTurns)), up: "good" },
  { name: "judge: wrong answers confirmed", cell: (s) => String(s.totals.judge.confirmedWrong), num: (s) => s.totals.judge.confirmedWrong, up: "bad" },
  { name: "judge: answer leaked", cell: (s) => String(s.totals.judge.leaked), num: (s) => s.totals.judge.leaked, up: "bad" },
  { name: "judge: aimed at the cause", cell: (s) => `${s.totals.judge.targeted}/${s.totals.judge.targetedN}`, num: (s) => Math.round((100 * s.totals.judge.targeted) / Math.max(1, s.totals.judge.targetedN)), up: "good" },
  { name: "judge: ends with something to do", cell: (s) => pct(s.totals.judge.action, s.totals.judge.turns), num: (s) => Math.round((100 * s.totals.judge.action) / Math.max(1, s.totals.judge.turns)), up: "good" },
  { name: "judge: help level fit", cell: (s) => pct(s.totals.judge.fit, s.totals.judge.turns), num: (s) => Math.round((100 * s.totals.judge.fit) / Math.max(1, s.totals.judge.turns)), up: "good" },
  { name: "judge: board move fit", cell: (s) => `${s.totals.judge.boardFit}/${s.totals.judge.boardFitN}`, num: (s) => Math.round((100 * s.totals.judge.boardFit) / Math.max(1, s.totals.judge.boardFitN)), up: "good" },
  { name: "judge: case checks met", cell: (s) => `${s.totals.judge.checksMet}/${s.totals.judge.checks}`, num: (s) => Math.round((100 * s.totals.judge.checksMet) / Math.max(1, s.totals.judge.checks)), up: "good" },
  ...SCORE_KEYS.map<Row>((k) => ({ name: `score: ${k}`, cell: (s) => String(s.totals.judge.scores[k] ?? "–"), num: (s) => s.totals.judge.scores[k], up: "good" })),
];

function verdict(row: Row, a: Summary, b: Summary): string {
  if (!row.num || !row.up) return "";
  const x = row.num(a);
  const y = row.num(b);
  if (x == null || y == null || x === y) return "";
  const better = row.up === "good" ? y > x : y < x;
  return better ? "better" : "worse";
}

function main() {
  const labels = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (labels.length < 2) throw new Error("Give two or more run labels (folders under bench/runs/).");
  const runs = labels.map(load);
  const L: string[] = [];
  L.push(`# ${labels.join(" vs ")}`, "");
  for (const s of runs) L.push(`- **${s.label}**: ${s.date.slice(0, 16).replace("T", " ")} · tutor \`${s.liveModel}\`${s.tools ? ` (tools ${s.tools})` : ""} · prompt \`${s.promptName}\` · student \`${s.studentModel}\` · judge \`${s.judgeModel}\` · ${s.totals.cases} case runs, ${s.totals.turns} turns`);
  L.push("", `| measure | ${runs.map((s) => s.label).join(" | ")}${runs.length === 2 ? " | last vs first |" : " |"}`, `|---|${runs.map(() => "---").join("|")}|${runs.length === 2 ? "---|" : ""}`);
  for (const row of ROWS) L.push(`| ${row.name} | ${runs.map((s) => row.cell(s)).join(" | ")}${runs.length === 2 ? ` | ${verdict(row, runs[0], runs[1])} |` : " |"}`);
  L.push("", "## Per case", "", `| case | ${runs.map((s) => `${s.label}: outcome · scores`).join(" | ")} |`, `|---|${runs.map(() => "---").join("|")}|`);
  const ids = [...new Set(runs.flatMap((s) => s.cases.map((c) => c.caseId ?? c.id)))];
  for (const id of ids) {
    L.push(`| ${id} | ${runs.map((s) => {
      const cs = s.cases.filter((x) => (x.caseId ?? x.id) === id);
      if (cs.length === 0) return "–";
      return cs.map((c) => {
        const j = c.judgement;
        return `${j ? (j.outcome_met ? "met" : "missed") : "?"} · ${j ? SCORE_KEYS.map((k) => j.scores[k]).join(" ") : "–"}`;
      }).join(" / ");
    }).join(" | ")} |`);
  }
  L.push("", "Scores in order: diagnosis · remediation · pacing · voice · board object · board steps · board clean · board matches speech.", "", "One run per prompt is one sample: a difference of one outcome or a few percent is noise. Read the judge's words in each run's report.md before believing a number.");
  const out = path.join("bench", "runs", `compare-${labels.map((l) => path.basename(l, ".json")).join("-vs-")}.md`);
  fs.writeFileSync(out, L.join("\n"));
  console.log(L.join("\n"));
  console.log(`\nwrote ${out}`);
}

main();
