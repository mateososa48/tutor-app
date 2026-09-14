import type { LiveTutorSession } from "./live-tutor";

// Which live voice stack runs the session. While the OpenAI account is out of
// credits, Gemini Live is the in-code default; set NEXT_PUBLIC_TUTOR_PROVIDER=openai
// (locally or on Vercel) to make GPT-Live the default again, or add
// ?provider=openai|gemini to a session URL to switch for one tab.
export type TutorProvider = "openai" | "gemini";

export function resolveTutorProvider(search: { get(name: string): string | null } | null): TutorProvider {
  const fromUrl = search?.get("provider");
  if (fromUrl === "gemini" || fromUrl === "openai") return fromUrl;
  return process.env.NEXT_PUBLIC_TUTOR_PROVIDER === "openai" ? "openai" : "gemini";
}

// The surface the session page relies on. Both clients implement it.
export type TutorClient = Pick<LiveTutorSession, "start" | "end" | "setMuted" | "sendText" | "sendFiles"> & {
  /** Show the model the board as a picture (data URL). Only clients with vision implement it. */
  sendBoardFrame?: (dataUrl: string) => boolean;
};
