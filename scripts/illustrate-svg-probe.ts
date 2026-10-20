// Speed and look of cheap models writing SVG directly (Oct 19 2026). Vendor
// throughput figures are not times on our kind of prompt, so this measures them:
// the same request each, told to draw each repeated object once in <defs> and
// copy it with <use> (fewer tokens, so faster).
//
//   npx tsx scripts/illustrate-svg-probe.ts [--label svgprobe] [--cases marbles,coins,thermometer] [--models a,b]

import fs from "node:fs";
import path from "node:path";
import { ILLUSTRATION_CASES, ILLUSTRATION_HELDOUT } from "./illustrate-cases";
import { illustratorPrompt } from "../lib/illustration/prompt";

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
const LABEL = opt("label", "svgprobe");
const CASE_IDS = opt("cases", "marbles,coins,thermometer").split(",");
const MODELS = opt("models", "inception/mercury-3,openai/gpt-6-luna,zai/glm-5.3-flash,claude-haiku-5-5").split(",");
const OUT = path.join(ROOT, "bench", "illustrate", LABEL);
fs.mkdirSync(OUT, { recursive: true });
const CASES = [...ILLUSTRATION_CASES, ...ILLUSTRATION_HELDOUT].filter((c) => CASE_IDS.includes(c.id));

const SYSTEM = `You draw one picture on a math tutor's shared whiteboard, in a live lesson. The tutor is talking while you draw, so it must be fast and right the first time.
- One idea, the one asked for. Flat, clean, white background, ink outlines #1d1d21, sky blue #3d9cff accents. Landscape, viewBox about 640 x 400.
- Quantities exactly as stated: count every object; equal parts are exactly equal.
- Words are labels of one to four words, font-family sans-serif, at least 16px. Never write anything the student said, and never an answer or total; "?" for the unknown.
- Draw each repeated object once inside <defs> and place copies with <use>. Keep the SVG short.
Reply with one <svg> element and nothing else.`;

type Result = { model: string; caseId: string; ms: number; outTokens: number | null; svg: boolean; error?: string };

async function call(model: string, user: string): Promise<{ text: string; outTokens: number | null }> {
  if (model.startsWith("claude")) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 6000, output_config: { effort: "low" }, thinking: { type: "disabled" }, system: SYSTEM, messages: [{ role: "user", content: user }] }),
    });
    const j = (await r.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { output_tokens: number }; error?: { message: string } };
    if (!r.ok) throw new Error(j.error?.message ?? String(r.status));
    return { text: (j.content ?? []).map((c) => c.text ?? "").join(""), outTokens: j.usage?.output_tokens ?? null };
  }
  const body: Record<string, unknown> = { model, max_tokens: 8000, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] };
  if (!model.startsWith("inception")) body.reasoning_effort = "low";
  const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { completion_tokens: number }; error?: { message: string } };
  if (!r.ok) throw new Error(j.error?.message ?? String(r.status));
  return { text: j.choices?.[0]?.message?.content ?? "", outTokens: j.usage?.completion_tokens ?? null };
}

async function main() {
  const results: Result[] = [];
  await Promise.all(
    MODELS.flatMap((model) =>
      CASES.map(async (c) => {
        const user = illustratorPrompt({ grade: c.grade, what: c.what, notice: c.why, conversation: c.conversation, board: c.board });
        const t0 = Date.now();
        try {
          const { text, outTokens } = await call(model, user);
          const ms = Date.now() - t0;
          const svg = /<svg[\s\S]*<\/svg>/.exec(text)?.[0];
          if (svg) fs.writeFileSync(path.join(OUT, `${c.id}.${model.split("/").pop()}.svg`), svg);
          results.push({ model, caseId: c.id, ms, outTokens, svg: Boolean(svg), error: svg ? undefined : text.slice(0, 100) });
        } catch (e) {
          results.push({ model, caseId: c.id, ms: Date.now() - t0, outTokens: null, svg: false, error: String(e).slice(0, 160) });
        }
      }),
    ),
  );
  for (const m of MODELS) {
    const rs = results.filter((r) => r.model === m);
    console.log(`${m.padEnd(22)} ${rs.map((r) => `${r.caseId} ${(r.ms / 1000).toFixed(1)}s ${r.outTokens ?? "?"}tok${r.svg ? "" : ` FAIL(${r.error})`}`).join(" · ")}`);
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
}
main();
