// The LiveKit voice path's browser client (Oct 2026, ?voice=livekit): the
// same TutorClient surface as the Gemini Live client, so the session page,
// the board, the pet, the dock and the recorder do not change. The voice runs
// in a LiveKit agent (agent/main.ts): speech-to-text, the turn detector, one
// Claude Haiku 5.5 call per line (lib/brain), the voice.
//
// Chalk's code owns the truth, here in the page's TutorRuntime: the answer
// checker, the lesson state, the turn notes and the board. The agent asks:
//   chalk.hello  -> the config (prompt, voice), sent back as a text stream
//                   (an RPC payload is capped at 15 KiB) with the worksheets
//                   as byte streams
//   chalk.turn   -> {note, leaving} for the line the student just said; it
//                   runs the auto-check and makes that turn the current one
//   chalk.check  -> check_answer, when the note had no verdict on an answer
//   chalk.tool   -> one board move, run on the real board, from turn N; a
//                   move from a turn that is not the current one, or was
//                   cancelled, is refused (it can never draw over the next)
//   chalk.cancel -> turn N was interrupted
//   chalk.done   -> what turn N actually said and drew
// and this client calls the agent's chalk.say for a typed line or the opening.
import { ConnectionState, ParticipantKind, Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack, type RpcInvocationData } from "livekit-client";
import type { LiveTutorCallbacks, LiveTutorStartOptions } from "./live-tutor";
import type { ToolCallResult } from "./live-types";
import type { UploadedFile } from "./file-processor";
import { clearActiveIntake, getActiveIntake, intakeOpeningMessage } from "./session-intake";
import { TutorRuntime } from "./tutor-runtime";
import { detectSignals, formatMemory, formatTutorState } from "./tutor-policy";
import { toolRole } from "./board-items";
import { buildTurnNote } from "./brain/note";
import { looksLikeAnswer } from "./tutor-policy";
import { isNonAnswer } from "./board-content-rules";
import { ILLUSTRATE_NOTHING, ILLUSTRATE_PENDING, ILLUSTRATE_WAIT_MS, PictureMemory, alreadyDrawn, illustrateFailed, illustrateRequest } from "./illustration/tool";
import type { IllustratorOption } from "./gemini-live";

type LivekitConfig = { url: string; token: string; room: string; instructions: string; ttsModel: string | null; voice: string | null; grade: string; stt: string | null; turns: string | null; wait: string | null; brain: string | null };

// A board move longer than this is dropped: the lesson goes on without it.
const TOOL_TIMEOUT_MS = 6000;
// The audible-gap meter: a frame louder than this is voice.
const MIC_VOICE_RMS = 0.015;
const TUTOR_VOICE_RMS = 0.008;

export class LivekitTutorSession {
  private room: Room | null = null;
  private config: LivekitConfig | null = null;
  private readonly runtime: TutorRuntime;
  private ended = false;
  private speaking = false;
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private getBoardSummary: () => string = () => "";
  private ids = 0;
  private files: UploadedFile[] = [];
  private agentIdentity: string | null = null;
  private opening: string | null = null;
  // The turn the agent is on, and the ones it took back.
  private currentTurn = 0;
  private readonly cancelled = new Set<number>();
  private turnDrew = false;
  private turnMarked = false;
  private turnTools: string[] = [];
  private lastStudentLine = "";
  // What the app wants the brain to know next time (TutorRuntime.turnNote), and a refused move.
  private pendingTurnNote: string | null = null;
  private refusal: string | null = null;
  // Pictures (lib/illustration): one a reply, never the same one twice.
  private readonly pictureMemory = new PictureMemory();
  private pictureNote: string | null = null;
  // The audible-gap meter: the student's last voiced frame, and the tutor's sound.
  private meter: ReturnType<typeof setInterval> | null = null;
  private lastMicVoiceAt = 0;
  private tutorQuietSince = 0;
  private tutorSounding = false;
  private typedAt = 0;
  /** The conversation so far, for an agent that has to take over mid-lesson. */
  private readonly history: Array<{ role: "tutor" | "student"; text: string }> = [];
  private recovering = false;
  /** Every measured gap (ms) from the student's last word (or a typed line) to the tutor's first sound. */
  readonly gaps: Array<{ ms: number; via: "voice" | "typed"; at: number }> = [];

  readonly boardFrames = "on-demand" as const;

  constructor(
    private readonly callbacks: LiveTutorCallbacks,
    private readonly options: { runtime?: TutorRuntime; illustrator?: IllustratorOption } = {},
  ) {
    this.runtime = options.runtime ?? new TutorRuntime();
  }

  get model(): string {
    return "livekit";
  }

  /** The last debug events, for the voice test to read (they are also recorded with the session). */
  readonly events: Array<{ at: number; message: string; payload?: Record<string, unknown> }> = [];

  private debug(kind: string, message: string, payload?: Record<string, unknown>) {
    this.events.push({ at: Date.now(), message, payload });
    if (this.events.length > 200) this.events.shift();
    this.callbacks.onDebugEvent?.({ kind, message, payload } as never);
  }

  private nextId(role: string) {
    this.ids += 1;
    return `livekit-${role}-${Date.now()}-${this.ids}`;
  }

  private setSpeaking(next: boolean) {
    if (this.speaking === next) return;
    this.speaking = next;
    this.callbacks.onSpeakingChange(next);
  }

  async start(opts: LiveTutorStartOptions): Promise<void> {
    this.getBoardSummary = opts.getBoardSummary;
    this.files = opts.files;
    const active = opts.mode === "resume" ? null : getActiveIntake();
    const res = await fetch("/api/livekit-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The voice lab's picks (lib/voice-lab.ts) ride on the session URL.
      body: JSON.stringify((() => {
        const q = new URLSearchParams(window.location.search);
        return { intake: active?.intake, fileCount: active?.fileCount ?? opts.files.length, tts: q.get("tts") ?? undefined, stt: q.get("stt") ?? undefined, turns: q.get("turns") ?? undefined, wait: q.get("wait") ?? undefined, brain: q.get("brain") ?? undefined };
      })()),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.debug("error", "livekit_config_failed", { status: res.status, detail: detail.slice(0, 300) });
      throw new Error(res.status === 401 ? "Please sign in again to start a session." : "Couldn't reach your tutor. Is the voice agent running?");
    }
    this.config = (await res.json()) as LivekitConfig;
    if (this.ended) return;
    if (active) {
      this.opening = `${intakeOpeningMessage(active.intake, opts.files.length)}\n\n(The session just started. Greet them first, by name, in a few warm words.${opts.files.length ? " Their work is attached and you can see it: say what it's on, then ask which problem they want to start with.)" : " Then ask which they want: a problem on a sheet, or the whole idea.)"}`;
      clearActiveIntake();
    } else if (opts.mode === "resume" && opts.history.length) {
      const last = opts.history.slice(-6).map((t) => `${t.role === "tutor" ? "Tutor" : "Student"}: ${t.text}`).join("\n");
      this.opening = `(We got disconnected and I'm back. Where we were:\n${last}\nPick up from there in a sentence.)`;
    } else {
      this.opening = "Hi! (The student just joined: greet them in a sentence and ask what they're working on.)";
    }

    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;
    this.registerRpc(room);
    this.listen(room);

    await room.connect(this.config.url, this.config.token);
    if (this.ended) return;
    this.debug("connection", "livekit_connected", { room: this.config.room });
    const mic = opts.micStream?.getAudioTracks()[0];
    if (mic) await room.localParticipant.publishTrack(mic, { source: Track.Source.Microphone, name: "microphone" });
    if (opts.micStream) this.startMeter(opts.micStream);
    this.callbacks.onConnected({ resumed: opts.mode === "resume", expiresAt: null });
    this.callbacks.onActivity("thinking");
    // The server dispatches an agent only if one is registered when the room opens.
    setTimeout(() => {
      if (!this.ended && !this.agentIdentity && this.opening) {
        this.callbacks.onError("The voice agent isn't running. Start it with `npm run livekit`, then start a new session.");
      }
    }, 15000);
  }

  private async sendConfig(agent: string) {
    const room = this.room;
    const c = this.config;
    if (!room || !c) return;
    this.agentIdentity = agent;
    // Worksheets first (the agent attaches them to the opening), then the config.
    await this.sendPictures(agent, this.files);
    await room.localParticipant.sendText(JSON.stringify({ instructions: c.instructions, ttsModel: c.ttsModel ?? undefined, voice: c.voice ?? undefined, stt: c.stt ?? undefined, turns: c.turns ?? undefined, wait: c.wait ?? undefined, brain: c.brain ?? undefined }), { topic: "chalk.config", destinationIdentities: [agent] });
    this.debug("connection", "livekit_config_sent", { chars: c.instructions.length, files: this.files.length, stt: c.stt, turns: c.turns, brain: c.brain, tts: c.ttsModel });
  }

  /** Worksheet pictures as byte streams (a PDF goes as its rendered pages). */
  private async sendPictures(agent: string, files: UploadedFile[]) {
    const room = this.room;
    if (!room) return;
    for (const f of files) {
      const pages = f.pages?.length ? f.pages.map((p, i) => ({ name: `${f.label} page ${i + 1}.jpg`, mime: p.mimeType, base64: p.base64 })) : /^image\//.test(f.mimeType) ? [{ name: f.name, mime: f.mimeType, base64: f.base64 }] : [];
      for (const p of pages) {
        const bytes = Uint8Array.from(atob(p.base64), (ch) => ch.charCodeAt(0));
        await room.localParticipant.sendFile(new File([bytes], p.name, { type: p.mime }), { topic: "chalk.file", destinationIdentities: [agent] }).catch((err) => this.debug("error", "livekit_file_failed", { error: String(err).slice(0, 120) }));
      }
    }
  }

  private registerRpc(room: Room) {
    const lp = room.localParticipant;
    lp.registerRpcMethod("chalk.hello", async (data: RpcInvocationData) => {
      // A new agent counts its turns from 1 again: forget the old one's cancelled turns.
      if (data.callerIdentity !== this.agentIdentity) this.cancelled.clear();
      void this.sendConfig(data.callerIdentity);
      return "ok";
    });
    lp.registerRpcMethod("chalk.ready", async (data: RpcInvocationData) => {
      this.agentIdentity = data.callerIdentity;
      this.debug("connection", "livekit_agent_ready", { agent: data.callerIdentity });
      if (this.recovering) {
        this.recovering = false;
        this.callbacks.onConnected({ resumed: true, expiresAt: null });
      }
      const opening = this.opening;
      this.opening = null;
      if (opening) void this.say(opening, true);
      return "ok";
    });
    lp.registerRpcMethod("chalk.turn", async (data: RpcInvocationData) => {
      const { turnId, line, typed } = JSON.parse(data.payload) as { turnId: number; line: string; typed: boolean };
      return JSON.stringify(this.turnNote(turnId, line, typed));
    });
    lp.registerRpcMethod("chalk.check", async (data: RpcInvocationData) => {
      const { turnId, id, args } = JSON.parse(data.payload) as { turnId: number; id: string; args: Record<string, unknown> };
      if (turnId !== this.currentTurn || this.cancelled.has(turnId)) return JSON.stringify({ success: false, error: "stale turn" });
      const r = this.runtime.runTool("check_answer", args, Date.now(), id) ?? { success: false, error: "no checker" };
      this.debug("tool", "livekit_check", { turnId, args, success: r.success, result: (r.success ? r.message : r.error)?.slice(0, 200) });
      return JSON.stringify(r);
    });
    lp.registerRpcMethod("chalk.tool", async (data: RpcInvocationData) => {
      const { turnId, id, name, args } = JSON.parse(data.payload) as { turnId: number; id: string; name: string; args: Record<string, unknown> };
      // Stale-result protection: only the current, uncancelled turn draws.
      if (turnId !== this.currentTurn || this.cancelled.has(turnId)) {
        this.debug("tool", "livekit_tool_stale", { turnId, current: this.currentTurn, name });
        return JSON.stringify({ success: false, error: "stale turn: not drawn" });
      }
      const result = await this.runTool(id, name, args ?? {});
      return JSON.stringify(result);
    });
    lp.registerRpcMethod("chalk.cancel", async (data: RpcInvocationData) => {
      const { turnId } = JSON.parse(data.payload) as { turnId: number };
      this.cancelled.add(turnId);
      this.debug("turn", "livekit_turn_cancelled", { turnId });
      return "ok";
    });
    lp.registerRpcMethod("chalk.done", async (data: RpcInvocationData) => {
      const d = JSON.parse(data.payload) as { turnId: number; said: string; moves: string[]; firstSentenceMs: number | null; brainFirstTokenMs: number | null; noteMs: number; steps: number; usd: number };
      this.debug("pacing", "livekit_turn_done", d);
      if (d.turnId === this.currentTurn) this.finishTutorTurn(d.said);
      if (d.said) this.history.push({ role: "tutor", text: d.said });
      return "ok";
    });
  }

  /** The private note for this line, and this line's turn becomes the current one. */
  private turnNote(turnId: number, line: string, typed: boolean): { note: string; leaving: boolean; forceCheck: boolean } {
    this.currentTurn = turnId;
    this.turnDrew = false;
    this.turnMarked = false;
    this.turnTools = [];
    const text = line.trim();
    if (text && text !== this.lastStudentLine) {
      this.lastStudentLine = text;
      this.history.push({ role: "student", text });
      this.runtime.noteStudentUtterance(text);
      if (!typed) this.callbacks.onTranscript({ role: "student", text, id: this.nextId("student"), at: Date.now() });
    }
    const leaving = Boolean(text) && detectSignals(text).includes("closing");
    const check = this.runtime.takeAutoCheckNote();
    // An answer the auto-check could not read: the brain checks it before it speaks (lib/brain/turn).
    const forceCheck = Boolean(text) && turnId > 1 && !check && looksLikeAnswer(text) && !isNonAnswer(text);
    const note = buildTurnNote({
      check,
      state: formatTutorState(this.runtime.policy, Date.now()) || null,
      board: this.getBoardSummary(),
      reminders: [this.pendingTurnNote, this.refusal, this.pictureNote],
      memory: formatMemory(this.runtime.policy) || null,
      leaving,
    });
    this.pendingTurnNote = null;
    this.refusal = null;
    this.pictureNote = null;
    this.debug("turn", "livekit_note", { turnId, line: text.slice(0, 120), chars: note.length });
    return { note: note.slice(0, 14000), leaving, forceCheck };
  }

  /** One board move from the brain, run exactly as the Gemini client runs it. */
  private async runTool(id: string, name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    this.callbacks.onActivity("writing");
    let result: ToolCallResult;
    try {
      if (name === "remember_about_student") {
        const note = typeof args.note === "string" ? args.note.trim() : "";
        this.runtime.rememberNote(note);
        if (note) void fetch("/api/profile/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }).catch(() => undefined);
        result = { success: true, message: "Noted." };
      } else if (name === "illustrate") {
        result = await this.illustrate(id, args);
      } else {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<ToolCallResult>((resolve) => {
          timer = setTimeout(() => resolve({ success: false, error: "That took too long." }), TOOL_TIMEOUT_MS);
        });
        result = await Promise.race([Promise.resolve(this.callbacks.onToolCall(name, args, id)), timeout]);
        if (timer) clearTimeout(timer);
        if (result.success) {
          const role = toolRole(name);
          if (role === "draw" || role === "mark") this.turnTools.push(name);
          if (role === "draw") {
            this.turnDrew = true;
            this.runtime.noteBoardWrite(name, args);
          }
          if (role === "mark") {
            this.turnMarked = true;
            this.runtime.noteBoardMark();
          }
        }
      }
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : "The board move failed." };
    }
    if (!result.success) this.refusal = `Your last board move (${name}) did not happen: ${result.error}`;
    this.debug("tool", "livekit_tool", { id, name, args, success: result.success, result: (result.success ? result.message : result.error)?.slice(0, 200) });
    setTimeout(() => {
      if (!this.ended && !this.speaking) this.callbacks.onActivity("idle");
    }, 1200);
    return result;
  }

  /** illustrate(what, notice): /api/illustrate draws the scene; the board puts it up under this call's id. */
  private async illustrate(id: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const req = illustrateRequest(args);
    if (!req) return { success: false, error: ILLUSTRATE_NOTHING };
    const ill = this.options.illustrator;
    if (!ill) return { success: false, error: illustrateFailed("this session can't draw pictures") };
    const same = this.pictureMemory.find(req.what, ill.board());
    if (same) return { success: true, message: alreadyDrawn(same.item, same.message) };
    const job = (async (): Promise<ToolCallResult> => {
      try {
        const r = await fetch("/api/illustrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grade: ill.grade(), what: req.what, notice: req.notice, conversation: this.lastStudentLine ? [{ who: "student", text: this.lastStudentLine }] : [], board: ill.board() }) });
        const j = r.ok ? ((await r.json()) as { scene?: unknown }) : null;
        if (!j?.scene) return { success: false, error: illustrateFailed(r.ok ? "no picture came back" : `status ${r.status}`) };
        const message = await ill.draw(j.scene, id);
        if (!message) return { success: false, error: illustrateFailed("the board refused it") };
        this.pictureMemory.remember(req.what, message);
        this.runtime.noteBoardWrite("draw_illustration");
        this.turnDrew = true;
        return { success: true, message };
      } catch {
        return { success: false, error: illustrateFailed("the request failed") };
      }
    })();
    const waited = await Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), ILLUSTRATE_WAIT_MS))]);
    if (waited) return waited;
    void job.then((r) => {
      if (!r.success) this.pictureNote = `The picture you said you'd draw (${req.what.slice(0, 80)}) could not be drawn. Say so in a few words and go on without it.`;
    });
    return { success: true, message: ILLUSTRATE_PENDING };
  }

  /** The tutor finished a reply: the lesson state learns what it said and drew. */
  private finishTutorTurn(text: string) {
    const said = text.trim();
    if (!said) return;
    this.runtime.noteTutorSpeech(said);
    this.runtime.noteTutorTurn(said, this.turnDrew, this.turnMarked);
    this.pendingTurnNote = this.runtime.turnNote(said, this.turnDrew, this.turnMarked) ?? this.pendingTurnNote;
    this.debug("turn", "livekit_tutor_turn", { text: said.slice(0, 200), tools: this.turnTools, student: this.lastStudentLine.slice(0, 120) });
  }

  /** The audible gap: the student's last loud mic frame (or a typed line) to the tutor's first sound. */
  private startMeter(mic: MediaStream) {
    try {
      const ctx = this.audioCtx ?? new AudioContext();
      this.audioCtx = ctx;
      const src = ctx.createMediaStreamSource(mic);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      this.meter = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        if (Math.sqrt(sum / buf.length) > MIC_VOICE_RMS && !this.tutorSounding) this.lastMicVoiceAt = performance.now();
      }, 20);
    } catch {
      // no meter; the session still runs
    }
  }

  private watchTutor(analyser: AnalyserNode) {
    const buf = new Float32Array(analyser.fftSize);
    const tick = setInterval(() => {
      if (this.ended) return clearInterval(tick);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const loud = Math.sqrt(sum / buf.length) > TUTOR_VOICE_RMS;
      const now = performance.now();
      if (loud && !this.tutorSounding && now - this.tutorQuietSince > 400) {
        this.tutorSounding = true;
        const since = this.typedAt > this.lastMicVoiceAt ? { at: this.typedAt, via: "typed" as const } : { at: this.lastMicVoiceAt, via: "voice" as const };
        // A tutor pause between sentences is not a new reply: only a student line before it counts.
        if (since.at && now - since.at < 30000 && now - since.at > 250) {
          const ms = Math.round(now - since.at);
          this.gaps.push({ ms, via: since.via, at: Date.now() });
          this.debug("pacing", "livekit_audible_gap", { ms, via: since.via });
        }
        this.typedAt = 0;
        this.lastMicVoiceAt = 0;
      } else if (!loud && this.tutorSounding) {
        this.tutorSounding = false;
        this.tutorQuietSince = now;
      } else if (!loud) {
        if (!this.tutorQuietSince) this.tutorQuietSince = now;
      } else {
        this.tutorQuietSince = 0;
      }
    }, 20);
  }

  private listen(room: Room) {
    room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      if (p.kind === ParticipantKind.AGENT) this.agentIdentity = p.identity;
    });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio || participant.kind !== ParticipantKind.AGENT) return;
      const el = track.attach() as HTMLAudioElement;
      el.style.display = "none";
      document.body.appendChild(el);
      this.audioEl = el;
      try {
        const ctx = this.audioCtx ?? new AudioContext();
        this.audioCtx = ctx;
        const source = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        void ctx.resume();
        this.callbacks.onAudioAnalyser?.(analyser);
        this.watchTutor(analyser);
      } catch {
        // no wave, the voice still plays
      }
    });

    room.on(RoomEvent.ParticipantAttributesChanged, (changed: Record<string, string>, participant) => {
      const state = changed["lk.agent.state"];
      if (!state || participant.identity === room.localParticipant.identity) return;
      this.debug("turn", "agent_state", { state });
      if (state === "thinking") this.callbacks.onActivity("thinking");
      if (state === "speaking") this.setSpeaking(true);
      else {
        this.setSpeaking(false);
        if (state === "listening") this.callbacks.onActivity("idle");
      }
    });

    // Captions arrive as text streams in step with the voice (syncTranscription):
    // an interrupted sentence is cut where the voice stopped.
    room.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
      const fromAgent = participantInfo.identity !== room.localParticipant.identity;
      if (!fromAgent) {
        await reader.readAll().catch(() => "");
        return;
      }
      let text = "";
      for await (const chunk of reader) {
        text += chunk;
        this.callbacks.onCaption(text.trim());
      }
      if (text.trim()) this.callbacks.onTranscript({ role: "tutor", text: text.trim(), id: this.nextId("tutor"), at: Date.now() });
    });

    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      if (state === ConnectionState.Reconnecting) this.callbacks.onReconnecting(1);
      if (state === ConnectionState.Connected && this.agentIdentity) this.debug("connection", "livekit_reconnected", {});
    });
    room.on(RoomEvent.Disconnected, () => {
      if (!this.ended) this.callbacks.onDisconnected("room_closed");
    });
    room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      if (p.kind === ParticipantKind.AGENT && !this.ended) void this.recoverAgent();
    });
  }

  /** The agent died mid-lesson: ask for a new one and hand it the conversation so far. */
  private async recoverAgent() {
    if (this.recovering || !this.config) return;
    this.recovering = true;
    this.agentIdentity = null;
    this.callbacks.onReconnecting(1);
    this.debug("connection", "livekit_agent_lost", {});
    const last = this.history.slice(-8).map((t) => `${t.role === "tutor" ? "Tutor" : "Student"}: ${t.text}`).join("\n");
    this.opening = `(The call dropped on your side for a few seconds and you're back. Where you were:\n${last || "(nothing yet)"}\nSay sorry for the drop in a few words, then pick up from there: if the student's last line was never answered, answer it.)`;
    try {
      const r = await fetch("/api/livekit-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redispatch: this.config.room }) });
      if (!r.ok) throw new Error(String(r.status));
    } catch (err) {
      this.callbacks.onError("The tutor's connection could not be restored. Try again.");
      this.debug("error", "livekit_redispatch_failed", { error: String(err).slice(0, 120) });
      return;
    }
    // The new agent says chalk.hello, gets the config, then chalk.ready sends the opening above.
    setTimeout(() => {
      if (!this.ended && !this.agentIdentity) this.callbacks.onError("The tutor's connection could not be restored. Try again.");
      this.recovering = false;
    }, 20000);
  }

  /** A line for the agent to answer as if the student said it (typed, or the opening). */
  private async say(text: string, opening = false): Promise<boolean> {
    const room = this.room;
    const agent = this.agentIdentity ?? [...(room?.remoteParticipants.values() ?? [])].find((p) => p.kind === ParticipantKind.AGENT)?.identity;
    if (!room || !agent) return false;
    this.callbacks.onActivity("thinking");
    this.typedAt = performance.now();
    try {
      await room.localParticipant.performRpc({ destinationIdentity: agent, method: "chalk.say", payload: JSON.stringify({ text, opening }), responseTimeout: 10000 });
      return true;
    } catch (err) {
      this.debug("error", "livekit_say_failed", { error: String(err).slice(0, 200) });
      return false;
    }
  }

  async end(): Promise<void> {
    this.ended = true;
    if (this.meter) clearInterval(this.meter);
    this.callbacks.onAudioAnalyser?.(null);
    this.audioEl?.remove();
    this.audioEl = null;
    void this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
    await this.room?.disconnect().catch(() => undefined);
    this.room = null;
    if (this.speaking) {
      this.speaking = false;
      this.callbacks.onSpeakingChange(false);
    }
  }

  setMuted(muted: boolean) {
    const pub = this.room?.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (!pub?.track) return;
    if (muted) void pub.mute();
    else void pub.unmute();
  }

  sendText(text: string): boolean {
    if (!this.room || this.room.state !== ConnectionState.Connected) return false;
    void this.say(text);
    return true;
  }

  sendFiles(files: UploadedFile[]): boolean {
    // A mid-session upload: the agent gets the pictures with a line saying so.
    const agent = this.agentIdentity;
    if (!files.length || !agent) return false;
    void this.sendPictures(agent, files).then(() => this.say(`(I just added ${files.length === 1 ? "a file" : `${files.length} files`}: ${files.map((f) => f.name).join(", ")}. It's attached: say what it's on and ask which problem first.)`));
    return true;
  }

  sendStudentEvent(text: string): boolean {
    void this.say(text);
    return true;
  }
}
