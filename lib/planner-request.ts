// One planner order, asked of the planner models (Oct 24 2026). /api/plan and
// the bench both call this, so the bench plans exactly as the app does (the
// bench had its own copy of the call, Gemini only).
//
// Claude Haiku 5.5 is tried first when ANTHROPIC_API_KEY is set: the flash-lite
// planners timed out on 9 of about 19 lines of Mateo's Oct 24 session (Google's
// free tier, the afternoon), and the orders that did come were the small
// questions the teaching review found wrong for a student with no way in.
// Without the key the Claude model fails at once and the hedge goes straight
// on to Gemini, so nothing changes for a deployment that lacks it.
//
// Server and scripts only: it reads the model keys from the environment.

import { hedged } from "./hedge";
import { PLANNER_SYSTEM, illustrationOf, parsePlannerOrder, plannerNote } from "./tutor-planner";

export const PLANNER_MODELS = (process.env.PLANNER_MODELS || "claude-haiku-5-5,gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map((s) => s.trim()).filter(Boolean);

export type Planned = { note: string; illustrate: { what: string; notice: string } | null; model: string; ms: number; failures: string[] };

type Opts = {
  models?: string[];
  system?: string;
  hedgeMs: number;
  deadlineMs: number;
  /** The Gemini key for a model ("model@KEY_NAME" specs in the bench resolve here). */
  geminiKey: (spec: string) => string | undefined;
};

async function ask(spec: string, system: string, prompt: string, signal: AbortSignal, geminiKey: Opts["geminiKey"]): Promise<string | null> {
  const model = spec.split("@")[0];
  if (model.startsWith("claude")) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error(`${model} no key`);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        output_config: { effort: "low" },
        thinking: { type: "disabled" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
      }),
      signal,
    });
    if (!r.ok) throw new Error(`${model} ${r.status}`);
    const j = (await r.json()) as { content?: Array<{ type: string; text?: string }> };
    return (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }
  const key = geminiKey(spec);
  if (!key) throw new Error(`${model} no key`);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 800, thinkingConfig: { thinkingLevel: "low" } },
    }),
    signal,
  });
  if (!r.ok) throw new Error(`${model} ${r.status}`);
  const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
  return j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
}

/** The first usable order, or null with why each model gave none (429, timeout, unusable…). */
export async function planReply(prompt: string, verdict: string | null, opts: Opts): Promise<Planned | { note: null; ms: number; failures: string[] }> {
  const started = Date.now();
  const failures: string[] = [];
  const asked = new Set<string>();
  const done = new Set<string>();
  const won = await hedged(
    opts.models ?? PLANNER_MODELS,
    async (spec, signal) => {
      asked.add(spec);
      try {
        const reply = await ask(spec, opts.system ?? PLANNER_SYSTEM, prompt, signal, opts.geminiKey);
        done.add(spec);
        const note = plannerNote(reply, verdict);
        if (!note) failures.push(`${spec} unusable`);
        return note ? { note, illustrate: illustrationOf(parsePlannerOrder(reply)?.board) } : null;
      } catch (err) {
        done.add(spec);
        if (!signal.aborted) failures.push(String((err as Error).message).slice(0, 80));
        return null;
      }
    },
    { hedgeMs: opts.hedgeMs, deadlineMs: opts.deadlineMs },
  );
  // A model still out when the deadline came is a timeout (Oct 11 2026).
  for (const m of asked) if (!done.has(m) && m !== won?.model) failures.push(`${m} timeout`);
  const ms = Date.now() - started;
  if (!won) return { note: null, ms, failures };
  return { ...won.value, model: won.model, ms, failures };
}
