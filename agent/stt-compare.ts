// How well two engines hear a student say math (Oct 24 2026; Mateo:
// "test how Universal-3.6 Pro by AssemblyAI compares to gemini 3.8").
//
// The same synthesized lines (macOS `say`, adult voices only) are streamed in
// real time, 20 ms frames with a quiet noise floor after, to:
//   - AssemblyAI Universal-3.6 Pro, through the LiveKit plugin the agent uses
//   - gemini-3.8-live with input transcription on, as Chalk's Live tutor hears today
// Each line has the math it must carry ("0.35", "6 r 5", "-7"); a key counts
// if it appears as digits or as words. Latency is from the end of the speech
// to the final transcript (AssemblyAI's FINAL_TRANSCRIPT; for Gemini, the last
// input-transcription fragment before the model starts its reply).
//
//   cd agent && npx tsx --env-file=../.env.local stt-compare.ts [out.json]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { AudioFrame } from "@livekit/rtc-node";
import { initializeLogger, stt as sttNs } from "@livekit/agents";

initializeLogger({ pretty: false, level: "warn" });
import * as assemblyai from "@livekit/agents-plugin-assemblyai";

const RATE = 16000;
const FRAME = 320; // 20 ms

type Line = { text: string; keys: Array<[string, RegExp]> };
const n = (s: string) => new RegExp(s, "i");
export const LINES: Line[] = [
  { text: "I think it's zero point three five, because thirty five is more than five.", keys: [["0.35", n("(0?\\.35|point three five)")], ["35", n("\\b35\\b|thirty[- ]five")]] },
  { text: "Six remainder five.", keys: [["6", n("\\b6\\b|six")], ["remainder", n("remainder|\\br\\b")], ["5", n("\\b5\\b|five")]] },
  { text: "Negative seven minus four is eleven.", keys: [["-7", n("(-|−|negative |minus )\\s?(7|seven)")], ["4", n("\\b4\\b|four")], ["11", n("\\b11\\b|eleven")]] },
  { text: "Two x squared minus three x plus one.", keys: [["2x²", n("2\\s?x\\s?(²|\\^2|squared)|two x squared")], ["3x", n("3\\s?x|three x")], ["1", n("\\b1\\b|one")]] },
  { text: "Um, is it five sixths?", keys: [["5/6", n("5\\s?/\\s?6|five[- ]sixths?")]] },
  { text: "F of three is seven.", keys: [["f(3)", n("f\\s?\\(\\s?3\\s?\\)|f of (3|three)")], ["7", n("\\b7\\b|seven")]] },
  { text: "Seventy two point two five.", keys: [["72.25", n("72\\.25|seventy[- ]two point two five")]] },
  { text: "The square root of forty nine is seven.", keys: [["49", n("\\b49\\b|forty[- ]nine")], ["7", n("\\b7\\b|seven")]] },
  { text: "Two thirds plus one fourth.", keys: [["2/3", n("2\\s?/\\s?3|two[- ]thirds")], ["1/4", n("1\\s?/\\s?4|one[- ](fourth|quarter)")]] },
  { text: "X equals negative three over two.", keys: [["x =", n("x\\s?(=|equals)")], ["-3/2", n("(-|−|negative |minus )\\s?(3|three)\\s?(/|over)\\s?(2|two)")]] },
  { text: "Fifteen percent of eighty.", keys: [["15%", n("15\\s?(%|percent)|fifteen percent")], ["80", n("\\b80\\b|eighty")]] },
  { text: "One cup makes six cookies, so five cups is thirty.", keys: [["6", n("\\b6\\b|six")], ["5", n("\\b5\\b|five")], ["30", n("\\b30\\b|thirty")]] },
];
const VOICES = ["Samantha", "Daniel"];

function synth(text: string, voice: string): Int16Array {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sttc-"));
  const aiff = path.join(dir, "a.aiff");
  const wav = path.join(dir, "a.wav");
  execFileSync("say", ["-v", voice, "-r", "170", "-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", aiff, wav]);
  const buf = fs.readFileSync(wav);
  const at = buf.indexOf("data");
  const pcm = buf.subarray(at + 8);
  fs.rmSync(dir, { recursive: true, force: true });
  return new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
}

function noise(samples: number): Int16Array {
  const a = new Int16Array(samples);
  for (let i = 0; i < samples; i++) a[i] = Math.round((Math.random() - 0.5) * 16);
  return a;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Real-time pacing: frame k goes out at start + k * 20 ms. */
async function paced(pcm: Int16Array, send: (chunk: Int16Array) => void, start: number) {
  for (let i = 0, k = 0; i < pcm.length; i += FRAME, k++) {
    const wait = start + k * 20 - Date.now();
    if (wait > 0) await sleep(wait);
    // A copy, not a view: AudioFrame reads the view's whole underlying buffer.
    send(pcm.slice(i, i + FRAME));
  }
}

async function assembly(pcm: Int16Array): Promise<{ text: string; ms: number | null }> {
  const engine = new assemblyai.STT({ apiKey: process.env.ASSEMBLYAI_API_KEY, speechModel: "universal-3-6-pro", sampleRate: RATE });
  const stream = engine.stream();
  let text = "";
  let speechEnd = 0;
  let ms: number | null = null;
  const reader = (async () => {
    for await (const ev of stream) {
      const e = ev as unknown as sttNs.SpeechEvent;
      if (e.type === sttNs.SpeechEventType.FINAL_TRANSCRIPT && e.alternatives?.[0]?.text) {
        text += (text ? " " : "") + e.alternatives[0].text;
        if (speechEnd && ms == null) ms = Date.now() - speechEnd;
      }
    }
  })();
  const t0 = Date.now() + 50;
  await paced(noise(RATE * 0.4), (c) => stream.pushFrame(new AudioFrame(c, RATE, 1, c.length)), t0);
  await paced(pcm, (c) => stream.pushFrame(new AudioFrame(c, RATE, 1, c.length)), Date.now());
  speechEnd = Date.now();
  await paced(noise(RATE * 3.5), (c) => stream.pushFrame(new AudioFrame(c, RATE, 1, c.length)), Date.now());
  stream.endInput();
  await Promise.race([reader, sleep(3000)]);
  stream.close();
  return { text: text.trim(), ms };
}

async function gemini(pcm: Int16Array): Promise<{ text: string; ms: number | null }> {
  const key = process.env.GEMINI_API_KEY!;
  const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`);
  let text = "";
  let lastFragmentAt = 0;
  let replyAt = 0;
  let speechEnd = 0;
  const ready = new Promise<void>((resolve, reject) => {
    ws.on("open", () => ws.send(JSON.stringify({ setup: { model: "models/gemini-3.8-live", generationConfig: { responseModalities: ["AUDIO"] }, inputAudioTranscription: {}, systemInstruction: { parts: [{ text: "You are listening to a student. Reply with the single word 'okay'." }] } } })));
    ws.on("message", (raw: Buffer) => {
      const m = JSON.parse(String(raw));
      if (m.setupComplete) resolve();
      const sc = m.serverContent;
      if (sc?.inputTranscription?.text) {
        text += sc.inputTranscription.text;
        lastFragmentAt = Date.now();
      }
      if (!replyAt && (sc?.modelTurn || sc?.outputTranscription)) replyAt = Date.now();
    });
    ws.on("error", reject);
  });
  await ready;
  const send = (c: Int16Array) => ws.send(JSON.stringify({ realtimeInput: { audio: { data: Buffer.from(c.buffer, c.byteOffset, c.byteLength).toString("base64"), mimeType: `audio/pcm;rate=${RATE}` } } }));
  await paced(noise(RATE * 0.4), send, Date.now() + 50);
  await paced(pcm, send, Date.now());
  speechEnd = Date.now();
  await paced(noise(RATE * 3.5), send, Date.now());
  await sleep(500);
  ws.close();
  // The transcript is final once the model starts its reply (Gemini sends it in pieces, then answers).
  const doneAt = lastFragmentAt && replyAt ? Math.max(lastFragmentAt, Math.min(replyAt, lastFragmentAt)) : lastFragmentAt;
  return { text: text.replace(/\s+/g, " ").trim(), ms: doneAt ? doneAt - speechEnd : null };
}

function score(line: Line, text: string) {
  const hit = line.keys.map(([name, re]) => ({ name, ok: re.test(text) }));
  return { hit, ok: hit.filter((h) => h.ok).length, of: hit.length };
}

const out: unknown[] = [];
const totals: Record<string, { ok: number; of: number; ms: number[]; exact: number }> = { assembly: { ok: 0, of: 0, ms: [], exact: 0 }, gemini: { ok: 0, of: 0, ms: [], exact: 0 } };
for (const voice of VOICES) {
  for (const line of LINES) {
    const pcm = synth(line.text, voice);
    const row: Record<string, unknown> = { voice, said: line.text };
    for (const [name, fn] of [["assembly", assembly], ["gemini", gemini]] as const) {
      let r: { text: string; ms: number | null };
      try {
        r = await fn(pcm);
      } catch (err) {
        r = { text: `ERROR ${String(err).slice(0, 100)}`, ms: null };
      }
      const s = score(line, r.text);
      totals[name].ok += s.ok;
      totals[name].of += s.of;
      if (s.ok === s.of) totals[name].exact++;
      if (r.ms != null) totals[name].ms.push(r.ms);
      row[name] = { heard: r.text, ms: r.ms, keys: `${s.ok}/${s.of}`, missed: s.hit.filter((h) => !h.ok).map((h) => h.name) };
      console.log(`${voice.padEnd(9)} ${name.padEnd(8)} ${String(r.ms ?? "-").padStart(5)} ms  ${s.ok}/${s.of}  "${r.text}"`);
    }
    out.push(row);
  }
}
const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
for (const [name, t] of Object.entries(totals)) {
  console.log(`${name}: math keys ${t.ok}/${t.of}, lines fully right ${t.exact}/${LINES.length * VOICES.length}, final transcript median ${med(t.ms)} ms, worst ${Math.max(...t.ms)} ms`);
}
fs.writeFileSync(process.argv[2] ?? "stt-compare.json", JSON.stringify({ totals, rows: out }, null, 1));
process.exit(0);
