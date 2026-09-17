"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Play, Plus, RotateCcw, Square } from "lucide-react";
import Whiteboard from "@/components/Whiteboard";
import type { WhiteboardHandle, WhiteboardSnapshot } from "@/components/Whiteboard";
import TutorDebugPanel from "@/components/TutorDebugPanel";
import type { TutorDebugEvent } from "@/components/TutorDebugPanel";
import { AppShell } from "@/components/app/AppShell";
import { TopBar } from "@/components/app/TopBar";
import { SessionChip, type LiveState } from "@/components/session/SessionChip";
import { VoiceDock, type DockActivity } from "@/components/session/VoiceDock";
import { CaptionBar } from "@/components/session/CaptionBar";
import { GraphExplorer } from "@/components/session/GraphExplorer";
import { useGraphExplore, type ExploreChannel } from "@/components/session/useGraphExplore";
import { DropOverlay } from "@/components/session/FilesPopover";
import { TranscriptList } from "@/components/session/TranscriptPanel";
import { useFileDrop, useFileIntake } from "@/components/session/useFileIntake";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LiveTutorSession } from "@/lib/live-tutor";
import type { LiveTutorCallbacks } from "@/lib/live-tutor";
import { GeminiTutorSession } from "@/lib/gemini-tutor";
import { resolveLiveModel, resolveTutorProvider, type TutorClient } from "@/lib/tutor-provider";
import { useTutorSpeed } from "@/components/session/SpeedControl";
import { tutorSpeedRate } from "@/lib/voice-settings";
import type { TranscriptEntry, ToolCallResult, TutorActivity } from "@/lib/live-types";
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
import { intakeOpeningMessage, intakeTitle, setActiveIntake, takeIntake } from "@/lib/session-intake";
import { dispatchWhiteboardTool } from "@/lib/whiteboard-tool-dispatch";
import { resolveWorksheet, worksheetShown, type WorksheetLook } from "@/lib/session-tools";
import { withPdfPages } from "@/lib/worksheet-pages";
import { desmosFailure, onDesmosStatus, preloadDesmos } from "@/components/board/desmos-renderer";
import { SessionRecorder } from "@/lib/session-recorder";
import { compareEvents } from "@/lib/session-recording";
import { joinTranscript } from "@/lib/live-events";

type Mode = "loading" | "notfound" | "lobby" | "live" | "review";

const TRANSCRIPT_MERGE_WINDOW_MS = 1200;
const TRANSCRIPT_MAX_MERGED_CHARS = 700;
const DEBUG_TRACE_LIMIT = 1000;
const RESUME_HISTORY_TURNS = 24;
const RECORDING_SKIPS = new Set(["tool_call_received", "board_frame_sent"]);

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
    return [...entries.slice(0, -1), { ...last, text: joinTranscript(last.text, entry.text, entry.spaced), at: entryAt }];
  }
  return [...entries, { ...entry, text: entry.text.trimStart() }];
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
  const [tutorActivity, setTutorActivity] = useState<TutorActivity>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionTitle, setSessionTitle] = useState("Session");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [fileNotice, setFileNotice] = useState("");
  const [subtitleText, setSubtitleText] = useState("");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [debugTrace, setDebugTrace] = useState<TutorDebugEvent[]>([]);
  const [debugConfig] = useState(() => {
    const enabled = searchParams.get("debug") === "1" || searchParams.get("qa") === "1";
    return {
      enabled,
      textOnly: enabled && searchParams.get("mic") !== "1",
    };
  });

  // live tutor refs
  const sessionRef = useRef<TutorClient | null>(null);
  // Which voice stack runs this session (env default, ?provider= override).
  const [provider] = useState(() => resolveTutorProvider(searchParams));
  // Which Gemini Live model this session runs (?live=3.8 for one tab).
  const [liveModel] = useState(() => resolveLiveModel(searchParams));
  // How fast the tutor's voice plays. Only the Gemini client can change it.
  const [tutorSpeed, setTutorSpeed] = useTutorSpeed();
  const speechRateRef = useRef(tutorSpeedRate(tutorSpeed));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whiteboardRef = useRef<WhiteboardHandle>(null);
  const intentionalDisconnectRef = useRef(false);
  const disconnectToErrorRef = useRef(false);
  const startInFlightRef = useRef(false);
  const endInFlightRef = useRef(false);
  const resumeInFlightRef = useRef(false);
  const pauseInFlightRef = useRef(false);

  // sync refs (avoid stale closures in event callbacks)
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
  // Everything that happens, recorded for the admin replay (lib/session-recorder.ts).
  const recorderRef = useRef<SessionRecorder | null>(null);

  const debugMode = debugConfig.enabled;
  const qaTextOnly = debugConfig.textOnly;

  // Dev-only design preview: `?mock=1` renders the live screen with a scripted
  // transcript and a synthetic voice, and never opens an OpenAI session.
  const mockPreview = process.env.NODE_ENV !== "production" && searchParams.get("mock") === "1";
  useEffect(() => {
    if (!mockPreview) return;
    const boot = setTimeout(() => {
      setMode("live");
      liveStateRef.current = "active";
      setLiveState("active");
      setSessionTitle("Fractions: one half");
      setTranscript(MOCK_TRANSCRIPT);
      setElapsedSeconds(252);
    }, 0);
    let speaking = false;
    const talk = setInterval(() => {
      speaking = !speaking;
      setIsTutorSpeaking(speaking);
      setTutorActivity(speaking ? "idle" : "writing");
      if (speaking) setSubtitleText("Look at the board: the pizza is cut into two equal pieces and one is shaded. Which piece is one half?");
    }, 4200);
    const clock = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => {
      clearTimeout(boot);
      clearInterval(talk);
      clearInterval(clock);
    };
  }, [mockPreview]);

  const recordDebug = useCallback((
    kind: string,
    label: string,
    detail?: Record<string, unknown>,
  ) => {
    const now = Date.now();
    // Every session is recorded in full (the debug panel is only for ?debug=1).
    // Transcript fragments are recorded as transcript.entry instead, and the
    // received-call and frame-sent notices repeat what other events carry.
    if (kind !== "transcript" && !RECORDING_SKIPS.has(label)) {
      recorderRef.current?.record("live.debug", kind === "tool" || kind === "pacing" ? "tutor" : "system", { kind: kind, message: label, payload: detail ?? null }, now);
    }
    if (!debugModeRef.current) return;
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

  // A failed Desmos load turns every graph into a vector drawing; the recording says when.
  useEffect(() => onDesmosStatus((status) => {
    recordDebug("board", "desmos_status", { status, ...(status === "failed" ? { reason: desmosFailure() } : {}) });
  }), [recordDebug]);

  // Keep refs synced
  useEffect(() => { sessionTitleRef.current = sessionTitle; }, [sessionTitle]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { elapsedSecondsRef.current = elapsedSeconds; }, [elapsedSeconds]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { liveStateRef.current = liveState; }, [liveState]);

  // One recorder per session page; it batches events and board pictures to the server.
  useEffect(() => {
    const recorder = new SessionRecorder(id, () => sessionStartedAtRef.current);
    recorderRef.current = recorder;
    return () => {
      recorder.flushBeacon();
      if (recorderRef.current === recorder) recorderRef.current = null;
    };
  }, [id]);

  // Mute: disable the mic track locally and tell the Live session.
  useEffect(() => {
    sessionRef.current?.setMuted(isMuted);
  }, [isMuted]);

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
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.recordLarge("whiteboard.snapshot", "system", snap as unknown as Record<string, unknown>);
      return;
    }
    appendEvent(id, {
      kind: "whiteboard.snapshot",
      actor: "system",
      offsetMs: offsetMs(),
      payload: snap as unknown as Record<string, unknown>,
    });
  }, [id]);

  // ── Tool call handler ────────────────────────────────────────────────
  // Every successful board action returns the semantic board summary, so the
  // teaching backend always knows what the student is actually looking at.
  // The tutor sees the board: after it draws, a picture of the finished board
  // goes to the model (clients with vision only). look_at_board sends one
  // before it answers; other tool calls are debounced so a burst sends one.
  const boardFrameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gemini takes about one video frame a second: pictures are spaced out.
  const lastFrameAtRef = useRef(0);
  const frameGap = useCallback(async () => {
    const wait = lastFrameAtRef.current + 1000 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastFrameAtRef.current = Date.now();
  }, []);
  const sendBoardFrame = useCallback(async (): Promise<boolean> => {
    const live = sessionRef.current;
    if (!live?.sendBoardFrame) return false;
    const img = await whiteboardRef.current?.exportImage?.(896);
    if (!img || sessionRef.current !== live) return false;
    await frameGap();
    const sent = live.sendBoardFrame(img.url);
    // The exact picture the tutor saw goes into the recording too.
    void recorderRef.current?.recordFrame(img, "sent to tutor", true);
    return sent;
  }, [frameGap]);
  const scheduleBoardFrame = useCallback((delayMs: number) => {
    const live = sessionRef.current;
    if (!live?.sendBoardFrame || live.boardFrames !== "auto") return;
    if (boardFrameTimerRef.current) clearTimeout(boardFrameTimerRef.current);
    boardFrameTimerRef.current = setTimeout(() => {
      boardFrameTimerRef.current = null;
      void sendBoardFrame();
    }, delayMs);
  }, [sendBoardFrame]);

  // Tutors whose board pictures are not sent automatically still get pictures in the recording.
  const recordingFrameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRecordingFrame = useCallback(() => {
    if (recordingFrameTimerRef.current) clearTimeout(recordingFrameTimerRef.current);
    recordingFrameTimerRef.current = setTimeout(async () => {
      recordingFrameTimerRef.current = null;
      const img = await whiteboardRef.current?.exportImage?.(896);
      if (img) void recorderRef.current?.recordFrame(img, "board changed", false);
    }, 1200);
  }, []);

  const recordToolCall = useCallback((name: string, args: Record<string, unknown>, result: ToolCallResult, startedAt: number, callId?: string) => {
    recorderRef.current?.record("tool.call", "tutor", {
      name,
      args,
      callId,
      success: result.success,
      message: result.success ? result.message ?? "" : undefined,
      error: result.success ? undefined : result.error,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }, []);

  // look_at_board: the picture reaches the tutor before the answer does (it
  // used to be sent after, so the tutor answered from an older picture).
  const lookAtBoard = useCallback(async (): Promise<ToolCallResult> => {
    const summary = whiteboardRef.current?.getBoardSummary?.() ?? "";
    if (!summary || /The board is empty\.$/.test(summary)) return { success: true, message: `The board is empty.${summary ? `\n[Board: ${summary}]` : ""}` };
    if (boardFrameTimerRef.current) {
      clearTimeout(boardFrameTimerRef.current);
      boardFrameTimerRef.current = null;
    }
    const sent = await Promise.race([sendBoardFrame(), new Promise<false>((resolve) => setTimeout(() => resolve(false), 2500))]);
    const lead = sent
      ? "Here is the board: a fresh picture of it arrived just before this"
      : sessionRef.current?.sendBoardFrame
        ? "The board is still being written; its picture follows in a moment"
        : "Here is the list of what is on the board";
    return { success: true, message: `${lead}.\n[Board: ${summary}]` };
  }, [sendBoardFrame]);

  // look_at_worksheet: one page of an upload, shown again.
  const lastWorksheetLookRef = useRef<WorksheetLook | null>(null);
  const lookAtWorksheet = useCallback(async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const list = filesRef.current;
    const choice = resolveWorksheet(
      list.map((f) => ({ id: f.id, label: f.label, name: f.name, mimeType: f.mimeType, pages: f.mimeType === "application/pdf" ? f.pages?.length ?? 0 : 1 })),
      args,
      lastWorksheetLookRef.current,
    );
    if ("error" in choice) return { success: false, error: choice.error };
    const file = list.find((f) => f.id === choice.file.id);
    const live = sessionRef.current;
    if (!file || !live?.sendImageFrame) return { success: false, error: "Pictures cannot be shown in this session." };
    const picture = file.mimeType === "application/pdf" ? file.pages?.[choice.page - 1] : { base64: file.base64, mimeType: file.mimeType };
    if (!picture) return { success: false, error: `${file.label} page ${choice.page} could not be read.` };
    const url = `data:${picture.mimeType};base64,${picture.base64}`;
    await frameGap();
    if (!live.sendImageFrame(url, `[${file.label} "${file.name}", page ${choice.page}: the picture you asked to see.]`)) {
      return { success: false, error: "The picture could not be sent right now. Try again in a moment." };
    }
    lastWorksheetLookRef.current = { fileId: file.id, page: choice.page };
    return { success: true, message: worksheetShown(choice.file, choice.page) };
  }, [frameGap]);

  const handleToolCall = useCallback(
    (name: string, args: Record<string, unknown>, callId?: string): ToolCallResult | Promise<ToolCallResult> => {
      const startedAt = performance.now();
      if (name === "look_at_board" || name === "look_at_worksheet") {
        const job = name === "look_at_board" ? lookAtBoard() : lookAtWorksheet(args);
        return job.then((result) => {
          recordToolCall(name, args, result, startedAt, callId);
          return result;
        });
      }
      let result = dispatchWhiteboardTool(name, args, {
        whiteboard: whiteboardRef.current,
        callId,
      });
      if (result.success) {
        scheduleBoardFrame(900);
        const summary = whiteboardRef.current?.getBoardSummary?.();
        if (summary) {
          result = {
            success: true,
            message: `${result.message ?? "Done"}.\n[Board: ${summary}]`,
          };
        }
      }
      if (sessionRef.current?.boardFrames !== "auto") scheduleRecordingFrame();
      recordToolCall(name, args, result, startedAt, callId);
      return result;
    },
    [lookAtBoard, lookAtWorksheet, recordToolCall, scheduleBoardFrame, scheduleRecordingFrame],
  );

  // The model cancelled calls (the student spoke over them): take them off the board.
  const handleToolCancelled = useCallback((callIds: string[]) => {
    for (const callId of callIds) {
      const undone = whiteboardRef.current?.undoCall?.(callId) ?? "";
      recorderRef.current?.record("tool.cancelled", "tutor", { callId, undone });
    }
    scheduleBoardFrame(900);
  }, [scheduleBoardFrame]);

  // PDFs become page pictures before any tutor sees them, and every upload
  // goes into the recording, so the review shows the worksheet too.
  const prepareFiles = useCallback(async (list: UploadedFile[]): Promise<UploadedFile[]> => {
    const ready = await withPdfPages(list);
    for (const f of ready) {
      const before = list.find((x) => x.id === f.id);
      if (f.mimeType === "application/pdf") {
        if (before?.pages) continue;
        (f.pages ?? []).forEach((page, i) => {
          void recorderRef.current?.recordFrame({ url: `data:${page.mimeType};base64,${page.base64}`, width: page.width, height: page.height }, `upload: ${f.label}, page ${i + 1}`, false);
        });
      } else if (f.mimeType === "image/jpeg" || f.mimeType === "image/png") {
        void recorderRef.current?.recordFrame({ url: `data:${f.mimeType};base64,${f.base64}`, width: 0, height: 0 }, `upload: ${f.label}`, false);
      }
    }
    return ready;
  }, []);

  // While queued writing is still appearing, the badge says so.
  const handleBoardWriting = useCallback((busy: boolean) => {
    setTutorActivity((prev) => (busy ? "writing" : prev === "writing" ? "idle" : prev));
  }, []);

  // ── Explore: a board graph opened live (components/session/GraphExplorer) ──
  // What the student changes reaches the tutor as a session event, which the
  // tutor answers, so it waits until nobody is talking: the tutor quiet for
  // 1.5 s and not thinking or writing, and the student silent for 2 s.
  const speakingRef = useRef(false);
  const tutorQuietSinceRef = useRef(0);
  const activityRef = useRef<TutorActivity>("idle");
  const lastStudentSpeechRef = useRef(0);
  useEffect(() => {
    speakingRef.current = isTutorSpeaking;
    if (!isTutorSpeaking) tutorQuietSinceRef.current = Date.now();
  }, [isTutorSpeaking]);
  useEffect(() => {
    activityRef.current = tutorActivity;
  }, [tutorActivity]);
  const exploreChannel = useMemo<ExploreChannel>(() => ({
    canReport: () => liveStateRef.current === "active" && Boolean(sessionRef.current?.sendStudentEvent),
    isQuiet: () => {
      const now = Date.now();
      return !speakingRef.current && activityRef.current === "idle" && now - tutorQuietSinceRef.current > 1500 && now - lastStudentSpeechRef.current > 2000;
    },
    report: async ({ itemId, event, picture, closed }) => {
      const live = sessionRef.current;
      if (!live?.sendStudentEvent) return false;
      if (picture && live.sendImageFrame) {
        // The picture of their graph arrives before the words about it.
        await frameGap();
        if (sessionRef.current !== live) return false;
        live.sendImageFrame(picture, `[Explore ${itemId}: the student's graph as it is now.]`);
        void recorderRef.current?.recordFrame({ url: picture, width: 0, height: 0 }, `explore ${itemId}`, true);
      } else if (closed) {
        // The board graph now shows their version.
        await sendBoardFrame();
      }
      if (sessionRef.current !== live) return false;
      return live.sendStudentEvent(event);
    },
    log: (label, detail) => recordDebug("explore", label, detail),
  }), [frameGap, recordDebug, sendBoardFrame]);
  // Destructured: the React Compiler lint treats an object holding a ref as a ref.
  const {
    state: exploreState,
    explorerRef,
    open: openExplore,
    close: closeExplore,
    change: changeExplore,
    exited: exploreExited,
  } = useGraphExplore(() => whiteboardRef.current, exploreChannel);

  const setTemporaryFileNotice = useCallback((message: string) => {
    setFileNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setFileNotice(""), 4200);
  }, []);

  const clearSubtitle = useCallback(() => {
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    subtitleTimerRef.current = null;
    setSubtitleText("");
  }, []);

  // Captions stay up for the whole utterance and linger after it so the last
  // sentence can be read to the end; a fixed timer used to cut them off while
  // the tutor was still talking.
  useEffect(() => {
    if (subtitleTimerRef.current) {
      clearTimeout(subtitleTimerRef.current);
      subtitleTimerRef.current = null;
    }
    if (isTutorSpeaking || !subtitleText) return;
    subtitleTimerRef.current = setTimeout(() => {
      subtitleTimerRef.current = null;
      setSubtitleText("");
    }, 4000);
    return () => {
      if (subtitleTimerRef.current) {
        clearTimeout(subtitleTimerRef.current);
        subtitleTimerRef.current = null;
      }
    };
  }, [isTutorSpeaking, subtitleText]);

  const cleanupTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    if (intervalSnapRef.current) clearInterval(intervalSnapRef.current);
    intervalSnapRef.current = null;
    setIsTutorSpeaking(false);
    setTutorActivity("idle");
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
    // The last board picture reaches the recording before the session closes (never waiting long).
    const finalImage = await Promise.race([
      whiteboardRef.current?.exportImage?.(896) ?? Promise.resolve(null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    if (finalImage) await recorderRef.current?.recordFrame(finalImage, "session end", false, endedAt);
    const live = sessionRef.current;
    sessionRef.current = null;
    // Graceful close first so the last transcript fragments flush into state.
    await live?.end();
    if (recorderRef.current) {
      recorderRef.current.record("session.ended", "system", {}, Date.now());
    } else {
      await appendEvent(id, {
        kind: "session.ended",
        actor: "system",
        offsetMs: Math.max(0, endedAt - sessionStartedAtRef.current),
        payload: {},
      });
    }
    await recorderRef.current?.flush();
    await patchSession(id, {
      status: "ended",
      endedAt,
      durationSec: dur,
      transcript: transcriptRef.current,
    });
    cleanupTimers();
    clearSubtitle();
    liveStateRef.current = "idle";
    setLiveState("idle");
    setMode("review");
    // Refresh session record
    const fresh = await getSessionById(id);
    if (fresh) setSession(fresh.session);
  }, [cleanupTimers, clearSubtitle, id, persistSnapshot]);

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
      // Fresh new session — reset transcript/elapsed/board, but keep what the
      // student set up on the way in: their opening line and the session's name.
      const opening = transcriptRef.current.filter((e) => e.id.startsWith("intake_"));
      const startTitle = sessionTitleRef.current || "Session";
      setTranscript(opening);
      transcriptRef.current = opening;
      setElapsedSeconds(0);
      elapsedSecondsRef.current = 0;
      setSessionTitle(startTitle);
      sessionTitleRef.current = startTitle;
      void patchSession(id, { title: startTitle, transcript: opening });
      whiteboardRef.current?.clearWhiteboard();
      sessionStartedAtRef.current = Date.now();
    }

    intentionalDisconnectRef.current = false;
    disconnectToErrorRef.current = false;

    const failStart = (message: string, micStream: MediaStream | null) => {
      micStream?.getTracks().forEach((t) => t.stop());
      setErrorMessage(message);
      intentionalDisconnectRef.current = true;
      disconnectToErrorRef.current = true;
      liveStateRef.current = "error";
      startInFlightRef.current = false;
      setLiveState("error");
      cleanupTimers();
    };

    // Request mic permission upfront so the browser prompt appears immediately,
    // before the live tutor connects. This makes "Try again" re-prompt right away.
    let micStream: MediaStream | null = null;
    if (qaTextOnlyRef.current) {
      recordDebug("audio", "microphone_skipped", { reason: "qa_text_only" });
    } else {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
        failStart(
          blocked
            ? "Microphone is blocked. Click the lock icon in your browser's address bar to allow mic access, then try again."
            : "Microphone access denied. Please allow mic access and try again.",
          null,
        );
        return;
      }
    }

    const callbacks: LiveTutorCallbacks = {
      onTranscript: (entry) => {
        recordDebug("transcript", entry.role, {
          id: entry.id,
          chars: entry.text.length,
          text: entry.text,
        });
        // Recorded in order with the rest of the session (one POST per fragment raced and shuffled them).
        const at = entry.at ?? Date.now();
        if (entry.role === "student") lastStudentSpeechRef.current = Date.now();
        recorderRef.current?.record("transcript.entry", entry.role, { text: entry.text, at, role: entry.role, id: entry.id, spaced: entry.spaced === true }, at);
        setTranscript((prev) => {
          const next = appendTranscriptEntry(prev, entry);
          transcriptRef.current = next;
          return next;
        });
      },
      onCaption: (text) => {
        // Lifetime is handled by the speaking effect: the caption stays while
        // the tutor talks and lingers a few seconds after.
        setSubtitleText(text);
      },
      onToolCall: handleToolCall,
      onToolCancelled: handleToolCancelled,
      onConnected: ({ resumed, expiresAt }) => {
        startInFlightRef.current = false;
        liveStateRef.current = "active";
        setLiveState("active");
        setErrorMessage("");
        recordDebug("connection", "live_session_active", { resumed, expiresAt });
        if (!isResumeRef.current) clearNewSessionUrlFlag();
        if (!timerRef.current) {
          recorderRef.current?.record("session.started", "system", {
            provider,
            model: provider === "gemini" ? liveModel : undefined,
            resumed: isResumeRef.current,
            speechRate: speechRateRef.current,
            textOnly: qaTextOnlyRef.current === true,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            userAgent: navigator.userAgent,
          });
        }
        if (timerRef.current) return; // reconnect: timers already running
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
      },
      onReconnecting: (attempt) => {
        recordDebug("connection", "live_session_reconnecting", { attempt });
        clearSubtitle();
        setIsTutorSpeaking(false);
        setTutorActivity("idle");
        liveStateRef.current = "connecting";
        setLiveState("connecting");
      },
      onDisconnected: (reason) => {
        recordDebug("connection", "live_session_disconnected", {
          intentional: intentionalDisconnectRef.current,
          reason,
        });
        void recorderRef.current?.flush();
        clearSubtitle();
        cleanupTimers();
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
        void recorderRef.current?.flush();
        pauseLiveSession();
        intentionalDisconnectRef.current = true;
        disconnectToErrorRef.current = true;
        setErrorMessage(msg);
        liveStateRef.current = "error";
        setLiveState("error");
        clearSubtitle();
        cleanupTimers();
        startInFlightRef.current = false;
        const live = sessionRef.current;
        sessionRef.current = null;
        void live?.end();
      },
      onSpeakingChange: (speaking) => {
        setIsTutorSpeaking(speaking);
        recorderRef.current?.record("tutor.speaking", "tutor", { speaking });
      },
      onAudioAnalyser: (node) => {
        setAnalyser(node);
      },
      onActivity: (activity) => {
        setTutorActivity(activity);
        recorderRef.current?.record("tutor.activity", "tutor", { activity });
      },
      onDebugEvent: (event) => {
        recordDebug(event.kind, event.message, event.payload);
      },
    };

    const live: TutorClient = provider === "gemini" ? new GeminiTutorSession(callbacks, { model: liveModel }) : new LiveTutorSession(callbacks);
    sessionRef.current = live;
    live.setSpeechRate?.(speechRateRef.current);
    recordDebug("connection", "live_provider_selected", { provider: provider === "gemini" ? "gemini-live" : "gpt-live-1" });

    // Graphs are drawn by Desmos (a 4.3 MB script): fetch it while the session connects.
    preloadDesmos();
    try {
      if (filesRef.current.some((f) => f.mimeType === "application/pdf" && !f.pages)) {
        const ready = await prepareFiles(filesRef.current);
        filesRef.current = ready;
        setFiles(ready);
      }
      await live.start({
        mode: isResumeRef.current ? "resume" : "new",
        micStream,
        files: filesRef.current,
        history: transcriptRef.current
          .slice(-RESUME_HISTORY_TURNS)
          .map((e) => ({ role: e.role, text: e.text })),
        sessionTitle: sessionTitleRef.current,
        getBoardSummary: () => whiteboardRef.current?.getBoardSummary?.() ?? "",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't start the session. Please try again.";
      recordDebug("error", "live_start_failed", { message });
      sessionRef.current = null;
      void live.end();
      pauseLiveSession();
      failStart(message, null);
    }
  }, [cleanupTimers, clearNewSessionUrlFlag, clearSubtitle, handleToolCall, handleToolCancelled, id, pauseLiveSession, persistSnapshot, prepareFiles, provider, recordDebug, liveModel]);

  useEffect(() => {
    speechRateRef.current = tutorSpeedRate(tutorSpeed);
    sessionRef.current?.setSpeechRate?.(speechRateRef.current);
    if (sessionRef.current) recorderRef.current?.record("settings.speed", "student", { speed: tutorSpeed, rate: speechRateRef.current });
  }, [tutorSpeed]);

  const handleAddFiles = useCallback(
    async (added: UploadedFile[]) => {
      recordDebug("file", "files_added", {
        files: debugFileSummary(added),
        liveState: liveStateRef.current,
      });
      const newFiles = await prepareFiles(added);
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
    [prepareFiles, recordDebug, setTemporaryFileNotice],
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
    recorderRef.current?.record("transcript.entry", "student", { text, at: entry.at, role: "student", id: entry.id }, entry.at);
    setTranscript((prev) => {
      const next = appendTranscriptEntry(prev, entry);
      transcriptRef.current = next;
      return next;
    });
  }, [recordDebug]);

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
      recorderRef.current?.flushBeacon();
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
      const live = sessionRef.current;
      sessionRef.current = null;
      void live?.end();
      cleanupTimers();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
      if (boardFrameTimerRef.current) clearTimeout(boardFrameTimerRef.current);
      if (recordingFrameTimerRef.current) clearTimeout(recordingFrameTimerRef.current);
    };
  }, [cleanupTimers, id]);

  // ── Initial load ─────────────────────────────────────────────────────
  useEffect(() => {
    if (mockPreview) return;
    let cancelled = false;

    // Capture isNew exactly once per mount. Cache in a ref so re-runs
    // (e.g. when Next.js re-emits searchParams after history changes)
    // see the same value and we never downgrade live → lobby.
    if (initialIsNewRef.current === null) {
      initialIsNewRef.current = searchParams.get("new") === "1";
    }
    const isNew = initialIsNewRef.current;

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
        const ordered = [...data.events].sort((a, b) => compareEvents({ ...a, cseq: a.clientSeq }, { ...b, cseq: b.clientSeq }));
        for (const ev of ordered) {
          if (ev.kind === "transcript.entry") {
            const p = ev.payload as { text: string; at?: number; role: "tutor" | "student"; id?: string; spaced?: boolean };
            rawEntries.push({
              id: p.id ?? `ev_${ev.id}`,
              role: p.role,
              text: p.text,
              at: p.at,
              spaced: p.spaced === true,
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

      // What the student answered on the way in (lib/session-intake): it names
      // the session, carries their photos into the first turn, and opens the
      // conversation, so the tutor never asks what we are working on.
      const handoff = isNew ? takeIntake(id) : null;
      if (handoff) {
        setActiveIntake(handoff.intake, handoff.files.length);
        if (handoff.files.length > 0) {
          setFiles(handoff.files);
          filesRef.current = handoff.files;
        }
        const opening: TranscriptEntry = {
          id: `intake_${Date.now()}`,
          role: "student",
          text: intakeOpeningMessage(handoff.intake, handoff.files.length),
          at: Date.now(),
        };
        const withOpening = appendTranscriptEntry(hydratedTranscript, opening);
        setTranscript(withOpening);
        transcriptRef.current = withOpening;
        recorderRef.current?.record("transcript.entry", "student", { text: opening.text, at: opening.at, role: "student", id: opening.id }, opening.at);
      }

      const initialTitle = isNew ? (handoff ? intakeTitle(handoff.intake) : "Session") : data.session.title;
      setSessionTitle(initialTitle);
      sessionTitleRef.current = initialTitle;
      sessionStartedAtRef.current = data.session.startedAt;
      setElapsedSeconds(isNew ? 0 : data.session.durationSec);
      elapsedSecondsRef.current = isNew ? 0 : data.session.durationSec;

      if (isNew) {
        isResumeRef.current = false;
        void patchSession(id, { title: initialTitle, transcript: [] });
        setMode("live");
      } else if (data.session.status === "ended") {
        setMode("review");
      } else {
        // Auto-resume: skip lobby, restore board and start voice immediately
        isResumeRef.current = true;
        void patchSession(id, { status: "active" });
        void appendEvent(id, {
          kind: "session.resumed",
          actor: "system",
          offsetMs: Math.max(0, Date.now() - data.session.startedAt),
          payload: {},
        });
        setMode("live");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, mockPreview, searchParams]);

  // Auto-start live mode once mounted (handles new + resume)
  useEffect(() => {
    if (mockPreview) return;
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
  }, [mockPreview, mode, startSession]);

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

  const { intake } = useFileIntake(files, handleAddFiles);
  const { dragging, handlers: dropHandlers } = useFileDrop((list) => {
    void intake(list);
  });

  // The chip says which model ran, so a recording can be told apart later.
  const liveTag =
    provider !== "gemini"
      ? provider
      : `gemini ${/gemini-([\d.]+)/.exec(liveModel)?.[1] ?? ""}${liveModel.includes("thinking") ? " thinking" : ""}`.trim();

  const dockActivity: DockActivity =
    liveState === "connecting" || liveState === "idle"
      ? "connecting"
      : isTutorSpeaking
        ? "speaking"
        : tutorActivity === "writing"
          ? "writing"
          : tutorActivity === "thinking"
            ? "thinking"
            : "listening";

  if (mode === "loading") {
    return (
      <AppShell defaultOpen={false}>
        <TopBar />
        <Centered text="Loading session…" />
      </AppShell>
    );
  }

  if (mode === "notfound") {
    return (
      <AppShell defaultOpen={false}>
        <TopBar />
        <NotFoundState onHome={() => router.push("/")} />
      </AppShell>
    );
  }

  if (mode === "lobby") {
    return (
      <AppShell defaultOpen={false}>
        <TopBar actions={<Button variant="outline" onClick={() => router.push("/")}>Home</Button>}>
          <SessionMeta session={session} />
        </TopBar>
        <LobbyBody session={session} onResume={beginResume} />
      </AppShell>
    );
  }

  if (mode === "review") {
    return (
      <AppShell defaultOpen={false}>
        <TopBar
          actions={
            <>
              <Button variant="outline" onClick={() => router.push("/session")}>
                <Plus />
                New session
              </Button>
              <Button onClick={beginResume}>
                <Play className="fill-current" />
                Continue session
              </Button>
            </>
          }
        >
          <SessionMeta session={session} showDuration />
        </TopBar>
        <ReviewBody transcript={transcript} />
      </AppShell>
    );
  }

  // Live: the board is the page. Title and End float over it; the dock sits
  // bottom right.
  return (
    <AppShell defaultOpen={false}>
      <main className="relative min-h-0 flex-1 overflow-hidden bg-white" {...dropHandlers}>
        <Whiteboard
          ref={whiteboardRef}
          onWriting={handleBoardWriting}
          onExplore={openExplore}
          exploringItemId={exploreState?.open ? exploreState.target.itemId : null}
        />

        <SessionChip
          liveState={liveState}
          title={sessionTitle}
          elapsed={formatTime(elapsedSeconds)}
          qaLabel={debugMode ? `${qaTextOnly ? "QA text" : "QA mic"} on ${liveTag}` : provider === "gemini" ? liveTag : null}
        />
        <div className="absolute top-4 right-4 z-30">
          <EndSessionButton disabled={liveState !== "active"} onConfirm={endSession} />
        </div>

        <CaptionBar text={subtitleText} />
        {exploreState && (
          <GraphExplorer
            key={exploreState.target.itemId}
            ref={explorerRef}
            state={exploreState}
            onChange={changeExplore}
            onClose={closeExplore}
            onExited={exploreExited}
          />
        )}
        <DropOverlay show={dragging} />
        {liveState === "error" && (
          <ErrorNotice
            message={errorMessage}
            onRetry={() => {
              isResumeRef.current = false;
              void startSession();
            }}
          />
        )}
        <VoiceDock
          activity={dockActivity}
          isMuted={isMuted}
          onMute={() => setIsMuted((v) => !v)}
          analyser={analyser}
          onSendText={handleSendText}
          transcript={transcript}
          transcriptOpen={transcriptOpen}
          onToggleTranscript={() => setTranscriptOpen((v) => !v)}
          files={files}
          onAddFiles={handleAddFiles}
          onRemoveFile={handleRemoveFile}
          fileNotice={fileNotice}
          speed={provider === "gemini" ? tutorSpeed : undefined}
          onSpeedChange={setTutorSpeed}
        />
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
    </AppShell>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────

const MOCK_TRANSCRIPT: TranscriptEntry[] = [
  { id: "m1", role: "student", text: "I don't get fractions at all." },
  { id: "m2", role: "tutor", text: "Totally fair. Quick question first: if you cut a pizza into two equal pieces and take one, what fraction of the pizza do you have?" },
  { id: "m3", role: "student", text: "um, a half?" },
  { id: "m4", role: "tutor", text: "Yes, one half. Look at the board: the pizza is cut into two equal pieces and one is shaded. If I cut the same pizza into four equal pieces instead, how many pieces would make one half?" },
  { id: "m5", role: "student", text: "two pieces" },
  { id: "m6", role: "tutor", text: "Exactly. Two quarters is the same amount as one half. Let me put both next to each other." },
];

function Centered({ text }: { text: string }) {
  return <div className="flex flex-1 items-center justify-center text-[14px] text-(--lp-ink-3)">{text}</div>;
}

function NotFoundState({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="lp-display m-0 text-[22px] text-(--lp-ink)">Session not found</p>
      <p className="m-0 mb-4 max-w-[38ch] text-[14px] leading-[1.5] text-(--lp-ink-2)">It may have been deleted, or the link is wrong.</p>
      <Button onClick={onHome}>Go to home</Button>
    </div>
  );
}

function SessionMeta({ session, showDuration }: { session: SavedSession | null; showDuration?: boolean }) {
  if (!session) return null;
  const status = session.status === "active" ? "In progress" : session.status === "paused" ? "Paused" : "Ended";
  return (
    <>
      <span className="truncate font-medium text-(--lp-ink)" title={session.title}>
        {session.title}
      </span>
      <span className="shrink-0 text-(--lp-ink-3)">{formatRelativeDate(session.startedAt)}</span>
      {showDuration && <span className="shrink-0 text-(--lp-ink-3)">{formatDuration(session.durationSec)}</span>}
      <Badge variant="outline" className="shrink-0 rounded-full border-(--lp-line-strong) text-(--lp-ink-2)">
        {status}
      </Badge>
    </>
  );
}

function LobbyBody({ session, onResume }: { session: SavedSession | null; onResume: () => void }) {
  const heading = session?.status === "active" ? "Session in progress" : "Session paused";
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <p className="lp-display m-0 text-[26px] text-(--lp-ink)">{heading}</p>
      <p className="m-0 mt-2 mb-7 max-w-[40ch] text-[15px] leading-[1.55] text-(--lp-ink-2)">
        Pick up where you left off. The board and the transcript come back exactly as they were.
      </p>
      <button type="button" onClick={onResume} className="lp-btn">
        <Play className="size-4 fill-current" />
        Resume session
      </button>
    </div>
  );
}

function ReviewBody({ transcript }: { transcript: TranscriptEntry[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-8 pt-10 pb-20">
        <section className="mb-10">
          <h2 className="lp-display m-0 mb-3 text-[18px] text-(--lp-ink)">Summary</h2>
          <div className="rounded-[14px] border border-dashed border-(--lp-line-strong) px-5 py-4 text-[13.5px] leading-[1.55] text-(--lp-ink-3)">
            A short summary of what was covered and what to practise next will appear here.
          </div>
        </section>
        <section>
          <h2 className="lp-display m-0 mb-4 text-[18px] text-(--lp-ink)">Transcript</h2>
          <TranscriptList transcript={transcript} emptyText="No transcript was recorded for this session." />
        </section>
      </div>
    </div>
  );
}

function EndSessionButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            disabled={disabled}
            className="h-8 rounded-full border-(--lp-line-strong) px-3.5 text-[13px] font-medium text-(--danger) hover:bg-[#fff1f0] hover:text-(--danger)"
          />
        }
      >
        <Square className="size-3 fill-current" />
        End session
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[300px] rounded-[16px] p-4">
        <p className="m-0 text-[14px] font-semibold text-(--lp-ink)">End this session?</p>
        <p className="m-0 mt-1 mb-4 text-[13px] leading-[1.5] text-(--lp-ink-2)">
          The board and transcript are saved. You can pick it up again from Home.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Keep going
          </Button>
          <Button
            size="sm"
            className="bg-(--danger) text-white hover:bg-[#b8261a]"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            End session
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute top-4 left-1/2 z-30 flex max-w-[520px] -translate-x-1/2 items-center gap-3 rounded-[14px] border border-(--lp-line-strong) bg-white px-4 py-3 shadow-(--lp-shadow-card)">
      <span className="min-w-0 flex-1 text-[13.5px] leading-[1.45] text-(--lp-ink)">
        {message || "The tutor connection hit an error."}
      </span>
      <Button size="sm" onClick={onRetry}>
        <RotateCcw />
        Try again
      </Button>
    </div>
  );
}
