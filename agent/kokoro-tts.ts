// Kokoro (82M, Apache-2.0) as a LiveKit TTS: the tutor's voice made on this
// machine, so it is free, has no rate limit, and no student text leaves the
// computer. Gemini's free TTS allowed 3 requests a minute and 10 a day
// (measured Sept 29 2026), which ran out after two sentences.
//
// The model runs in its own process (kokoro-server.ts, `npm run voice`); this
// class asks it for each piece of speech. Measured on an Apple M5, fp32,
// warm: 0.44 s to voice a short sentence, about five times faster than real
// time. The framework hands us a sentence at a time; a long sentence is
// voiced clause by clause so the first sound comes sooner.
import { type APIConnectOptions, AudioByteStream, shortuuid, tts } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";

const SAMPLE_RATE = 24000;
const SERVER = process.env.KOKORO_URL || "http://127.0.0.1:8880/tts";

/** A long sentence in speakable pieces, each ending at a comma or clause break. */
export function clauses(text: string, max = 70): string[] {
  const t = text.trim();
  if (t.length <= max) return t ? [t] : [];
  const parts = t.split(/(?<=[,;:—])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (cur && (cur + " " + p).length > max) {
      out.push(cur);
      cur = p;
    } else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

export class KokoroTTS extends tts.TTS {
  label = "kokoro.TTS";
  constructor(readonly voice = "af_heart", readonly speed = 0.92) {
    super(SAMPLE_RATE, 1, { streaming: false });
  }

  synthesize(text: string, connOptions?: APIConnectOptions, abortSignal?: AbortSignal): tts.ChunkedStream {
    return new KokoroStream(text, this, connOptions, abortSignal);
  }

  stream(): tts.SynthesizeStream {
    throw new Error("Kokoro synthesizes a sentence at a time");
  }
}

class KokoroStream extends tts.ChunkedStream {
  label = "kokoro.ChunkedStream";
  constructor(text: string, private readonly engine: KokoroTTS, connOptions?: APIConnectOptions, abortSignal?: AbortSignal) {
    super(text, engine, connOptions, abortSignal);
  }

  protected async run(): Promise<void> {
    const requestId = shortuuid();
    const bstream = new AudioByteStream(SAMPLE_RATE, 1);
    let last: AudioFrame | undefined;
    const put = (frame: AudioFrame) => {
      if (last) this.queue.put({ requestId, segmentId: requestId, frame: last, final: false });
      last = frame;
    };
    // Ask for every piece at once; the server voices them in order.
    const pieces = clauses(this.inputText).map((text) =>
      fetch(SERVER, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, voice: this.engine.voice, speed: this.engine.speed }),
        signal: this.abortSignal,
      }).then(async (r) => {
        if (!r.ok) throw new Error(`kokoro ${r.status}: ${await r.text()}`);
        return Buffer.from(await r.arrayBuffer());
      }),
    );
    for (const piece of pieces) {
      const pcm = await piece;
      if (this.abortSignal?.aborted) return;
      for (const frame of bstream.write(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer)) put(frame);
    }
    for (const frame of bstream.flush()) put(frame);
    if (last) this.queue.put({ requestId, segmentId: requestId, frame: last, final: true });
  }
}
