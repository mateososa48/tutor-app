"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LeftNav from "@/components/LeftNav";
import Whiteboard from "@/components/Whiteboard";
import type { WhiteboardHandle, WhiteboardSnapshot } from "@/components/Whiteboard";
import Sidebar from "@/components/Sidebar";
import TutorDebugPanel from "@/components/TutorDebugPanel";
import { SubtitleBar } from "@/components/SubtitleBar";
import type { TutorDebugEvent } from "@/components/TutorDebugPanel";
import { GeminiLiveSession } from "@/lib/gemini-live";
import type { SessionCallbacks, TranscriptEntry, ToolCallResult } from "@/lib/gemini-live";
import { AudioCapture, AudioPlayer } from "@/lib/audio";
import {
  SavedSession,
  getSessionById,
  patchSession,
  appendEvent,
  sendHeartbeat,
  pauseSession,
  sendPauseBeacon,
  formatRelativeDate,
  formatDuration,
} from "@/lib/sessions";
import type { UploadedFile } from "@/lib/file-processor";
import { buildStudentContext } from "@/lib/student-context";
import type { StudentProfile } from "@/lib/student-context";
import { dispatchWhiteboardTool } from "@/lib/whiteboard-tool-dispatch";

type Mode = "loading" | "notfound" | "lobby" | "live" | "review";
type LiveState = "idle" | "connecting" | "active" | "ending" | "error";

const TRANSCRIPT_MERGE_WINDOW_MS = 1200;
const TRANSCRIPT_MAX_MERGED_CHARS = 700;
const DEBUG_TRACE_LIMIT = 1000;

function shouldMergeTranscript(last: TranscriptEntry | undefined, entry: TranscriptEntry): last is TranscriptEntry {
  if (!last || last.role !== entry.role) return false;
  const entryAt = entry.at ?? 0;
  const lastAt = last.at ?? 0;
  const delta = entryAt - lastAt;
  if (delta < 0 || delta > TRANSCRIPT_MERGE_WINDOW_MS) return false;
  if (last.text.length + entry.text.length > TRANSCRIPT_MAX_MERGED_CHARS) return false;
  return true;
}

function appendTranscriptEntry(entries: TranscriptEntry[], entry: TranscriptEntry): TranscriptEntry[] {
  const last = entries[entries.length - 1];
  const entryAt = entry.at ?? Date.now();
  if (shouldMergeTranscript(last, entry)) {
    return [...entries.slice(0, -1), { ...last, text: `${last.text} ${entry.text}`, at: entryAt }];
  }
  return [...entries, entry];
}

// Merge consecutive same-role transcript fragments emitted close together.
// Matches the live merge in onTranscript so hydrated transcripts look identical.
function mergeTranscript(entries: TranscriptEntry[]): TranscriptEntry[] {
  let merged: TranscriptEntry[] = [];
  for (const entry of entries) {
    merged = appendTranscriptEntry(merged, entry);
  }
  return merged;
}

function getWhiteboardDebugMetrics(snapshot: WhiteboardSnapshot | null) {
  const eqCount = snapshot?.eqItems?.length ?? 0;
  const semanticCount = snapshot?.semanticBoard?.artifacts?.length ?? 0;
  const shapeTypes: Record<string, number> = {};
  let shapeCount = 0;

  const store = snapshot?.store;
  if (store && typeof store === "object" && "records" in store) {
    const records = (store as { records?: Record<string, unknown> }).records;
    if (records && typeof records === "object") {
      for (const record of Object.values(records)) {
        if (!record || typeof record !== "object") continue;
        const typedRecord = record as { typeName?: unknown; type?: unknown; id?: unknown };
        const id = typeof typedRecord.id === "string" ? typedRecord.id : "";
        const typeName = typeof typedRecord.typeName === "string" ? typedRecord.typeName : "";
        if (typeName !== "shape" && !id.startsWith("shape:")) continue;
        const shapeType = typeof typedRecord.type === "string" ? typedRecord.type : "unknown";
        shapeTypes[shapeType] = (shapeTypes[shapeType] ?? 0) + 1;
        shapeCount++;
      }
    }
  }

  return {
    shapeCount,
    eqCount,
    semanticCount,
    totalArtifacts: shapeCount + eqCount,
    shapeTypes,
    pageState: snapshot?.pageState ?? null,
  };
}

function debugFileSummary(files: UploadedFile[]) {
  return files.map(({ id, label, name, mimeType }) => ({ id, label, name, mimeType }));
}

export default function PageWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SessionDetailPage key={id} id={id} />;
}

function SessionDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>("loading");
  const [session, setSession] = useState<SavedSession | null>(null);

  // live state
  const [liveState, setLiveState] = useState<LiveState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isTutorSpeaking, setIsTutorSpeaking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionTitle, setSessionTitle] = useState("Session");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [fileNotice, setFileNotice] = useState("");
  const [subtitleText, setSubtitleText] = useState("");
  const [debugTrace, setDebugTrace] = useState<TutorDebugEvent[]>([]);
  const [debugConfig] = useState(() => {
    const enabled = searchParams.get("debug") === "1" || searchParams.get("qa") === "1";
    return {
      enabled,
      textOnly: enabled && searchParams.get("mic") !== "1",
    };
  });

  // live tutor + audio refs
  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleAccumRef = useRef("");
  const mutedRef = useRef(false);
  const whiteboardRef = useRef<WhiteboardHandle>(null);
  const intentionalDisconnectRef = useRef(false);
  const disconnectToErrorRef = useRef(false);
  const startInFlightRef = useRef(false);
  const endInFlightRef = useRef(false);
  const resumeInFlightRef = useRef(false);
  const pauseInFlightRef = useRef(false);

  // student profile (fetched once, used when constructing the live tutor session)
  const studentContextRef = useRef<string>("");

  // sync refs (avoid stale closures in WS callbacks)
  const sessionTitleRef = useRef("Session");
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const elapsedSecondsRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
  const filesRef = useRef<UploadedFile[]>([]);
  const liveStateRef = useRef<LiveState>("idle");
  const isResumeRef = useRef(false);
  const initialIsNewRef = useRef<boolean | null>(null);
  const debugModeRef = useRef(debugConfig.enabled);
  const qaTextOnlyRef = useRef(debugConfig.textOnly);
  const debugTraceRef = useRef<TutorDebugEvent[]>([]);
  const debugEventIdRef = useRef(0);
  const debugBootLoggedRef = useRef(false);

  // persistence refs
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalSnapRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingResumeSnapshotRef = useRef<WhiteboardSnapshot | null>(null);

  const debugMode = debugConfig.enabled;
  const qaTextOnly = debugConfig.textOnly;

  const recordDebug = useCallback((
    kind: string,
    label: string,
    detail?: Record<string, unknown>,
  ) => {
    if (!debugModeRef.current) return;
    const now = Date.now();
    const event: TutorDebugEvent = {
      id: `dbg_${now}_${++debugEventIdRef.current}`,
      at: now,
      offsetMs: sessionStartedAtRef.current > 0
        ? Math.max(0, now - sessionStartedAtRef.current)
        : Math.max(0, elapsedSecondsRef.current * 1000),
      kind,
      label,
      detail,
    };
    setDebugTrace((prev) => {
      const next = [...prev, event].slice(-DEBUG_TRACE_LIMIT);
      debugTraceRef.current = next;
      return next;
    });
  }, []);

  const clearNewSessionUrlFlag = useCallback(() => {
    if (typeof window === "undefined" || initialIsNewRef.current !== true) return;
    const nextParams = new URLSearchParams(window.location.search);
    initialIsNewRef.current = false;
    if (!nextParams.has("new")) return;
    nextParams.delete("new");
    const query = nextParams.toString();
    window.history.replaceState(null, "", `/session/${id}${query ? `?${query}` : ""}`);
  }, [id]);

  // Keep refs synced
  useEffect(() => { mutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { sessionTitleRef.current = sessionTitle; }, [sessionTitle]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { elapsedSecondsRef.current = elapsedSeconds; }, [elapsedSeconds]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { liveStateRef.current = liveState; }, [liveState]);

  useEffect(() => {
    if (!debugMode || debugBootLoggedRef.current) return;
    debugBootLoggedRef.current = true;
    recordDebug("session", "debug_mode_enabled", {
      textOnly: qaTextOnly,
      route: `/session/${id}`,
    });
  }, [debugMode, id, qaTextOnly, recordDebug]);

  const clearDebugTrace = useCallback(() => {
    debugTraceRef.current = [];
    setDebugTrace([]);
  }, []);

  const exportDebugTrace = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sessionId: id,
      title: sessionTitleRef.current,
      mode,
      liveState: liveStateRef.current,
      elapsedSeconds: elapsedSecondsRef.current,
      qa: {
        debugMode,
        textOnly: qaTextOnly,
      },
      files: debugFileSummary(filesRef.current),
      transcript: transcriptRef.current,
      board: getWhiteboardDebugMetrics(whiteboardRef.current?.getSnapshot() ?? null),
      events: debugTraceRef.current,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tutor-trace-${id}-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    recordDebug("session", "trace_exported", {
      events: debugTraceRef.current.length,
    });
  }, [debugMode, id, mode, qaTextOnly, recordDebug]);

  // ── Persistence helpers ──────────────────────────────────────────────
  const offsetMs = () => Math.max(0, Date.now() - sessionStartedAtRef.current);

  const persistSnapshot = useCallback(() => {
    const snap = whiteboardRef.current?.getSnapshot();
    if (!snap) return;
    appendEvent(id, {
      kind: "whiteboard.snapshot",
      actor: "system",
      offsetMs: offsetMs(),
      payload: snap as unknown as Record<string, unknown>,
    });
  }, [id]);

  // ── Tool call handler ────────────────────────────────────────────────
  const handleToolCall = useCallback(
    (name: string, args: Record<string, unknown>): ToolCallResult => {
      return dispatchWhiteboardTool(name, args, {
        whiteboard: whiteboardRef.current,
      });
    },
    [],
  );

  const setTemporaryFileNotice = useCallback((message: string) => {
    setFileNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setFileNotice(""), 4200);
  }, []);

  const cleanupAudio = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    if (intervalSnapRef.current) clearInterval(intervalSnapRef.current);
    intervalSnapRef.current = null;
    setIsTutorSpeaking(false);
  }, []);

  const pauseLiveSession = useCallback(() => {
    if (pauseInFlightRef.current) return;
    if (endInFlightRef.current) return;
    if (liveStateRef.current !== "active" && liveStateRef.current !== "connecting") return;
    pauseInFlightRef.current = true;
    void pauseSession(id).finally(() => {
      pauseInFlightRef.current = false;
    });
  }, [id]);

  // ── End session ──────────────────────────────────────────────────────
  const endSession = useCallback(async () => {
    if (endInFlightRef.current) return;
    if (liveStateRef.current !== "active" && liveStateRef.current !== "connecting") return;
    endInFlightRef.current = true;
    intentionalDisconnectRef.current = true;
    disconnectToErrorRef.current = false;
    liveStateRef.current = "ending";
    setLiveState("ending");
    const endedAt = Date.now();
    const dur = elapsedSecondsRef.current;
    persistSnapshot();
    await appendEvent(id, {
      kind: "session.ended",
      actor: "system",
      offsetMs: Math.max(0, endedAt - sessionStartedAtRef.current),
      payload: {},
    });
    await patchSession(id, {
      status: "ended",
      endedAt,
      durationSec: dur,
      transcript: transcriptRef.current,
    });
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    cleanupAudio();
    liveStateRef.current = "idle";
    setLiveState("idle");
    setMode("review");
    // Refresh session record
    const fresh = await getSessionById(id);
    if (fresh) setSession(fresh.session);
  }, [cleanupAudio, id, persistSnapshot]);

  // ── Start (or resume) live session ───────────────────────────────────
  const startSession = useCallback(async () => {
    if (startInFlightRef.current) return;
    if (liveStateRef.current === "active" || liveStateRef.current === "connecting") return;
    startInFlightRef.current = true;
    liveStateRef.current = "connecting";
    setLiveState("connecting");
    setErrorMessage("");
    setIsMuted(false);
    endInFlightRef.current = false;
    recordDebug("session", isResumeRef.current ? "resume_start_requested" : "start_requested", {
      textOnly: qaTextOnlyRef.current === true,
      fileCount: filesRef.current.length,
    });

    if (!isResumeRef.current) {
      // Fresh new session — reset transcript/elapsed/board
      setTranscript([]);
      transcriptRef.current = [];
      setElapsedSeconds(0);
      elapsedSecondsRef.current = 0;
      setSessionTitle("Session");
      sessionTitleRef.current = "Session";
      void patchSession(id, { title: "Session", transcript: [] });
      whiteboardRef.current?.clearWhiteboard();
      sessionStartedAtRef.current = Date.now();
    }

    intentionalDisconnectRef.current = false;
    disconnectToErrorRef.current = false;

    // Request mic permission upfront so the browser prompt appears immediately,
    // before the live tutor connects. This makes "Try again" re-prompt right away.
    let micStream: MediaStream | undefined;
    if (qaTextOnlyRef.current) {
      recordDebug("audio", "microphone_skipped", { reason: "qa_text_only" });
    } else {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 },
          video: false,
        });
        recordDebug("audio", "microphone_ready");
      } catch {
        // Check if it's permanently blocked vs. just dismissed
        let blocked = false;
        try {
          const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
          blocked = perm.state === "denied";
        } catch { /* permissions API not available */ }

        recordDebug("error", "microphone_unavailable", { blocked });
        setErrorMessage(
          blocked
            ? "Microphone is blocked. Click the lock icon in your browser's address bar to allow mic access, then try again."
            : "Microphone access denied. Please allow mic access and try again.",
        );
        intentionalDisconnectRef.current = true;
        disconnectToErrorRef.current = true;
        liveStateRef.current = "error";
        startInFlightRef.current = false;
        setLiveState("error");
        return;
      }
    }

    if (qaTextOnlyRef.current) {
      playerRef.current = null;
    } else {
      const player = new AudioPlayer();
      player.resume();
      playerRef.current = player;
    }

    const callbacks: SessionCallbacks = {
      onAudio: (base64) => {
        if (qaTextOnlyRef.current) return;
        setIsTutorSpeaking(true);
        playerRef.current?.enqueue(base64);
        setTimeout(() => setIsTutorSpeaking(false), 800);
      },
      onTranscript: (entry) => {
        recordDebug("transcript", entry.role, {
          id: entry.id,
          chars: entry.text.length,
          text: entry.text,
        });
        // append + persist
        appendEvent(id, {
          kind: "transcript.entry",
          actor: entry.role,
          offsetMs: offsetMs(),
          payload: { text: entry.text, at: entry.at ?? Date.now(), role: entry.role, id: entry.id },
        });
        setTranscript((prev) => {
          const next = appendTranscriptEntry(prev, entry);
          transcriptRef.current = next;
          return next;
        });
        if (entry.role === "tutor") {
          subtitleAccumRef.current = subtitleAccumRef.current
            ? subtitleAccumRef.current + " " + entry.text
            : entry.text;
          setSubtitleText(subtitleAccumRef.current);
          if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
          subtitleTimerRef.current = setTimeout(() => {
            subtitleAccumRef.current = "";
            setSubtitleText("");
          }, 3500);
        }
      },
      onToolCall: handleToolCall,
      onConnected: async () => {
        startInFlightRef.current = false;
        liveStateRef.current = "active";
        setLiveState("active");
        recordDebug("connection", "live_session_active");
        const greetingOk = isResumeRef.current
          ? sessionRef.current?.sendResumeContext(
              sessionTitleRef.current,
              transcriptRef.current.slice(-6).map((e) => ({ role: e.role, text: e.text })),
              filesRef.current,
            )
          : sessionRef.current?.sendInitialGreeting(filesRef.current);
        recordDebug("session", "session_context_sent", {
          kind: isResumeRef.current ? "resume" : "initial_start",
          success: Boolean(greetingOk),
          fileCount: filesRef.current.length,
        });
        if (!greetingOk) {
          setErrorMessage("Connected, but the tutor was not ready to receive the greeting.");
          pauseLiveSession();
          intentionalDisconnectRef.current = true;
          disconnectToErrorRef.current = true;
          sessionRef.current?.disconnect();
          sessionRef.current = null;
          liveStateRef.current = "error";
          startInFlightRef.current = false;
          setLiveState("error");
          cleanupAudio();
          return;
        }
        if (!isResumeRef.current) clearNewSessionUrlFlag();
        // Ticker for elapsed time
        timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
        // Heartbeat
        heartbeatRef.current = setInterval(() => {
          sendHeartbeat(id, elapsedSecondsRef.current);
        }, 20_000);
        // Periodic snapshot (max interval)
        intervalSnapRef.current = setInterval(() => {
          persistSnapshot();
        }, 30_000);

        if (qaTextOnlyRef.current) {
          recordDebug("audio", "audio_capture_skipped", { reason: "qa_text_only" });
          return;
        }

        try {
          const capture = new AudioCapture((base64) => {
            if (!mutedRef.current) {
              sessionRef.current?.sendAudio(base64);
            }
          });
          await capture.start(micStream);
          captureRef.current = capture;
          recordDebug("audio", "audio_capture_started");
        } catch {
          recordDebug("error", "audio_capture_failed");
          setErrorMessage("Microphone error. Please try again.");
          intentionalDisconnectRef.current = true;
          disconnectToErrorRef.current = true;
          pauseLiveSession();
          sessionRef.current?.disconnect();
          sessionRef.current = null;
          cleanupAudio();
          liveStateRef.current = "error";
          startInFlightRef.current = false;
          setLiveState("error");
        }
      },
      onInterrupted: () => {
        recordDebug("session", "tutor_interrupted");
        playerRef.current?.flush();
        setIsTutorSpeaking(false);
        if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
        subtitleAccumRef.current = "";
        setSubtitleText("");
      },
      onDisconnected: () => {
        recordDebug("connection", "live_session_disconnected", {
          intentional: intentionalDisconnectRef.current,
        });
        if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
        subtitleAccumRef.current = "";
        setSubtitleText("");
        cleanupAudio();
        sessionRef.current = null;
        startInFlightRef.current = false;
        if (intentionalDisconnectRef.current) {
          liveStateRef.current = disconnectToErrorRef.current ? "error" : "idle";
          setLiveState(disconnectToErrorRef.current ? "error" : "idle");
          return;
        }
        pauseLiveSession();
        setErrorMessage("The tutor connection closed unexpectedly.");
        liveStateRef.current = "error";
        setLiveState("error");
      },
      onError: (msg) => {
        recordDebug("error", "live_session_error", { message: msg });
        pauseLiveSession();
        intentionalDisconnectRef.current = true;
        disconnectToErrorRef.current = true;
        setErrorMessage(msg);
        liveStateRef.current = "error";
        setLiveState("error");
        cleanupAudio();
        startInFlightRef.current = false;
        sessionRef.current?.disconnect();
        sessionRef.current = null;
      },
      onDebugEvent: (event) => {
        recordDebug(event.kind, event.message, event.payload);
      },
    };

    const liveSession = new GeminiLiveSession(callbacks, studentContextRef.current);

    sessionRef.current = liveSession;
    recordDebug("connection", "live_provider_selected", { provider: "gemini-live" });
    liveSession.connect();
  }, [cleanupAudio, clearNewSessionUrlFlag, handleToolCall, id, pauseLiveSession, persistSnapshot, recordDebug]);

  const handleAddFiles = useCallback(
    (newFiles: UploadedFile[]) => {
      recordDebug("file", "files_added", {
        files: debugFileSummary(newFiles),
        liveState: liveStateRef.current,
      });
      setFiles((prev) => {
        const updated = [...prev, ...newFiles];
        filesRef.current = updated;
        return updated;
      });
      if (liveStateRef.current === "active" && sessionRef.current) {
        const sent = sessionRef.current.sendFiles(newFiles);
        recordDebug("file", "files_sent_to_tutor", {
          success: sent,
          count: newFiles.length,
        });
        setTemporaryFileNotice(
          sent
            ? `${newFiles.length} file${newFiles.length === 1 ? "" : "s"} uploaded and sent to the tutor.`
            : "File added, but the tutor connection is not ready.",
        );
        return;
      }
      setTemporaryFileNotice(
        `${newFiles.length} file${newFiles.length === 1 ? "" : "s"} ready for the next session.`,
      );
    },
    [recordDebug, setTemporaryFileNotice],
  );

  const handleRemoveFile = useCallback((fileId: string) => {
    recordDebug("file", "file_removed", { fileId });
    setFiles((prev) => {
      const updated = prev.filter((f) => f.id !== fileId);
      filesRef.current = updated;
      return updated;
    });
  }, [recordDebug]);

  const handleSendText = useCallback((text: string) => {
    if (liveStateRef.current !== "active" || !sessionRef.current) {
      recordDebug("text", "send_skipped", { reason: "session_not_active", text });
      return;
    }
    const sent = sessionRef.current.sendText(text);
    recordDebug("text", "student_text_sent", { success: sent, chars: text.length, text });
    if (!sent) return;
    const entry: TranscriptEntry = {
      id: `text_${Date.now()}`,
      role: "student",
      text,
      at: Date.now(),
    };
    appendEvent(id, {
      kind: "transcript.entry",
      actor: "student",
      offsetMs: offsetMs(),
      payload: { text, at: entry.at, role: "student", id: entry.id },
    });
    setTranscript((prev) => {
      const next = appendTranscriptEntry(prev, entry);
      transcriptRef.current = next;
      return next;
    });
  }, [id, recordDebug]);

  // Mute keyboard shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "m" || e.key === "M") {
        if (liveStateRef.current === "active") setIsMuted((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // pagehide → pause beacon
  useEffect(() => {
    function onPageHide() {
      if ((liveStateRef.current === "active" || liveStateRef.current === "connecting") && !endInFlightRef.current) {
        sendPauseBeacon(id);
      }
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [id]);

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      if ((liveStateRef.current === "active" || liveStateRef.current === "connecting") && !endInFlightRef.current) {
        sendPauseBeacon(id);
      }
      intentionalDisconnectRef.current = true;
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      cleanupAudio();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, [cleanupAudio, id]);

  // ── Initial load ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Capture isNew exactly once per mount. Cache in a ref so re-runs
    // (e.g. when Next.js re-emits searchParams after history changes)
    // see the same value and we never downgrade live → lobby.
    if (initialIsNewRef.current === null) {
      initialIsNewRef.current = searchParams.get("new") === "1";
    }
    const isNew = initialIsNewRef.current;

    // Fetch profile for student context injection (fire-and-forget alongside session)
    fetch("/api/onboarding")
      .then((r) => r.ok ? r.json() : null)
      .then((profile: StudentProfile | null) => {
        if (!cancelled) studentContextRef.current = buildStudentContext(profile);
      })
      .catch(() => {});

    getSessionById(id).then((data) => {
      if (cancelled) return;
      if (liveStateRef.current === "active" || liveStateRef.current === "connecting") return;
      if (!data) {
        setMode("notfound");
        return;
      }
      setSession(data.session);

      // Hydrate transcript from events, merging only short same-role chunks
      // that look like one utterance (mirrors live-mode merge in onTranscript).
      const rawEntries: TranscriptEntry[] = [];
      let latestSnap: WhiteboardSnapshot | null = null;
      if (!isNew) {
        for (const ev of data.events) {
          if (ev.kind === "transcript.entry") {
            const p = ev.payload as { text: string; at?: number; role: "tutor" | "student"; id?: string };
            rawEntries.push({
              id: p.id ?? `ev_${ev.id}`,
              role: p.role,
              text: p.text,
              at: p.at,
            });
          } else if (ev.kind === "whiteboard.snapshot") {
            latestSnap = ev.payload as unknown as WhiteboardSnapshot;
          }
        }
      }
      const hydratedTranscript = mergeTranscript(rawEntries);
      setTranscript(hydratedTranscript);
      transcriptRef.current = hydratedTranscript;
      pendingResumeSnapshotRef.current = latestSnap;

      const initialTitle = isNew ? "Session" : data.session.title;
      setSessionTitle(initialTitle);
      sessionTitleRef.current = initialTitle;
      sessionStartedAtRef.current = data.session.startedAt;
      setElapsedSeconds(isNew ? 0 : data.session.durationSec);
      elapsedSecondsRef.current = isNew ? 0 : data.session.durationSec;

      if (isNew) {
        isResumeRef.current = false;
        void patchSession(id, { title: "Session", transcript: [] });
        setMode("live");
      } else if (data.session.status === "ended") {
        setMode("review");
      } else {
        setMode("lobby");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, searchParams]);

  // Auto-start live mode once mounted (handles new + resume)
  useEffect(() => {
    if (mode !== "live") return;
    if (liveStateRef.current !== "idle") return;

    let tries = 0;
    const tryStart = () => {
      const probe = whiteboardRef.current?.getSnapshot();
      if (probe === null || probe === undefined) {
        if (tries++ < 50) setTimeout(tryStart, 100);
        return;
      }
      if (isResumeRef.current && pendingResumeSnapshotRef.current) {
        whiteboardRef.current?.loadSnapshot(pendingResumeSnapshotRef.current);
        pendingResumeSnapshotRef.current = null;
      }
      startSession();
    };
    tryStart();
  }, [mode, startSession]);

  // ── Resume action ────────────────────────────────────────────────────
  const beginResume = useCallback(async () => {
    if (resumeInFlightRef.current) return;
    resumeInFlightRef.current = true;
    isResumeRef.current = true;
    try {
      // Mark active, record resumed event
      const now = Date.now();
      await patchSession(id, { status: "active" });
      await appendEvent(id, {
        kind: "session.resumed",
        actor: "system",
        offsetMs: Math.max(0, now - sessionStartedAtRef.current),
        payload: {},
      });
      setMode("live");
    } finally {
      resumeInFlightRef.current = false;
    }
  }, [id]);

  // ── Render ───────────────────────────────────────────────────────────
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  if (mode === "loading") {
    return (
      <Shell>
        <Centered text="Loading session…" />
      </Shell>
    );
  }

  if (mode === "notfound") {
    return (
      <Shell>
        <NotFoundState onHome={() => router.push("/")} />
      </Shell>
    );
  }

  if (mode === "lobby") {
    return (
      <Shell>
        <LobbyHeader session={session} onHome={() => router.push("/")} />
        <LobbyBody
          session={session}
          onResume={beginResume}
        />
      </Shell>
    );
  }

  if (mode === "review") {
    return (
      <Shell>
        <ReviewHeader
          session={session}
          onBack={() => router.push("/")}
          onContinue={beginResume}
          onNew={() => router.push("/session")}
        />
        <ReviewBody transcript={transcript} />
      </Shell>
    );
  }

  // Live
  return (
    <div
      className="h-screen w-screen flex overflow-hidden"
      style={{ background: "#e2e2e2", padding: 10, gap: 10 }}
    >
      <LeftNav />
      <section
        className="flex-1 min-w-0 flex flex-col overflow-hidden"
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 18px rgba(0,0,0,0.06)",
        }}
      >
        <header
          className="h-14 px-7 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid #d0d0d0" }}
        >
          <div className="flex items-center gap-3 text-[13px]">
            {liveState === "active" && (
              <>
                <span className="flex items-center gap-2">
                  <LiveDot />
                  <span className="font-semibold" style={{ color: "#0a0a0a" }}>
                    {sessionTitle}
                  </span>
                </span>
                <span style={{ color: "#d0d0d0" }} aria-hidden="true">·</span>
                <span style={{ color: "#5a5a5a", fontVariantNumeric: "tabular-nums" }}>
                  {formatTime(elapsedSeconds)}
                </span>
                {debugMode && (
                  <>
                    <span style={{ color: "#d0d0d0" }} aria-hidden="true">·</span>
                    <span
                      style={{
                        color: qaTextOnly ? "#2563eb" : "#7c3aed",
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {qaTextOnly ? "QA text" : "QA mic"}
                    </span>
                  </>
                )}
              </>
            )}
            {liveState === "connecting" && (
              <span className="font-medium" style={{ color: "#909090" }}>Connecting…</span>
            )}
            {liveState === "ending" && (
              <span className="font-medium" style={{ color: "#909090" }}>Ending session…</span>
            )}
            {liveState === "error" && (
              <span className="font-medium" style={{ color: "#b91c1c" }}>
                {errorMessage || "Session error"}
              </span>
            )}
          </div>
        </header>
        <main className="flex-1 relative overflow-hidden">
          <Whiteboard ref={whiteboardRef} />
          <SubtitleBar text={subtitleText} />
          {debugMode && (
            <TutorDebugPanel
              events={debugTrace}
              liveState={liveState}
              elapsedSeconds={elapsedSeconds}
              isTextOnly={qaTextOnly}
              canSend={liveState === "active"}
              transcriptCount={transcript.length}
              fileCount={files.length}
              onClear={clearDebugTrace}
              onExport={exportDebugTrace}
              onSendScenario={handleSendText}
            />
          )}
        </main>
      </section>

      <Sidebar
        sessionState={
          liveState === "idle"
            ? "pre"
            : liveState === "active"
            ? "active"
            : liveState === "connecting"
            ? "connecting"
            : liveState === "ending"
            ? "ending"
            : liveState === "error"
            ? "error"
            : "pre"
        }
        transcript={transcript}
        isMuted={isMuted}
        isTutorSpeaking={isTutorSpeaking}
        files={files}
        errorMessage={errorMessage}
        fileNotice={fileNotice}
        onStart={() => {
          isResumeRef.current = false;
          startSession();
        }}
        onMute={() => setIsMuted((v) => !v)}
        onEnd={endSession}
        onAddFiles={handleAddFiles}
        onRemoveFile={handleRemoveFile}
        onSendText={handleSendText}
      />
    </div>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-screen w-screen flex overflow-hidden"
      style={{ background: "#e2e2e2", padding: 10, gap: 10 }}
    >
      <LeftNav />
      <main
        className="flex-1 min-w-0 flex flex-col overflow-hidden"
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 18px rgba(0,0,0,0.06)",
        }}
      >
        {children}
      </main>
    </div>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <span style={{ color: "#909090", fontSize: 14 }}>{text}</span>
    </div>
  );
}

function NotFoundState({ onHome }: { onHome: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 500, color: "#0a0a0a", margin: 0 }}>Session not found</p>
      <p style={{ fontSize: 14, color: "#b0b0b0", margin: 0, marginBottom: 14 }}>
        This session may have been cleared or never existed.
      </p>
      <DarkButton onClick={onHome}>Go to home</DarkButton>
    </div>
  );
}

function LobbyHeader({
  session,
  onHome,
}: {
  session: SavedSession | null;
  onHome: () => void;
}) {
  return (
    <header
      className="h-14 px-7 flex items-center justify-between flex-shrink-0"
      style={{ borderBottom: "1px solid #d0d0d0" }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1 mr-4" style={{ fontSize: 13 }}>
        {session && (
          <>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#0a0a0a",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 360,
              }}
              title={session.title}
            >
              {session.title}
            </span>
            <span style={{ color: "#d0d0d0" }} aria-hidden="true">·</span>
            <span style={{ color: "#5a5a5a", whiteSpace: "nowrap" }}>
              {formatRelativeDate(session.startedAt)}
            </span>
            <span style={{ color: "#d0d0d0" }} aria-hidden="true">·</span>
            <StatusPill status={session.status} />
          </>
        )}
      </div>
      <GhostButton onClick={onHome}>← Home</GhostButton>
    </header>
  );
}

function LobbyBody({
  session,
  onResume,
}: {
  session: SavedSession | null;
  onResume: () => void;
}) {
  const heading = session?.status === "active" ? "Session in progress" : "Session paused";
  return (
    <div className="flex-1 page-in flex flex-col items-center justify-center" style={{ padding: 40 }}>
      <p style={{ fontSize: 22, fontWeight: 600, color: "#0a0a0a", margin: 0, marginBottom: 8 }}>
        {heading}
      </p>
      <p style={{ fontSize: 14, color: "#5a5a5a", margin: 0, marginBottom: 24, textAlign: "center", maxWidth: 420 }}>
        {session
          ? "Pick up where you left off — your whiteboard and transcript will be restored."
          : "Resume to continue."}
      </p>
      <DarkButton onClick={onResume}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 2.5l6 3.5-6 3.5V2.5z" fill="currentColor" />
        </svg>
        Resume session
      </DarkButton>
    </div>
  );
}

function ReviewHeader({
  session,
  onBack,
  onContinue,
  onNew,
}: {
  session: SavedSession | null;
  onBack: () => void;
  onContinue: () => void;
  onNew: () => void;
}) {
  return (
    <header
      className="h-14 px-7 flex items-center justify-between flex-shrink-0"
      style={{ borderBottom: "1px solid #d0d0d0" }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1 mr-4" style={{ fontSize: 13 }}>
        {session && (
          <>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#0a0a0a",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 360,
              }}
              title={session.title}
            >
              {session.title}
            </span>
            <span style={{ color: "#d0d0d0" }} aria-hidden="true">·</span>
            <span style={{ color: "#5a5a5a", whiteSpace: "nowrap" }}>
              {formatRelativeDate(session.startedAt)}
            </span>
            <span style={{ color: "#d0d0d0" }} aria-hidden="true">·</span>
            <span style={{ color: "#909090", whiteSpace: "nowrap" }}>
              {formatDuration(session.durationSec)}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <GhostButton onClick={onBack}>← Back</GhostButton>
        <DarkButton onClick={onContinue}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 2.5l6 3.5-6 3.5V2.5z" fill="currentColor" />
          </svg>
          Continue session
        </DarkButton>
        <DarkButton onClick={onNew} variant="outline">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          New session
        </DarkButton>
      </div>
    </header>
  );
}

function ReviewBody({ transcript }: { transcript: TranscriptEntry[] }) {
  return (
    <div className="flex-1 overflow-y-auto page-in" style={{ padding: "40px 52px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <section style={{ marginBottom: 40 }}>
          <SectionLabel>Analysis</SectionLabel>
          <div
            style={{
              border: "1px dashed #d0d0d0",
              borderRadius: 10,
              padding: "16px 18px",
              color: "#909090",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            Session analysis coming soon — an AI summary of what was covered and what to practice next.
          </div>
        </section>

        <section>
          <SectionLabel>Transcript</SectionLabel>
          {transcript.length === 0 ? (
            <p style={{ fontSize: 14, color: "#c0c0c0", margin: 0 }}>
              No transcript was recorded for this session.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {transcript.map((entry) => (
                <TranscriptTurn key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "#b0b0b0",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: 14,
      }}
    >
      {children}
    </h2>
  );
}

function TranscriptTurn({ entry }: { entry: TranscriptEntry }) {
  const isTutor = entry.role === "tutor";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "60px 1fr",
        columnGap: 14,
        alignItems: "baseline",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: isTutor ? "#0a0a0a" : "#909090",
          paddingTop: 4,
        }}
      >
        {isTutor ? "Tutor" : "You"}
      </span>
      <p
        style={{
          margin: 0,
          fontSize: 15,
          lineHeight: 1.6,
          color: isTutor ? "#0a0a0a" : "#5a5a5a",
          fontWeight: isTutor ? 500 : 400,
        }}
      >
        {entry.text}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: SavedSession["status"] }) {
  const label = status === "active" ? "Active" : status === "paused" ? "Paused" : "Ended";
  const dotColor =
    status === "active" ? "#16a34a" : status === "paused" ? "#909090" : "#c0c0c0";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 20,
        padding: "0 8px",
        background: "#f5f5f5",
        border: "1px solid #d0d0d0",
        borderRadius: 6,
        color: "#5a5a5a",
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
        }}
      />
      {label}
    </span>
  );
}


function DarkButton({
  children,
  onClick,
  variant = "solid",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "solid" | "outline";
}) {
  if (variant === "outline") {
    return (
      <button
        onClick={onClick}
        style={{
          height: 32,
          paddingLeft: 14,
          paddingRight: 14,
          background: "transparent",
          color: "#5a5a5a",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          border: "1px solid #d0d0d0",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          transition: "background 0.12s, color 0.12s",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = "#f0f0f0";
          e.currentTarget.style.color = "#0a0a0a";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#5a5a5a";
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      style={{
        height: 38,
        paddingLeft: 18,
        paddingRight: 18,
        background: "#0a0a0a",
        color: "#fff",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        transition: "background 0.15s",
      }}
      onMouseOver={(e) => (e.currentTarget.style.background = "#2a2a2a")}
      onMouseOut={(e) => (e.currentTarget.style.background = "#0a0a0a")}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 32,
        paddingLeft: 14,
        paddingRight: 14,
        background: "transparent",
        color: "#5a5a5a",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        border: "1px solid #d0d0d0",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = "#f0f0f0";
        e.currentTarget.style.color = "#0a0a0a";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#5a5a5a";
      }}
    >
      {children}
    </button>
  );
}

function LiveDot() {
  return (
    <span
      className="w-[7px] h-[7px] rounded-full"
      style={{
        background: "#16a34a",
        animation: "live-pulse 2.2s cubic-bezier(0.22,1,0.36,1) infinite",
      }}
    />
  );
}
