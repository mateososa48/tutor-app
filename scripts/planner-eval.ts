// Offline check of the planner (lib/tutor-planner) on judged benchmark moments.
//
//   npx tsx scripts/planner-eval.ts --runs bench/runs/n2-e-main,bench/runs/n-a-main \
//     --model gemini-3.8-flash --fallback gemini-3.5-flash-lite --key GEMINI_API_KEY_2 \
//     --out bench/runs/planner-eval.md [--per-case 4] [--system path]
//
// A moment is a student line the judge marked a miss on (a telling or generic
// move, a mistake not caught, a board move that did not fit) or a line that
// gives a reason ("cuz", "i put", "idk"). The planner sees what the tutor saw
// before its reply (the turns before, the board, the checker's note, the
// app's turn note) and gives its one order; the file sets it beside what the
// tutor actually did and what the judge said, for a review panel to compare.
// Text calls only, no Live session. --system swaps in another system prompt
// (a file) to compare planner wordings on the same moments.
//
// --moments bench/runs/rr-n4-key.json --root ../tutor-app-cand3/bench/runs: plan
// exactly the moments a reply review rated (its key's src ids), so planner
// versions can be blind-rated on the same lines (reply-review.ts build-orders).
// A planner turn's recorded note is its own order, so reminders are passed only
// where the note is the app's.
import fs from "node:fs";
import path from "node:path";
import { arg, readGeminiKey } from "./eval-tools";
import { PLANNER_SYSTEM, plannerNote, plannerPrompt, type PlannerTurn } from "../lib/tutor-planner";

type Tool = { name: string; ok?: boolean; by?: string; args?: Record<string, unknown> };
type Turn = { n: number; student: string; tutor: string; tools: Tool[]; boardCompact?: string; autoCheck?: string | null; turnNote?: string };
type JudgeTurn = { turn: number; move?: string; targeted?: string; mistake_identified?: string; board_fit?: string; board_note?: string; note?: string };

const REASON = /\b(cuz|cause|because|bc|i put|i got|i did|i think|so it'?s|idk|i don'?t know|wait)\b/i;

async function plan(model: string, fallback: string, key: string, system: string, text: string, verdict: string | null = null): Promise<{ order: string | null; model: string; ms: number }> {
  for (const m of [model, fallback].filter(Boolean)) {
    const t0 = Date.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text }] }], generationConfig: { maxOutputTokens: 800, temperature: 0.3, thinkingConfig: { thinkingLevel: arg("thinking", "low") } } }),
      });
      if (r.status === 503 || r.status === 429) { await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); continue; }
      const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
      const reply = j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
      const order = plannerNote(reply, verdict);
      // An unusable reply (reasoning, no quote) falls through to the next model.
      if (order) return { order, model: m, ms: Date.now() - t0 };
      break;
    }
  }
  return { order: null, model: "failed", ms: 0 };
}

async function main() {
  const runs = arg("runs", "").split(",").filter(Boolean);
  const model = arg("model", "gemini-3.8-flash");
  const fallback = arg("fallback", "gemini-3.5-flash-lite");
  const key = readGeminiKey(arg("key", "GEMINI_API_KEY_2"));
  const out = arg("out", "bench/runs/planner-eval.md");
  const perCase = Number(arg("per-case", "4"));
  const system = arg("system", "") ? fs.readFileSync(arg("system", ""), "utf8") : PLANNER_SYSTEM;
  const moments: Array<Record<string, unknown>> = [];
  const picks: Array<{ dir: string; caseId: string; n: number | null }> = [];
  if (arg("moments", "")) {
    const root = arg("root", "bench/runs");
    for (const k of JSON.parse(fs.readFileSync(arg("moments", ""), "utf8")) as Array<{ src: string }>) {
      const [run, caseId, t] = k.src.split("/");
      picks.push({ dir: path.join(root, run), caseId, n: Number(t.slice(1)) });
    }
  } else {
    for (const dir of runs) {
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".judge.json") && f !== "summary.json")) picks.push({ dir, caseId: file.replace(/\.json$/, ""), n: null });
    }
  }
  const limit = Number(arg("limit", "0")) || Infinity;
  for (const pick of picks) {
    if (moments.length >= limit) break;
    {
      const { dir, caseId } = pick;
      const run = JSON.parse(fs.readFileSync(path.join(dir, `${caseId}.json`), "utf8")) as { name: string; grade: string; turns: Turn[] };
      const judgeFile = path.join(dir, `${caseId}.judge.json`);
      let judge: { turns?: JudgeTurn[]; human_tutor_would?: string } = {};
      try { judge = JSON.parse(fs.readFileSync(judgeFile, "utf8")); } catch { /* unjudged */ }
      const topic = run.turns[0]?.student.replace(/^I need help with:\s*/i, "").replace(/\s*Please teach me in \w+\.?$/i, "") ?? "";
      const picked = pick.n != null ? run.turns.filter((t) => t.n === pick.n) : run.turns.filter((t, i) => {
        if (i === 0) return false;
        const jt = judge.turns?.find((x) => x.turn === t.n);
        const miss = jt && (/telling|generic/.test(jt.move ?? "") || jt.targeted === "no" || jt.mistake_identified === "no" || jt.board_fit === "no");
        return miss || REASON.test(t.student);
      }).slice(0, perCase);
      for (const t of picked) {
        const i = run.turns.indexOf(t);
        const before = run.turns.slice(0, i);
        const turns: PlannerTurn[] = before.map((x) => ({ student: x.student, tutor: x.tutor, tools: x.tools.filter((y) => y.ok !== false && !y.by).map((y) => y.name) }));
        const reminders = t.turnNote && !t.turnNote.startsWith("[Next move") ? t.turnNote : null;
        const text = plannerPrompt({ grade: run.grade, topic, turns, line: t.student, verdict: t.autoCheck ?? null, board: before.at(-1)?.boardCompact ?? "", state: null, reminders });
        const r = await plan(model, fallback, key, system, text, t.autoCheck ?? null);
        const jt = judge.turns?.find((x) => x.turn === t.n);
        moments.push({
          id: `${path.basename(dir)}/${caseId}/t${t.n}`,
          name: run.name,
          grade: run.grade,
          student: `${run.name}, ${run.grade}`,
          context: before.slice(-2).map((x) => `Student: ${x.student}\nTutor: ${x.tutor}`).join("\n"),
          line: t.student,
          verdict: t.autoCheck ?? null,
          actual: `${t.tutor} [board: ${t.tools.filter((y) => !y.by).map((y) => y.name).join(", ") || "none"}]`,
          judge: jt ? `move ${jt.move}; targeted ${jt.targeted}; mistake ${jt.mistake_identified}; board ${jt.board_fit}${jt.board_note ? `; ${jt.board_note}` : ""}` : "not judged",
          expert: judge.human_tutor_would ?? null,
          planner: r.order,
          plannerModel: r.model,
          plannerMs: r.ms,
        });
        console.log(`${moments.length}. ${String(moments.at(-1)!.id)} (${r.model}, ${r.ms} ms): ${r.order ?? "(none)"}`);
      }
    }
  }
  const md = moments.map((m, k) => [
    `## ${k + 1}. ${m.id} — ${m.student}`,
    m.context ? `Before:\n${m.context}` : "",
    `**Student now:** ${m.line}`,
    m.verdict ? `Checker: ${m.verdict}` : "",
    `**What the tutor actually did:** ${m.actual}`,
    `Judge on that turn: ${m.judge}`,
    m.expert ? `Judge, what an expert would have done in this session: ${m.expert}` : "",
    `**Planner's order:** ${m.planner ?? "(none)"} _(${m.plannerModel}, ${m.plannerMs} ms)_`,
  ].filter(Boolean).join("\n\n")).join("\n\n---\n\n");
  fs.writeFileSync(out, `# Planner offline check\n\nModel ${model} (fallback ${fallback}), ${moments.length} moments.\n\n${md}\n`);
  fs.writeFileSync(out.replace(/\.md$/, ".json"), JSON.stringify(moments, null, 1));
  const ms = moments.map((m) => Number(m.plannerMs)).filter(Boolean).sort((a, b) => a - b);
  console.log(`\nwrote ${out}: ${moments.length} moments, planner median ${ms[Math.floor(ms.length / 2)] ?? "-"} ms, worst ${ms.at(-1) ?? "-"} ms`);
}

void main();
