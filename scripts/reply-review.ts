// Blind reply-level review across benchmark runs (Sept 27 2026).
//
// Session-level judge scores move by ±0.3 between identical runs, so a single
// change rarely shows in them. This rates what the change acts on: the tutor's
// actual reply at the moments a student gives an answer or a reason, pooled
// from several runs and shuffled so the rater cannot tell which arm a reply
// came from. With the planner it measured 2.84 ± 0.15 without vs 3.73 ± 0.13
// with, where the session scores could not tell the arms apart.
//
//   npx tsx scripts/reply-review.ts build --tag n4 --per-case 4 \
//     --arm off=../tutor-app-cand3/bench/runs/n4-off --arm on=../tutor-app-cand3/bench/runs/n4-on
//   (then run a workflow: one rater per bench/runs/rr-<tag>-batchN.md, schema
//    { moments: [{ moment, score, why }] }, and save the rater replies as
//    bench/runs/rr-<tag>-ratings.json: an array of { moments: [...] })
//   npx tsx scripts/reply-review.ts score --tag n4
//
// Planner versions without a live run: planner-eval.ts --moments writes each
// version's orders on the same moments; the tutor says an order's quote
// nearly word for word (n4-on), so the order is rated as the reply.
//   npx tsx scripts/reply-review.ts build-orders --tag p6 \
//     --orders v4=bench/runs/pe-v4.json --orders v6=bench/runs/pe-v6.json
import fs from "node:fs";
import path from "node:path";

type Tool = { name: string; by?: string };
type Turn = { n: number; student: string; tutor: string; tools: Tool[] };
type Run = { name: string; grade: string; turns: Turn[] };

const argv = process.argv.slice(2);
const flag = (name: string, fallback = "") => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const arms = argv.flatMap((a, i) => (a === "--arm" && argv[i + 1] ? [argv[i + 1]] : [])).map((s) => {
  const [name, dirs] = s.split("=");
  return { name, dirs: dirs.split(",") };
});
const tag = flag("tag", "rr");
const out = path.join("bench/runs", `rr-${tag}`);

// A seeded shuffle, so a build is reproducible.
function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MOMENT = /\b(cuz|cause|because|bc|i put|i got|i did|i think|so it'?s|idk|i don'?t know|wait|is it)\b|\d/i;
const LEAVING = /^\s*(ok|okay)?\s*(bye|thanks|thank you)/i;

function build() {
  const perCase = Number(flag("per-case", "4"));
  const seed = Number(flag("seed", "31"));
  const moments: Array<{ arm: string; src: string; text: string }> = [];
  for (const arm of arms) {
    for (const dir of arm.dirs) {
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".judge.json") && f !== "summary.json")) {
        const run = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Run;
        const picks = shuffle(run.turns.map((t, i) => ({ t, i })).filter(({ t, i }) => i > 0 && MOMENT.test(t.student) && t.tutor.trim() && !LEAVING.test(t.student)), seed + file.length)
          .slice(0, perCase)
          .sort((a, b) => a.i - b.i);
        for (const { t, i } of picks) {
          const before = run.turns.slice(Math.max(0, i - 2), i).map((x) => `Student: ${x.student}\nTutor: ${x.tutor}`).join("\n");
          const board = t.tools.filter((x) => !x.by).map((x) => x.name).join(", ") || "none";
          moments.push({ arm: arm.name, src: `${path.basename(dir)}/${file.replace(/\.json$/, "")}/t${t.n}`, text: `(${run.name}, ${run.grade})\nBefore:\n${before}\nStudent now: ${t.student}\nTutor's reply: "${t.tutor.slice(0, 600)}"\nTutor's board moves with it: ${board}` });
        }
      }
    }
  }
  const mixed = shuffle(moments, seed);
  const batches = Math.max(1, Math.ceil(mixed.length / 10));
  const files: string[][] = Array.from({ length: batches }, () => []);
  mixed.forEach((m, k) => files[k % batches].push(`### Moment ${k + 1} ${m.text}`));
  files.forEach((b, k) => fs.writeFileSync(`${out}-batch${k + 1}.md`, `${b.join("\n\n---\n\n")}\n`));
  fs.writeFileSync(`${out}-key.json`, JSON.stringify(mixed.map((m) => ({ arm: m.arm, src: m.src })), null, 1));
  const count = new Map<string, number>();
  for (const m of mixed) count.set(m.arm, (count.get(m.arm) ?? 0) + 1);
  console.log(`${mixed.length} moments in ${batches} batches (${out}-batch1..${batches}.md): ${[...count].map(([a, n]) => `${a} ${n}`).join(", ")}`);
}

/** "[Next move, not from the student: Say: "…" After speaking: tool(…)]" → the words and the tool. */
function orderReply(note: string | null): { say: string; board: string } | null {
  if (!note) return null;
  const say = /Say: "([^"]+)"/.exec(note)?.[1];
  if (!say) return null;
  const board = /After speaking: ([a-z_]+)/.exec(note)?.[1] ?? "none";
  return { say, board };
}

function buildOrders() {
  const seed = Number(flag("seed", "31"));
  const specs = argv.flatMap((a, i) => (a === "--orders" && argv[i + 1] ? [argv[i + 1]] : [])).map((s) => {
    const [name, file] = s.split("=");
    return { name, rows: JSON.parse(fs.readFileSync(file, "utf8")) as Array<Record<string, string | null>> };
  });
  const moments: Array<{ arm: string; src: string; text: string }> = [];
  for (const spec of specs) {
    for (const r of spec.rows) {
      const reply = orderReply(r.planner);
      // No order came back: the reply would have been the tutor's own. Rated as such.
      const said = reply ? reply.say : "(no order: the tutor would answer by itself)";
      moments.push({ arm: spec.name, src: String(r.id), text: `(${r.name ?? r.student}, ${r.grade ?? ""})\nBefore:\n${r.context ?? ""}\nStudent now: ${r.line}\nTutor's reply: "${said}"\nTutor's board moves with it: ${reply?.board ?? "none"}` });
    }
  }
  const mixed = shuffle(moments.filter((m) => !m.text.includes("(no order:")), seed);
  const batches = Math.max(1, Math.ceil(mixed.length / 10));
  const files: string[][] = Array.from({ length: batches }, () => []);
  mixed.forEach((m, k) => files[k % batches].push(`### Moment ${k + 1} ${m.text}`));
  files.forEach((b, k) => fs.writeFileSync(`${out}-batch${k + 1}.md`, `${b.join("\n\n---\n\n")}\n`));
  fs.writeFileSync(`${out}-key.json`, JSON.stringify(mixed.map((m) => ({ arm: m.arm, src: m.src })), null, 1));
  const count = new Map<string, number>();
  for (const m of mixed) count.set(m.arm, (count.get(m.arm) ?? 0) + 1);
  const dropped = moments.length - mixed.length;
  console.log(`${mixed.length} moments in ${batches} batches (${out}-batch1..${batches}.md): ${[...count].map(([a, n]) => `${a} ${n}`).join(", ")}${dropped ? `; ${dropped} with no order left out` : ""}`);
}

function score() {
  const key = JSON.parse(fs.readFileSync(`${out}-key.json`, "utf8")) as Array<{ arm: string; src: string }>;
  const ratings = JSON.parse(fs.readFileSync(`${out}-ratings.json`, "utf8")) as Array<{ moments?: Array<{ moment: number; score: number }> | null }>;
  const by = new Map<string, number[]>();
  for (const r of ratings) for (const m of r.moments ?? []) {
    const k = key[m.moment - 1];
    if (k) by.set(k.arm, [...(by.get(k.arm) ?? []), m.score]);
  }
  // The same moments in every arm: the paired difference is the sharper test.
  const bySrc = new Map<string, Map<string, number>>();
  for (const r of ratings) for (const m of r.moments ?? []) {
    const k = key[m.moment - 1];
    if (!k) continue;
    if (!bySrc.has(k.src)) bySrc.set(k.src, new Map());
    bySrc.get(k.src)!.set(k.arm, m.score);
  }
  for (const [arm, xs] of by) {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1));
    console.log(`${arm.padEnd(12)} n=${String(xs.length).padStart(3)}  mean ${mean.toFixed(2)} ± ${(sd / Math.sqrt(xs.length)).toFixed(2)}  4-5: ${xs.filter((x) => x >= 4).length}  1-2: ${xs.filter((x) => x <= 2).length}`);
  }
  const names = [...by.keys()];
  for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) {
    const d = [...bySrc.values()].filter((m) => m.has(names[a]) && m.has(names[b])).map((m) => m.get(names[b])! - m.get(names[a])!);
    if (d.length < 2) continue;
    const mean = d.reduce((x, y) => x + y, 0) / d.length;
    const sd = Math.sqrt(d.reduce((x, y) => x + (y - mean) ** 2, 0) / (d.length - 1));
    console.log(`${names[b]} − ${names[a]}: ${mean >= 0 ? "+" : ""}${mean.toFixed(2)} ± ${(sd / Math.sqrt(d.length)).toFixed(2)} over ${d.length} paired moments (better ${d.filter((x) => x > 0).length}, worse ${d.filter((x) => x < 0).length})`);
  }
}

if (argv[0] === "build") build();
else if (argv[0] === "build-orders") buildOrders();
else if (argv[0] === "score") score();
else console.log("usage: reply-review.ts build|build-orders|score --tag t [--arm name=dir[,dir]]… [--orders name=file]…");
