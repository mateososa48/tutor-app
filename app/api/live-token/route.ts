import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { auth } from "@/lib/auth";

// Mints a short-lived ephemeral token so the browser can open a Gemini Live
// WebSocket without ever seeing the real API key. One token per connection;
// reconnects fetch a fresh one.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[live-token] GEMINI_API_KEY is not set");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  try {
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      },
    });
    return NextResponse.json({ token: token.name });
  } catch (err) {
    console.error("[live-token] mint failed:", err);
    return NextResponse.json({ error: "token_mint_failed" }, { status: 502 });
  }
}
