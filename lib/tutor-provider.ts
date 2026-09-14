import type { LiveTutorSession } from "./live-tutor";

// Which live voice stack runs the session. GPT-Live (OpenAI) is the default;
// Gemini Live is the fallback that costs no OpenAI credits. Set
// NEXT_PUBLIC_TUTOR_PROVIDER=gemini in .env.local, or add ?provider=gemini to a
// session URL, to switch.
export type TutorProvider = "openai" | "gemini";

export function resolveTutorProvider(search: { get(name: string): string | null } | null): TutorProvider {
  const fromUrl = search?.get("provider");
  if (fromUrl === "gemini" || fromUrl === "openai") return fromUrl;
  return process.env.NEXT_PUBLIC_TUTOR_PROVIDER === "gemini" ? "gemini" : "openai";
}

// The surface the session page relies on. Both clients implement it.
export type TutorClient = Pick<LiveTutorSession, "start" | "end" | "setMuted" | "sendText" | "sendFiles">;
