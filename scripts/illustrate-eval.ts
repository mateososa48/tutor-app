// The illustrator's test bench (Oct 19 2026). Runs one or more variants
// ("arms", scripts/illustrate-arms.ts) over the test set
// (scripts/illustrate-eval-cases.ts), several samples each, and grades every
// picture two ways:
//   - code checks: engine problems, exact counts of the objects named in the
//     case, numbers that must not appear, words overlapping words (measured in
//     a real browser), text off the picture, a shape too tall for a phone;
//   - a judge: Claude Sonnet 5.5 looks at the picture with the case and scores
//     math, withheld, clear, look, fit and overall (1-5) and flags failures.
// It writes results.json, report.md and gallery.html per run.
//
//   npx tsx scripts/illustrate-eval.ts --arms base --split tune --samples 2 --label e1
//   [--cases a,b] [--judge claude-sonnet-5-5|none] [--concurrency 6]
//   npx tsx scripts/illustrate-eval.ts --calibrate   (the judge against the three raters of the Arrow test)

import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { EVAL_CASES, type EvalCase } from "./illustrate-eval-cases";
import { ARMS, type ArmResult } from "./illustrate-arms";
import type { Scene, SceneNode } from "../lib/illustration/scene";

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
const flag = (name: string) => args.includes(`--${name}`);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// The judge is Claude Code itself (Mateo, Oct 19 2026: "i want u to be the
// judge. not a different api call"): the run writes one anonymous packet per
// picture (bench/illustrate/eval/<label>/judge/<id>.md and .png, no arm in
// sight), subagents grade them, and --fold <label> reads their verdicts back.
// --judge claude-sonnet-5-5 still calls the API, but is not to be used.
const JUDGE = opt("judge", "file");

// ── Code checks ─────────────────────────────────────────────────────────

/** How many objects with a name matching `re` the scene draws. */
export function countObjects(scene: Scene | null | undefined, re: RegExp): number {
  if (!scene) return 0;
  let n = 0;
  const walk = (node: SceneNode | undefined) => {
    if (!node) return;
    switch (node.type) {
      case "items":
        if (re.test(`${node.color ?? ""} ${node.icon}`.toLowerCase().replace(/[\s-]+/g, "_"))) n += Math.max(0, Math.round(node.count));
        break;
      case "icon":
        if (re.test(`${node.color ?? ""} ${node.icon}`.toLowerCase())) n += 1;
        break;
      case "pictograph":
        for (const r of node.rows ?? []) if (re.test(`${r.color ?? ""} ${r.icon}`.toLowerCase())) n += Math.max(0, Math.round(r.count));
        break;
      case "lineup":
        if (re.test((node.icon ?? "kid").toLowerCase())) n += (node.values ?? []).length;
        break;
      case "row":
      case "column":
        (node.children ?? []).forEach(walk);
        break;
      case "container":
        // A plate, jar, bag or box drawn as a container counts as one of itself.
        if (re.test(node.shape)) n += 1;
        walk(node.child);
        break;
      case "balance":
        walk(node.left);
        walk(node.right);
        break;
      case "axis":
        for (const m of node.marks ?? []) if (m.icon && re.test(m.icon.toLowerCase())) n += 1;
        break;
      default:
        // Nodes an arm adds later (templates) report their own counts.
        if ("counts" in (node as object)) {
          for (const [k, v] of Object.entries((node as unknown as { counts: Record<string, number> }).counts)) if (re.test(k)) n += v;
        }
    }
  };
  walk(scene.root);
  return n;
}

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** Every word written in the picture. */
function svgTexts(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, "")).trim()).filter(Boolean);
}

/** A forbidden string appears as its own token in some label ("4" in "4 each", not in "14" or "4/12"). */
export function forbiddenHits(texts: string[], forbid: string[]): string[] {
  const hits: string[] = [];
  for (const f of forbid) {
    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
    const re = new RegExp(`(^|[^0-9./])${esc}($|[^0-9./])`, "i");
    if (texts.some((t) => re.test(t))) hits.push(f);
  }
  return hits;
}

type Layout = { overlaps: Array<[string, string]>; offPicture: string[]; aspect: number; width: number; height: number };

/** Measures the rendered picture in a browser: which words overlap other words, and which run off it. */
async function measure(browser: Browser, svg: string, png: string): Promise<Layout> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1.5 });
    await page.setContent(`<html><body style="margin:0;background:#fff;display:inline-block;padding:12px">${svg.replace(/<svg\b([^>]*)>/, (t) => t.replace(/\s(width|height)="[^"]*"/g, "").replace("<svg", '<svg style="max-width:860px;max-height:640px;width:860px;height:auto"'))}</body></html>`);
    const res = await page.evaluate(() => {
      const svgEl = document.querySelector("svg")!;
      const box = svgEl.getBoundingClientRect();
      const texts = [...svgEl.querySelectorAll("text")]
        .map((t) => ({ t: (t.textContent ?? "").trim(), r: t.getBoundingClientRect() }))
        .filter((x) => x.t && x.r.width > 0 && x.r.height >= 8);
      const overlaps: Array<[string, string]> = [];
      for (let i = 0; i < texts.length; i++)
        for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i].r;
          const b = texts[j].r;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 2 && h > 2 && w * h > 0.15 * Math.min(a.width * a.height, b.width * b.height)) overlaps.push([texts[i].t, texts[j].t]);
        }
      const offPicture = texts.filter((x) => x.r.left < box.left - 2 || x.r.right > box.right + 2 || x.r.top < box.top - 2 || x.r.bottom > box.bottom + 2).map((x) => x.t);
      return { overlaps, offPicture, aspect: box.height / Math.max(1, box.width), width: box.width, height: box.height };
    });
    const el = await page.$("body");
    await el!.screenshot({ path: png });
    return res;
  } finally {
    await page.close();
  }
}

// ── The judge ───────────────────────────────────────────────────────────

export const JUDGE_RUBRIC = `You are a strict expert math tutor reviewing one picture an AI tutor drew on a shared whiteboard during a live voice lesson. The tutor said "let me draw that" and the picture appeared while it talked. Score the picture 1-5 on each (5 is rare, 3 is "fine, nothing special"):
- math: counts and quantities exactly right; nothing wrong or misleading written on it (a student's wrong answer written as if it were a fact is misleading).
- withheld: 5 = gives nothing away; 1 = shows the answer the tutor is about to ask for.
- clear: a student sees the one idea at once; no clutter, nothing overlapping, nothing confusing.
- look: how good it looks, like a good teacher's board a kid would like.
- fit: shows what was asked and what this student needs right now.
- overall: would you put this on the board in front of this student?
Also flag, true or false: wrong_count (an object count differs from what was asked), gives_answer, overlap (words or shapes on top of each other), missing (something asked for is absent), off_topic (it shows the wrong idea or the student's wrong method).
Reply with JSON only: {"math":n,"withheld":n,"clear":n,"look":n,"fit":n,"overall":n,"wrong_count":b,"gives_answer":b,"overlap":b,"missing":b,"off_topic":b,"note":"one sentence: the main thing right or wrong"}`;

export type Verdict = { math: number; withheld: number; clear: number; look: number; fit: number; overall: number; wrong_count: boolean; gives_answer: boolean; overlap: boolean; missing: boolean; off_topic: boolean; note: string };

function casePacket(c: Pick<EvalCase, "grade" | "conversation" | "board" | "what" | "why" | "withhold" | "mustShow">): string {
  return [
    `Student: ${c.grade}.`,
    c.conversation.map((l) => `${l.who === "tutor" ? "Tutor" : "Student"}: ${l.text}`).join("\n"),
    `On the board already: ${c.board}`,
    `The picture was asked to show: ${c.what}`,
    `The student should notice: ${c.why}`,
    `Must not show: ${c.withhold ?? "the answer"}`,
    `A right picture has: ${c.mustShow.join("; ")}`,
  ].join("\n");
}

export async function judge(packet: string, png: string): Promise<{ v: Verdict | null; cost: number }> {
  if (JUDGE === "none" || JUDGE === "file") return { v: null, cost: 0 };
  const data = fs.readFileSync(png).toString("base64");
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: JUDGE,
        max_tokens: 6000,
        system: [{ type: "text", text: JUDGE_RUBRIC, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data } }, { type: "text", text: packet }] }],
      }),
    });
    if (r.status === 429 || r.status >= 500) {
      await new Promise((res) => setTimeout(res, 5000 * (attempt + 1)));
      continue;
    }
    const j = (await r.json()) as { content?: Array<{ type: string; text?: string }>; usage?: Record<string, number>; error?: { message: string } };
    if (!r.ok) throw new Error(`judge ${r.status} ${j.error?.message}`);
    const text = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const u = j.usage ?? {};
    // Sonnet 5.5: $2/M in, $10/M out (platform.claude.com pricing, Oct 15 2026); cache reads at a tenth.
    const cost = ((u.input_tokens ?? 0) * 2 + (u.cache_creation_input_tokens ?? 0) * 2.5 + (u.cache_read_input_tokens ?? 0) * 0.2 + (u.output_tokens ?? 0) * 10) / 1e6;
    const m = /\{[\s\S]*\}/.exec(text);
    try {
      return { v: m ? (JSON.parse(m[0]) as Verdict) : null, cost };
    } catch {
      return { v: null, cost };
    }
  }
  return { v: null, cost: 0 };
}

// ── The run ─────────────────────────────────────────────────────────────

type Row = {
  arm: string;
  caseId: string;
  split: string;
  kind: string;
  sample: number;
  ms: number;
  cost: number | null;
  turns: number;
  error?: string;
  checks: { engine: string[]; counts: Array<{ match: string; want: number; got: number }>; forbidden: string[]; overlaps: number; offPicture: number; tall: boolean };
  pass: boolean;
  verdict: Verdict | null;
  notes?: string[];
  judgeId?: string;
};

/** A short id that does not reveal the arm, the case or the sample. */
function blindId(key: string): string {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `p${h.toString(36)}`;
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Reads the subagents' verdicts (judge/verdicts-*.json, keyed by packet id) into a run and rewrites its report. */
function fold(label: string) {
  const out = path.join(ROOT, "bench", "illustrate", "eval", label);
  const rows = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8")) as Row[];
  const verdicts: Record<string, Verdict> = {};
  for (const f of fs.readdirSync(path.join(out, "judge")).filter((f) => /^verdicts.*\.json$/.test(f))) Object.assign(verdicts, JSON.parse(fs.readFileSync(path.join(out, "judge", f), "utf8")));
  let n = 0;
  for (const r of rows) if (r.judgeId && verdicts[r.judgeId]) {
    r.verdict = verdicts[r.judgeId];
    n++;
  }
  const arms = [...new Set(rows.map((r) => r.arm))];
  const report: string[] = [`${n} of ${rows.length} pictures judged`];
  for (const sp of [...new Set(rows.map((r) => r.split))].sort()) report.push(`\n### ${sp}\n`, ...summarize(rows.filter((r) => r.split === sp), arms).slice(0, 2 + arms.length));
  report.push("\n### all\n", ...summarize(rows, arms));
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(out, "report.md"), report.join("\n"));
  gallery(rows, out, label);
  console.log(report.join("\n"));
}

/** Splits a run's packets into batches for subagent judges: one file per batch listing packet paths. */
function batches(label: string, size: number) {
  const dir = path.join(ROOT, "bench", "illustrate", "eval", label, "judge");
  const ids = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")).sort();
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += size) groups.push(ids.slice(i, i + size));
  groups.forEach((g, i) => fs.writeFileSync(path.join(dir, `batch-${i + 1}.txt`), g.map((id) => path.join(dir, `${id}.md`)).join("\n")));
  console.log(`${ids.length} packets in ${groups.length} batches → ${dir}/batch-N.txt`);
}

/** Blind packets for a run judged before packets existed (from its PNGs), and its old verdicts set aside. */
function packets(label: string) {
  const out = path.join(ROOT, "bench", "illustrate", "eval", label);
  const rows = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8")) as Row[];
  const byId = new Map(EVAL_CASES.map((c) => [c.id, c]));
  fs.mkdirSync(path.join(out, "judge"), { recursive: true });
  let n = 0;
  for (const r of rows) {
    const png = path.join(out, `${r.arm}.${r.caseId}.s${r.sample}.png`);
    if (!fs.existsSync(png)) continue;
    const jid = blindId(`${label}|${r.arm}|${r.caseId}|${r.sample}`);
    fs.copyFileSync(png, path.join(out, "judge", `${jid}.png`));
    fs.writeFileSync(path.join(out, "judge", `${jid}.md`), `# Picture ${jid}\n\n${casePacket(byId.get(r.caseId)!)}\n\nThe picture: ${path.join(out, "judge", `${jid}.png`)}\n`);
    r.judgeId = jid;
    if (r.verdict) (r as Row & { apiVerdict?: Verdict }).apiVerdict = r.verdict;
    r.verdict = null;
    n++;
  }
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(rows, null, 2));
  console.log(`${n} packets written`);
}

async function main() {
  if (flag("calibrate")) return calibrate();
  if (opt("packets", "")) return packets(opt("packets", ""));
  if (opt("fold", "")) return fold(opt("fold", ""));
  if (opt("batches", "")) return batches(opt("batches", ""), Number(opt("size", "25")));
  const label = opt("label", "e1");
  const armNames = opt("arms", "base").split(",");
  const split = opt("split", "tune");
  const samples = Number(opt("samples", "2"));
  const only = opt("cases", "");
  const cases = EVAL_CASES.filter((c) => (split === "all" || split.split(",").includes(c.split)) && (!only || only.split(",").includes(c.id)));
  const out = path.join(ROOT, "bench", "illustrate", "eval", label);
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const rows: Row[] = [];
  const judgeIds = new Map<string, string>();
  let judgeCost = 0;
  const jobs = armNames.flatMap((arm) => cases.flatMap((c) => Array.from({ length: samples }, (_, k) => ({ arm, c, k: k + 1 }))));
  console.log(`${jobs.length} pictures: ${armNames.join(", ")} × ${cases.length} cases (${split}) × ${samples}`);
  await pool(jobs, Number(opt("concurrency", "6")), async ({ arm, c, k }) => {
    const fn = ARMS[arm];
    if (!fn) throw new Error(`no arm ${arm}`);
    let res: ArmResult;
    try {
      res = await fn(c);
    } catch (e) {
      res = { svg: null, ms: 0, cost: null, turns: 0, problems: [], error: String(e).slice(0, 200) };
    }
    const base = path.join(out, `${arm}.${c.id}.s${k}`);
    const counts = (c.counts ?? []).map((x) => ({ match: x.match, want: x.n, got: countObjects(res.scene, new RegExp(x.match, "i")) }));
    let layout: Layout = { overlaps: [], offPicture: [], aspect: 0, width: 0, height: 0 };
    let verdict: Verdict | null = null;
    if (res.svg) {
      fs.writeFileSync(`${base}.svg`, res.svg);
      if (res.scene) fs.writeFileSync(`${base}.scene.json`, JSON.stringify(res.scene));
      layout = await measure(browser, res.svg, `${base}.png`);
      if (JUDGE === "file") {
        const jid = blindId(`${label}|${arm}|${c.id}|${k}`);
        fs.mkdirSync(path.join(out, "judge"), { recursive: true });
        fs.copyFileSync(`${base}.png`, path.join(out, "judge", `${jid}.png`));
        fs.writeFileSync(path.join(out, "judge", `${jid}.md`), `# Picture ${jid}\n\n${casePacket(c)}\n\nThe picture: ${path.join(out, "judge", `${jid}.png`)}\n`);
        judgeIds.set(`${arm}|${c.id}|${k}`, jid);
      }
      const j = await judge(casePacket(c), `${base}.png`);
      verdict = j.v;
      judgeCost += j.cost;
    }
    const forbidden = res.svg ? forbiddenHits(svgTexts(res.svg), c.forbid) : [];
    const checks = {
      engine: res.problems,
      counts,
      forbidden,
      overlaps: layout.overlaps.length,
      offPicture: layout.offPicture.length,
      tall: layout.aspect > 1.25,
    };
    const pass = Boolean(res.svg) && !res.error && checks.engine.length === 0 && counts.every((x) => !res.scene || x.got === x.want) && forbidden.length === 0 && checks.overlaps === 0 && checks.offPicture === 0 && !checks.tall;
    rows.push({ arm, caseId: c.id, split: c.split, kind: c.kind, sample: k, ms: res.ms, cost: res.cost, turns: res.turns, error: res.error, checks, pass, verdict, notes: res.notes, judgeId: judgeIds.get(`${arm}|${c.id}|${k}`) });
    const v = verdict;
    console.log(`${arm.padEnd(10)} ${c.id.padEnd(14)} s${k} ${String(res.ms).padStart(6)} ms ${pass ? "pass" : "FAIL"}${res.error ? ` err ${res.error.slice(0, 60)}` : ""}${checks.engine.length ? ` engine:${checks.engine.length}` : ""}${counts.some((x) => res.scene && x.got !== x.want) ? ` count:${counts.map((x) => `${x.match}=${x.got}/${x.want}`).join(",")}` : ""}${forbidden.length ? ` forbid:${forbidden}` : ""}${checks.overlaps ? ` overlap:${checks.overlaps}` : ""}${checks.offPicture ? ` off:${checks.offPicture}` : ""}${checks.tall ? " tall" : ""}${v ? ` | judge ${v.overall} (m${v.math} w${v.withheld} c${v.clear} l${v.look} f${v.fit})` : ""}`);
  });
  await browser.close();
  rows.sort((a, b) => a.arm.localeCompare(b.arm) || a.caseId.localeCompare(b.caseId) || a.sample - b.sample);
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(rows, null, 2));
  const report: string[] = [];
  for (const sp of [...new Set(rows.map((r) => r.split))].sort()) report.push(`\n### ${sp}\n`, ...summarize(rows.filter((r) => r.split === sp), armNames).slice(0, 2 + armNames.length));
  report.push("\n### all\n", ...summarize(rows, armNames));
  report.push(`\nJudge cost: $${judgeCost.toFixed(3)}`);
  fs.writeFileSync(path.join(out, "report.md"), report.join("\n"));
  console.log("\n" + report.join("\n"));
  gallery(rows, out, label);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0;
};

export function summarize(rows: Row[], arms: string[]): string[] {
  const lines = ["| arm | n | checks pass | judge overall | math | withheld | clear | look | fit | wrong count | gives answer | overlap | missing | off topic | median s | p90 s | $/pic |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const arm of arms) {
    const r = rows.filter((x) => x.arm === arm);
    const v = r.map((x) => x.verdict).filter((x): x is Verdict => Boolean(x));
    const ms = r.map((x) => x.ms).sort((a, b) => a - b);
    const q = (p: number) => (ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] / 1000).toFixed(1);
    const f = (k: keyof Verdict) => `${v.filter((x) => x[k] === true).length}`;
    const s = (k: keyof Verdict) => mean(v.map((x) => x[k] as number)).toFixed(2);
    const overall = v.map((x) => x.overall);
    lines.push(`| ${arm} | ${r.length} | ${r.filter((x) => x.pass).length}/${r.length} | ${mean(overall).toFixed(2)} ± ${(sd(overall) / Math.sqrt(Math.max(1, overall.length))).toFixed(2)} | ${s("math")} | ${s("withheld")} | ${s("clear")} | ${s("look")} | ${s("fit")} | ${f("wrong_count")} | ${f("gives_answer")} | ${f("overlap")} | ${f("missing")} | ${f("off_topic")} | ${q(0.5)} | ${q(0.9)} | ${mean(r.map((x) => x.cost ?? 0)).toFixed(4)} |`);
  }
  // Per kind, for the first arm against the rest.
  lines.push("", "Judge overall by kind:", "", `| kind | ${arms.join(" | ")} |`, `|---|${arms.map(() => "---").join("|")}|`);
  const kinds = [...new Set(rows.map((x) => x.kind))].sort();
  for (const k of kinds) lines.push(`| ${k} | ${arms.map((a) => mean(rows.filter((x) => x.arm === a && x.kind === k && x.verdict).map((x) => x.verdict!.overall)).toFixed(2)).join(" | ")} |`);
  return lines;
}

function gallery(rows: Row[], out: string, label: string) {
  const esc = (s?: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const cards = rows
    .map((r) => {
      const png = `${r.arm}.${r.caseId}.s${r.sample}.png`;
      const v = r.verdict;
      const fails = [
        ...r.checks.engine.map((e) => `engine: ${e}`),
        ...r.checks.counts.filter((x) => x.got !== x.want).map((x) => `count ${x.match}: ${x.got} of ${x.want}`),
        ...r.checks.forbidden.map((f) => `shows "${f}"`),
        r.checks.overlaps ? `${r.checks.overlaps} overlapping labels` : "",
        r.checks.offPicture ? `${r.checks.offPicture} labels off the picture` : "",
        r.checks.tall ? "too tall for a phone" : "",
        r.error ?? "",
      ].filter(Boolean);
      return `<figure><figcaption><b>${esc(r.caseId)}</b> · ${esc(r.arm)} · s${r.sample} · ${(r.ms / 1000).toFixed(1)} s${v ? ` · <b>${v.overall}</b>/5` : ""}</figcaption>${fs.existsSync(path.join(out, png)) ? `<img src="${png}">` : "<p>no picture</p>"}${fails.length ? `<p class="bad">${fails.map(esc).join(" · ")}</p>` : ""}${v ? `<p>${esc(v.note)}</p>` : ""}</figure>`;
    })
    .join("\n");
  fs.writeFileSync(path.join(out, "gallery.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Illustrator Eval</title><style>body{font:14px system-ui;margin:16px;background:#f5f5f7;color:#121215}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:12px}figure{background:#fff;margin:0;padding:12px;border-radius:12px}img{width:100%;height:auto}.bad{color:#b42318}</style><h1>${esc(label)}</h1><main>${cards}</main>`);
}

/**
 * How far the judge agrees with the three blind raters of the Arrow test
 * (bench/illustrate/arrow1): each of its 28 pictures judged alone, the
 * judge's overall against the raters' mean, by Pearson r.
 */
async function calibrate() {
  const dir = path.join(ROOT, "bench", "illustrate", "arrow1");
  const results = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8")) as Array<{ id: string; aIs: "arrow" | "haiku" }>;
  const raters = fs.readdirSync(path.join(dir, "ratings")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, "ratings", f), "utf8")) as Record<string, Record<string, Record<string, number>>>);
  const pairs: Array<{ id: string; human: number; judge: number; humanMath: number; judgeMath: number }> = [];
  const byId = new Map(EVAL_CASES.map((c) => [c.id, c]));
  const jobs = Object.keys(raters[0]).flatMap((id) => ["A", "B"].map((slot) => ({ id, slot })));
  await pool(jobs, 6, async ({ id, slot }) => {
    const c = byId.get(id)!;
    const png = path.join(dir, `${id}.${slot}.png`);
    const { v } = await judge(casePacket(c), png);
    if (!v) return;
    const human = mean(raters.map((r) => r[id][slot].overall));
    const humanMath = mean(raters.map((r) => r[id][slot].math));
    pairs.push({ id: `${id}.${slot}`, human, judge: v.overall, humanMath, judgeMath: v.math });
    console.log(`${id}.${slot} raters ${human.toFixed(1)} judge ${v.overall} · ${v.note}`);
  });
  const r = (xs: number[], ys: number[]) => {
    const mx = mean(xs), my = mean(ys);
    const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
    return num / Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0) * ys.reduce((a, y) => a + (y - my) ** 2, 0));
  };
  console.log(`\n${pairs.length} pictures · overall r = ${r(pairs.map((p) => p.human), pairs.map((p) => p.judge)).toFixed(2)} · math r = ${r(pairs.map((p) => p.humanMath), pairs.map((p) => p.judgeMath)).toFixed(2)} · mean raters ${mean(pairs.map((p) => p.human)).toFixed(2)} judge ${mean(pairs.map((p) => p.judge)).toFixed(2)}`);
  void results;
}

main();
