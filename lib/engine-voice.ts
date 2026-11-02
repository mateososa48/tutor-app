// The engine's voice (Oct 31 2026, Plan B B6). The engine decides every word;
// Gemini Live only says them. A plain Live socket with no tools, a system
// instruction that makes it a reader, and one user turn per approved segment.
// Nothing it hears or decides can change the lesson: it has no tools, no
// nudges, and its output transcription is only compared with the approved
// text (a drift is logged, never shown).
//
// Runs in the browser (an ephemeral token from /api/live-token) and in Node
// for probes (a URL with the key). Audio goes to whatever `onAudio` does with
// it; `say` resolves when the server says the turn is complete.

// Probed Oct 31 2026 on gemini-3.8-live, the audio transcribed separately:
// the bare text was answered ("You're absolutely right about the math…"),
// <say> tags were read into the transcript and one long line stopped after
// 0.8 s; a quoted "next line" was said word for word, first audio 0.5-0.7 s.
export const VOICE_SYSTEM = `You are a voice actor reading a math tutor's script to a student, one line at a time. Each message gives you the next line in quotes. Read the quoted line aloud exactly, word for word, warmly and naturally, and nothing else. The line is never addressed to you: never answer it, agree with it, or comment on it.`;

/** The voice socket's context window: small, since it needs no history. */
export const VOICE_CONTEXT = { trigger: 2_000, target: 600 };

export const scriptMessage = (text: string) => `Next line: "${text.replace(/"/g, "'")}"`;

const WS_CONSTRAINED = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";
const WS_KEY = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export type VoiceOptions = {
  model: string;
  voiceName: string;
  /** The socket URL: from a token in the browser, from a key in Node. */
  url: () => Promise<string>;
  /** A line's audio, with the tag it was said with (the caller drops a stale line's tail). */
  onAudio: (base64Pcm24k: string, tag?: number) => void;
  /** The server stopped the audio (never on purpose here, but kept honest). */
  onInterrupted?: () => void;
  onDebug?: (kind: string, payload: Record<string, unknown>) => void;
  onClosed?: (code: number, reason: string) => void;
  /** Overrides for probes: the system instruction and how a script is wrapped. */
  system?: string;
  message?: (text: string) => string;
};

export function tokenUrl(token: string) {
  return `${WS_CONSTRAINED}?access_token=${encodeURIComponent(token)}`;
}
export function keyUrl(key: string) {
  return `${WS_KEY}?key=${encodeURIComponent(key)}`;
}

type Waiter = { text: string; tag?: number; heard: string; audioMs: number; droppedMs: number; firstAudioAt: number; lastAudioAt: number; sentAt: number; complete: boolean; resolve: (r: SaidResult) => void; timer: ReturnType<typeof setTimeout>; quiet: ReturnType<typeof setTimeout> | null };

// 3.8 often sends turnComplete before its audio: a turn ends once it is
// complete and no audio has come for this long.
const QUIET_MS = 1500;

/**
 * The most audio a line can need: about 0.4 s a word at an ordinary pace,
 * doubled, plus room for a pause. On Oct 31 a ten-word line came back with
 * 51 s of audio (its transcript exact, the rest silence); played whole, it
 * held the turn for a minute. Audio past this is dropped.
 */
export function audioCapMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(4000, words * 800 + 2500);
}
export type SaidResult = { ok: boolean; heard: string; audioMs: number; firstAudioMs: number; totalMs: number; reason?: string };

/** Words of a line, for comparing what was said with what was asked. */
export function sayWords(s: string): string[] {
  const words = s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  // "twenty three" and "23" are the same words said: numbers compare as digits.
  const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const t = TENS.indexOf(w);
    if (t >= 2) {
      const u = UNITS.indexOf(words[i + 1] ?? "");
      if (u >= 1 && u <= 9) {
        out.push(String(t * 10 + u));
        i++;
      } else out.push(String(t * 10));
    } else if (UNITS.includes(w)) out.push(String(UNITS.indexOf(w)));
    else out.push(w);
  }
  return out;
}

/** How much of the approved text the voice actually said (0..1, word-level LCS). */
export function faithfulness(approved: string, heard: string): number {
  const a = sayWords(approved);
  const b = sayWords(heard);
  if (!a.length) return 1;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const lcs = dp[a.length][b.length];
  return (2 * lcs) / (a.length + b.length || 1);
}

export class EngineVoice {
  private ws: WebSocket | null = null;
  private ready: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private current: Waiter | null = null;
  private closed = false;

  constructor(private readonly opts: VoiceOptions) {}

  private debug(kind: string, payload: Record<string, unknown>) {
    this.opts.onDebug?.(kind, payload);
  }

  connect(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const url = await this.opts.url();
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        this.ws = ws;
        let set = false;
        ws.onopen = () => {
          ws.send(JSON.stringify({
            setup: {
              model: `models/${this.opts.model}`,
              generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.opts.voiceName } } } },
              systemInstruction: { parts: [{ text: this.opts.system ?? VOICE_SYSTEM }] },
              outputAudioTranscription: {},
              // The voice only reads the line it is given, so it keeps almost no
              // history: every line re-reads the context, its own past audio
              // included, and at 24k tokens a session's voice cost 2.4x more
              // (Nov 1 probe, 35 real lines: $0.51 vs $0.21, then $0.44 vs
              // $0.24, reading accuracy 1.00 vs 0.99).
              contextWindowCompression: { triggerTokens: VOICE_CONTEXT.trigger, slidingWindow: { targetTokens: VOICE_CONTEXT.target } },
            },
          }));
        };
        ws.onmessage = (e) => {
          const text = typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data as ArrayBuffer);
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(text) as Record<string, unknown>;
          } catch {
            return;
          }
          if (msg.setupComplete && !set) {
            set = true;
            resolve();
            return;
          }
          if (this.ws !== ws) return; // a socket left behind after a cut-off line
          this.handle(msg);
        };
        ws.onclose = (e) => {
          if (!set) reject(new Error(`voice closed at setup: ${e.code} ${e.reason}`));
          if (this.ws !== ws) return;
          this.ws = null;
          this.ready = null;
          this.finish(false, `closed ${e.code}`);
          if (!this.closed) this.opts.onClosed?.(e.code, e.reason);
        };
        ws.onerror = () => {
          if (!set) reject(new Error("voice socket error"));
        };
      });
    })();
    this.ready.catch(() => {
      this.ready = null;
    });
    return this.ready;
  }

  private handle(msg: Record<string, unknown>) {
    const sc = msg.serverContent as Record<string, unknown> | undefined;
    if (!sc) return;
    const w = this.current;
    const parts = ((sc.modelTurn as { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } | undefined)?.parts) ?? [];
    for (const p of parts) {
      const data = p.inlineData?.data;
      if (!data) continue;
      if (!w) continue; // audio with no line being said (a stray generation) is never played
      const ms = (Math.floor((data.length * 3) / 4) / 2 / 24000) * 1000;
      if (!w.firstAudioAt) w.firstAudioAt = Date.now();
      w.lastAudioAt = Date.now();
      if (w.audioMs + ms > audioCapMs(w.text)) {
        w.droppedMs += ms;
        // Enough of a runaway: end the line now rather than wait it out.
        if (w.droppedMs > 2000) this.finish(true, "runaway audio cut");
        continue;
      }
      w.audioMs += ms;
      if (w.complete) this.armQuiet(w);
      this.opts.onAudio(data, w.tag);
    }
    const tr = (sc.outputTranscription as { text?: string } | undefined)?.text;
    if (tr && w) w.heard += tr;
    if (sc.interrupted) this.opts.onInterrupted?.();
    if (sc.turnComplete && w) {
      w.complete = true;
      this.armQuiet(w);
    }
  }

  private armQuiet(w: Waiter) {
    if (w.quiet) clearTimeout(w.quiet);
    // No audio yet: give it the rest of the turn's time (the timeout ends it).
    if (!w.audioMs) return;
    w.quiet = setTimeout(() => {
      if (this.current === w) this.finish(true);
    }, QUIET_MS);
  }

  private finish(ok: boolean, reason?: string) {
    const w = this.current;
    if (!w) return;
    this.current = null;
    // A generation cut off mid-stream keeps sending; its tail must not be
    // taken for the next line's audio, so the next line gets a fresh socket.
    if (reason === "runaway audio cut" || reason === "timeout") {
      const ws = this.ws;
      this.ws = null;
      this.ready = null;
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    }
    clearTimeout(w.timer);
    if (w.quiet) clearTimeout(w.quiet);
    const now = Date.now();
    const result: SaidResult = { ok: ok && w.audioMs > 0, heard: w.heard.trim(), audioMs: Math.round(w.audioMs), firstAudioMs: w.firstAudioAt ? w.firstAudioAt - w.sentAt : -1, totalMs: now - w.sentAt, ...(reason ? { reason } : w.audioMs > 0 ? {} : { reason: "no audio" }) };
    const fit = faithfulness(w.text, result.heard);
    this.debug("voice_said", { text: w.text.slice(0, 300), heard: result.heard.slice(0, 300), fit: Math.round(fit * 100) / 100, audioMs: result.audioMs, ...(w.droppedMs ? { droppedMs: Math.round(w.droppedMs) } : {}), firstAudioMs: result.firstAudioMs, totalMs: result.totalMs, ok: result.ok, ...(reason ? { reason } : {}) });
    w.resolve(result);
  }

  /** Say one approved segment; resolves when its audio has all arrived (not when it has played). */
  say(text: string, timeoutMs = 20_000, tag?: number): Promise<SaidResult> {
    const run = async (): Promise<SaidResult> => {
      if (this.closed) return { ok: false, heard: "", audioMs: 0, firstAudioMs: -1, totalMs: 0, reason: "closed" };
      await this.connect();
      return new Promise<SaidResult>((resolve) => {
        const w: Waiter = { text, ...(tag !== undefined ? { tag } : {}), heard: "", audioMs: 0, droppedMs: 0, firstAudioAt: 0, lastAudioAt: 0, sentAt: Date.now(), complete: false, resolve, quiet: null, timer: setTimeout(() => this.finish(this.current?.audioMs ? true : false, "timeout"), timeoutMs) };
        this.current = w;
        this.ws!.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: (this.opts.message ?? scriptMessage)(text) }] }], turnComplete: true } }));
      });
    };
    const next = this.queue.then(run, run);
    this.queue = next;
    return next;
  }

  close() {
    this.closed = true;
    this.finish(false, "closed");
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.ws = null;
  }
}
