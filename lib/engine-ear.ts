// The engine's ear (Oct 31 2026, Plan B: typed and spoken input go through
// the same engine). A second Gemini Live socket that only listens: the
// microphone goes in, its input transcription comes out, and the end of each
// utterance becomes one committed line for the turns route. Whatever the
// model says back is never played: it has no tools and no say in the lesson,
// and its reply is only a sign that the student has finished speaking.
//
// When an utterance has ended: the server's voice-activity end, else the
// first sign of the model answering (its audio or turnComplete), else this
// long after the last transcribed words.
const QUIET_COMMIT_MS = 1400;

export const EAR_SYSTEM = `You are listening to a student in a math tutoring session. Do not speak. Never answer, comment or greet. Stay silent.`;

export type EarOptions = {
  model: string;
  url: () => Promise<string>;
  /** The student started speaking (to stop the tutor talking over them). */
  onSpeechStart: () => void;
  /** Words so far in this utterance, for a live caption. */
  onPartial?: (text: string) => void;
  /** One finished utterance. */
  onUtterance: (text: string) => void;
  onDebug?: (kind: string, payload: Record<string, unknown>) => void;
  onClosed?: (code: number, reason: string) => void;
};

export class EngineEar {
  private ws: WebSocket | null = null;
  private ready = false;
  private closed = false;
  private text = "";
  private speaking = false;
  private quiet: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: EarOptions) {}

  async connect(): Promise<void> {
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
            generationConfig: { responseModalities: ["AUDIO"] },
            systemInstruction: { parts: [{ text: EAR_SYSTEM }] },
            inputAudioTranscription: {},
            contextWindowCompression: { triggerTokens: 24_000, slidingWindow: { targetTokens: 8_000 } },
          },
        }));
      };
      ws.onmessage = (e) => {
        const raw = typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data as ArrayBuffer);
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return;
        }
        if (msg.setupComplete && !set) {
          set = true;
          this.ready = true;
          resolve();
          return;
        }
        if (this.ws === ws) this.handle(msg);
      };
      ws.onclose = (e) => {
        if (!set) reject(new Error(`ear closed at setup: ${e.code} ${e.reason}`));
        if (this.ws !== ws) return;
        this.ws = null;
        this.ready = false;
        this.commit("closed");
        if (!this.closed) this.opts.onClosed?.(e.code, e.reason);
      };
      ws.onerror = () => {
        if (!set) reject(new Error("ear socket error"));
      };
    });
  }

  private handle(msg: Record<string, unknown>) {
    const activity = (msg.voiceActivity ?? msg.voiceActivityDetectionSignal) as Record<string, unknown> | undefined;
    if (activity) {
      const type = String(activity.voiceActivityType ?? activity.vadSignalType ?? "").toUpperCase();
      if (/START/.test(type)) this.started();
      else if (/END/.test(type) && this.text.trim()) this.armQuiet(300);
    }
    const sc = msg.serverContent as Record<string, unknown> | undefined;
    const tx = (sc?.inputTranscription ?? msg.inputTranscription) as { text?: string } | undefined;
    if (typeof tx?.text === "string" && tx.text) {
      this.started();
      this.text += tx.text;
      this.opts.onPartial?.(this.text.trim());
      this.armQuiet(QUIET_COMMIT_MS);
    }
    // The model answering means the student's turn is over (its words are never played).
    if (sc && (sc.modelTurn || sc.turnComplete || sc.generationComplete) && this.text.trim()) this.commit("model_turn");
  }

  private started() {
    if (this.speaking) return;
    this.speaking = true;
    this.opts.onSpeechStart();
  }

  private armQuiet(ms: number) {
    if (this.quiet) clearTimeout(this.quiet);
    this.quiet = setTimeout(() => this.commit("quiet"), ms);
  }

  private commit(why: string) {
    if (this.quiet) clearTimeout(this.quiet);
    this.quiet = null;
    const text = this.text.replace(/\s+/g, " ").trim();
    this.text = "";
    this.speaking = false;
    if (!text) return;
    this.opts.onDebug?.("ear_utterance", { text: text.slice(0, 300), why });
    this.opts.onUtterance(text);
  }

  /** One microphone chunk (16 kHz PCM, base64). Dropped until the socket is ready. */
  sendAudio(base64: string, rate = 16000): boolean {
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: base64, mimeType: `audio/pcm;rate=${rate}` } } }));
    return true;
  }

  close() {
    this.closed = true;
    if (this.quiet) clearTimeout(this.quiet);
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.ws = null;
    this.ready = false;
  }
}
