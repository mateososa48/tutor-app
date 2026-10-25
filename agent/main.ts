// Chalk's LiveKit voice agent (Oct 2026, branch `livekit`, ?voice=livekit).
//
// A persistent LiveKit Agents worker. For each student line:
//   1. the student's mic -> Silero VAD + LiveKit's turn detector decide they're
//      done -> speech-to-text (AssemblyAI when ASSEMBLYAI_API_KEY is set, else
//      Gemini's free live transcription, synthetic voices only: Google's terms
//      bar under-18 products)
//   2. the browser, which owns the TutorRuntime, checks the answer and builds
//      the private note (RPC chalk.turn)
//   3. ONE streamed Claude Haiku 5.5 call (lib/brain) writes the spoken reply
//      and the board calls; when the app had no verdict on an answer, the brain
//      calls check_answer first and the browser's checker answers (chalk.check)
//   4. each sentence goes through the speech layer (lib/brain/speech) to the
//      voice (the AI Gateway's TTS, or Kokoro on this machine), while each board
//      call goes to the browser's dispatcher the moment it is complete
//      (chalk.tool). A sentence that points at the board ("look at these
//      bars") waits until the browser says the drawing is up.
//
// Every turn has an id. The browser drops a board call from a turn that is no
// longer the current one or was interrupted (chalk.cancel), so a late call
// from a cut-off reply never draws over the next one.
//
// Run with `npm run livekit` from the app (scripts/livekit-dev.mjs), or by hand:
//   livekit-server --dev ; cd agent && npm run dev
import { cli, defineAgent, inference, llm, ServerOptions, voice, type JobContext, type JobProcess } from "@livekit/agents";
import * as assemblyai from "@livekit/agents-plugin-assemblyai";
import * as silero from "@livekit/agents-plugin-silero";
import * as livekit from "@livekit/agents-plugin-livekit";
import { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";
import { anthropicTools, brainMessages, brainCost, streamBrain, type BrainImage, type BrainTurn } from "../lib/brain/haiku";
import { runBrainTurn } from "../lib/brain/turn";
import { brainToolDeclarations, brainToolNames } from "../lib/brain/tools";
import { SentenceStream, displayText, pointsAtBoard, speakMath, stripPraise } from "../lib/brain/speech";
import { describeMove } from "../lib/brain/note";
import type { ToolCallResult } from "../lib/live-types";
import { GatewayTTS } from "./gateway-tts";
import { KokoroTTS } from "./kokoro-tts";
import { STT as GeminiSTT, endOfSpeech } from "./gemini-stt";

const STT_KIND = process.env.LIVEKIT_STT || (process.env.ASSEMBLYAI_API_KEY ? "assemblyai" : "gemini");
// gateway:<model> or kokoro. Grok TTS: Mateo asked for a random pick from the blind audition (voice A, Oct 24 2026); MAI-Voice 2.1 Flash was the fastest (0.75 s a sentence).
const TTS_KIND = process.env.LIVEKIT_TTS || "gateway:spacexai/grok-tts";
const BRAIN_MODEL = process.env.LIVEKIT_BRAIN || "claude-haiku-5-5";
// Haiku answers in ~0.6 s warm with a slow tail past 1.2 s: a second request at 0.9 s cuts the tail for ~$0.0002.
const HEDGE_MS = Number(process.env.LIVEKIT_HEDGE_MS || 900);
// How long a board-pointing sentence waits for its drawing before it is dropped.
const BOARD_WAIT_MS = Number(process.env.LIVEKIT_BOARD_WAIT_MS || 3500);
// The first clause goes to the voice early when it has this many words (0: whole sentences only).
const EARLY_CLAUSE_WORDS = Number(process.env.LIVEKIT_EARLY_CLAUSE || 6);
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2 || "";

/** The pipeline wants an LLM; ours is the llmNode override, so this one is never asked. */
class BrainSlot extends llm.LLM {
  label(): string {
    return "chalk.brain";
  }
  chat(): llm.LLMStream {
    throw new Error("the brain runs in ChalkTutor.llmNode");
  }
}

const log = (...a: unknown[]) => console.log(`[chalk ${new Date().toISOString().slice(11, 23)}]`, ...a);

type Rpc = (method: string, payload: unknown, timeoutMs?: number) => Promise<string>;
type Config = { instructions: string; ttsModel?: string; voice?: string; speed?: number; stt?: "assemblyai" | "gemini"; turns?: "livekit" | "assemblyai"; wait?: "patient" | "quick"; brain?: string };

/** The brain's history out of the framework's chat context (which holds what was actually said, cut where an interruption stopped it). */
function historyOf(chatCtx: llm.ChatContext, movesByReply: Map<string, string[]>, openingImages: BrainImage[]): { turns: BrainTurn[]; line: string } {
  const msgs: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const item of chatCtx.items) {
    if (item.type !== "message" || (item.role !== "user" && item.role !== "assistant")) continue;
    const text = item.textContent?.trim();
    if (!text) continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === item.role) last.text += `\n${text}`;
    else msgs.push({ role: item.role, text });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const line = msgs.length && msgs[msgs.length - 1].role === "user" ? msgs.pop()!.text : "";
  const turns: BrainTurn[] = [];
  for (let i = 0; i < msgs.length; i += 2) {
    const tutor = msgs[i + 1]?.text ?? "";
    turns.push({ student: msgs[i].text, tutor, moves: movesByReply.get(tutor) ?? [], ...(i === 0 && openingImages.length ? { images: openingImages } : {}) });
  }
  return { turns, line };
}

class ChalkTutor extends voice.Agent {
  private turnSeq = 0;
  private typedLine: string | null = null;
  readonly openingImages: BrainImage[] = [];
  /** Pictures that arrived mid-session: they ride on the next line. */
  readonly pendingImages: BrainImage[] = [];
  private firstTurn = true;
  private readonly movesByReply = new Map<string, string[]>();
  private readonly tools = anthropicTools(brainToolDeclarations());
  private readonly allowed = brainToolNames();
  /** Running totals for the session ledger. */
  readonly spend = { brainUsd: 0, turns: 0 };
  /** Stops the reply in progress (set while one runs). */
  private abortCurrent: (() => void) | null = null;

  /** The lab's brain, else the environment's. */
  readonly brainModel: string;

  constructor(private readonly config: Config, private readonly rpc: Rpc) {
    super({ instructions: config.instructions });
    this.brainModel = config.brain || BRAIN_MODEL;
  }

  /** A typed line (or the opening) is about to be answered: the browser already has it in the transcript. */
  markTyped(text: string) {
    this.typedLine = text;
  }

  /** A typed line arrived mid-reply: stop the reply and its board calls (a spoken interruption cancels the node itself). */
  interruptTurn() {
    this.abortCurrent?.();
  }

  /** Warm the connection and write the prompt cache so the first reply is not the slow one. */
  async warm(): Promise<void> {
    const t0 = Date.now();
    try {
      for await (const ev of streamBrain({ system: this.config.instructions, tools: this.tools, messages: [{ role: "user", content: [{ type: "text", text: "(warm-up: reply with one word)" }] }], maxTokens: 5, model: this.brainModel })) {
        if (ev.type === "done") this.spend.brainUsd += brainCost(ev.usage);
      }
      log(`brain warm in ${Date.now() - t0} ms`);
    } catch (err) {
      log("brain warm-up failed", String(err).slice(0, 200));
    }
  }

  override async llmNode(chatCtx: llm.ChatContext): Promise<ReadableStream<string> | null> {
    const turnId = ++this.turnSeq;
    const typed = this.typedLine;
    this.typedLine = null;
    const { turns, line } = historyOf(chatCtx, this.movesByReply, this.openingImages);
    const images = this.firstTurn ? this.openingImages : this.pendingImages.splice(0);
    this.firstTurn = false;
    const rpc = this.rpc;
    const agent = this;
    const started = Date.now();
    const abort = new AbortController();

    // The browser's note for this line (it also runs the auto-check and starts this turn there).
    let note = "";
    let leaving = false;
    let forceCheck = false;
    try {
      const r = JSON.parse(await rpc("chalk.turn", { turnId, line, typed: typed !== null }, 2500)) as { note: string; leaving?: boolean; forceCheck?: boolean };
      note = r.note;
      leaving = Boolean(r.leaving);
      forceCheck = Boolean(r.forceCheck);
    } catch (err) {
      log(`turn ${turnId}: chalk.turn failed`, String(err).slice(0, 160));
      note = "Checker: no answer to check in this line.\nBoard: unknown.\nPrivate; never read aloud.";
    }
    const noteMs = Date.now() - started;
    const verdict = /^Checker: (.*)$/m.exec(note)?.[1] ?? "";
    if (verdict && !/^no answer/.test(verdict)) log(`turn ${turnId}: checker ${verdict.slice(0, 120)}`);

    return new ReadableStream<string>({
      async start(controller) {
        let closed = false;
        agent.abortCurrent = () => {
          if (closed) return;
          abort.abort();
          void rpc("chalk.cancel", { turnId }, 2000).catch(() => undefined);
          log(`turn ${turnId}: interrupted`);
        };
        const sentences = new SentenceStream({ earlyClauseWords: EARLY_CLAUSE_WORDS });
        // Sentences go out in order; one that points at the board waits for the board.
        let chain: Promise<void> = Promise.resolve();
        let spoken = "";
        // The same sentences with digits kept, for the lesson state in the browser.
        let shown = "";
        let firstSentenceMs: number | null = null;
        const boardCalls: Array<Promise<ToolCallResult>> = [];
        let brainDone: () => void = () => undefined;
        const brainFinished = new Promise<void>((r) => (brainDone = r));
        const boardReady = async (): Promise<boolean> => {
          // Wait for the reply's calls to be known, then for the browser to answer them.
          await Promise.race([brainFinished, new Promise((r) => setTimeout(r, BOARD_WAIT_MS))]);
          const results = await Promise.race([Promise.all(boardCalls), new Promise<null>((r) => setTimeout(() => r(null), BOARD_WAIT_MS))]);
          if (!results) return false;
          return results.length === 0 || results.some((x) => x.success);
        };
        const emit = (raw: string) => {
          const kept = stripPraise(raw);
          const text = speakMath(kept);
          if (!text) return;
          const gate = pointsAtBoard(raw);
          chain = chain.then(async () => {
            if (abort.signal.aborted || closed) return;
            if (gate && !(await boardReady())) {
              log(`turn ${turnId}: dropped "${text.slice(0, 60)}" (the board did not show it)`);
              return;
            }
            if (abort.signal.aborted || closed) return;
            if (firstSentenceMs == null) {
              firstSentenceMs = Date.now() - started;
              log(`turn ${turnId}: first sentence ${firstSentenceMs} ms after the line (note ${noteMs} ms)`);
            }
            spoken += (spoken ? " " : "") + text;
            shown += (shown ? " " : "") + displayText(kept);
            controller.enqueue(`${text} `);
          });
        };
        // Board calls go to the browser in order, the moment each is complete.
        let toolChain: Promise<unknown> = Promise.resolve();
        const sendBoard = (call: { id: string; name: string; args: Record<string, unknown> }) => {
          if (leaving) return;
          const p = new Promise<ToolCallResult>((resolve) => {
            toolChain = toolChain.then(async () => {
              if (abort.signal.aborted) return resolve({ success: false, error: "interrupted" });
              try {
                const r = JSON.parse(await rpc("chalk.tool", { turnId, ...call }, 9000)) as ToolCallResult;
                log(`  turn ${turnId} ${call.name} -> ${r.success ? (r.message ?? "ok").slice(0, 90) : `✗ ${r.error}`}`);
                resolve(r);
              } catch (err) {
                log(`  turn ${turnId} ${call.name} failed`, String(err).slice(0, 120));
                resolve({ success: false, error: String(err) });
              }
            });
          });
          boardCalls.push(p);
        };
        try {
          const r = await runBrainTurn(
            {
              system: agent.config.instructions,
              tools: agent.tools,
              messages: brainMessages(turns, line, note, { lineImages: images }),
              signal: abort.signal,
              hedgeMs: HEDGE_MS,
              model: agent.brainModel,
            },
            {
              allowed: agent.allowed,
              forceCheck,
              line,
              onText: (t) => sentences.push(t).forEach(emit),
              onBoard: sendBoard,
              check: async (args, id) => {
                try {
                  return JSON.parse(await rpc("chalk.check", { turnId, id, args }, 3000)) as ToolCallResult;
                } catch (err) {
                  return { success: false, error: `the checker did not answer (${String(err).slice(0, 80)}): judge it yourself and reply now` };
                }
              },
            },
          );
          sentences.end().forEach(emit);
          brainDone();
          agent.spend.brainUsd += brainCost(r.usage);
          agent.spend.turns += 1;
          log(`turn ${turnId}: brain ${r.model} first token ${r.firstTokenMs} ms, ${r.ms} ms, ${r.steps} call${r.steps > 1 ? "s" : ""}${r.verdict ? ` (checked alongside: ${r.verdict.slice(0, 50)}; held ${r.heldMs} ms${r.redone ? ", redone" : ""})` : ""}, ${r.calls.map((c) => c.name).join(", ") || "no board"}${r.dropped.length ? `, dropped ${r.dropped.join(",")}` : ""}, $${brainCost(r.usage).toFixed(5)} (session $${agent.spend.brainUsd.toFixed(4)})`);
          await chain;
          log(`turn ${turnId}: said "${spoken.slice(0, 220)}"`);
          const results = await Promise.all(boardCalls);
          const moves = r.calls.filter((_, i) => results[i]?.success).map((c) => describeMove(c.name, c.args));
          if (spoken) agent.movesByReply.set(spoken.trim(), moves);
          void rpc("chalk.done", { turnId, said: shown, voiced: spoken, moves, firstSentenceMs, brainFirstTokenMs: r.firstTokenMs, noteMs, steps: r.steps, usd: brainCost(r.usage) }, 3000).catch(() => undefined);
        } catch (err) {
          brainDone();
          if (!abort.signal.aborted) {
            log(`turn ${turnId}: brain failed`, String(err).slice(0, 300));
            if (!spoken) controller.enqueue("Sorry, I lost my train of thought. Say that again? ");
          }
        }
        closed = true;
        agent.abortCurrent = null;
        controller.close();
      },
      cancel() {
        // The framework cancels the node when the reply is interrupted.
        if (!abort.signal.aborted) {
          abort.abort();
          void rpc("chalk.cancel", { turnId }, 2000).catch(() => undefined);
          log(`turn ${turnId}: cancelled`);
        }
      },
    });
  }
}

/** Wait for the browser's config text stream (the prompt is too big for an RPC payload, 15 KiB). */
function waitForConfig(ctx: JobContext): Promise<Config> {
  return new Promise((resolve) => {
    ctx.room.registerTextStreamHandler("chalk.config", async (reader) => {
      const text = await reader.readAll();
      resolve(JSON.parse(text) as Config);
    });
  });
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const configP = waitForConfig(ctx);
    const files: BrainImage[] = [];
    ctx.room.registerByteStreamHandler("chalk.file", async (reader) => {
      const chunks: Uint8Array[] = [];
      for await (const c of reader) chunks.push(c);
      const mime = reader.info.mimeType || "image/jpeg";
      if (/^image\//.test(mime)) files.push({ mimeType: mime, base64: Buffer.concat(chunks).toString("base64") });
      log(`file: ${reader.info.name} ${mime} ${chunks.reduce((s, c) => s + c.length, 0)} bytes`);
    });
    await ctx.connect();
    const student = await ctx.waitForParticipant();
    log(`student joined: ${student.identity} in ${ctx.room.name}`);

    const rpc: Rpc = async (method, payload, timeoutMs = 5000) =>
      ctx.room.localParticipant!.performRpc({ destinationIdentity: student.identity, method, payload: JSON.stringify(payload), responseTimeout: timeoutMs });

    // Ask for the config (the browser answers by sending it as a text stream).
    void rpc("chalk.hello", {}, 5000).catch(() => undefined);
    const config = await Promise.race([configP, new Promise<null>((r) => setTimeout(() => r(null), 15000))]);
    if (!config) {
      log("no config from the browser in 15 s; leaving");
      ctx.shutdown("no config");
      return;
    }
    log(`config: ${config.instructions.length} chars of instructions`);

    // The voice lab's picks (lib/voice-lab.ts), else the environment's defaults.
    const sttKind = config.stt === "assemblyai" && !process.env.ASSEMBLYAI_API_KEY ? "gemini" : (config.stt ?? STT_KIND);
    const assemblyTurns = sttKind === "assemblyai" && config.turns === "assemblyai";
    // Kids pause mid-thought ("like... one half plus... one third"): at 0.5 s of silence
    // (and AssemblyAI's own 0.1 s) both turn-enders cut that line into three (Oct 24 2026).
    const patient = (config.wait ?? "patient") === "patient";
    const stt = sttKind === "assemblyai"
      // Universal-3.6 Pro heard 52 of 52 maths keys right and finalized 0.45 s after the
      // speech (median), against gemini-3.8-live's 48 of 52 and 1.23 s (agent/stt-compare.ts, Oct 24 2026).
      ? new assemblyai.STT({ apiKey: process.env.ASSEMBLYAI_API_KEY, speechModel: "universal-3-6-pro", ...(assemblyTurns ? (patient ? { minTurnSilence: 900, maxTurnSilence: 2400 } : { minTurnSilence: 300, maxTurnSilence: 1500 }) : {}), keytermsPrompt: ["remainder", "squared", "cubed", "f of x", "x", "y", "fraction", "numerator", "denominator", "negative", "decimal", "percent"] })
      : new GeminiSTT({ apiKey: GEMINI_KEY });
    const ttsSpec = config.ttsModel || TTS_KIND;
    const tts = ttsSpec === "kokoro"
      ? new KokoroTTS(process.env.LIVEKIT_KOKORO_VOICE || "af_heart", Number(process.env.LIVEKIT_KOKORO_SPEED || 0.95))
      : new GatewayTTS(ttsSpec.replace(/^gateway:/, ""), config.voice, config.speed ?? 1);

    // The end-of-turn model hears how a sentence ends ("0.35?" still going,
    // "so it's 0.35." done), on this machine; the text model is the fallback.
    // Or AssemblyAI's own end of turn, from the words and the pause (lab: turns=assemblyai).
    let turnDetection: voice.AgentSessionOptions["turnDetection"] = undefined;
    if (assemblyTurns) turnDetection = "stt";
    else try {
      turnDetection = new inference.TurnDetector({ version: "v1-mini" });
    } catch (err) {
      log("audio turn detector unavailable:", String(err).slice(0, 160));
      try {
        turnDetection = new livekit.turnDetector.EnglishModel();
      } catch {
        log("text turn detector unavailable too: VAD only");
      }
    }

    const agent = new ChalkTutor(config, rpc);
    const warming = agent.warm();
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt,
      // The brain is ours (llmNode); the pipeline still wants an LLM slot.
      llm: new BrainSlot(),
      tts,
      turnDetection,
      turnHandling: {
        preemptiveGeneration: { enabled: false },
        // A kid pausing mid-thought ("six... remainder... five") is not done.
        // With AssemblyAI ending the turn its own silence rule applies; LiveKit's delay would be added on top.
        endpointing: { minDelay: assemblyTurns ? 0 : patient ? 900 : 500, maxDelay: Number(process.env.LIVEKIT_MAX_ENDPOINT_MS || 2500) },
        interruption: { mode: "vad", minDuration: 600 },
      },
    });

    const ms = (v: unknown) => Math.round(Number(v) || 0);
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      const m = ev.metrics as unknown as Record<string, unknown>;
      if (m.type === "eou_metrics") log(`end of turn ${ms(m.endOfUtteranceDelayMs ?? m.endOfUtteranceDelay)} ms (transcript ${ms(m.transcriptionDelayMs ?? m.transcriptionDelay)} ms)`);
      if (m.type === "tts_metrics") log(`voice first audio ${ms(m.ttfbMs ?? m.ttfb)} ms`);
    });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      if (ev.oldState === "speaking" && ev.newState !== "speaking" && sttKind === "gemini") endOfSpeech();
    });
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (ev.isFinal) log(`heard: "${ev.transcript}"`);
    });

    await session.start({ agent, room: ctx.room, outputOptions: { syncTranscription: true } as never });
    await warming;
    log(`session started: stt ${sttKind}${assemblyTurns ? " (its own turn ending)" : ""}, ${patient ? "patient" : "quick"}, brain ${agent.brainModel}, voice ${ttsSpec}`);

    // A typed line, or the session's opening: answer it like a spoken one.
    ctx.room.localParticipant!.registerRpcMethod("chalk.say", async (data) => {
      const { text, opening } = JSON.parse(data.payload) as { text: string; opening?: boolean };
      log(`${opening ? "opening" : "typed"}: "${text.slice(0, 120)}"`);
      if (opening) agent.openingImages.push(...files.splice(0));
      else agent.pendingImages.push(...files.splice(0));
      agent.interruptTurn();
      session.interrupt();
      agent.markTyped(text);
      session.generateReply({ userInput: text });
      return "ok";
    });
    ctx.addShutdownCallback(async () => {
      const chars = tts instanceof GatewayTTS ? tts.chars : 0;
      log(`session over: ${agent.spend.turns} turns, brain $${agent.spend.brainUsd.toFixed(4)}, voice ${chars} chars (~$${((chars * 15) / 1e6).toFixed(4)})`);
    });
    await rpc("chalk.ready", {}, 5000).catch(() => undefined);
  },
});

// Explicit dispatch by name: /api/livekit-token puts this agent in each new
// room, and can send a fresh one into a room whose agent died.
cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: process.env.LIVEKIT_AGENT_NAME || "chalk-tutor" }));
