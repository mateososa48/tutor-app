// Measures the production illustrator (Oct 17 2026): the prompt in
// lib/illustration/prompt.ts, the call in lib/illustration/model.ts, the label
// guard, and the engine, exactly as /api/illustrate runs them, over the ten
// bake-off cases and the five held-out ones. Prints time, cost, guard hits and
// engine problems per case and writes the pictures to one HTML sheet.
//
//   npx tsx scripts/illustrate-measure.ts [--model claude-haiku-5-5] [--label m1] [--set all|heldout|main] [--runs 1]

import fs from "node:fs";
import path from "node:path";
import { ILLUSTRATION_CASES, ILLUSTRATION_HELDOUT } from "./illustrate-cases";
import { guardLabels, illustratorPrompt, partNames } from "../lib/illustration/prompt";
import { callCost, callIllustrator } from "../lib/illustration/model";
import { parseScene, renderScene } from "../lib/illustration/scene";

const ROOT = path.resolve(__dirname, "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const args = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const MODEL = opt("model", "claude-haiku-5-5");
const LABEL = opt("label", "m1");
const SET = opt("set", "all");
const RUNS = Number(opt("runs", "1"));
const OUT = path.join(ROOT, "bench", "illustrate", LABEL);
fs.mkdirSync(OUT, { recursive: true });

const cases = [...(SET !== "heldout" ? ILLUSTRATION_CASES.map((c) => ({ ...c, held: false })) : []), ...(SET !== "main" ? ILLUSTRATION_HELDOUT.map((c) => ({ ...c, held: true })) : [])];

type Row = { id: string; held: boolean; run: number; ms: number; cost: number | null; ok: boolean; problems: string[]; withheld: string[]; parts: string[]; svg?: string; error?: string; usage?: unknown };
const rows: Row[] = [];

async function one(c: (typeof cases)[number], run: number): Promise<Row> {
  const req = { grade: c.grade, what: c.what, notice: c.why, conversation: c.conversation, board: c.board };
  const t0 = Date.now();
  try {
    const reply = await callIllustrator(MODEL, illustratorPrompt(req));
    const ms = Date.now() - t0;
    if (!reply) return { id: c.id, held: c.held, run, ms, cost: null, ok: false, problems: [], withheld: [], parts: [], error: "no key" };
    const scene = parseScene(reply.text);
    const cost = callCost(MODEL, reply.usage);
    if (!scene) return { id: c.id, held: c.held, run, ms, cost, ok: false, problems: [], withheld: [], parts: [], error: `unreadable: ${reply.text.slice(0, 120)}`, usage: reply.usage };
    const seen = [c.conversation.map((l) => l.text).join(" "), c.board, c.what, c.why].join(" ");
    const guarded = guardLabels(scene, seen);
    const out = renderScene(guarded.scene);
    return { id: c.id, held: c.held, run, ms, cost, ok: true, problems: out.problems, withheld: guarded.withheld, parts: partNames(out.parts), svg: out.svg, usage: reply.usage };
  } catch (e) {
    return { id: c.id, held: c.held, run, ms: Date.now() - t0, cost: null, ok: false, problems: [], withheld: [], parts: [], error: String(e) };
  }
}

async function main() {
  for (let run = 1; run <= RUNS; run++) {
    // Three at a time: the app makes one call a turn; this only saves wall clock.
    for (let i = 0; i < cases.length; i += 3) {
      const batch = await Promise.all(cases.slice(i, i + 3).map((c) => one(c, run)));
      for (const r of batch) {
        rows.push(r);
        console.log(`${r.id.padEnd(12)} ${r.held ? "held" : "main"} r${r.run} ${String(r.ms).padStart(5)} ms  ${r.cost != null ? `$${r.cost.toFixed(5)}` : "   -    "}  ${r.ok ? "ok" : `FAIL ${r.error}`}${r.withheld.length ? `  withheld ${r.withheld.join(",")}` : ""}${r.problems.length ? `  problems: ${r.problems.join("; ")}` : ""}`);
      }
    }
  }
  const ok = rows.filter((r) => r.ok);
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
  const costs = ok.map((r) => r.cost ?? 0);
  console.log(`\n${MODEL}: ${ok.length}/${rows.length} drawn · p50 ${q(0.5)} ms · p90 ${q(0.9)} ms · max ${ms[ms.length - 1]} ms · mean cost $${(costs.reduce((a, b) => a + b, 0) / Math.max(1, costs.length)).toFixed(5)}`);
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows.map(({ svg, ...r }) => r), null, 2));
  const cards = rows
    .map((r) => `<figure><figcaption><b>${r.id}</b>${r.held ? " · held out" : ""} · r${r.run} · ${r.ms} ms${r.cost != null ? ` · $${r.cost.toFixed(5)}` : ""}${r.withheld.length ? ` · guard: ${r.withheld.join(", ")}` : ""}${r.problems.length ? ` · problems: ${r.problems.join("; ")}` : ""}</figcaption>${r.svg ?? `<p>${r.error}</p>`}</figure>`)
    .join("\n");
  fs.writeFileSync(
    path.join(OUT, "sheet.html"),
    `<!doctype html><meta charset="utf-8"><title>Illustrator ${MODEL}</title><style>body{font:14px system-ui;margin:24px;background:#f5f5f7}figure{background:#fff;margin:0 0 20px;padding:16px;border-radius:12px}figure svg{max-width:100%;height:auto}figcaption{margin-bottom:8px;color:#444}</style><h1>${MODEL} · ${LABEL}</h1>${cards}`,
  );
  console.log(`sheet: ${path.join(OUT, "sheet.html")}`);
}
main();
