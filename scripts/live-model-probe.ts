// Compare Gemini Live models on our own setup before switching one on.
//
//   npx tsx scripts/live-model-probe.ts [model ...]
//
// It opens a real Live session per model with the real system instruction,
// every tool declaration and our audio config, sends one student line,
// answers whatever tools the model calls, and reports: setup time, time to
// first audio, which tools fired and when, what it said, and the close code.
// Defaults to 3.1, 3.8 and 3.8 extended thinking. A few cents a run.
//
// Env switches for narrowing a problem down:
//   THINK=HIGH|LOW   thinking level for the extended-thinking model
//   TIMELINE=1       print every event with its timestamp, 26 s window
//   NOTOOLS=1        leave the tool declarations out
//   SHORTPROMPT=1    a one-line system instruction instead of the real one
//   APIV=v1alpha     the endpoint the browser client uses (default v1beta)
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { buildGeminiInstructions } from "../lib/tutor-prompts";
import { WHITEBOARD_TOOL_DECLARATIONS } from "../lib/whiteboard-tools";
import { TUTOR_TOOL_DECLARATIONS } from "../lib/tutor-tools";
import { SESSION_TOOL_DECLARATIONS } from "../lib/session-tools";

const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const key = (/^GEMINI_API_KEY=(.*)$/m.exec(env)?.[1] ?? /^NEXT_PUBLIC_GEMINI_API_KEY=(.*)$/m.exec(env)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("no Gemini key in .env.local");

const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : ["gemini-3.1-flash-live-preview", "gemini-3.8-live", "gemini-3.8-live-extended-thinking"];
const STUDENT = "hey i need help with adding fractions. like 1/2 plus 1/3. i dont get it";
const instructions = buildGeminiInstructions({ displayName: "Sam", gradeLevel: "Middle school (6–8)", learningPrefs: {} } as never, []);
const ASYNC = Boolean(process.env.ASYNC);
const declarations = [...WHITEBOARD_TOOL_DECLARATIONS, ...TUTOR_TOOL_DECLARATIONS, ...SESSION_TOOL_DECLARATIONS];
// NON_BLOCKING lets the model keep talking while a tool runs (3.8 and later).
const tools = [{ functionDeclarations: ASYNC ? declarations.map((d) => ({ ...d, behavior: "NON_BLOCKING" })) : declarations }];

type LivePart = { text?: string; thought?: boolean; inlineData?: { data?: string } };
type LiveMessage = {
  setupComplete?: unknown;
  toolCall?: { functionCalls?: Array<{ id?: string; name: string }> };
  serverContent?: {
    modelTurn?: { parts?: LivePart[] };
    outputTranscription?: { text?: string };
    interrupted?: boolean;
    generationComplete?: boolean;
    turnComplete?: boolean;
  };
};

type Report = {
  model: string;
  setupMs?: number;
  firstAudioMs?: number;
  firstTextMs?: number;
  audioChunks: number;
  audioBytes: number;
  toolCalls: string[];
  toolAtMs: number[];
  said: string;
  thoughts: number;
  turnCompleteMs?: number;
  close?: string;
  error?: string;
};

function probe(model: string, thinkingConfig: Record<string, unknown> | null): Promise<Report> {
  return new Promise((resolve) => {
    const r: Report = { model, audioChunks: 0, audioBytes: 0, toolCalls: [], toolAtMs: [], said: "", thoughts: 0 };
    const t0 = Date.now();
    const apiv = process.env.APIV ?? "v1beta";
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiv}.GenerativeService.BidiGenerateContent?key=${key}`;
    const ws = new WebSocket(url);
    const done = () => {
      try { ws.close(); } catch { /* already closed */ }
      resolve(r);
    };
    const timer = setTimeout(done, process.env.TIMELINE ? 26000 : 30000);
    ws.on("open", () => {
      ws.send(JSON.stringify({
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } },
            ...(thinkingConfig ? { thinkingConfig } : {}),
            ...(process.env.MEDIARES ? { mediaResolution: `MEDIA_RESOLUTION_${process.env.MEDIARES}` } : {}),
            ...(process.env.AFFECT === "gen" ? { enableAffectiveDialog: true } : {}),
          },
          ...(process.env.AFFECT === "setup" ? { enableAffectiveDialog: true } : {}),
          ...(process.env.PROACTIVE ? { proactivity: { proactiveAudio: true } } : {}),
          systemInstruction: { parts: [{ text: process.env.SHORTPROMPT ? "You are a friendly math tutor for a 12-year-old. Keep replies short." : instructions }] },
          ...(process.env.NOTOOLS ? {} : { tools }),
          ...(process.env.MINIMAL ? { outputAudioTranscription: {} } : {
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {},
            contextWindowCompression: { slidingWindow: {} },
          }),
        },
      }));
    });
    ws.on("message", (raw: Buffer) => {
      let msg: LiveMessage;
      try { msg = JSON.parse(raw.toString("utf8")); } catch { return; }
      const ms = Date.now() - t0;
      if (msg.setupComplete) {
        r.setupMs = ms;
        // A board picture first, the way the session page sends one.
        if (process.env.IMAGE) {
          const b64 = fs.readFileSync(process.env.IMAGE, "utf8").trim();
          ws.send(JSON.stringify({ realtimeInput: { video: { data: b64, mimeType: "image/jpeg" } } }));
        }
        const line = process.env.ASK ?? STUDENT;
        setTimeout(() => ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: line }] }], turnComplete: true } })), process.env.IMAGE ? 1200 : 0);
        return;
      }
      if (msg.toolCall?.functionCalls) {
        if (process.env.TIMELINE) console.log(`   ${ms}ms toolCall ${msg.toolCall.functionCalls.map((c) => c.name).join(", ")}`);
        for (const c of msg.toolCall.functionCalls) {
          r.toolCalls.push(c.name);
          r.toolAtMs.push(ms);
          const response: Record<string, unknown> = { output: `Done (item b${r.toolCalls.length}).` };
          if (ASYNC) response.scheduling = process.env.SCHEDULING ?? "WHEN_IDLE";
          // A real board takes a moment; with NON_BLOCKING the model should keep talking meanwhile.
          const delay = ASYNC ? Number(process.env.TOOLDELAY ?? 2500) : 0;
          setTimeout(() => {
            try { ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: c.id, name: c.name, response }] } })); } catch { /* closed */ }
          }, delay);
        }
        return;
      }
      const sc = msg.serverContent;
      if (!sc) return;
      for (const p of sc.modelTurn?.parts ?? []) {
        if (p.thought) r.thoughts++;
        if (p.inlineData?.data) {
          r.audioChunks++;
          r.audioBytes += Buffer.from(p.inlineData.data, "base64").length;
          r.firstAudioMs ??= ms;
        }
        if (p.text) { r.firstTextMs ??= ms; r.said += p.text; }
      }
      if (sc.outputTranscription?.text) {
        r.firstTextMs ??= ms;
        r.said += sc.outputTranscription.text;
        if (process.env.TIMELINE) console.log(`   ${ms}ms said: ${sc.outputTranscription.text.replace(/\s+/g, " ").slice(0, 90)}`);
      }
      if (process.env.TIMELINE && sc.interrupted) console.log(`   ${ms}ms interrupted`);
      if (process.env.TIMELINE && sc.generationComplete) console.log(`   ${ms}ms generationComplete`);
      if (sc.turnComplete) {
        r.turnCompleteMs = ms;
        if (process.env.TIMELINE) { console.log(`   ${ms}ms turnComplete (audio ${r.audioChunks}, tools ${r.toolCalls.length})`); return; }
        // The speech often follows the tool responses, so only stop once we have heard something.
        if (r.audioChunks > 0) { clearTimeout(timer); done(); }
      }
    });
    ws.on("error", (e: Error) => { r.error = e.message.slice(0, 160); });
    ws.on("close", (code: number, reason: Buffer) => {
      r.close = `${code}${reason?.length ? ` ${reason.toString().slice(0, 140)}` : ""}`;
      clearTimeout(timer);
      resolve(r);
    });
  });
}

const THINKING_TRIES: Array<Record<string, unknown>> = process.env.THINK
  ? [{ includeThoughts: true, thinkingLevel: process.env.THINK }]
  : [
  { includeThoughts: true, thinkingLevel: "LOW" },
  { includeThoughts: true, thinkingLevel: "HIGH" },
  { includeThoughts: true, thinkingLevel: 1 },
  { includeThoughts: true, thinkingBudget: 1024 },
];


async function main() {
  const out: Report[] = [];
  for (const m of MODELS) {
    let r: Report;
    if (m.includes("thinking")) {
      r = { model: m, audioChunks: 0, audioBytes: 0, toolCalls: [], toolAtMs: [], said: "", thoughts: 0 };
      for (const cfg of THINKING_TRIES) {
        r = await probe(m, cfg);
        console.log(`  try ${JSON.stringify(cfg)} -> ${r.close ?? "ok"}`);
        if (!r.close?.startsWith("1007")) { (r as Report & { config?: unknown }).config = cfg; break; }
      }
    } else {
      r = await probe(m, null);
    }
    out.push(r);
    console.log(JSON.stringify({ ...r, said: r.said.replace(/\s+/g, " ").slice(0, 220) }, null, 1));
  }
  fs.writeFileSync("/private/tmp/claude-501/-Users-mateososaalbrecht-tutor-app/8d1266f1-3d9c-48f8-ba4e-81b67a8c9a7f/scratchpad/live-probe.json", JSON.stringify(out, null, 2));
}
void main();
