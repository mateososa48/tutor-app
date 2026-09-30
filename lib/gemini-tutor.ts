import type { LiveVadConfig } from "./live-tool-behavior";
import { DEFAULT_LIVE_MODEL, GeminiLiveSession } from "./gemini-live";
import { joinTranscript } from "./live-events";
import { AudioCapture, AudioPlayer, quietFrame } from "./audio";
import type { LiveTutorCallbacks, LiveTutorStartOptions } from "./live-tutor";
import type { UploadedFile } from "./file-processor";
import { clearActiveIntake, getActiveIntake, intakeOpeningMessage } from "./session-intake";
import { DEFAULT_TUTOR_SPEED, tutorSpeedRate } from "./voice-settings";
import { TutorRuntime } from "./tutor-runtime";

// Gemini Live behind the same surface as the GPT-Live client, so the session
// page does not care which one it is talking to. One model both talks and
// draws; the prompt and voice come from /api/live-token.

// `grade` is the profile's, for the planner (lib/tutor-planner reads it).
type GeminiConfig = { instructions: string; voice: string; grade?: string };

// Gemini sends a turn's audio and its transcript faster than real time, so
// the caption is revealed in step with playback instead of all at once.
function pcmMs(base64: string): number {
  const pad = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - pad;
  return bytes / 48; // 16-bit mono at 24 kHz: 48 bytes per millisecond
}

function revealByFraction(text: string, frac: number): string {
  if (!text) return "";
  if (frac >= 0.995) return text;
  let n = Math.floor(text.length * frac);
  if (n <= 0) return "";
  const space = text.indexOf(" ", n);
  n = space === -1 ? text.length : space;
  return text.slice(0, n);
}

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
  private micMeter: ReturnType<typeof setInterval> | null = null;
  private player: AudioPlayer | null = null;
  private meter: ReturnType<typeof setInterval> | null = null;
  private speaking = false;
  private muted = false;
  private ended = false;
  private turnText = "";
  private turnAudioMs = 0;
  private turnDone = false;
  private shownCaption = "";
  private lastAudioAt = 0;
  private turnIndex = 0;
  // The turn the shown caption belongs to: within a turn it only grows.
  private captionTurn = -1;
  // While the student talks the pet listens; a moment after they stop, it thinks.
  private thinkTimer: ReturnType<typeof setTimeout> | null = null;
  private cutTimer: ReturnType<typeof setTimeout> | null = null;
  private speechRate = tutorSpeedRate(DEFAULT_TUTOR_SPEED);

  readonly boardFrames = "auto" as const;

  constructor(private readonly callbacks: LiveTutorCallbacks, private readonly options: { model?: string; runtime?: TutorRuntime; asyncTools?: boolean; vad?: LiveVadConfig; coach?: { topic: () => string; board: () => string }; planner?: { topic: () => string; board: () => string; grade: () => string } } = {}) {}

  /** The Live model this session runs, for the recording and the QA chip. */
  get model(): string {
    return this.options.model?.trim() || DEFAULT_LIVE_MODEL;
  }

  private debug(kind: string, message: string, payload?: Record<string, unknown>) {
    this.callbacks.onDebugEvent?.({ kind, message, payload });
  }

  private resetTurn() {
    if (this.turnText || this.turnAudioMs) this.turnIndex += 1;
    this.turnText = "";
    this.turnAudioMs = 0;
    this.turnDone = false;
  }

  // The first audio or text after a completed turn starts the next one.
  private beginTurnIfNeeded() {
    if (this.turnDone) this.resetTurn();
  }

  private clearThinkTimer() {
    if (this.thinkTimer) clearTimeout(this.thinkTimer);
    this.thinkTimer = null;
  }

  private showCaption(text: string) {
    if (this.cutTimer) {
      clearTimeout(this.cutTimer);
      this.cutTimer = null;
    }
    if (text === this.shownCaption) return;
    this.shownCaption = text;
    this.callbacks.onCaption(text);
  }

  private setSpeaking(next: boolean) {
    if (this.speaking === next) return;
    this.speaking = next;
    this.callbacks.onSpeakingChange(next);
    if (next) this.callbacks.onActivity("idle");
  }

  /** The planner option with the grade from the profile when the page has none. */
  private planner(config: GeminiConfig) {
    const planner = this.options.planner;
    if (!planner) return undefined;
    return { ...planner, grade: () => planner.grade() || config.grade || "" };
  }

  async start(opts: LiveTutorStartOptions): Promise<void> {
    this.debug("connection", "gemini_start", { mode: opts.mode, mic: Boolean(opts.micStream) });
    // What the student answered before the session opened (lib/session-intake):
    // it sets the language and the opening context in the prompt.
    const active = opts.mode === "resume" ? null : getActiveIntake();
    const res = await fetch("/api/live-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configOnly: true, intake: active?.intake, fileCount: active?.fileCount ?? opts.files.length, nextMove: Boolean(this.options.planner) }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.debug("error", "gemini_config_failed", { status: res.status, detail: detail.slice(0, 300) });
      throw new Error(describeStartFailure(res.status, detail));
    }
    const config = (await res.json()) as GeminiConfig;
    if (this.ended) return;

    const player = new AudioPlayer({ rate: this.speechRate });
    this.player = player;
    player.resume();
    this.callbacks.onAudioAnalyser?.(player.getAnalyser());

    const session = new GeminiLiveSession(
      {
        onAudio: (base64) => {
          this.beginTurnIfNeeded();
          this.clearThinkTimer();
          // Mid-turn, a speaker that already ran dry is an audible stall.
          if (this.turnAudioMs > 0) {
            const dry = player.starvedMs();
            if (dry > 60) this.debug("audio", "audio_underrun", { gapMs: Math.round(dry), turn: this.turnIndex });
          }
          player.enqueue(base64);
          this.turnAudioMs += pcmMs(base64);
          this.lastAudioAt = Date.now();
          this.setSpeaking(true);
        },
        onTranscript: (entry) => {
          if (entry.role === "tutor") {
            this.beginTurnIfNeeded();
            this.turnText = joinTranscript(this.turnText, entry.text, entry.spaced);
          } else {
            this.resetTurn();
            this.showCaption("");
            // Listening while the words arrive; thinking once they stop.
            this.callbacks.onActivity("idle");
            this.clearThinkTimer();
            this.thinkTimer = setTimeout(() => {
              this.thinkTimer = null;
              if (!this.ended && !this.speaking) this.callbacks.onActivity("thinking");
            }, 700);
          }
          this.callbacks.onTranscript(entry);
        },
        onToolCall: (name, args, callId) => {
          this.callbacks.onActivity("writing");
          const result = this.callbacks.onToolCall(name, args, callId);
          setTimeout(() => {
            if (!this.ended && !this.speaking) this.callbacks.onActivity("idle");
          }, 1200);
          return result;
        },
        onToolCancelled: (callIds) => this.callbacks.onToolCancelled?.(callIds),
        onConnected: () => {
          this.callbacks.onConnected({ resumed: opts.mode === "resume", expiresAt: null });
          const sent = opts.mode === "resume"
            ? session.sendResumeContext(opts.sessionTitle, opts.history, opts.files)
            : active
              ? session.sendOpening(intakeOpeningMessage(active.intake, opts.files.length), opts.files)
              : session.sendInitialGreeting(opts.files);
          this.debug("session", "opening_turn_sent", { sent, mode: opts.mode, fromIntake: Boolean(active) });
          if (active) clearActiveIntake();
        },
        onDisconnected: () => {
          if (!this.ended) this.callbacks.onDisconnected("socket_closed");
        },
        onError: (message) => this.callbacks.onError(message),
        onInterrupted: () => {
          player.flush();
          // The bubble stops on the last words the student heard, with a dash,
          // then clears (or sooner, when the student's words arrive).
          const heard = this.shownCaption.trim();
          this.resetTurn();
          this.showCaption(heard ? `${heard.replace(/[\s,;:.!?—-]+$/u, "")} —` : "");
          if (heard) {
            this.cutTimer = setTimeout(() => {
              this.cutTimer = null;
              this.showCaption("");
            }, 1200);
          }
          this.setSpeaking(false);
        },
        onTurnComplete: () => {
          this.turnDone = true;
        },
        onDebugEvent: (event) => this.callbacks.onDebugEvent?.(event),
      },
      { systemInstruction: config.instructions, voiceName: config.voice, model: this.model, runtime: this.options.runtime, asyncTools: this.options.asyncTools, vad: this.options.vad, coach: this.options.coach, planner: this.planner(config) },
    );
    this.session = session;

    if (opts.micStream) {
      const capture = new AudioCapture((base64, rate) => {
        // Muted: the same length of a quiet room, never nothing (quietFrame).
        session.sendAudio(this.muted ? quietFrame(Math.floor((base64.length * 3) / 8)) : base64, rate);
      }, 16000);
      this.capture = capture;
      await capture.start(opts.micStream);
      const first = capture.level();
      this.debug("audio", "mic_started", { device: capture.deviceLabel().slice(0, 60), context: first.context, track: first.track });
      // What the mic actually sent, every 15 s: the only way to tell "the
      // student said nothing" from "their voice never left the browser".
      this.micMeter = setInterval(() => {
        const level = this.capture?.level();
        if (level) this.debug("audio", "mic_level", { ...level, muted: this.muted });
      }, 15_000);
    }

    // The player knows whether audio is still scheduled; that is the
    // "tutor speaking" signal, with a short tail so word gaps do not flicker.
    this.meter = setInterval(() => {
      const playing = player.isPlaying() || Date.now() - this.lastAudioAt < 220;
      this.setSpeaking(playing);
      // Caption follows the audio: reveal the turn's text in proportion to
      // how much of the turn's audio has actually played, counted in the
      // original audio's time so a slowed voice keeps its caption in step.
      // The page decides how long the finished caption lingers.
      if (this.turnText) {
        const played = Math.max(0, this.turnAudioMs - player.getPendingSourceMs());
        const frac = this.turnAudioMs > 0 ? Math.min(1, played / this.turnAudioMs) : 0;
        const next = revealByFraction(this.turnText, frac);
        // Audio can arrive ahead of its words for a tick, which drops the
        // fraction: never take words back within a turn (the bubble would
        // read it as a new line).
        const shrinks = this.captionTurn === this.turnIndex && next.length < this.shownCaption.length && this.shownCaption.startsWith(next);
        if (!shrinks) {
          this.captionTurn = this.turnIndex;
          this.showCaption(next);
        }
      }
    }, 80);

    session.connect();
  }

  async end(): Promise<void> {
    this.ended = true;
    this.clearThinkTimer();
    if (this.cutTimer) clearTimeout(this.cutTimer);
    this.cutTimer = null;
    if (this.meter) clearInterval(this.meter);
    this.meter = null;
    if (this.micMeter) clearInterval(this.micMeter);
    this.micMeter = null;
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

  // Playback speed of the tutor's voice, pitch kept. Applies mid-sentence.
  setSpeechRate(rate: number) {
    this.speechRate = rate;
    this.player?.setRate(rate);
    this.debug("audio", "speech_rate", { rate });
  }

  sendText(text: string): boolean {
    const sent = this.session?.sendText(text) ?? false;
    if (sent) {
      // Their answer is in: the tutor's lingering line gives way to Thinking.
      this.clearThinkTimer();
      this.resetTurn();
      this.showCaption("");
      this.callbacks.onActivity("thinking");
    }
    return sent;
  }

  sendFiles(files: UploadedFile[]): boolean {
    return this.session?.sendFiles(files) ?? false;
  }

  // A picture the tutor asked for (a worksheet page), sent like a board frame.
  sendImageFrame(dataUrl: string): boolean {
    const comma = dataUrl.indexOf(",");
    if (comma < 0 || !this.session) return false;
    const mime = /^data:([^;]+)/.exec(dataUrl)?.[1] ?? "image/jpeg";
    const sent = this.session.sendVideoFrame(dataUrl.slice(comma + 1), mime);
    this.debug("board", "image_frame_sent", { bytes: dataUrl.length - comma - 1, sent });
    return sent;
  }

  sendStudentEvent(text: string): boolean {
    return this.session?.sendEvent(text) ?? false;
  }

  sendBoardFrame(dataUrl: string): boolean {
    const comma = dataUrl.indexOf(",");
    if (comma < 0 || !this.session) return false;
    const mime = /^data:([^;]+)/.exec(dataUrl)?.[1] ?? "image/jpeg";
    const sent = this.session.sendVideoFrame(dataUrl.slice(comma + 1), mime);
    this.debug("board", "board_frame_sent", { bytes: dataUrl.length - comma - 1, sent });
    return sent;
  }
}
