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
  /** Show the model the board as a picture (data URL). */
  sendBoardFrame?: (dataUrl: string) => boolean;
  /**
   * "auto": a frame after every drawing is cheap (Gemini video input).
   * "on-demand": frames pile up in the conversation (GPT-Live backend items),
   * so only look_at_board sends one.
   */
  boardFrames?: "auto" | "on-demand";
  /**
   * Playback speed of the tutor's voice (0.9 = 10% slower, pitch kept).
   * Gemini only: its audio is PCM we play ourselves. GPT-Live's arrives as a
   * live WebRTC track, which cannot be slowed without piling up delay.
   */
  setSpeechRate?: (rate: number) => void;
  /** Show the model a picture it asked for (a worksheet page), as a data URL. */
  sendImageFrame?: (dataUrl: string, caption?: string) => boolean;
  /** Something the student did that is not speech; it gets an answer, so send it when nobody is talking. */
  sendStudentEvent?: (text: string) => boolean;
};
