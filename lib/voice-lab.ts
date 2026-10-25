// The voice lab (Oct 2026): which voice stack a session runs on, picked in the
// new-session window on preview builds, in development, or with ?lab=1.
// Mateo: "a window where i can pick which models i want… the new livekit
// thing, which models… and between gemini live and this universal 3.6".
//
// The choice travels as URL parameters into the session page (the intake keeps
// the query when it moves to /session/[id]), where resolveTutorProvider and the
// LiveKit client read it; the token route accepts only the values listed here.
// Pure.

export type LabEngine = "gemini" | "livekit";
export type LabLive = "3.8" | "3.1";
export type LabStt = "assemblyai" | "gemini";
export type LabTurns = "livekit" | "assemblyai";
/** How long a pause ends the student's turn: quick (0.5 s) or patient (about 0.9 s; kids pause mid-thought). */
export type LabWait = "patient" | "quick";

export type VoiceLab = {
  engine: LabEngine;
  /** Gemini Live */
  live: LabLive;
  planner: boolean;
  /** LiveKit */
  stt: LabStt;
  turns: LabTurns;
  wait: LabWait;
  brain: string;
  tts: string;
};

export const LAB_BRAINS: ReadonlyArray<{ id: string; label: string; note: string }> = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5", note: "fast, $0.10 / $0.50 per M" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", note: "slower, about 10x the price" },
];

export const LAB_VOICES: ReadonlyArray<{ id: string; label: string; note: string }> = [
  { id: "spacexai/grok-tts", label: "Grok TTS", note: "xAI, 0.5–1.6 s a sentence" },
  { id: "microsoft/mai-voice-2.1-flash", label: "MAI-Voice 2.1 Flash", note: "Microsoft, about 0.8 s" },
  { id: "microsoft/mai-voice-2.1", label: "MAI-Voice 2.1", note: "Microsoft, 1.5–3.9 s" },
  { id: "fish-audio/s2.1-pro", label: "Fish S2.1 Pro", note: "2–4.6 s a sentence" },
  { id: "google/gemini-3.8-flash-lite-tts", label: "Gemini 3.8 Flash-Lite TTS", note: "Google, about 3 s" },
];

export const DEFAULT_LAB: VoiceLab = {
  engine: "livekit",
  live: "3.8",
  planner: true,
  stt: "assemblyai",
  // AssemblyAI's own turn ending, patient: the only setup that heard "like... one half plus... one third" whole (Oct 24 2026).
  turns: "assemblyai",
  wait: "patient",
  brain: LAB_BRAINS[0].id,
  tts: LAB_VOICES[0].id,
};

const oneOf = <T extends string>(v: unknown, xs: readonly T[], fallback: T): T => (typeof v === "string" && (xs as readonly string[]).includes(v) ? (v as T) : fallback);

/** A stored or partial lab, made whole and safe. */
export function normalizeLab(raw: unknown): VoiceLab {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    engine: oneOf(r.engine, ["gemini", "livekit"] as const, DEFAULT_LAB.engine),
    live: oneOf(r.live, ["3.8", "3.1"] as const, DEFAULT_LAB.live),
    planner: typeof r.planner === "boolean" ? r.planner : DEFAULT_LAB.planner,
    stt: oneOf(r.stt, ["assemblyai", "gemini"] as const, DEFAULT_LAB.stt),
    turns: oneOf(r.turns, ["livekit", "assemblyai"] as const, DEFAULT_LAB.turns),
    wait: oneOf(r.wait, ["patient", "quick"] as const, DEFAULT_LAB.wait),
    brain: oneOf(r.brain, LAB_BRAINS.map((b) => b.id), DEFAULT_LAB.brain),
    tts: oneOf(r.tts, LAB_VOICES.map((v) => v.id), DEFAULT_LAB.tts),
  };
}

/** The lab's URL parameters (every lab key, so a stale one is overwritten). */
export function labParams(lab: VoiceLab): Record<string, string | null> {
  if (lab.engine === "gemini") {
    return { provider: "gemini", voice: null, live: lab.live, plan: lab.planner ? null : "0", stt: null, turns: null, wait: null, brain: null, tts: null };
  }
  return { provider: "livekit", voice: "livekit", live: null, plan: null, stt: lab.stt, turns: lab.stt === "assemblyai" ? lab.turns : "livekit", wait: lab.wait, brain: lab.brain, tts: lab.tts };
}

/** The lab as a short line ("LiveKit · AssemblyAI · Haiku 5.5 · Grok TTS"). */
export function labSummary(lab: VoiceLab): string {
  if (lab.engine === "gemini") return `Gemini Live ${lab.live}${lab.planner ? " + planner" : ""}`;
  const brain = LAB_BRAINS.find((b) => b.id === lab.brain)?.label ?? lab.brain;
  const voice = LAB_VOICES.find((v) => v.id === lab.tts)?.label ?? lab.tts;
  return `LiveKit · ${lab.stt === "assemblyai" ? "AssemblyAI" : "Gemini hearing"} · ${brain} · ${voice}`;
}

/** A lab already in the URL (a shared link, a test script) wins over the saved one. */
export function labFromQuery(q: { get(k: string): string | null }, fallback: VoiceLab): VoiceLab {
  const engine = q.get("voice") === "livekit" || q.get("provider") === "livekit" ? "livekit" : q.get("provider") === "gemini" ? "gemini" : null;
  if (!engine) return fallback;
  return normalizeLab({
    ...fallback,
    engine,
    ...(q.get("live") ? { live: q.get("live") } : {}),
    ...(q.get("plan") === "0" ? { planner: false } : {}),
    ...(q.get("stt") ? { stt: q.get("stt") } : {}),
    ...(q.get("turns") ? { turns: q.get("turns") } : {}),
    ...(q.get("wait") ? { wait: q.get("wait") } : {}),
    ...(q.get("brain") ? { brain: q.get("brain") } : {}),
    ...(q.get("tts") ? { tts: q.get("tts") } : {}),
  });
}

/** What the token route accepts from the browser for a LiveKit session. */
export function labFromRequest(body: Record<string, unknown>): { stt: LabStt | null; turns: LabTurns | null; wait: LabWait | null; brain: string | null; tts: string | null } {
  const pick = <T extends string>(v: unknown, xs: readonly T[]): T | null => (typeof v === "string" && (xs as readonly string[]).includes(v) ? (v as T) : null);
  return {
    stt: pick(body.stt, ["assemblyai", "gemini"] as const),
    turns: pick(body.turns, ["livekit", "assemblyai"] as const),
    wait: pick(body.wait, ["patient", "quick"] as const),
    brain: pick(body.brain, LAB_BRAINS.map((b) => b.id)),
    tts: typeof body.tts === "string" && (body.tts === "kokoro" || LAB_VOICES.some((v) => v.id === body.tts)) ? body.tts : null,
  };
}

/** The lab is offered on preview builds, in development, or with ?lab=1. */
export function labEnabled(search: { get(k: string): string | null } | null): boolean {
  if (search?.get("lab") === "1") return true;
  return process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
}
