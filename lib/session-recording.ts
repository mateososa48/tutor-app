// Session recordings for the admin replay (Sept 15 2026). Pure and shared:
// the client recorder clamps payloads with it, the events route validates
// kinds with it, and the admin pages and exports read recordings with it.

export const RECORDED_EVENT_KINDS = [
  "transcript.entry",
  "whiteboard.snapshot",
  "board.update.ready",
  "board.update.failed",
  "session.paused",
  "session.resumed",
  "session.ended",
  "session.started",
  "tool.call",
  "live.debug",
  "tutor.speaking",
  "tutor.activity",
  "board.frame",
  "settings.speed",
] as const;
export type RecordedEventKind = (typeof RECORDED_EVENT_KINDS)[number];
export const EVENT_ACTORS = ["student", "tutor", "system"] as const;

export type TimelineEvent = {
  seq: number;
  offsetMs: number;
  kind: string;
  actor: string;
  payload: Record<string, unknown>;
};

/** Keep a recorded payload small: long strings are cut, long lists trimmed, deep nesting stopped. */
export function clampPayload(value: unknown, maxString = 4000, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > maxString ? `${value.slice(0, maxString)}… [${value.length - maxString} more characters]` : value;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (value === undefined || typeof value === "function") return undefined;
  if (depth >= 6) return "[nested too deeply]";
  if (Array.isArray(value)) {
    const items = value.slice(0, 200).map((item) => clampPayload(item, maxString, depth + 1));
    return value.length > 200 ? [...items, `[${value.length - 200} more items]`] : items;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const clamped = clampPayload(item, maxString, depth + 1);
      if (clamped !== undefined) out[key] = clamped;
    }
    return out;
  }
  return String(value);
}

/** 65300 → "1:05.3"; an hour or more → "1:02:03.4". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor(total / 60_000) % 60;
  const tenths = Math.floor((total % 60_000) / 100) / 10;
  const seconds = tenths.toFixed(1).padStart(4, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** The last item at or before `t` in a list sorted by offsetMs, or -1. */
export function lastIndexAtOrBefore<T extends { offsetMs: number }>(list: readonly T[], t: number): number {
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].offsetMs <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

// ── Speech ────────────────────────────────────────────────────────────────────
export type Utterance = { role: "student" | "tutor"; text: string; startMs: number; endMs: number };

function joinFragments(a: string, b: string): string {
  if (/^[.,!?;:%)\]}'’]/.test(b) || /[([{-]$/.test(a)) return `${a}${b}`;
  return `${a} ${b}`;
}

/** Live transcription arrives in small fragments; consecutive fragments from one speaker become one utterance. */
export function mergeUtterances(events: readonly TimelineEvent[], gapMs = 1800): Utterance[] {
  const fragments = events
    .filter((e) => e.kind === "transcript.entry")
    .map((e) => {
      const role = e.payload.role === "student" || e.payload.role === "tutor" ? e.payload.role : e.actor;
      return { role, text: typeof e.payload.text === "string" ? e.payload.text.trim() : "", at: e.offsetMs, seq: e.seq };
    })
    .filter((f): f is { role: "student" | "tutor"; text: string; at: number; seq: number } => Boolean(f.text) && (f.role === "student" || f.role === "tutor"))
    .sort((a, b) => a.at - b.at || a.seq - b.seq);
  const out: Utterance[] = [];
  for (const f of fragments) {
    const last = out[out.length - 1];
    if (last && last.role === f.role && f.at - last.endMs <= gapMs) {
      last.text = joinFragments(last.text, f.text);
      last.endMs = f.at;
    } else {
      out.push({ role: f.role, text: f.text, startMs: f.at, endMs: f.at });
    }
  }
  return out;
}

/** When the tutor's voice was playing, from tutor.speaking on/off events. */
export function speakingIntervals(events: readonly TimelineEvent[]): Array<{ startMs: number; endMs: number }> {
  const out: Array<{ startMs: number; endMs: number }> = [];
  let open: number | null = null;
  const sorted = events.filter((e) => e.kind === "tutor.speaking").sort((a, b) => a.offsetMs - b.offsetMs || a.seq - b.seq);
  for (const e of sorted) {
    if (e.payload.speaking === true) {
      if (open === null) open = e.offsetMs;
    } else if (open !== null) {
      out.push({ startMs: open, endMs: Math.max(open, e.offsetMs) });
      open = null;
    }
  }
  if (open !== null) out.push({ startMs: open, endMs: open + 2000 });
  return out;
}

// ── Analysis ──────────────────────────────────────────────────────────────────
export type SessionFlag = { offsetMs: number; tone: "warn" | "error"; label: string };

export type SessionAnalysis = {
  durationMs: number;
  studentTurns: number;
  tutorTurns: number;
  toolCalls: number;
  toolErrors: number;
  interruptions: number;
  reconnects: number;
  errors: number;
  frames: number;
  medianReplyMs: number | null;
  slowestReplyMs: number | null;
  replies: number;
  longestSilenceMs: number;
  flags: SessionFlag[];
};

const SLOW_REPLY_MS = 6000;
const LONG_SILENCE_MS = 20_000;

function inner(e: TimelineEvent): Record<string, unknown> {
  const p = e.payload.payload;
  return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

type ToolRecord = { offsetMs: number; name: string; success: boolean; error: unknown };

function toolRecords(sorted: readonly TimelineEvent[]): ToolRecord[] {
  // The live client reports every tool (board and tutor tools); older recordings only have tool.call.
  const responses = sorted.filter((e) => e.kind === "live.debug" && e.payload.message === "tool_response_sent");
  if (responses.length > 0) {
    return responses.map((e) => ({ offsetMs: e.offsetMs, name: String(inner(e).name ?? "tool"), success: inner(e).success !== false, error: inner(e).error }));
  }
  return sorted
    .filter((e) => e.kind === "tool.call")
    .map((e) => ({ offsetMs: e.offsetMs, name: String(e.payload.name ?? "tool"), success: e.payload.success !== false, error: e.payload.error }));
}

export function analyzeSession(events: readonly TimelineEvent[], durationMs = 0): SessionAnalysis {
  const sorted = [...events].sort((a, b) => a.offsetMs - b.offsetMs || a.seq - b.seq);
  const utterances = mergeUtterances(sorted);
  const speaking = speakingIntervals(sorted);
  const debug = sorted.filter((e) => e.kind === "live.debug");
  const message = (e: TimelineEvent) => String(e.payload.message ?? "");
  const flags: SessionFlag[] = [];

  const tools = toolRecords(sorted);
  const failed = tools.filter((t) => !t.success);
  for (const t of failed) flags.push({ offsetMs: t.offsetMs, tone: "error", label: `${t.name} failed${t.error ? `: ${String(t.error).slice(0, 140)}` : ""}` });

  const interruptions = debug.filter((e) => message(e) === "interrupted");
  for (const e of interruptions) flags.push({ offsetMs: e.offsetMs, tone: "warn", label: "Student interrupted the tutor" });

  const pageReconnects = debug.filter((e) => message(e) === "live_session_reconnecting");
  const reconnects = pageReconnects.length > 0 ? pageReconnects : debug.filter((e) => message(e) === "reconnect_scheduled");
  for (const e of reconnects) flags.push({ offsetMs: e.offsetMs, tone: "warn", label: "Connection dropped, reconnecting" });

  const errors = debug.filter((e) => e.payload.kind === "error");
  for (const e of errors) {
    const detail = inner(e).message;
    flags.push({ offsetMs: e.offsetMs, tone: "error", label: `Error: ${message(e)}${detail ? ` (${String(detail).slice(0, 140)})` : ""}` });
  }

  // Reply time: from the end of what the student said to the tutor's first
  // response of any kind (voice, words, or a board action).
  const tutorStarts = [
    ...speaking.map((s) => s.startMs),
    ...utterances.filter((u) => u.role === "tutor").map((u) => u.startMs),
    ...tools.map((t) => t.offsetMs),
  ].sort((a, b) => a - b);
  const replies: number[] = [];
  for (const u of utterances) {
    if (u.role !== "student") continue;
    const next = tutorStarts.find((s) => s > u.endMs);
    if (next === undefined) continue;
    const wait = next - u.endMs;
    if (wait > 60_000) continue;
    replies.push(wait);
    if (wait >= SLOW_REPLY_MS) flags.push({ offsetMs: u.endMs, tone: "warn", label: `Slow reply: ${(wait / 1000).toFixed(1)} s after the student spoke` });
  }

  // Longest silence while connected (a pause and resume is not silence).
  const intervals = [
    ...utterances.map((u) => [u.startMs, Math.max(u.endMs, u.startMs + 500)] as const),
    ...speaking.map((s) => [s.startMs, s.endMs] as const),
  ].sort((a, b) => a[0] - b[0]);
  const breaks = sorted.filter((e) => e.kind === "session.paused" || e.kind === "session.resumed").map((e) => e.offsetMs);
  let longest = 0;
  let longestAt = 0;
  let reach = intervals[0]?.[0] ?? 0;
  for (const [start, end] of intervals) {
    const gap = start - reach;
    if (gap > longest && !breaks.some((b) => b > reach && b < start)) {
      longest = gap;
      longestAt = reach;
    }
    reach = Math.max(reach, end);
  }
  if (longest >= LONG_SILENCE_MS) flags.push({ offsetMs: longestAt, tone: "warn", label: `${Math.round(longest / 1000)} s of silence` });

  flags.sort((a, b) => a.offsetMs - b.offsetMs);
  const lastOffset = sorted.length ? sorted[sorted.length - 1].offsetMs : 0;
  return {
    durationMs: Math.max(durationMs, lastOffset),
    studentTurns: utterances.filter((u) => u.role === "student").length,
    tutorTurns: utterances.filter((u) => u.role === "tutor").length,
    toolCalls: tools.length,
    toolErrors: failed.length,
    interruptions: interruptions.length,
    reconnects: reconnects.length,
    errors: errors.length,
    frames: sorted.filter((e) => e.kind === "board.frame" && e.payload.repeat !== true).length,
    medianReplyMs: median(replies),
    slowestReplyMs: replies.length ? Math.max(...replies) : null,
    replies: replies.length,
    longestSilenceMs: longest,
    flags,
  };
}

// ── The event log ─────────────────────────────────────────────────────────────
export type LogLane = "student" | "tutor" | "action" | "board" | "system";

export type LogEntry = {
  key: string;
  offsetMs: number;
  endMs?: number;
  lane: LogLane;
  title: string;
  detail?: string;
  tone: "default" | "warn" | "error";
  frameId?: number;
  /** Low-level events, shown only when "every event" is on. */
  hidden: boolean;
  issue: boolean;
};

function compactJson(value: unknown, max = 700): string {
  let s: string;
  try {
    s = JSON.stringify(value) ?? "";
  } catch {
    s = String(value);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function toolDetail(args: unknown, success: boolean, message: unknown, error: unknown, durationMs: unknown): string {
  const lines: string[] = [];
  if (args && typeof args === "object" && Object.keys(args).length > 0) lines.push(`args ${compactJson(args)}`);
  lines.push(success ? `→ ${String(message ?? "ok")}` : `→ failed: ${String(error ?? "unknown error")}`);
  if (typeof durationMs === "number") lines.push(`${durationMs} ms`);
  return lines.join("\n");
}

const QUIET_CONNECTION = new Set(["connect_requested", "websocket_open", "resumption_handle_stored", "live_provider_selected", "gemini_start"]);

export function buildLog(events: readonly TimelineEvent[]): LogEntry[] {
  const sorted = [...events].sort((a, b) => a.offsetMs - b.offsetMs || a.seq - b.seq);
  const entries: LogEntry[] = [];
  mergeUtterances(sorted).forEach((u, i) => {
    entries.push({ key: `u${i}`, offsetMs: u.startMs, endMs: u.endMs, lane: u.role, title: u.text, tone: "default", hidden: false, issue: false });
  });
  const liveReportsTools = sorted.some((e) => e.kind === "live.debug" && e.payload.message === "tool_response_sent");

  for (const e of sorted) {
    const key = `e${e.seq}`;
    const base = { key, offsetMs: e.offsetMs };
    const p = e.payload;
    switch (e.kind) {
      case "transcript.entry":
        break;
      case "tool.call": {
        const success = p.success !== false;
        entries.push({ ...base, lane: "action", title: String(p.name ?? "tool"), detail: toolDetail(p.args, success, p.message, p.error, p.durationMs), tone: success ? "default" : "error", hidden: liveReportsTools, issue: !success && !liveReportsTools });
        break;
      }
      case "live.debug": {
        const kind = String(p.kind ?? "");
        const message = String(p.message ?? "");
        const data = inner(e);
        if (kind === "transcript" || message === "tool_call_received" || message === "board_frame_sent") break;
        if (message === "tool_response_sent") {
          const success = data.success !== false;
          entries.push({ ...base, lane: "action", title: String(data.name ?? "tool"), detail: toolDetail(data.args, success, data.message, data.error, data.durationMs), tone: success ? "default" : "error", hidden: false, issue: !success });
        } else if (message === "interrupted") {
          entries.push({ ...base, lane: "system", title: "Student interrupted the tutor", tone: "warn", hidden: false, issue: true });
        } else if (message === "turn_complete") {
          entries.push({ ...base, lane: "system", title: "Tutor finished its turn", tone: "default", hidden: true, issue: false });
        } else if (message === "tutor_state") {
          entries.push({ ...base, lane: "action", title: "Tutor state", detail: String(data.line ?? ""), tone: "default", hidden: false, issue: false });
        } else if (kind === "error") {
          entries.push({ ...base, lane: "system", title: `Error: ${message}`, detail: Object.keys(data).length ? compactJson(data) : undefined, tone: "error", hidden: false, issue: true });
        } else if (kind === "connection") {
          const dropped = message === "live_session_reconnecting" || message === "reconnect_scheduled" || message === "server_goaway" || message === "reconnect_exhausted";
          entries.push({ ...base, lane: "system", title: message.replaceAll("_", " "), detail: Object.keys(data).length ? compactJson(data) : undefined, tone: dropped ? "warn" : "default", hidden: QUIET_CONNECTION.has(message), issue: dropped });
        } else {
          entries.push({ ...base, lane: "system", title: `${kind}: ${message.replaceAll("_", " ")}`, detail: Object.keys(data).length ? compactJson(data) : undefined, tone: "default", hidden: true, issue: false });
        }
        break;
      }
      case "tutor.speaking":
        entries.push({ ...base, lane: "tutor", title: p.speaking === true ? "Tutor voice starts" : "Tutor voice stops", tone: "default", hidden: true, issue: false });
        break;
      case "tutor.activity":
        entries.push({ ...base, lane: "system", title: `Tutor is ${String(p.activity ?? "idle")}`, tone: "default", hidden: true, issue: false });
        break;
      case "board.frame":
        entries.push({
          ...base,
          lane: "board",
          title: p.repeat === true ? "Board picture (unchanged)" : "Board picture",
          // The reason already says when the picture went to the tutor ("sent to tutor").
          detail: typeof p.reason === "string" && p.reason ? p.reason : p.sentToTutor === true ? "sent to tutor" : undefined,
          tone: "default",
          frameId: typeof p.frameId === "number" ? p.frameId : undefined,
          hidden: p.repeat === true,
          issue: false,
        });
        break;
      case "session.started":
        entries.push({ ...base, lane: "system", title: p.resumed === true ? "Session resumed and connected" : "Session started", detail: compactJson(p), tone: "default", hidden: false, issue: false });
        break;
      case "session.paused":
      case "session.resumed":
      case "session.ended":
        entries.push({ ...base, lane: "system", title: e.kind === "session.paused" ? "Session paused" : e.kind === "session.resumed" ? "Session resumed" : "Session ended", tone: "default", hidden: false, issue: false });
        break;
      case "settings.speed":
        entries.push({ ...base, lane: "system", title: `Voice speed set to ${String(p.rate ?? "?")}×`, tone: "default", hidden: false, issue: false });
        break;
      case "whiteboard.snapshot":
        entries.push({ ...base, lane: "board", title: "Board saved", tone: "default", hidden: true, issue: false });
        break;
      default:
        entries.push({ ...base, lane: "system", title: e.kind, detail: compactJson(p), tone: "default", hidden: true, issue: false });
    }
  }
  return entries.sort((a, b) => a.offsetMs - b.offsetMs);
}

// ── Export ────────────────────────────────────────────────────────────────────
export type ExportInput = {
  sessionId: string;
  title: string;
  studentName: string | null;
  studentEmail: string | null;
  startedAt: number;
  durationSec: number;
  events: readonly TimelineEvent[];
  frameUrl: (frameId: number) => string;
};

const LANE_WORD: Record<LogLane, string> = { student: "STUDENT", tutor: "TUTOR", action: "ACTION", board: "BOARD", system: "SYSTEM" };

function seconds(ms: number | null): string {
  return ms === null ? "none" : `${(ms / 1000).toFixed(1)} s`;
}

/** A plain-text account of a session, for reading it closely (by Mateo or by Claude). */
export function buildMarkdownExport(input: ExportInput): string {
  const analysis = analyzeSession(input.events, input.durationSec * 1000);
  const log = buildLog(input.events).filter((e) => !e.hidden);
  const who = [input.studentName, input.studentEmail ? `<${input.studentEmail}>` : ""].filter(Boolean).join(" ") || "Unknown student";
  const lines = [
    `# ${input.title}`,
    "",
    `- Student: ${who}`,
    `- Session: ${input.sessionId}`,
    `- Started: ${new Date(input.startedAt).toISOString()}`,
    `- Length: ${formatClock(analysis.durationMs)}`,
    "",
    "## Summary",
    "",
    `- Student lines: ${analysis.studentTurns}; tutor lines: ${analysis.tutorTurns}`,
    `- Tool calls: ${analysis.toolCalls} (failed: ${analysis.toolErrors})`,
    `- Interruptions: ${analysis.interruptions}; reconnects: ${analysis.reconnects}; errors: ${analysis.errors}`,
    `- Reply time: median ${seconds(analysis.medianReplyMs)}, slowest ${seconds(analysis.slowestReplyMs)} over ${analysis.replies} replies (approximate: measured from when the student's words were transcribed)`,
    `- Longest silence: ${seconds(analysis.longestSilenceMs)}`,
    `- Board pictures: ${analysis.frames}`,
    "",
    "## Issues",
    "",
    ...(analysis.flags.length ? analysis.flags.map((f) => `- [${formatClock(f.offsetMs)}] ${f.label}`) : ["- None found"]),
    "",
    "## Timeline",
    "",
  ];
  for (const e of log) {
    const head = `[${formatClock(e.offsetMs)}] ${LANE_WORD[e.lane]}: ${e.title}`;
    lines.push(e.tone === "error" ? `${head} (FAILED)` : head);
    if (e.detail) for (const line of e.detail.split("\n")) lines.push(`    ${line}`);
    if (e.frameId !== undefined) lines.push(`    picture: ${input.frameUrl(e.frameId)}`);
  }
  return `${lines.join("\n")}\n`;
}
