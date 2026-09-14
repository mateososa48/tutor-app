"use client";

// Browser client for the GPT-Live tutor.
//
// Transport: WebRTC. The mic track and the tutor's voice ride on media tracks
// (the browser handles echo cancellation, jitter, and playback); JSON events
// ride on the "oai-events" data channel. Our server creates the session
// (app/api/live-session) so the API key never reaches the browser.
//
// Responsibilities:
//   - negotiate the peer connection and wait for `session.started`
//   - assemble transcript fragments into utterances
//   - run the backend tool loop (whiteboard tools) via BackendTurnTracker
//   - meter the remote audio to drive the "tutor speaking" indicator
//   - rebuild the session with recent history if the connection drops

import type { UploadedFile } from "./file-processor";
import type {
  LiveDebugEvent,
  ToolCallResult,
  TranscriptEntry,
  TutorActivity,
} from "./live-types";
import { BackendTurnTracker, TranscriptAssembler } from "./live-events";
import { buildFilesItemText } from "./tutor-prompts";

const DATA_CHANNEL_LABEL = "oai-events";
const SESSION_START_TIMEOUT_MS = 15_000;
const ICE_GATHER_TIMEOUT_MS = 1_500;
const CLOSE_TIMEOUT_MS = 2_500;
const MAX_RECONNECT_ATTEMPTS = 3;
const HISTORY_TURNS = 24;
const MAX_NOTES = 40;

export type LiveTutorCallbacks = {
  onTranscript: (entry: TranscriptEntry) => void;
  /** Live, growing text of the tutor's current utterance (for captions). */
  onCaption: (text: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => ToolCallResult;
  onConnected: (info: { resumed: boolean; expiresAt: number | null }) => void;
  onReconnecting: (attempt: number) => void;
  /** The session is over and will not reconnect. */
  onDisconnected: (reason: string) => void;
  onError: (message: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
  /** The analyser on the tutor's audio, so the UI can draw a live waveform. Null when detached. */
  onAudioAnalyser?: (analyser: AnalyserNode | null) => void;
  onActivity: (activity: TutorActivity) => void;
  onDebugEvent?: (event: LiveDebugEvent) => void;
};

export type LiveTutorStartOptions = {
  mode: "new" | "resume";
  /** null = text-only session (no microphone). */
  micStream: MediaStream | null;
  files: UploadedFile[];
  /** Recent transcript, oldest first, used to seed a resumed session. */
  history: { role: "tutor" | "student"; text: string }[];
  sessionTitle: string;
  getBoardSummary: () => string;
};

type HistoryTurn = { role: "tutor" | "student"; text: string };

type LiveSessionResponse = {
  sessionId: string;
  sdp: string;
  notes?: string[];
  greeting?: string;
  resume?: string;
};

function fileToInputContent(file: UploadedFile): Record<string, unknown> | null {
  if (file.mimeType === "image/jpeg" || file.mimeType === "image/png") {
    return {
      type: "input_image",
      detail: "auto",
      image_url: `data:${file.mimeType};base64,${file.base64}`,
    };
  }
  if (file.mimeType === "application/pdf") {
    return {
      type: "input_file",
      filename: file.name,
      file_data: `data:application/pdf;base64,${file.base64}`,
    };
  }
  if (file.mimeType === "text/plain") {
    let text = "";
    try {
      const binary = atob(file.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      text = new TextDecoder().decode(bytes);
    } catch {
      text = "";
    }
    return { type: "input_text", text: text || "(empty text file)" };
  }
  return null;
}

// The Live model's clock is driven by inbound audio: with no input track, the
// session never advances (appended context is never "injected" and the model
// never speaks). For text-only QA sessions we therefore feed a faint noise
// track instead of nothing — quiet enough to never transcribe as words.
function createSyntheticMicStream(): { stream: MediaStream; close: () => void } | null {
  try {
    const ctx = new AudioContext();
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 0.002;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);
    source.start();
    void ctx.resume();
    return {
      stream: dest.stream,
      close: () => {
        try { source.stop(); } catch { /* noop */ }
        void ctx.close();
      },
    };
  } catch {
    return null;
  }
}

// RMS meter over the remote audio track. WebRTC gives us no "speaking" event,
// so the indicator is driven by what is actually coming out of the speaker.
class SpeakingMeter {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Float32Array<ArrayBuffer> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private speaking = false;
  private lastLoudAt = 0;

  constructor(
    private readonly onChange: (speaking: boolean) => void,
    private readonly onAnalyser?: (analyser: AnalyserNode | null) => void,
  ) {}

  attach(stream: MediaStream) {
    this.detach();
    try {
      this.ctx = new AudioContext();
      const source = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      source.connect(this.analyser);
      this.data = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
      this.timer = setInterval(() => this.tick(), 60);
      this.onAnalyser?.(this.analyser);
    } catch {
      this.detach();
    }
  }

  private tick() {
    if (!this.analyser || !this.data) return;
    this.analyser.getFloatTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) sum += this.data[i] * this.data[i];
    const rms = Math.sqrt(sum / this.data.length);
    const now = Date.now();
    if (rms > 0.012) this.lastLoudAt = now;
    const next = now - this.lastLoudAt < 420;
    if (next !== this.speaking) {
      this.speaking = next;
      this.onChange(next);
    }
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  detach() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try { void this.ctx?.close(); } catch { /* already closed */ }
    this.ctx = null;
    if (this.analyser) this.onAnalyser?.(null);
    this.analyser = null;
    this.data = null;
    if (this.speaking) {
      this.speaking = false;
      this.onChange(false);
    }
  }
}

// Turn the create-session failure into something a student (or the person
// running the app) can act on. The server forwards OpenAI's message in
// `detail`; the two cases worth naming are billing and a bad key.
function describeStartFailure(status: number, detail: string): string {
  if (status === 401) return "Please sign in again to start a session.";
  let text = detail;
  try {
    const parsed = JSON.parse(detail) as { detail?: unknown; error?: unknown };
    if (typeof parsed.detail === "string") text = parsed.detail;
    else if (typeof parsed.error === "string") text = parsed.error;
  } catch {
    // plain text
  }
  if (/no credits|insufficient_quota|billing|exceeded your current quota/i.test(text)) {
    return "The tutor is paused: the OpenAI account is out of credits. Add credits at platform.openai.com and try again.";
  }
  if (/invalid_api_key|incorrect api key|misconfigured/i.test(text)) {
    return "The tutor is not set up: the OpenAI API key is missing or invalid.";
  }
  if (/rate limit|429/i.test(text)) {
    return "The tutor is busy right now. Wait a moment and try again.";
  }
  return "Couldn't reach your tutor. Check your internet connection and try again.";
}

export class LiveTutorSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private meter: SpeakingMeter;
  private assembler: TranscriptAssembler;
  private turns: BackendTurnTracker;
  private opts: LiveTutorStartOptions | null = null;
  private micStream: MediaStream | null = null;
  private syntheticMic: { stream: MediaStream; close: () => void } | null = null;
  private started = false;
  private ending = false;
  private reconnectAttempts = 0;
  private notesList: string[] = [];
  private recent: HistoryTurn[] = [];
  private idCounter = 0;
  private eventCounter = 0;
  private muted = false;
  private expiresAt: number | null = null;
  private closedWaiter: (() => void) | null = null;
  private startWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private generation = 0;

  constructor(private readonly callbacks: LiveTutorCallbacks) {
    this.meter = new SpeakingMeter(
      (speaking) => this.callbacks.onSpeakingChange(speaking),
      (analyser) => this.callbacks.onAudioAnalyser?.(analyser),
    );
    this.assembler = new TranscriptAssembler({
      onFlush: (role, text, at) => {
        this.recent.push({ role, text });
        if (this.recent.length > HISTORY_TURNS * 2) this.recent.splice(0, this.recent.length - HISTORY_TURNS * 2);
        this.callbacks.onTranscript({ id: this.nextId(), role, text, at });
      },
      onPartial: (role, text) => {
        if (role === "tutor") this.callbacks.onCaption(text);
      },
    });
    this.turns = new BackendTurnTracker({
      execute: (name, args) => this.executeTool(name, args),
      send: (event) => this.send(event as Record<string, unknown>),
      onActivity: (activity) => this.callbacks.onActivity(activity),
      onBackendText: (text) => this.debug("backend", "backend_text", { text }),
      debug: (kind, message, payload) => this.debug(kind, message, payload),
    });
  }

  get notes(): string[] {
    return this.notesList;
  }

  private nextId() {
    return `t${++this.idCounter}`;
  }

  private debug(kind: string, message: string, payload?: Record<string, unknown>) {
    this.callbacks.onDebugEvent?.({ kind, message, payload });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async start(opts: LiveTutorStartOptions): Promise<void> {
    this.opts = opts;
    this.micStream = opts.micStream;
    this.recent = opts.history.slice(-HISTORY_TURNS);
    this.ending = false;
    this.reconnectAttempts = 0;
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      // Dev-only handle for poking at the live session from the console / QA.
      (window as unknown as { __liveTutor?: LiveTutorSession }).__liveTutor = this;
    }
    await this.openConnection(opts.mode === "resume");
  }

  /** Dev/QA: raw peer-connection stats and channel state. */
  async debugStats(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {
      started: this.started,
      dataChannel: this.dc?.readyState ?? null,
      peer: this.pc?.connectionState ?? null,
      notes: this.notesList,
    };
    if (!this.pc) return out;
    const stats = await this.pc.getStats();
    const rtp: Record<string, unknown>[] = [];
    stats.forEach((report) => {
      if (report.type === "inbound-rtp" || report.type === "outbound-rtp") {
        const r = report as unknown as Record<string, unknown>;
        rtp.push({ type: r.type, kind: r.kind, bytes: r.bytesReceived ?? r.bytesSent, packets: r.packetsReceived ?? r.packetsSent });
      }
    });
    out.rtp = rtp;
    return out;
  }

  /** Dev/QA: send a raw client event. */
  debugSend(event: Record<string, unknown>): boolean {
    return this.send(event);
  }

  private async openConnection(resumed: boolean): Promise<void> {
    const gen = ++this.generation;
    const opts = this.opts;
    if (!opts) throw new Error("start() must be called first");
    this.started = false;
    this.debug("connection", resumed ? "webrtc_resuming" : "webrtc_connecting");

    const pc = new RTCPeerConnection();
    this.pc = pc;

    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.setAttribute("playsinline", "true");
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
    this.audioEl = audioEl;

    pc.addEventListener("track", (event) => {
      if (this.pc !== pc) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      audioEl.srcObject = stream;
      void audioEl.play().catch(() => {
        this.debug("audio", "autoplay_blocked");
      });
      this.meter.attach(stream);
      this.meter.resume();
      this.debug("audio", "remote_track_attached");
    });

    pc.addEventListener("connectionstatechange", () => {
      if (this.pc !== pc) return;
      this.debug("connection", "peer_state", { state: pc.connectionState });
      if (pc.connectionState === "failed") this.handleLost("peer_connection_failed");
    });

    if (this.micStream) {
      for (const track of this.micStream.getAudioTracks()) {
        track.enabled = !this.muted;
        pc.addTrack(track, this.micStream);
      }
    } else {
      // Text-only QA session: the model still needs an inbound audio track to
      // keep its timeline moving, so send faint synthetic room tone.
      if (!this.syntheticMic) this.syntheticMic = createSyntheticMicStream();
      if (this.syntheticMic) {
        for (const track of this.syntheticMic.stream.getAudioTracks()) pc.addTrack(track, this.syntheticMic.stream);
        this.debug("audio", "synthetic_mic_attached");
      } else {
        pc.addTransceiver("audio", { direction: "recvonly" });
        this.debug("audio", "synthetic_mic_unavailable");
      }
    }

    const dc = pc.createDataChannel(DATA_CHANNEL_LABEL);
    this.dc = dc;
    dc.addEventListener("message", (event) => {
      if (this.dc !== dc) return;
      this.handleMessage(String(event.data));
    });
    dc.addEventListener("close", () => {
      if (this.dc !== dc) return;
      this.debug("connection", "data_channel_closed");
      if (!this.ending) this.handleLost("data_channel_closed");
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc, ICE_GATHER_TIMEOUT_MS);
    if (this.generation !== gen) return;

    const body = {
      sdp: pc.localDescription?.sdp ?? offer.sdp,
      mode: resumed ? "resume" : "new",
      history: resumed ? this.recent.slice(-HISTORY_TURNS) : [],
      boardSummary: resumed ? opts.getBoardSummary() : "",
      sessionTitle: opts.sessionTitle,
      fileNames: opts.files.map((f) => f.name),
    };
    const res = await fetch("/api/live-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (this.generation !== gen) return;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.debug("error", "live_session_create_failed", { status: res.status, detail: detail.slice(0, 300) });
      throw new Error(describeStartFailure(res.status, detail));
    }
    const data = (await res.json()) as LiveSessionResponse;
    if (Array.isArray(data.notes)) this.notesList = data.notes.filter((n): n is string => typeof n === "string");
    // The opening lines need the student's profile, so the server composes
    // them and returns them alongside the SDP answer.
    this.serverInstructions = { greeting: data.greeting ?? "", resume: data.resume ?? "" };
    await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
    this.debug("connection", "sdp_answer_applied", { openaiSessionId: data.sessionId });

    await new Promise<void>((resolve, reject) => {
      this.startWaiter = { resolve, reject };
      setTimeout(() => {
        if (this.startWaiter && !this.started) {
          this.startWaiter.reject(new Error("The tutor took too long to answer. Please try again."));
          this.startWaiter = null;
        }
      }, SESSION_START_TIMEOUT_MS);
    });
    if (this.generation !== gen) return;

    // Session is live. Hand the backend any pre-attached files (it reads them
    // on its first delegation), then have the voice model open the conversation.
    if (opts.files.length > 0) this.pushFilesToBackend(opts.files);
    this.speakOpeningLine(resumed ? "resume" : "greeting");
    this.reconnectAttempts = 0;
    this.callbacks.onConnected({ resumed, expiresAt: this.expiresAt });
  }

  private serverInstructions: { greeting: string; resume: string } = { greeting: "", resume: "" };

  // Opening line (greeting on a new session, a short "I'm back" on a resumed
  // one). Sent as commentary: the voice model speaks a natural paraphrase of
  // it right away, whereas appended instructions alone never trigger speech.
  private speakOpeningLine(kind: "greeting" | "resume") {
    const text = kind === "resume" ? this.serverInstructions.resume : this.serverInstructions.greeting;
    if (!text) return;
    this.send({
      type: "session.commentary.append",
      event_id: `open_${++this.eventCounter}`,
      delegation_id: null,
      content: text,
    });
  }

  async end(): Promise<void> {
    this.ending = true;
    this.generation++;
    this.assembler.flushAll();
    if (this.dc?.readyState === "open" && this.started) {
      const closed = new Promise<void>((resolve) => {
        this.closedWaiter = resolve;
        setTimeout(resolve, CLOSE_TIMEOUT_MS);
      });
      this.send({ type: "session.close", event_id: `close_${++this.eventCounter}` });
      await closed;
    }
    this.teardown();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.syntheticMic?.close();
    this.syntheticMic = null;
    this.turns.reset();
  }

  private teardown() {
    this.meter.detach();
    try { this.dc?.close(); } catch { /* noop */ }
    try { this.pc?.close(); } catch { /* noop */ }
    this.dc = null;
    this.pc = null;
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl.remove();
      this.audioEl = null;
    }
    this.started = false;
  }

  private handleLost(reason: string) {
    if (this.ending) return;
    this.assembler.flushAll();
    this.teardown();
    this.turns.reset();
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.debug("connection", "reconnect_exhausted", { reason });
      this.callbacks.onDisconnected(reason);
      return;
    }
    this.reconnectAttempts += 1;
    this.debug("connection", "reconnect_scheduled", { reason, attempt: this.reconnectAttempts });
    this.callbacks.onReconnecting(this.reconnectAttempts);
    const delay = 400 * this.reconnectAttempts;
    setTimeout(() => {
      if (this.ending) return;
      this.openConnection(true).catch((err) => {
        this.debug("error", "reconnect_failed", { message: String(err) });
        this.handleLost("reconnect_failed");
      });
    }, delay);
  }

  // ── Outbound ─────────────────────────────────────────────────────────────

  private send(event: Record<string, unknown>): boolean {
    if (this.dc?.readyState !== "open") return false;
    try {
      this.dc.send(JSON.stringify(event));
      return true;
    } catch {
      return false;
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.micStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    this.send({
      type: muted ? "session.input_audio.mute" : "session.input_audio.unmute",
      event_id: `mute_${++this.eventCounter}`,
    });
  }

  // Typed text goes straight to the teaching backend as a user message and we
  // request a backend turn. The Live service treats that as a delegation: the
  // voice model bridges, then speaks the backend's reply — the same path a
  // spoken question takes.
  sendText(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || !this.started) return false;
    const queued = this.send({
      type: "response.item.create",
      event_id: `typed_${++this.eventCounter}`,
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: `(typed instead of spoken) ${trimmed}` }],
      },
    });
    if (!queued) return false;
    return this.requestBackendTurn();
  }

  // Files are delivered to the backend as an attachment message, then a backend
  // turn is requested so the tutor acknowledges what it can see.
  sendFiles(files: UploadedFile[]): boolean {
    if (!this.started || files.length === 0) return false;
    if (!this.pushFilesToBackend(files)) return false;
    return this.requestBackendTurn();
  }

  private requestBackendTurn(): boolean {
    this.turns.handleDelegationCreated();
    return this.send({ type: "response.create", event_id: `turn_${++this.eventCounter}` });
  }

  private pushFilesToBackend(files: UploadedFile[]): boolean {
    const content: Record<string, unknown>[] = [
      { type: "input_text", text: buildFilesItemText(files.map((f) => `${f.label} (${f.name})`)) },
    ];
    for (const f of files) {
      const part = fileToInputContent(f);
      if (!part) {
        content.push({ type: "input_text", text: `${f.label} — "${f.name}": skipped (unsupported type ${f.mimeType || "unknown"}).` });
        continue;
      }
      content.push({ type: "input_text", text: `${f.label} — "${f.name}":` });
      content.push(part);
    }
    const ok = this.send({
      type: "response.item.create",
      event_id: `files_${++this.eventCounter}`,
      item: { type: "message", role: "user", content },
    });
    this.debug("file", "files_pushed_to_backend", { count: files.length, delivered: ok });
    return ok;
  }

  // ── Tools ────────────────────────────────────────────────────────────────

  private async executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    if (name === "remember_about_student") {
      const note = typeof args.note === "string" ? args.note.trim() : "";
      if (!note) return { success: false, error: "Missing note." };
      if (!this.notesList.includes(note)) {
        this.notesList.push(note);
        if (this.notesList.length > MAX_NOTES) this.notesList.shift();
      }
      try {
        const res = await fetch("/api/profile/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        });
        if (res.ok) {
          const data = (await res.json()) as { notes?: string[] };
          if (Array.isArray(data.notes)) this.notesList = data.notes.filter((n): n is string => typeof n === "string");
        }
      } catch {
        // Keep the local copy; the note still lives in this session.
      }
      return { success: true, message: `Noted. [Memory: ${this.notesList.join("; ")}]` };
    }
    return this.callbacks.onToolCall(name, args);
  }

  // ── Inbound ──────────────────────────────────────────────────────────────

  private handleMessage(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.debug("error", "unparseable_event", { raw: raw.slice(0, 200) });
      return;
    }
    const type = typeof msg.type === "string" ? msg.type : "";

    switch (type) {
      case "session.started": {
        const session = msg.session as Record<string, unknown> | undefined;
        this.expiresAt = typeof session?.expires_at === "number" ? session.expires_at : null;
        this.started = true;
        this.debug("connection", "session_started", {
          openaiSessionId: session?.id,
          expiresAt: this.expiresAt,
        });
        this.startWaiter?.resolve();
        this.startWaiter = null;
        return;
      }
      case "session.input_transcript.delta": {
        if (typeof msg.delta === "string") this.assembler.push("student", msg.delta);
        return;
      }
      case "session.output_transcript.delta": {
        if (typeof msg.delta === "string") this.assembler.push("tutor", msg.delta);
        return;
      }
      case "session.delegation.created": {
        const d = msg.delegation as Record<string, unknown> | undefined;
        this.debug("backend", "delegation_created", { id: d?.id, target: d?.target });
        this.turns.handleDelegationCreated();
        return;
      }
      case "response.event": {
        const nested = msg.event as Record<string, unknown> | undefined;
        if (nested) void this.turns.handleResponseEvent(nested);
        return;
      }
      case "session.usage.updated": {
        const usage = msg.usage as Record<string, unknown> | undefined;
        const ctx = msg.context_window as Record<string, unknown> | undefined;
        this.debug("usage", "usage_updated", { seconds: usage?.seconds, contextRatio: ctx?.usage_ratio });
        return;
      }
      case "session.closed": {
        const reason = typeof msg.reason === "string" ? msg.reason : "unknown";
        const usage = msg.usage as Record<string, unknown> | undefined;
        this.debug("connection", "session_closed", { reason, seconds: usage?.seconds });
        if (this.closedWaiter) {
          this.closedWaiter();
          this.closedWaiter = null;
          return;
        }
        if (this.ending) return;
        if (reason === "content") {
          this.ending = true;
          this.teardown();
          this.callbacks.onError("The session was ended by a safety filter.");
          return;
        }
        this.handleLost(`session_closed:${reason}`);
        return;
      }
      case "error": {
        const err = msg.error as Record<string, unknown> | undefined;
        this.debug("error", "live_error", { code: err?.code, message: err?.message, param: err?.param, clientEventId: err?.client_event_id });
        if (!this.started && this.startWaiter) {
          this.startWaiter.reject(new Error("Your tutor hit a technical problem starting up. Please try again."));
          this.startWaiter = null;
        }
        return;
      }
      case "info": {
        this.debug("connection", "live_info", { code: msg.code, message: msg.message });
        return;
      }
      case "session.instructions.appended":
      case "session.thinking.appended":
      case "session.commentary.appended":
      case "session.input_audio.muted":
      case "session.input_audio.unmuted":
      case "session.updated":
        this.debug("connection", type, { clientEventId: msg.client_event_id });
        return;
      default:
        this.debug("connection", "unhandled_event", { type });
        return;
    }
  }

}

async function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, timeoutMs);
  });
}
