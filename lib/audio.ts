import type SignalsmithStretch from "signalsmith-stretch";
import type { StretchNode } from "signalsmith-stretch";

// Converts a Float32 sample array to 16-bit signed PCM
function float32ToPCM16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return pcm;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Captures mic audio and calls onChunk with base64 PCM at the requested sample rate
export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  // ScriptProcessorNode is deprecated but works for prototypes across all browsers
  private processor: ScriptProcessorNode | null = null;
  private onChunk: (base64: string) => void;
  private sampleRate: number;

  constructor(onChunk: (base64: string) => void, sampleRate = 16000) {
    this.onChunk = onChunk;
    this.sampleRate = sampleRate;
  }

  async start(existingStream?: MediaStream) {
    this.stream = existingStream ?? await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: this.sampleRate,
      },
      video: false,
    });
    // Browsers may round to the nearest supported rate.
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      const pcm = float32ToPCM16(float32);
      const base64 = arrayBufferToBase64(pcm.buffer as ArrayBuffer);
      this.onChunk(base64);
    };

    source.connect(this.processor);
    // ScriptProcessorNode must be connected to destination to fire
    this.processor.connect(this.audioContext.destination);
  }

  stop() {
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.processor = null;
    this.stream = null;
    this.audioContext = null;
  }
}

// Plays back base64 PCM audio at 24kHz from Gemini, at an adjustable speed.
//
// The voice runs through Signalsmith Stretch (MIT, WASM in an AudioWorklet),
// which changes speed without changing pitch. Chunks are appended to the
// node's input buffer as they arrive. The player keeps its own copy of the
// node's timeline (an anchor: this input position is heard at this context
// time, moving at this rate), because the node's playhead keeps running past
// the end of the buffer during silence: every burst of speech that arrives
// after a pause re-anchors the playhead to the burst's first sample.
//
// The library is served unbundled from public/vendor (scripts/vendor-stretch.mjs):
// it runs its own source inside the AudioWorklet, and the bundled copy never
// starts there. If the worklet cannot load, chunks are scheduled back to back
// as plain buffers at normal speed, the way this player always worked.

const SAMPLE_RATE = 24000;
const STRETCH_URL = "/vendor/signalsmith-stretch.mjs?v=1.3.2";
const LOAD_TIMEOUT_MS = 4000;
const MIN_RATE = 0.5;
const MAX_RATE = 1.5;

type Anchor = { input: number; output: number; rate: number };

export type AudioPlayerOptions = { rate?: number };

function clampRate(rate: number): number {
  return Number.isFinite(rate) ? Math.min(MAX_RATE, Math.max(MIN_RATE, rate)) : 1;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export class AudioPlayer {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private output: GainNode;
  private rate: number;
  private closed = false;
  private mode: "loading" | "stretch" | "plain" = "loading";

  // Plain path.
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  // Stretch path.
  private stretch: StretchNode | null = null;
  private latency = 0.12;
  private waiting: Float32Array<ArrayBuffer>[] = [];
  private waitingSec = 0;
  private sourceEnd = 0; // seconds of audio handed to the node
  private anchor: Anchor = { input: 0, output: 0, rate: 1 };
  private droppedTo = 0;
  private readonly debugId = Math.random().toString(36).slice(2, 7);

  constructor(options: AudioPlayerOptions = {}) {
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    // Everything plays through one analyser so the UI can draw the voice.
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.analyser.connect(this.audioContext.destination);
    this.output = this.audioContext.createGain();
    this.output.connect(this.analyser);
    this.rate = clampRate(options.rate ?? 1);
    this.anchor = { input: 0, output: 0, rate: this.rate };
    void this.loadStretch();
  }

  private async loadStretch() {
    try {
      if (typeof AudioWorkletNode === "undefined" || !this.audioContext.audioWorklet) {
        throw new Error("AudioWorklet is not available");
      }
      const { default: createStretch } = (await import(/* webpackIgnore: true */ STRETCH_URL)) as { default: typeof SignalsmithStretch };
      const node = await withTimeout(
        createStretch(this.audioContext, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }),
        LOAD_TIMEOUT_MS,
      );
      if (this.closed) {
        node.disconnect();
        return;
      }
      this.latency = Math.max(0.02, await withTimeout(node.latency(), LOAD_TIMEOUT_MS));
      // If the worklet ever throws, it stays silent for good: play the rest
      // of the session at normal speed instead.
      node.onprocessorerror = () => this.fallBackToPlain("the speed engine stopped");
      node.connect(this.output);
      this.stretch = node;
      this.mode = "stretch";
      this.setAnchor({ input: 0, output: this.audioContext.currentTime, rate: this.rate });
      const queued = this.waiting;
      this.waiting = [];
      this.waitingSec = 0;
      for (const samples of queued) this.pushStretch(samples);
    } catch (err) {
      console.warn("[AudioPlayer] speed control unavailable, playing at normal speed:", err);
      if (this.closed) return;
      this.mode = "plain";
      const queued = this.waiting;
      this.waiting = [];
      this.waitingSec = 0;
      for (const samples of queued) this.schedulePlain(samples);
    }
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  getRate(): number {
    return this.rate;
  }

  /** The player's timeline, for the dev voice lab (/dev/voice). */
  debugState() {
    const now = this.audioContext.currentTime;
    return {
      id: this.debugId,
      closed: this.closed,
      waiting: this.waiting.length,
      mode: this.mode,
      rate: this.rate,
      now: +now.toFixed(3),
      sourceEnd: +this.sourceEnd.toFixed(3),
      head: +this.head(now).toFixed(3),
      anchor: { ...this.anchor },
      nodeInputTime: this.stretch ? +this.stretch.inputTime.toFixed(3) : null,
      gain: this.output.gain.value,
      latency: this.latency,
      droppedTo: this.droppedTo,
      contextState: this.audioContext.state,
    };
  }

  /** "stretch" once the speed engine is running, "plain" if it could not load. */
  getMode(): "loading" | "stretch" | "plain" {
    return this.mode;
  }

  /** Change the speed, mid-sentence if need be. Pitch is kept. */
  setRate(rate: number) {
    const next = clampRate(rate);
    if (next === this.rate) return;
    this.rate = next;
    if (this.mode !== "stretch") return;
    const now = this.audioContext.currentTime;
    const a = this.anchor;
    this.setAnchor(a.output > now ? { ...a, rate: next } : { input: this.head(now), output: now, rate: next });
  }

  isPlaying(): boolean {
    if (this.mode === "loading") return this.waiting.length > 0;
    if (this.mode === "plain") return this.activeSources.size > 0 && this.getPendingDurationMs() > 0;
    return this.sourceEnd - this.head(this.audioContext.currentTime) > 0.001;
  }

  enqueue(base64: string) {
    if (this.closed) return;
    const buffer = base64ToArrayBuffer(base64);
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length) as Float32Array<ArrayBuffer>;
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    if (this.mode === "stretch") this.pushStretch(float32);
    else if (this.mode === "plain") this.schedulePlain(float32);
    else {
      this.waiting.push(float32);
      this.waitingSec += float32.length / SAMPLE_RATE;
    }
  }

  /** Audio still to be heard, in wall-clock milliseconds at the current speed. */
  getPendingDurationMs() {
    if (this.mode === "loading") return (this.waitingSec / this.rate) * 1000;
    if (this.mode === "plain") return Math.max(0, this.nextStartTime - this.audioContext.currentTime) * 1000;
    const now = this.audioContext.currentTime;
    const left = this.sourceEnd - this.head(now);
    if (left <= 0) return 0;
    return (Math.max(0, this.anchor.output - now) + left / this.anchor.rate) * 1000;
  }

  /** Audio still to be heard, in milliseconds of the original audio. Captions pace by this. */
  getPendingSourceMs() {
    if (this.mode === "loading") return this.waitingSec * 1000;
    if (this.mode === "plain") return this.getPendingDurationMs();
    return Math.max(0, this.sourceEnd - this.head(this.audioContext.currentTime)) * 1000;
  }

  // Stop all scheduled/playing audio immediately (called on model interruption)
  flush() {
    this.activeSources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
    this.activeSources.clear();
    this.nextStartTime = 0;
    this.waiting = [];
    this.waitingSec = 0;
    if (this.mode === "stretch" && this.stretch) {
      const now = this.audioContext.currentTime;
      // The node still holds a block of processed audio: mute it, and open
      // again once that block has drained.
      const gain = this.output.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(0, now);
      gain.setValueAtTime(1, now + this.latency + 0.05);
      void this.stretch.dropBuffers();
      this.sourceEnd = 0;
      this.droppedTo = 0;
      this.setAnchor({ input: 0, output: now, rate: this.rate });
    }
  }

  resume() {
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
  }

  close() {
    this.flush();
    this.closed = true;
    this.stretch?.disconnect();
    this.stretch = null;
    this.audioContext.close();
  }

  // Where the node's playhead is at context time `now`, in input seconds.
  private head(now: number): number {
    const a = this.anchor;
    return a.input + Math.max(0, now - a.output) * a.rate;
  }

  private setAnchor(anchor: Anchor) {
    this.anchor = anchor;
    void this.stretch?.schedule({ active: true, input: anchor.input, output: anchor.output, rate: anchor.rate });
  }

  private pushStretch(samples: Float32Array<ArrayBuffer>) {
    const node = this.stretch;
    if (!node) return;
    const now = this.audioContext.currentTime;
    if (this.head(now) >= this.sourceEnd - 0.001) {
      // Nothing left to play: start this audio one latency from now, so the
      // node has read its first samples by the time they are due.
      this.setAnchor({ input: this.sourceEnd, output: now + this.latency, rate: this.rate });
    }
    // Read the length first: transferring the buffer empties `samples` here.
    const duration = samples.length / SAMPLE_RATE;
    void node.addBuffers([samples], [samples.buffer]);
    this.sourceEnd += duration;
    // Let go of audio that played more than a few seconds ago.
    const played = this.head(now) - 2;
    if (played - this.droppedTo > 20) {
      this.droppedTo = played;
      void node.dropBuffers(played);
    }
  }

  private fallBackToPlain(reason: string) {
    if (this.closed || this.mode === "plain") return;
    console.warn(`[AudioPlayer] ${reason}; playing at normal speed from here on.`);
    this.stretch?.disconnect();
    this.stretch = null;
    this.mode = "plain";
    this.sourceEnd = 0;
    this.droppedTo = 0;
    this.nextStartTime = 0;
  }

  private schedulePlain(samples: Float32Array<ArrayBuffer>) {
    const audioBuffer = this.audioContext.createBuffer(1, samples.length, SAMPLE_RATE);
    audioBuffer.copyToChannel(samples, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.output);
    this.activeSources.add(source);
    source.onended = () => this.activeSources.delete(source);

    const now = this.audioContext.currentTime;
    const startAt = Math.max(now, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
  }
}
