// Shared types for the live tutor session. Kept dependency-free so both the
// browser client (lib/live-tutor.ts) and server/tool modules can import them
// without pulling in WebRTC code.

export type TranscriptEntry = {
  role: "tutor" | "student";
  text: string;
  id: string;
  at?: number;
  /** A raw fragment that carries its own spacing: join it without adding spaces. */
  spaced?: boolean;
};

export type ToolCallResult =
  | { success: true; message?: string }
  | { success: false; error: string };

// What the tutor is doing right now, derived from Live events. Drives the
// small status line in the sidebar ("Thinking…", "Writing on the board…").
export type TutorActivity = "idle" | "thinking" | "writing";

export type LiveDebugEvent = {
  kind: string;
  message: string;
  payload?: Record<string, unknown>;
};
