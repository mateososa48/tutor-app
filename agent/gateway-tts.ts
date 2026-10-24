// The tutor's voice through the Vercel AI Gateway's speech endpoint (Oct 2026;
// Mateo's call: "a text to speech model in vercel ai gateway"). The endpoint
// returns one whole clip per request (base64 WAV, not a stream), so the
// framework's stream adapter hands us one sentence at a time and synthesizes
// the next while this one plays.
//
// Measured Oct 24 2026, one 12-word sentence, wav: microsoft/mai-voice-2.1-flash
// 0.75 s, spacexai/grok-tts 1.07 s, fish-audio/s2.1-pro 2.39 s (44.1 kHz),
// openai/tts-1 2.83 s; all mono PCM16. About $15 per million characters
// (mai-voice-2.1 $22), so a 20-minute session's ~3,000 spoken characters is
// about 5 cents.
import { type APIConnectOptions, AudioByteStream, shortuuid, tts } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";

const URL = "https://ai-gateway.vercel.sh/v4/ai/speech-model";

/** The sample rate each model returns (WAV header), so frames are labelled right. */
export function rateFor(model: string): number {
  return /^fish-audio\//.test(model) ? 44100 : 24000;
}

/** PCM16 samples out of a WAV clip (the gateway's streaming WAVs carry bogus chunk sizes, so the data chunk runs to the end). */
export function wavPcm(buf: Buffer): { pcm: Buffer; sampleRate: number; channels: number } {
  if (buf.subarray(0, 4).toString() !== "RIFF") return { pcm: buf, sampleRate: 24000, channels: 1 };
  let i = 12;
  let sampleRate = 24000;
  let channels = 1;
  while (i + 8 <= buf.length) {
    const id = buf.subarray(i, i + 4).toString();
    const size = buf.readUInt32LE(i + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(i + 10);
      sampleRate = buf.readUInt32LE(i + 12);
    }
    if (id === "data") return { pcm: buf.subarray(i + 8), sampleRate, channels };
    i += 8 + size + (size % 2);
  }
  return { pcm: Buffer.alloc(0), sampleRate, channels };
}

export class GatewayTTS extends tts.TTS {
  label = "gateway.TTS";
  /** Characters sent so far (the ledger: dollars = chars × price). */
  chars = 0;
  constructor(readonly modelId: string, readonly voice?: string, readonly speed = 1) {
    super(rateFor(modelId), 1, { streaming: false });
  }

  synthesize(text: string, connOptions?: APIConnectOptions, abortSignal?: AbortSignal): tts.ChunkedStream {
    return new GatewayStream(text, this, connOptions, abortSignal);
  }

  stream(): tts.SynthesizeStream {
    throw new Error("The gateway voices a sentence at a time");
  }
}

class GatewayStream extends tts.ChunkedStream {
  label = "gateway.ChunkedStream";
  constructor(text: string, private readonly engine: GatewayTTS, connOptions?: APIConnectOptions, abortSignal?: AbortSignal) {
    super(text, engine, connOptions, abortSignal);
  }

  protected async run(): Promise<void> {
    const text = this.inputText.trim();
    if (!text) return;
    const key = process.env.AI_GATEWAY_API_KEY;
    if (!key) throw new Error("AI_GATEWAY_API_KEY is not set");
    this.engine.chars += text.length;
    const r = await fetch(URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "ai-gateway-protocol-version": "0.0.1",
        "ai-speech-model-specification-version": "4",
        "ai-model-id": this.engine.modelId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, outputFormat: "wav", ...(this.engine.voice ? { voice: this.engine.voice } : {}), ...(this.engine.speed !== 1 ? { speed: this.engine.speed } : {}) }),
      signal: this.abortSignal,
    });
    if (!r.ok) throw new Error(`gateway tts ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { audio?: string };
    if (!j.audio || this.abortSignal?.aborted) return;
    const { pcm, sampleRate } = wavPcm(Buffer.from(j.audio, "base64"));
    const requestId = shortuuid();
    const bstream = new AudioByteStream(sampleRate, 1);
    let last: AudioFrame | undefined;
    const put = (frame: AudioFrame) => {
      if (last) this.queue.put({ requestId, segmentId: requestId, frame: last, final: false });
      last = frame;
    };
    for (const frame of bstream.write(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer)) put(frame);
    for (const frame of bstream.flush()) put(frame);
    if (last) this.queue.put({ requestId, segmentId: requestId, frame: last, final: true });
  }
}
