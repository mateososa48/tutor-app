import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { FAQ_SYSTEM, clampAnswer, cleanQuestion } from "@/lib/faq";

// The landing page's "ask anything" row: one question in, one short answer
// out, grounded only in lib/faq.ts. Public, because the landing page is.
//
// The model is gpt-6-luna through Vercel's AI Gateway (plain OpenAI without
// the gateway key), at low reasoning effort. Measured on Sept 22: 1.1 to 2.6 s
// a question, about 900 tokens in and 35 out, so roughly $0.0001 a question.
// The cheapest model on the gateway would save a fraction of a cent per
// thousand questions and answer worse. `FAQ_MODEL` overrides it.
//
// Limits are per server instance and in memory: good enough to stop one page
// from being scripted into a bill, not a quota. A real one needs a store.

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";
const PER_MINUTE = 8;
const PER_DAY = 60;
/** Every visitor together, per instance, per hour: the ceiling on spend. */
const ALL_PER_HOUR = 1500;

const hits = new Map<string, number[]>();
let recent: number[] = [];

function limited(ip: string, now: number): boolean {
  const day = now - 86_400_000;
  const mine = (hits.get(ip) ?? []).filter((t) => t > day);
  recent = recent.filter((t) => t > now - 3_600_000);
  const lastMinute = mine.filter((t) => t > now - 60_000).length;
  if (lastMinute >= PER_MINUTE || mine.length >= PER_DAY || recent.length >= ALL_PER_HOUR) return true;
  mine.push(now);
  recent.push(now);
  hits.set(ip, mine);
  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) for (const key of [...hits.keys()].slice(0, 1000)) hits.delete(key);
  return false;
}

function client(): { ai: OpenAI; model: string } | null {
  const gateway = process.env.AI_GATEWAY_API_KEY?.trim();
  const override = process.env.FAQ_MODEL?.trim();
  if (gateway) return { ai: new OpenAI({ apiKey: gateway, baseURL: GATEWAY_URL }), model: override || "openai/gpt-6-luna" };
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) return { ai: new OpenAI({ apiKey: key }), model: override || "gpt-6-luna" };
  return null;
}

// Said in the pet's own voice, since the page shows it in the bubble.
const BUSY = "I'm getting a lot of questions right now. Give me a minute and ask again.";
const BROKEN = "I couldn't answer that just now. Try again in a moment.";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
  const question = cleanQuestion(body?.question);
  if (!question) return NextResponse.json({ error: "Ask a question up to 200 characters long." }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (limited(ip, Date.now())) return NextResponse.json({ error: BUSY }, { status: 429 });

  const c = client();
  if (!c) return NextResponse.json({ error: BROKEN }, { status: 503 });

  try {
    const completion = await c.ai.chat.completions.create(
      {
        model: c.model,
        messages: [
          { role: "system", content: FAQ_SYSTEM },
          { role: "user", content: question },
        ],
        // Reasoning counts against this; at low effort Luna spent none on the
        // probe questions, and the answers are about 35 tokens.
        max_completion_tokens: 600,
        reasoning_effort: "low",
      },
      { signal: AbortSignal.timeout(15_000) },
    );
    const text = completion.choices[0]?.message?.content ?? "";
    const answer = clampAnswer(text);
    if (!answer) return NextResponse.json({ error: BROKEN }, { status: 502 });
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[faq] model call failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: BROKEN }, { status: 502 });
  }
}
