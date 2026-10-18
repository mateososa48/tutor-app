// The illustrator's model call (server only: it reads API keys).
//
// Claude through the Messages API, per Anthropic's docs as read on Oct 15
// 2026 (platform.claude.com), not from memory: `claude-haiku-5-5`,
// `output_config.effort` low, thinking disabled (allowed at low on Haiku 5.5;
// on by default it counts toward max_tokens and adds time), no
// temperature/top_p/top_k (a 400 on these models), and the system prompt cached
// (Haiku 5.5 caches from 512 tokens; ours is about 2.5k). Gemini is the
// fallback model, called the way /api/plan calls it.

import { ILLUSTRATOR_SYSTEM } from "./prompt";

export type ModelReply = { text: string; usage?: Record<string, unknown> };

/** Dollars a million tokens, from the providers' pricing pages (Oct 15 2026). */
const PRICES: Record<string, { in: number; out: number; cacheRead?: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01 },
  "gemini-3.8-flash": { in: 0.75, out: 3.75 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
};

/** The cost of one call in dollars, from its usage, or null when the model is unpriced. */
export function callCost(model: string, usage: Record<string, unknown> | undefined): number | null {
  const p = PRICES[model];
  if (!p || !usage) return null;
  const n = (k: string) => (typeof usage[k] === "number" ? (usage[k] as number) : 0);
  if (model.startsWith("claude")) {
    const cacheWrite = n("cache_creation_input_tokens") * p.in * 1.25;
    return (n("input_tokens") * p.in + cacheWrite + n("cache_read_input_tokens") * (p.cacheRead ?? p.in) + n("output_tokens") * p.out) / 1e6;
  }
  return (n("promptTokenCount") * p.in + (n("candidatesTokenCount") + n("thoughtsTokenCount")) * p.out) / 1e6;
}

export async function callIllustrator(model: string, user: string, signal?: AbortSignal): Promise<ModelReply | null> {
  if (model.startsWith("claude")) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        output_config: { effort: "low" },
        thinking: { type: "disabled" },
        system: [{ type: "text", text: ILLUSTRATOR_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      }),
      signal,
    });
    if (!r.ok) throw new Error(`${model} ${r.status}`);
    const j = (await r.json()) as { content?: Array<{ type: string; text?: string }>; usage?: Record<string, unknown>; stop_reason?: string };
    if (j.stop_reason === "refusal") throw new Error(`${model} refusal`);
    return { text: (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join(""), usage: j.usage };
  }
  const key = process.env.PLANNER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: ILLUSTRATOR_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 3000, thinkingConfig: { thinkingLevel: "low" } },
    }),
    signal,
  });
  if (!r.ok) throw new Error(`${model} ${r.status}`);
  const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>; usageMetadata?: Record<string, unknown> };
  return { text: j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "", usage: j.usageMetadata };
}
