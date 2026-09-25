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
//   TOOLDELAY=ms     how long a board tool takes to answer (default 0)
//   ASYNC=1          the app's async tool design (?tools=async)
//   BEHAVIOR=none|blocking   the model's own defaults, or every tool blocking
//   SCHED=WHEN_IDLE|SILENT|INTERRUPT   force one scheduling for async results
//   USAGE=1          print every usage message and message kind
//   STUDENT="…"      the student line to send (default: help adding 1/2 + 1/3)
//   INTAKE="topic"   open as a session from the intake: its session block and
//                    opening message (MINUTES=20 for the time they chose)
//   NEXT="a||b"      more student lines, one per tutor turn; prints the conversation
//   MIC=floor|zeros|stop|clicks   stream a microphone at 16 kHz in 40 ms frames
//                    the whole run: a ±8 LSB noise floor, digital zeros, the
//                    floor for 3 s then nothing (the app's mute), or the floor
//                    with typing-like clicks. The first line waits 2 s for it.
//   TEXTVIA=realtime send typed lines as realtimeInput.text, not clientContent
//   NOTEAUTO=1       the app's board note (lib/tutor-policy boardNote) after a
//                    turn that left the board alone, as the session sends it
//   NOTE="…"         a private note sent before every NEXT line as its own
//                    clientContent with turnComplete:false (does the model
//                    answer it separately? does it obey it?)
//   PROMPT=path      another copy of tutor-prompts.ts (git show <rev>:lib/tutor-prompts.ts
//                    > lib/_old-tutor-prompts.ts keeps its imports working) for an A/B
//   CONSTRAINED=1    connect the way the browser does: a one-use token on the
//                    BidiGenerateContentConstrained method (v1alpha)
//
// Tools carry the app's own per-model behaviour and scheduling
// (lib/live-tool-behavior.ts), and tutor tools answer through a real
// TutorRuntime, so a probe sees what a session would.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import WebSocket from "ws";
import { buildGeminiInstructions } from "../lib/tutor-prompts";
import { WHITEBOARD_TOOL_DECLARATIONS } from "../lib/whiteboard-tools";
import { TUTOR_TOOL_DECLARATIONS } from "../lib/tutor-tools";
import { SESSION_TOOL_DECLARATIONS } from "../lib/session-tools";
import { toolScheduling, withToolBehavior } from "../lib/live-tool-behavior";
import { toolRole } from "../lib/board-items";
import { TutorRuntime } from "../lib/tutor-runtime";
import { CONTEXT_WINDOW_COMPRESSION, liveToolDeclarations } from "../lib/gemini-live";
import { EMPTY_INTAKE, intakeInstructions, intakeOpeningMessage, type SessionIntake } from "../lib/session-intake";

const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const key = (/^GEMINI_API_KEY=(.*)$/m.exec(env)?.[1] ?? /^NEXT_PUBLIC_GEMINI_API_KEY=(.*)$/m.exec(env)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("no Gemini key in .env.local");

const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : ["gemini-3.1-flash-live-preview", "gemini-3.8-live", "gemini-3.8-live-extended-thinking"];
const intake = process.env.INTAKE ? { ...EMPTY_INTAKE, topic: process.env.INTAKE, minutes: Number(process.env.MINUTES ?? 20) as SessionIntake["minutes"] } : null;
const STUDENT = process.env.STUDENT ?? (intake ? intakeOpeningMessage(intake, 0) : "hey i need help with adding fractions. like 1/2 plus 1/3. i dont get it");
const NEXT = (process.env.NEXT ?? "").split("||").map((l) => l.trim()).filter(Boolean);
let instructions = "";
async function loadInstructions() {
  const promptModule = process.env.PROMPT
    ? ((await import(pathToFileURL(path.resolve(process.env.PROMPT)).href)) as typeof import("../lib/tutor-prompts"))
    : { buildGeminiInstructions };
  instructions = promptModule.buildGeminiInstructions({ displayName: "Sam", gradeLevel: "Middle school (6–8)", learningPrefs: {} } as never, [], intake ? { session: intakeInstructions(intake, 0) } : {});
}
const conversation: string[] = [];
// The set a session sends since Sept 25 2026 (the Live diet); FULLTOOLS=1 sends every declaration.
const declarations = process.env.FULLTOOLS ? [...WHITEBOARD_TOOL_DECLARATIONS, ...TUTOR_TOOL_DECLARATIONS, ...SESSION_TOOL_DECLARATIONS] : liveToolDeclarations();

type LivePart = { text?: string; thought?: boolean; inlineData?: { data?: string } };
type LiveMessage = {
  setupComplete?: unknown;
  toolCall?: { functionCalls?: Array<{ id?: string; name: string; args?: Record<string, unknown> }> };
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
  /** Longest pause between two audio chunks inside a reply (after its first). */
  maxAudioGapMs?: number;
  /** Replies to each line: ms from the line to its first audio. */
  replyMs?: number[];
};

let lineAt = 0;
let turnDrew = false;
let turnMarked = false;
let saidAtTurnStart = 0;
let lastAudioAt = 0;
let audioStarted = false;
let micTimer: ReturnType<typeof setInterval> | null = null;

type Sock = { send(data: string): void; readyState: number };

function sendLine(ws: Sock, line: string) {
  if (process.env.NOTE) {
    ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: process.env.NOTE }] }], turnComplete: false } }));
  }
  lineAt = Date.now();
  lastAudioAt = 0;
  audioStarted = false;
  const msg = process.env.TEXTVIA === "realtime"
    ? { realtimeInput: { text: line } }
    : { clientContent: { turns: [{ role: "user", parts: [{ text: line }] }], turnComplete: true } };
  ws.send(JSON.stringify(msg));
}

// A microphone, 16 kHz PCM16 in 40 ms frames, as the app streams it.
function startMic(ws: Sock, t0: number) {
  const mode = process.env.MIC;
  if (!mode) return;
  const frame = () => {
    const n = 640;
    const buf = Buffer.alloc(n * 2);
    const elapsed = Date.now() - t0;
    if ((mode === "stop" || mode === "loudstop") && elapsed > 3000) return null;
    for (let i = 0; i < n; i++) {
      // loudstop: speech-loud sound for 3 s, then nothing (muted mid-sound).
      const amp = mode === "loudstop" ? 3000 * (0.6 + 0.4 * Math.sin(elapsed / 90)) : 8;
      let v = mode === "zeros" ? 0 : Math.round((Math.random() * 2 - 1) * amp);
      // Typing: a sharp click about every 180 ms.
      if (mode === "clicks" && (elapsed + i / 16) % 180 < 4) v = Math.round((Math.random() * 2 - 1) * 6000);
      buf.writeInt16LE(v, i * 2);
    }
    return buf.toString("base64");
  };
  micTimer = setInterval(() => {
    if (ws.readyState !== 1) { if (micTimer) clearInterval(micTimer); return; }
    const data = frame();
    if (data) ws.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } } }));
  }, 40);
}

function probe(model: string, thinkingConfig: Record<string, unknown> | null): Promise<Report> {
  return new Promise((resolve) => {
    const r: Report = { model, audioChunks: 0, audioBytes: 0, toolCalls: [], toolAtMs: [], said: "", thoughts: 0 };
    const mode = process.env.BEHAVIOR;
    const tools = [{ functionDeclarations: mode === "none" ? declarations : mode === "blocking" ? declarations.map((d) => ({ ...d, behavior: "BLOCKING" })) : withToolBehavior(declarations, model, Boolean(process.env.ASYNC)) }];
    const runtime = new TutorRuntime({ startedAt: Date.now() });
    const t0 = Date.now();
    const apiv = process.env.APIV ?? "v1beta";
    const url = constrainedToken
      ? `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(constrainedToken)}`
      : `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiv}.GenerativeService.BidiGenerateContent?key=${key}`;
    const ws = new WebSocket(url);
    const done = () => {
      if (micTimer) clearInterval(micTimer);
      try { ws.close(); } catch { /* already closed */ }
      resolve(r);
    };
    const timer = setTimeout(done, (process.env.TIMELINE ? 26000 : 30000) * (1 + NEXT.length));
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
          systemInstruction: { parts: [{ text: (process.env.SHORTPROMPT ? "You are a friendly math tutor for a 12-year-old. Keep replies short." : instructions) + (process.env.PROMPTADD ? `\n\n${process.env.PROMPTADD}` : "") }] },
          ...(process.env.NOTOOLS ? {} : { tools }),
          ...(process.env.MINIMAL ? { outputAudioTranscription: {} } : {
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {},
            contextWindowCompression: CONTEXT_WINDOW_COMPRESSION,
          }),
        },
      }));
    });
    ws.on("message", (raw: Buffer) => {
      let msg: LiveMessage;
      try { msg = JSON.parse(raw.toString("utf8")); } catch { return; }
      const ms = Date.now() - t0;
      // USAGE=1: every usage message and every message kind, to learn how Live reports them.
      if (process.env.USAGE) {
        const keys = Object.keys(msg).filter((k) => k !== "serverContent" || !(msg.serverContent?.modelTurn || msg.serverContent?.outputTranscription));
        const m = msg as Record<string, unknown>;
        if (m.usageMetadata) console.log(`   ${ms}ms usage ${JSON.stringify(m.usageMetadata)}`);
        else if (keys.length && !msg.toolCall) console.log(`   ${ms}ms keys ${keys.join(",")}${msg.serverContent ? " " + Object.keys(msg.serverContent).join(",") : ""}`);
      }
      if (msg.setupComplete) {
        r.setupMs = ms;
        // A board picture first, the way the session page sends one.
        if (process.env.IMAGE) {
          const b64 = fs.readFileSync(process.env.IMAGE, "utf8").trim();
          ws.send(JSON.stringify({ realtimeInput: { video: { data: b64, mimeType: "image/jpeg" } } }));
        }
        const line = process.env.ASK ?? STUDENT;
        if (NEXT.length) conversation.push(`Student: ${line}`);
        runtime.noteStudentUtterance(line);
        startMic(ws as unknown as Sock, t0);
        setTimeout(() => sendLine(ws as unknown as Sock, line), (process.env.IMAGE ? 1200 : 0) + (process.env.MIC ? 2000 : 0));
        return;
      }
      if (msg.toolCall?.functionCalls) {
        if (process.env.TIMELINE) console.log(`   ${ms}ms toolCall ${msg.toolCall.functionCalls.map((c) => `${c.name}(${JSON.stringify(c.args ?? {}).slice(0, 80)})`).join(", ")}`);
        for (const c of msg.toolCall.functionCalls) {
          r.toolCalls.push(c.name);
          conversation.push(`  ↳ ${c.name}(${JSON.stringify(c.args ?? {})})`);
          r.toolAtMs.push(ms);
          // Board tools answer as a session's would: the item, plus the notes
          // that ride on board results (state line, unchecked answer, …).
          const output = runtime.runTool(c.name, c.args ?? {}, Date.now(), c.id) ?? { success: true, message: `Done (item b${r.toolCalls.length}). ${runtime.boardResultExtras()}`.trim() };
          if (toolRole(c.name) === "draw") { turnDrew = true; runtime.noteBoardWrite(c.name, c.args ?? {}); }
          if (toolRole(c.name) === "mark") { turnMarked = true; runtime.noteBoardMark(); }
          const planned = process.env.BEHAVIOR ? undefined : toolScheduling(model, c.name, output, Boolean(process.env.ASYNC), audioStarted);
          const scheduling = planned && (process.env.SCHED ?? planned);
          if (process.env.TIMELINE) console.log(`   ${ms}ms   -> ${c.name}: ${(output.success ? output.message ?? "" : output.error).slice(0, 110)}${scheduling ? ` [${scheduling}]` : ""}`);
          setTimeout(() => {
            try { ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: c.id, name: c.name, response: { output }, ...(scheduling ? { scheduling } : {}) }] } })); } catch { /* closed */ }
          }, Number(process.env.TOOLDELAY ?? 0));
        }
        return;
      }
      const sc = msg.serverContent;
      if (!sc) return;
      for (const p of sc.modelTurn?.parts ?? []) {
        if (p.thought) r.thoughts++;
        if (p.inlineData?.data) {
          r.audioChunks++;
          const now = Date.now();
          if (!audioStarted) { audioStarted = true; (r.replyMs ??= []).push(now - lineAt); }
          else if (lastAudioAt) r.maxAudioGapMs = Math.max(r.maxAudioGapMs ?? 0, now - lastAudioAt);
          lastAudioAt = now;
          r.audioBytes += Buffer.from(p.inlineData.data, "base64").length;
          r.firstAudioMs ??= ms;
        }
        if (p.text) { r.firstTextMs ??= ms; r.said += p.text; if (process.env.TIMELINE) console.log(`   ${ms}ms text part${p.thought ? " (thought)" : ""}: ${p.text.replace(/\s+/g, " ").slice(0, 120)}`); }
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
        // What the session does at a turn's end: note the turn, and send the
        // board note when the board was left alone.
        const turnText = r.said.slice(saidAtTurnStart).replace(/\s+/g, " ").trim();
        if (turnText) {
          runtime.noteTutorTurn(turnText, turnDrew, turnMarked);
          const note = process.env.NOTEAUTO ? runtime.boardNote(turnText, turnDrew, turnMarked) : null;
          if (note) {
            conversation.push(`  [note] ${note.slice(0, 90)}…`);
            ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: note }] }], turnComplete: false } }));
          }
        }
        turnDrew = false;
        turnMarked = false;
        saidAtTurnStart = r.said.length;
        if (process.env.TIMELINE) console.log(`   ${ms}ms turnComplete (audio ${r.audioChunks}, tools ${r.toolCalls.length})`);
        if (process.env.TIMELINE && NEXT.length === 0) return;
        // The speech often follows the tool responses, so only stop once we have heard something.
        if (r.audioChunks > 0 && NEXT.length > 0) {
          conversation.push(`Tutor: ${r.said.replace(/\s+/g, " ").trim()}`);
          r.said = "";
          saidAtTurnStart = 0;
          const line = NEXT.shift()!;
          conversation.push(`Student: ${line}`);
          runtime.noteStudentUtterance(line);
          audioStarted = false;
          sendLine(ws as unknown as Sock, line);
          return;
        }
        if (r.audioChunks > 0) {
          if (conversation.length) conversation.push(`Tutor: ${r.said.replace(/\s+/g, " ").trim()}`);
          clearTimeout(timer);
          done();
        }
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


let constrainedToken: string | null = null;

async function main() {
  await loadInstructions();
  const out: Report[] = [];
  for (const m of MODELS) {
    if (process.env.CONSTRAINED) {
      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: "v1alpha" } });
      const token = await client.authTokens.create({
        config: { uses: 1, expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(), newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString() },
      });
      constrainedToken = token.name ?? null;
    }
    let r: Report;
    if (m.includes("thinking")) {
      r = { model: m, audioChunks: 0, audioBytes: 0, toolCalls: [], toolAtMs: [], said: "", thoughts: 0 };
      for (const cfg of THINKING_TRIES) {
        r = await probe(m, cfg);
        console.log(`  try ${JSON.stringify(cfg)} -> ${r.close ?? "ok"}`);
        if (!r.close?.startsWith("1007")) { (r as Report & { config?: unknown }).config = cfg; break; }
      }
    } else {
      // 3.8 thinks a little on every turn, but rejects any thinkingLevel
      // (1007 "Thinking level is not supported for this model", Sept 24 2026).
      r = await probe(m, null);
    }
    out.push(r);
    console.log(JSON.stringify({ ...r, said: r.said.replace(/\s+/g, " ").slice(0, 220) }, null, 1));
    if (conversation.length) console.log(conversation.join("\n"));
    console.log(`SUMMARY ${process.env.CONSTRAINED ? "constrained" : "key"} mic=${process.env.MIC ?? "none"} text=${process.env.TEXTVIA ?? "client"} replyMs=${JSON.stringify(r.replyMs ?? [])} maxAudioGapMs=${r.maxAudioGapMs ?? "-"} close=${r.close ?? "-"}`);
  }
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 2));
}
void main();
