// Arrow 2 (QuiverAI, through the Vercel AI Gateway) against today's
// illustrator, on the bake-off's 15 cases (Oct 19 2026, Mateo: "run the test
// with this model… quiverai/arrow-2"). Arrow 2 writes SVG itself; ours writes a
// scene that lib/illustration draws. Both get the same request the app sends
// (grade, the lesson, the board, what to draw, what to notice). Each case's two
// pictures go to blind raters in a random order.
//
// Arrow 2 is called through the gateway's Responses endpoint: chat completions
// stopped on "length" with no SVG (its hidden refinement counts as output).
//
//   npx tsx scripts/illustrate-arrow.ts [--label arrow1] [--effort low] [--cases a,b]

import fs from "node:fs";
import path from "node:path";
import { ILLUSTRATION_CASES, ILLUSTRATION_HELDOUT } from "./illustrate-cases";
import { guardLabels, illustratorPrompt } from "../lib/illustration/prompt";
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
const LABEL = opt("label", "arrow1");
const EFFORT = opt("effort", "low");
const ONLY = opt("cases", "");
const OUT = path.join(ROOT, "bench", "illustrate", LABEL);
fs.mkdirSync(OUT, { recursive: true });
const CASES = [...ILLUSTRATION_CASES, ...ILLUSTRATION_HELDOUT].filter((c) => !ONLY || ONLY.split(",").includes(c.id));

// What the picture should be, as our illustrator is told, minus the scene language.
const STYLE = `You draw one picture on a math tutor's shared whiteboard, in a live lesson with a student. The tutor is talking while you draw, so it must be right the first time.
- One idea, the one asked for. Nothing decorative.
- Quantities exactly as stated: count every object; equal parts are exactly equal.
- Words are labels of one to four words, never sentences.
- Never show a result the student has not said yet: no totals, no answers. Use "?" for the unknown.
- Readable on a phone: few labels, big enough objects. White background, landscape.`;

type Arm = { svg: string | null; ms: number; cost: number | null; outTokens?: number; error?: string };

async function arrow(user: string): Promise<Arm> {
  const t0 = Date.now();
  try {
    const r = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` },
      body: JSON.stringify({ model: "quiverai/arrow-2", instructions: STYLE, input: user, max_output_tokens: 32000, reasoning: { effort: EFFORT } }),
    });
    const ms = Date.now() - t0;
    const j = (await r.json()) as { output?: Array<{ type: string; content?: Array<{ text?: string }> }>; usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } }; error?: { message: string } };
    const text = (j.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("");
    const svg = /<svg[\s\S]*<\/svg>/.exec(text)?.[0] ?? null;
    const u = j.usage;
    // Gateway prices: $4/M in, $0.4/M cached in, $20/M out (models endpoint, Oct 19 2026).
    const cost = u ? ((u.input_tokens - (u.input_tokens_details?.cached_tokens ?? 0)) * 4 + (u.input_tokens_details?.cached_tokens ?? 0) * 0.4 + u.output_tokens * 20) / 1e6 : null;
    return { svg, ms, cost, outTokens: u?.output_tokens, error: svg ? undefined : j.error?.message ?? `no svg: ${text.slice(0, 120)}` };
  } catch (e) {
    return { svg: null, ms: Date.now() - t0, cost: null, error: String(e) };
  }
}

async function haiku(c: (typeof CASES)[number], user: string): Promise<Arm> {
  const t0 = Date.now();
  const reply = await callIllustrator("claude-haiku-5-5", user).catch(() => null);
  const ms = Date.now() - t0;
  const scene = reply ? parseScene(reply.text) : null;
  if (!scene) return { svg: null, ms, cost: null, error: "no scene" };
  const seen = [c.conversation.map((l) => l.text).join(" "), c.board, c.what, c.why].join(" ");
  return { svg: renderScene(guardLabels(scene, seen).scene).svg, ms, cost: callCost("claude-haiku-5-5", reply!.usage) };
}

/** A fixed per-case order, so the raters' letters are reproducible. */
const flip = (id: string) => [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 2 === 1;

async function main() {
  const rows: Array<{ id: string; arrow: Omit<Arm, "svg">; haiku: Omit<Arm, "svg">; aIs: "arrow" | "haiku" }> = [];
  for (let i = 0; i < CASES.length; i += 5) {
    await Promise.all(
      CASES.slice(i, i + 5).map(async (c) => {
        const user = illustratorPrompt({ grade: c.grade, what: c.what, notice: c.why, conversation: c.conversation, board: c.board });
        const [a, h] = await Promise.all([arrow(user), haiku(c, user)]);
        const aIs = flip(c.id) ? "arrow" : "haiku";
        const A = aIs === "arrow" ? a : h;
        const B = aIs === "arrow" ? h : a;
        if (A.svg) fs.writeFileSync(path.join(OUT, `${c.id}.A.svg`), A.svg);
        if (B.svg) fs.writeFileSync(path.join(OUT, `${c.id}.B.svg`), B.svg);
        if (a.svg) fs.writeFileSync(path.join(OUT, `${c.id}.arrow.svg`), a.svg);
        const convo = c.conversation.map((l) => `${l.who === "tutor" ? "Tutor" : "Student"}: ${l.text}`).join("\n");
        fs.writeFileSync(
          path.join(OUT, `${c.id}.md`),
          `# ${c.id} (${c.grade})\n\n${convo}\n\nOn the board: ${c.board}\n\nThe tutor says "let me draw that" and this is drawn while it talks.\nAsked for: ${c.what}\nThe student should notice: ${c.why}\nMust not show: ${c.withhold ?? "the answer"}\nA correct picture has: ${c.mustShow.join("; ")}\n\nPicture A: ${path.join(OUT, `${c.id}.A.png`)}\nPicture B: ${path.join(OUT, `${c.id}.B.png`)}\n`,
        );
        const strip = ({ svg, ...rest }: Arm) => rest;
        rows.push({ id: c.id, arrow: strip(a), haiku: strip(h), aIs });
        console.log(`${c.id.padEnd(12)} arrow ${String(a.ms).padStart(6)} ms ${a.cost != null ? `$${a.cost.toFixed(4)}` : "  -   "} ${a.outTokens ?? "-"} tok ${a.error ?? "ok"} · haiku ${h.ms} ms ${h.error ?? "ok"}`);
      }),
    );
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
  const ok = rows.filter((r) => !r.arrow.error);
  const ms = ok.map((r) => r.arrow.ms).sort((x, y) => x - y);
  const cost = ok.reduce((s, r) => s + (r.arrow.cost ?? 0), 0);
  console.log(`\narrow-2 (${EFFORT}): ${ok.length}/${rows.length} drew · median ${ms[Math.floor(ms.length / 2)]} ms · max ${ms.at(-1)} ms · total $${cost.toFixed(3)} · mean $${(cost / Math.max(1, ok.length)).toFixed(4)}`);
}
main();
