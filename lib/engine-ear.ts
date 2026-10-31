// The engine's ear (Oct 31 2026, Plan B: typed and spoken input go through
// the same engine). A second Gemini Live socket that only listens: the
// microphone goes in, its input transcription comes out, and the end of each
// utterance becomes one committed line for the turns route. Whatever the
// model says back is never played: it has no tools and no say in the lesson,
// and its reply is only a sign that the student has finished speaking.
//
// An utterance ends after a second of quiet at the microphone (STILL_MS);
// it is committed when the model starts its (unplayed) reply, or this long
// after the last transcribed words.
const QUIET_COMMIT_MS = 350;
// The student's own voice, measured here: Gemini ends a turn at a pause
// between sentences, and "…is 24." / "Which is under 23. Is my reasoning
// right?" became two turns (Oct 31). An utterance is committed only once the
// microphone has been quiet this long; what arrives meanwhile joins it.
const STILL_MS = 1000;
// Voice this long while the tutor talks stops the tutor (a cough is shorter).
const BARGE_MS = 250;

/** Loudness of a 16-bit PCM chunk (every fourth sample is enough). */
export function chunkRms(base64: string): number {
  const bin = atob(base64);
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 1 < bin.length; i += 8) {
    let v = bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    sum += v * v;
    n++;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

export const EAR_SYSTEM = `You are listening to a student in a math tutoring session. Do not speak. Never answer, comment or greet. Stay silent.`;

export type EarOptions = {
  model: string;
  url: () => Promise<string>;
  /** The student started speaking (to stop the tutor talking over them). */
  onSpeechStart: () => void;
  /** The student has been speaking for a moment: the tutor should stop if it is talking. */
  onBargeIn?: () => void;
  /** The tutor is talking: its voice can leak into the microphone, so barging in needs a louder voice. */
  tutorTalking?: () => boolean;
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
  private floor = 0;
  private lastVoiceAt = 0;
  private voiceSince = 0;
  private barged = false;
  // Manual turns (Oct 31): Gemini's own voice detection ended a turn at a
  // pause and lost what was said while its unplayed reply ran. The ear marks
  // the start and end of each utterance from the microphone itself.
  private inActivity = false;
  private preroll: Array<{ data: string; rate: number }> = [];

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
            realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
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
        this.inActivity = false;
        this.commit("closed");
        if (!this.closed) this.opts.onClosed?.(e.code, e.reason);
      };
      ws.onerror = () => {
        if (!set) reject(new Error("ear socket error"));
      };
    });
  }

  private handle(msg: Record<string, unknown>) {
    const sc = msg.serverContent as Record<string, unknown> | undefined;
    const tx = (sc?.inputTranscription ?? msg.inputTranscription) as { text?: string } | undefined;
    if (typeof tx?.text === "string" && tx.text) {
      this.text += tx.text;
      this.opts.onPartial?.(this.text.trim());
      // The utterance already ended: the transcript only needs a moment to finish arriving.
      if (!this.inActivity) this.armQuiet(QUIET_COMMIT_MS);
    }
    // The model answering means the transcript of the utterance is complete (its words are never played).
    if (sc && (sc.modelTurn || sc.turnComplete || sc.generationComplete) && this.text.trim() && !this.inActivity) this.commit("model_turn");
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
    // Talking again: this joins the next end of the utterance.
    if (this.inActivity && why !== "closed") return;
    const text = this.text.replace(/\s+/g, " ").trim();
    this.text = "";
    this.speaking = false;
    if (!text) return;
    this.opts.onDebug?.("ear_utterance", { text: text.slice(0, 300), why });
    this.opts.onUtterance(text);
  }

  private send(o: Record<string, unknown>) {
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(o));
    return true;
  }

  /** One microphone chunk (16 kHz PCM, base64). */
  sendAudio(base64: string, rate = 16000): boolean {
    // Voice or room: above four times the room's level (tracked slowly), and
    // never below a fixed floor, so a quiet room is never "speech".
    const rms = chunkRms(base64);
    // The room's level: it falls quickly to quiet and rises only slowly, so a
    // line that starts the moment the mic opens is still heard as a voice.
    if (!this.floor) this.floor = 50;
    this.floor = rms < this.floor ? this.floor * 0.8 + rms * 0.2 : this.floor * 0.998 + Math.min(rms, this.floor * 3) * 0.002;
    const now = Date.now();
    const voiced = rms > Math.max(500, this.floor * 4);
    if (voiced) {
      if (!this.voiceSince || now - this.lastVoiceAt > 300) this.voiceSince = now;
      this.lastVoiceAt = now;
      const loudEnough = !this.opts.tutorTalking?.() || rms > Math.max(1500, this.floor * 8);
      if (!this.barged && loudEnough && now - this.voiceSince >= BARGE_MS) {
        this.barged = true;
        this.opts.onBargeIn?.();
      }
      // An utterance starts: the moment before it goes too, so its first word is whole.
      if (!this.inActivity && now - this.voiceSince >= 100) {
        if (this.send({ realtimeInput: { activityStart: {} } })) {
          this.inActivity = true;
          if (this.quiet) clearTimeout(this.quiet);
          this.quiet = null;
          this.started();
          for (const c of this.preroll) this.send({ realtimeInput: { audio: { data: c.data, mimeType: `audio/pcm;rate=${c.rate}` } } });
          this.preroll = [];
        }
      }
    } else if (now - this.lastVoiceAt > STILL_MS) {
      this.barged = false;
      this.voiceSince = 0;
      // Quiet for a whole second: the utterance is over.
      if (this.inActivity) {
        this.send({ realtimeInput: { audio: { data: base64, mimeType: `audio/pcm;rate=${rate}` } } });
        this.send({ realtimeInput: { activityEnd: {} } });
        this.inActivity = false;
        // Its transcript comes with the model's (unplayed) reply; if not, a moment later.
        this.armQuiet(3000);
        return true;
      }
    }
    if (!this.inActivity) {
      this.preroll.push({ data: base64, rate });
      if (this.preroll.length > 12) this.preroll.shift();
      return true;
    }
    return this.send({ realtimeInput: { audio: { data: base64, mimeType: `audio/pcm;rate=${rate}` } } });
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
