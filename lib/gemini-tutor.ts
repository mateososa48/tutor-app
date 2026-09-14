import { GeminiLiveSession } from "./gemini-live";
import { AudioCapture, AudioPlayer } from "./audio";
import type { LiveTutorCallbacks, LiveTutorStartOptions } from "./live-tutor";
import type { UploadedFile } from "./file-processor";

// Gemini Live behind the same surface as the GPT-Live client, so the session
// page does not care which one it is talking to. One model both talks and
// draws; the prompt and voice come from /api/live-token.

type GeminiConfig = { instructions: string; voice: string };

function describeStartFailure(status: number, detail: string): string {
  if (status === 401) return "Please sign in again to start a session.";
  let text = detail;
  try {
    const parsed = JSON.parse(detail) as { detail?: unknown; error?: unknown };
    if (typeof parsed.detail === "string") text = parsed.detail;
    else if (typeof parsed.error === "string") text = parsed.error;
  } catch {
    // plain text
  }
  if (/GEMINI_API_KEY|misconfigured|API key/i.test(text)) return "The tutor is not set up: the Gemini API key is missing or invalid.";
  if (/quota|billing|RESOURCE_EXHAUSTED|429/i.test(text)) return "The tutor is paused: the Gemini quota is used up. Try again later.";
  return "Couldn't reach your tutor. Check your internet connection and try again.";
}

export class GeminiTutorSession {
  private session: GeminiLiveSession | null = null;
  private capture: AudioCapture | null = null;
  private player: AudioPlayer | null = null;
  private meter: ReturnType<typeof setInterval> | null = null;
  private speaking = false;
  private muted = false;
  private ended = false;
  private turnText = "";
  private lastAudioAt = 0;

  constructor(private readonly callbacks: LiveTutorCallbacks) {}

  private debug(kind: string, message: string, payload?: Record<string, unknown>) {
    this.callbacks.onDebugEvent?.({ kind, message, payload });
  }

  private setSpeaking(next: boolean) {
    if (this.speaking === next) return;
    this.speaking = next;
    this.callbacks.onSpeakingChange(next);
    if (next) this.callbacks.onActivity("idle");
  }

  async start(opts: LiveTutorStartOptions): Promise<void> {
    this.debug("connection", "gemini_start", { mode: opts.mode, mic: Boolean(opts.micStream) });
    const res = await fetch("/api/live-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configOnly: true }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.debug("error", "gemini_config_failed", { status: res.status, detail: detail.slice(0, 300) });
      throw new Error(describeStartFailure(res.status, detail));
    }
    const config = (await res.json()) as GeminiConfig;
    if (this.ended) return;

    const player = new AudioPlayer();
    this.player = player;
    player.resume();
    this.callbacks.onAudioAnalyser?.(player.getAnalyser());

    const session = new GeminiLiveSession(
      {
        onAudio: (base64) => {
          player.enqueue(base64);
          this.lastAudioAt = Date.now();
          this.setSpeaking(true);
        },
        onTranscript: (entry) => {
          if (entry.role === "tutor") {
            this.turnText = this.turnText ? `${this.turnText} ${entry.text}` : entry.text;
            this.callbacks.onCaption(this.turnText);
          } else {
            this.turnText = "";
            this.callbacks.onActivity("thinking");
          }
          this.callbacks.onTranscript(entry);
        },
        onToolCall: (name, args) => {
          this.callbacks.onActivity("writing");
          const result = this.callbacks.onToolCall(name, args);
          setTimeout(() => {
            if (!this.ended && !this.speaking) this.callbacks.onActivity("idle");
          }, 1200);
          return result;
        },
        onConnected: () => {
          this.callbacks.onConnected({ resumed: opts.mode === "resume", expiresAt: null });
          const sent = opts.mode === "resume"
            ? session.sendResumeContext(opts.sessionTitle, opts.history, opts.files)
            : session.sendInitialGreeting(opts.files);
          this.debug("session", "opening_turn_sent", { sent, mode: opts.mode });
        },
        onDisconnected: () => {
          if (!this.ended) this.callbacks.onDisconnected("socket_closed");
        },
        onError: (message) => this.callbacks.onError(message),
        onInterrupted: () => {
          player.flush();
          this.turnText = "";
          this.callbacks.onCaption("");
          this.setSpeaking(false);
        },
        onDebugEvent: (event) => this.callbacks.onDebugEvent?.(event),
      },
      { systemInstruction: config.instructions, voiceName: config.voice },
    );
    this.session = session;

    if (opts.micStream) {
      const capture = new AudioCapture((base64) => {
        if (!this.muted) session.sendAudio(base64);
      }, 16000);
      this.capture = capture;
      await capture.start(opts.micStream);
    }

    // The player knows whether audio is still scheduled; that is the
    // "tutor speaking" signal, with a short tail so word gaps do not flicker.
    this.meter = setInterval(() => {
      const playing = player.isPlaying() || Date.now() - this.lastAudioAt < 220;
      this.setSpeaking(playing);
      if (!playing && this.turnText && Date.now() - this.lastAudioAt > 900) {
        this.turnText = "";
        this.callbacks.onCaption("");
      }
    }, 80);

    session.connect();
  }

  async end(): Promise<void> {
    this.ended = true;
    if (this.meter) clearInterval(this.meter);
    this.meter = null;
    this.capture?.stop();
    this.capture = null;
    this.session?.disconnect();
    this.session = null;
    this.player?.close();
    this.player = null;
    this.callbacks.onAudioAnalyser?.(null);
    if (this.speaking) {
      this.speaking = false;
      this.callbacks.onSpeakingChange(false);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.debug("audio", muted ? "mic_muted" : "mic_unmuted");
  }

  sendText(text: string): boolean {
    return this.session?.sendText(text) ?? false;
  }

  sendFiles(files: UploadedFile[]): boolean {
    return this.session?.sendFiles(files) ?? false;
  }
}
