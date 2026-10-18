// When does the planner order a picture? (Oct 17 2026.) The illustration's
// value depends less on how it is drawn than on whether it is asked for at the
// right moment, for the right reason. This runs the real planner prompt on
// moments where a picture of real things is the expert move (the bake-off and
// held-out cases, at the moment of the student's wrong answer) and on moments
// where it is not (a step in algebra, a right answer, a graph, a student who
// only wants a check), several times each, and prints how often it chose
// illustrate and what it asked to draw.
//
//   npx tsx scripts/illustrate-decide.ts [--runs 3] [--model gemini-3.5-flash-lite@GEMINI_API_KEY_2] [--out bench/illustrate/decide.json]

import fs from "node:fs";
import path from "node:path";
import { ILLUSTRATION_CASES, ILLUSTRATION_HELDOUT } from "./illustrate-cases";
import { PLANNER_SYSTEM, illustrationOf, parsePlannerOrder, plannerPrompt, type PlannerTurn } from "../lib/tutor-planner";
import { callCost, callIllustrator } from "../lib/illustration/model";
import { guardLabels, illustratorPrompt } from "../lib/illustration/prompt";
import { parseScene, renderScene } from "../lib/illustration/scene";

const ROOT = path.resolve(__dirname, "..");
const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const args = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const RUNS = Number(opt("runs", "3"));
const MODELS = opt("model", "gemini-3.5-flash-lite@GEMINI_API_KEY_2,gemini-3.5-flash-lite@GEMINI_API_KEY").split(",");
const OUT = path.join(ROOT, opt("out", "bench/illustrate/decide.json"));
const SYSTEM_FILE = opt("system", "");
const SYSTEM = SYSTEM_FILE ? fs.readFileSync(SYSTEM_FILE, "utf8") : PLANNER_SYSTEM;
// --draw DIR: every picture the planner orders is drawn the way the app draws
// it (Haiku, the production prompt, the label guard, the engine) and written as
// a packet for blind raters: the moment, the planner's words, the picture.
const DRAW = opt("draw", "");
// --from FILE: the decisions of an earlier run (its --out), drawn again without asking the planner.
const FROM = opt("from", "");
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

type Moment = { id: string; should: boolean; grade: string; topic: string; turns: PlannerTurn[]; line: string; board: string; verdict?: string };

// Where a case ends on a bare answer, the expert move is first to ask how they
// got it (the planner's rule 1). These add that exchange, so the moment is the
// one where the reasoning is out and a picture can show where it breaks.
const REASONS: Record<string, string> = {
  marbles: "idk i just guessed 9 cuz 12 take away 3",
  discount: "25% is 25 so 25 dollars off, so 15",
  balance: "i thought you divide first cuz the 3 is stuck to the x",
  trip: "it goes 150 miles so it's 150",
  bag: "3 red and 5 blue so 3 out of 5",
  bundles: "3 plus 4 is 7",
  thermometer: "it's -3 and 8 more so -11",
  chairs: "6 plus 8",
};

/** A case's conversation as the planner sees it: earlier exchanges as turns, the student's last line as the new line. */
function fromCase(c: (typeof ILLUSTRATION_CASES)[number]): Moment {
  const lines = REASONS[c.id]
    ? [...c.conversation, { who: "tutor" as const, text: "How did you get that?" }, { who: "student" as const, text: REASONS[c.id] }]
    : c.conversation;
  const last = lines.at(-1)!;
  const turns: PlannerTurn[] = [];
  let student = "";
  for (const l of lines.slice(0, -1)) {
    if (l.who === "student") student = l.text;
    else {
      turns.push({ student, tutor: l.text, tools: [] });
      student = "";
    }
  }
  return { id: c.id, should: true, grade: c.grade, topic: c.id, turns, line: last.text, board: c.board };
}

// Moments where a picture of real things is the wrong move: the expert asks,
// writes a step, checks, or uses a graph or number line.
const AGAINST: Moment[] = [
  { id: "two-step", should: false, grade: "8th grade", topic: "solving equations", turns: [{ student: "", tutor: "Solve 3x + 5 = 20. What would you do first?", tools: [] }], line: "subtract 5 from both sides so 3x = 15", board: 'b1 heading "Solving"; b2 equation line "3x + 5 = 20"' },
  { id: "right-fraction", should: false, grade: "5th grade", topic: "adding fractions", turns: [{ student: "", tutor: "What is one half plus one fourth?", tools: [] }], line: "3/4", board: 'b1 heading "Adding fractions"; b2 equation line "1/2 + 1/4 = ?"', verdict: "[Answer check, not from the student: \"3/4\" → correct.]" },
  { id: "slope", should: false, grade: "9th grade", topic: "slope", turns: [{ student: "", tutor: "The line goes through (1, 2) and (3, 8). What's its slope?", tools: [] }], line: "is it 2?", board: 'b1 heading "Slope"; b2 graph of the two points' },
  { id: "quadratic", should: false, grade: "10th grade", topic: "quadratic formula", turns: [{ student: "", tutor: "For x² − 3x − 4 = 0, what are a, b and c?", tools: [] }], line: "a is 1, b is 3, c is 4", board: 'b1 heading "Quadratic formula"; b2 equation line "x^2 - 3x - 4 = 0"' },
  { id: "just-check", should: false, grade: "7th grade", topic: "integers", turns: [{ student: "", tutor: "Want to try the next one on your sheet?", tools: [] }], line: "can you just check if -12 + 5 is -7", board: 'b1 heading "Integers"; b2 equation line "-12 + 5 = ?"' },
  { id: "derivative", should: false, grade: "12th grade", topic: "derivatives", turns: [{ student: "", tutor: "What's the derivative of x³?", tools: [] }], line: "3x?", board: 'b1 heading "Power rule"; b2 equation line "d/dx x^3 = ?"' },
  { id: "rule-words", should: false, grade: "6th grade", topic: "ratios", turns: [{ student: "2 cups make 12 cookies, so 5 cups make 15", tutor: "If 0 cups made 3 cookies, would that make sense?", tools: [] }, { student: "no", tutor: "So how many cookies does one cup make?", tools: [] }], line: "6", board: 'b1 heading "Cookies"; b2 a picture of 2 cups and 12 cookies', verdict: "[Answer check, not from the student: \"6\" → correct.]" },
  { id: "percent-done", should: false, grade: "7th grade", topic: "percent", turns: [{ student: "", tutor: "What's 10% of 80?", tools: [] }], line: "8 because you move the decimal", board: 'b1 heading "Percent"; b2 equation line "10% of 80 = ?"', verdict: "[Answer check, not from the student: \"8\" → correct.]" },
];

const MOMENTS: Moment[] = [...ILLUSTRATION_CASES.map(fromCase), ...ILLUSTRATION_HELDOUT.map(fromCase), ...AGAINST];

let turn = 0;
async function plan(m: Moment): Promise<{ reply: string; ms: number } | null> {
  const prompt = plannerPrompt({ grade: m.grade, topic: m.topic, turns: m.turns, line: m.line, verdict: m.verdict ?? null, board: m.board, state: null, reminders: null });
  for (let attempt = 0; attempt < 4; attempt++) {
    const [model, keyName] = MODELS[turn++ % MODELS.length].split("@");
    const t0 = Date.now();
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env[keyName ?? "GEMINI_API_KEY"] },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800, thinkingConfig: { thinkingLevel: "low" } } }),
    });
    if (!r.ok) {
      await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
      continue;
    }
    const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
    return { reply: j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "", ms: Date.now() - t0 };
  }
  return null;
}

const packets: Array<{ id: string; ms: number; cost: number | null; withheld: string[]; problems: string[]; error?: string }> = [];

async function drawPacket(m: Moment, run: number, say: string, pic: { what: string; notice: string }) {
  const id = `${m.id}-r${run}`;
  const conversation = [...m.turns.flatMap((t) => [...(t.student ? [{ who: "student" as const, text: t.student }] : []), { who: "tutor" as const, text: t.tutor }]), { who: "student" as const, text: m.line }];
  const t0 = Date.now();
  const reply = await callIllustrator("claude-haiku-5-5", illustratorPrompt({ grade: m.grade, what: pic.what, notice: pic.notice, conversation, board: m.board })).catch((e) => ({ text: "", error: String(e) }));
  const ms = Date.now() - t0;
  const scene = reply ? parseScene(reply.text) : null;
  const dir = path.join(ROOT, DRAW);
  fs.mkdirSync(dir, { recursive: true });
  if (!scene) {
    packets.push({ id, ms, cost: null, withheld: [], problems: [], error: "no scene" });
    return;
  }
  const guarded = guardLabels(scene, [conversation.map((l) => l.text).join(" "), m.board, pic.what, pic.notice].join(" "));
  const out = renderScene(guarded.scene);
  fs.writeFileSync(path.join(dir, `${id}.svg`), out.svg);
  fs.writeFileSync(path.join(dir, `${id}.scene.json`), JSON.stringify(guarded.scene));
  packets.push({ id, ms, cost: callCost("claude-haiku-5-5", (reply as { usage?: Record<string, unknown> }).usage), withheld: guarded.withheld, problems: out.problems });
  const lesson = conversation.slice(0, -1).map((l) => `${l.who === "tutor" ? "Tutor" : "Student"}: ${l.text}`).join("\n");
  fs.writeFileSync(
    path.join(dir, `${id}.md`),
    [
      `# Picture ${id}`,
      `Student: ${m.grade}.`,
      "",
      "## The lesson so far",
      lesson || "(start)",
      `On the board: ${m.board}`,
      "",
      "## This moment",
      `Student: ${m.line}`,
      `The tutor says: "${say}"`,
      `While it talks, this picture is drawn on the board (asked for: ${pic.what}; to notice: ${pic.notice || "-"}).`,
      "",
      `## The picture`,
      `Look at the image file: ${path.join(dir, `${id}.png`)}`,
    ].join("\n"),
  );
}

async function redraw() {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, FROM), "utf8")) as Array<{ id: string; run: number; say: string | null; picture: { what: string; notice: string } | null }>;
  const todo = rows.filter((r) => r.picture && r.say);
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map((r) => drawPacket(MOMENTS.find((m) => m.id === r.id)!, r.run, r.say!, r.picture!)));
  }
  fs.writeFileSync(path.join(ROOT, DRAW, "packets.json"), JSON.stringify(packets, null, 2));
  const ms = packets.filter((p) => !p.error).map((p) => p.ms).sort((a, b) => a - b);
  console.log(`drew ${ms.length}/${packets.length} · p50 ${ms[Math.floor(ms.length / 2)]} ms · max ${ms.at(-1)} ms · guard hits ${packets.filter((p) => p.withheld.length).length} (${packets.flatMap((p) => p.withheld).join(", ")}) · engine problems ${packets.filter((p) => p.problems.length).length}`);
}

async function main() {
  if (FROM && DRAW) return redraw();
  const rows: Array<{ id: string; should: boolean; run: number; say: string | null; board: string | null; picture: { what: string; notice: string } | null }> = [];
  for (let run = 1; run <= RUNS; run++) {
    for (let i = 0; i < MOMENTS.length; i += 4) {
      const batch = await Promise.all(MOMENTS.slice(i, i + 4).map(async (m) => ({ m, r: await plan(m) })));
      for (const { m, r } of batch) {
        const order = parsePlannerOrder(r?.reply);
        const picture = illustrationOf(order?.board);
        if (DRAW && picture && order) await drawPacket(m, run, order.say, picture);
        rows.push({ id: m.id, should: m.should, run, say: order?.say ?? null, board: order?.board ?? null, picture });
        console.log(`${m.should ? "DRAW" : "skip"} ${m.id.padEnd(14)} r${run} ${picture ? "→ illustrate" : `→ ${order?.board?.split("(")[0] ?? "(words only)"}`}${picture ? `: ${picture.what.slice(0, 90)}` : ""}`);
      }
    }
  }
  const rate = (should: boolean) => {
    const r = rows.filter((x) => x.should === should);
    return `${r.filter((x) => x.picture).length}/${r.length}`;
  };
  const DRAWS = /^(?:illustrate|draw_fraction|add_number_line|draw_grid|draw_tape_diagram|add_table|draw_desmos|draw_figure|draw_icons)\b/;
  const drew = (should: boolean) => {
    const r = rows.filter((x) => x.should === should);
    return `${r.filter((x) => x.board && DRAWS.test(x.board)).length}/${r.length}`;
  };
  console.log(`\nillustrate chosen where a picture helps: ${rate(true)} · where it does not: ${rate(false)}`);
  console.log(`any picture move where a picture helps: ${drew(true)} · where it does not: ${drew(false)}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
  if (DRAW) {
    fs.writeFileSync(path.join(ROOT, DRAW, "packets.json"), JSON.stringify(packets, null, 2));
    const ms = packets.filter((p) => !p.error).map((p) => p.ms).sort((a, b) => a - b);
    console.log(`drew ${ms.length}/${packets.length} · p50 ${ms[Math.floor(ms.length / 2)]} ms · max ${ms.at(-1)} ms · guard hits ${packets.filter((p) => p.withheld.length).length} · engine problems ${packets.filter((p) => p.problems.length).length}`);
  }
}
main();
