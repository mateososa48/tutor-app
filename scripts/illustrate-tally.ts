// Tallies the blind ratings of an illustration bake-off (Oct 14 2026):
// bench/illustrate/<label>/blind/rater*.json (letter scores per case) with
// key.json (letter → arm) and meta.json (timings), into one table per arm.
//
//   npx tsx scripts/illustrate-tally.ts --label g1

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const label = args[args.indexOf("--label") + 1] ?? "g1";
const DIR = path.join(ROOT, "bench", "illustrate", label);
const key: Record<string, Record<string, string>> = JSON.parse(fs.readFileSync(path.join(DIR, "blind", "key.json"), "utf8"));
const meta: Array<{ caseId: string; arm: string; ms: number; error?: string }> = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
const raters = fs.readdirSync(path.join(DIR, "blind")).filter((f) => /^rater\d+\.json$/.test(f));

type Score = { math: number; withheld: number; clear: number; look: number; fit: number; overall: number; note?: string };
const FIELDS = ["overall", "math", "clear", "look", "fit"] as const;
const byArm: Record<string, Score[]> = {};
const perCase: Record<string, Record<string, number[]>> = {};
for (const f of raters) {
  const r: Record<string, Record<string, Score>> = JSON.parse(fs.readFileSync(path.join(DIR, "blind", f), "utf8"));
  for (const [caseId, letters] of Object.entries(r)) {
    for (const [letter, s] of Object.entries(letters)) {
      const arm = key[caseId]?.[letter];
      if (!arm) continue;
      (byArm[arm] ??= []).push(s);
      ((perCase[caseId] ??= {})[arm] ??= []).push(s.overall);
    }
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const rows = Object.entries(byArm)
  .map(([arm, ss]) => {
    const ms = meta.filter((m) => m.arm === arm && !m.error && m.ms > 0).map((m) => m.ms);
    return {
      arm,
      n: ss.length,
      ...Object.fromEntries(FIELDS.map((k) => [k, mean(ss.map((s) => s[k]))])),
      se: sd(ss.map((s) => s.overall)) / Math.sqrt(ss.length),
      leaked: ss.filter((s) => s.withheld === 1).length,
      good: ss.filter((s) => s.overall >= 4).length,
      bad: ss.filter((s) => s.overall <= 2).length,
      ms: ms.length ? median(ms) : null,
    } as Record<string, number | string | null>;
  })
  .sort((a, b) => (b.overall as number) - (a.overall as number));

console.log(`raters: ${raters.length}\n`);
console.log("arm      n  overall (±se)  math  clear  look  fit   leaked  4-5  1-2  median time");
for (const r of rows) {
  const f = (k: string) => (r[k] as number).toFixed(2);
  console.log(`${String(r.arm).padEnd(7)} ${String(r.n).padStart(2)}  ${f("overall")} ±${(r.se as number).toFixed(2)}    ${f("math")}  ${f("clear")}  ${f("look")}  ${f("fit")}  ${String(r.leaked).padStart(5)}  ${String(r.good).padStart(4)} ${String(r.bad).padStart(4)}  ${r.ms === null ? "-" : ((r.ms as number) / 1000).toFixed(1) + " s"}`);
}
console.log("\nOverall by case (mean of raters):");
const arms = rows.map((r) => String(r.arm));
console.log("case      " + arms.map((a) => a.padStart(6)).join(""));
for (const [c, m] of Object.entries(perCase)) console.log(c.padEnd(10) + arms.map((a) => (m[a] ? mean(m[a]).toFixed(1) : "-").padStart(6)).join(""));
