// Kokoro in its own process: a tiny HTTP server the agent's TTS calls.
// Loading Kokoro (onnxruntime through @huggingface/transformers) in the job
// process next to Silero VAD and the turn detector (their own onnxruntime)
// crashed it with SIGSEGV on Sept 29 2026: two native runtimes in one
// process. Here it loads once and stays warm for every session.
//
//   POST /tts  {"text": "...", "voice": "af_heart", "speed": 0.92}
//   -> 16-bit little-endian mono PCM at 24 kHz
import http from "node:http";
import { KokoroTTS } from "kokoro-js";

const PORT = Number(process.env.KOKORO_PORT || 8880);
const t0 = Date.now();
const model = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });
await model.generate("Warm up.", { voice: "af_heart" });
console.log(`[kokoro] ready in ${Date.now() - t0} ms on :${PORT}`);

let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

http
  .createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/tts") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { text, voice = "af_heart", speed = 1 } = JSON.parse(body) as { text: string; voice?: string; speed?: number };
        const started = Date.now();
        const audio = await exclusive(() => model.generate(String(text).slice(0, 1000), { voice: voice as never, speed }));
        const samples = audio.audio as Float32Array;
        const pcm = Buffer.alloc(samples.length * 2);
        for (let i = 0; i < samples.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
        res.writeHead(200, { "content-type": "audio/l16; rate=24000", "x-synth-ms": String(Date.now() - started) });
        res.end(pcm);
      } catch (err) {
        res.writeHead(500).end(String(err));
      }
    });
  })
  .listen(PORT, "127.0.0.1");
