import OpenAI from "openai";
import { SUMMARY_SCHEMA, SUMMARY_SYSTEM } from "./session-summary";

// The one place a model is called for a summary.
//
// Vercel's AI Gateway speaks the OpenAI API, so the SDK the GPT-Live path
// already depends on talks to it with nothing but a different base URL and
// key. With `AI_GATEWAY_API_KEY` set we go through the gateway (models are
// namespaced, `openai/gpt-5.6-luna`); without it we fall back to the plain
// OpenAI key, so this works before the gateway key exists.

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";

export type SummaryModelResult = { raw: unknown; model: string };

export function summaryModelName(): string {
  const configured = process.env.SESSION_SUMMARY_MODEL?.trim();
  if (configured) return configured;
  return process.env.AI_GATEWAY_API_KEY ? "openai/gpt-5.6-luna" : "gpt-5.6-luna";
}

export function summaryModelConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY);
}

function client(): OpenAI {
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (gatewayKey) return new OpenAI({ apiKey: gatewayKey, baseURL: GATEWAY_URL });
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("No AI_GATEWAY_API_KEY or OPENAI_API_KEY");
  return new OpenAI({ apiKey: key });
}

/**
 * One call, one JSON object back. The schema is enforced by the API, so what
 * comes back still goes through `parseSummary`: a model can satisfy a schema
 * and still hand back an empty headline.
 */
export async function generateSummary(prompt: string, signal?: AbortSignal): Promise<SummaryModelResult> {
  const model = summaryModelName();
  const completion = await client().chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "session_summary", strict: true, schema: SUMMARY_SCHEMA },
      },
      // Long enough for five short fields and nothing more.
      max_completion_tokens: 700,
    },
    { signal },
  );

  const text = completion.choices[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("The model returned nothing");
  try {
    return { raw: JSON.parse(text), model };
  } catch {
    throw new Error("The model's answer was not JSON");
  }
}
