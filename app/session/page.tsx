"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LeftNav from "@/components/LeftNav";
import Whiteboard from "@/components/Whiteboard";
import type { WhiteboardHandle } from "@/components/Whiteboard";
import Sidebar from "@/components/Sidebar";
import { GeminiLiveSession, TranscriptEntry } from "@/lib/gemini-live";
import { AudioCapture, AudioPlayer } from "@/lib/audio";
import { newSessionId, saveSession } from "@/lib/sessions";
import type { UploadedFile } from "@/lib/file-processor";

type SessionState = "pre" | "connecting" | "active" | "ended";

export default function SessionPage() {
  const [sessionState, setSessionState] = useState<SessionState>("pre");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isTutorSpeaking, setIsTutorSpeaking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Session");
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutedRef = useRef(false);
  const whiteboardRef = useRef<WhiteboardHandle>(null);

  // Refs to capture current state inside WebSocket callbacks (avoids stale closures)
  const sessionTitleRef = useRef("Session");
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const elapsedSecondsRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
  const filesRef = useRef<UploadedFile[]>([]);
  const sessionStateRef = useRef<SessionState>("pre");

  // Whiteboard reveal queue — stagger items so they animate in one at a time
  const wbQueueRef = useRef<Array<() => void>>([]);
  const wbBusyRef = useRef(false);
  const wbDrainRef = useRef<() => void>(null!);
  wbDrainRef.current = () => {
    if (wbQueueRef.current.length === 0) { wbBusyRef.current = false; return; }
    wbBusyRef.current = true;
    const op = wbQueueRef.current.shift()!;
    op();
    setTimeout(() => wbDrainRef.current(), 240);
  };
  const enqueueWb = (op: () => void) => {
    wbQueueRef.current.push(op);
    if (!wbBusyRef.current) wbDrainRef.current();
  };

  // Keep refs in sync so WebSocket callbacks always see current values
  useEffect(() => { mutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { sessionTitleRef.current = sessionTitle; }, [sessionTitle]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { elapsedSecondsRef.current = elapsedSeconds; }, [elapsedSeconds]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { sessionStateRef.current = sessionState; }, [sessionState]);

  const handleToolCall = useCallback(
    (name: string, args: Record<string, unknown>) => {
      const col = args.column as "left" | "right" | undefined;

      if (name === "clear_whiteboard") {
        wbQueueRef.current = [];
        wbBusyRef.current = false;
        whiteboardRef.current?.clearWhiteboard();
        return;
      }

      if (name === "start_new_problem") {
        const t = (args.title as string) ?? "";
        if (t) setSessionTitle(t);
        wbQueueRef.current = [];
        wbBusyRef.current = false;
        enqueueWb(() =>
          whiteboardRef.current?.startNewProblem(t)
        );
        return;
      }

      if (name === "draw_equation_step") {
        enqueueWb(() =>
          whiteboardRef.current?.drawEquationStep(
            (args.latex as string) ?? "",
            args.annotation as string | undefined,
            col
          )
        );
        return;
      }

      if (name === "add_text_note") {
        enqueueWb(() =>
          whiteboardRef.current?.addTextNote(
            (args.text as string) ?? "",
            args.size as "heading" | "body" | undefined,
            col
          )
        );
        return;
      }

      if (name === "add_function_graph") {
        enqueueWb(() =>
          whiteboardRef.current?.addFunctionGraph(
            (args.expression as string) ?? "",
            (args.x_min as number) ?? -10,
            (args.x_max as number) ?? 10,
            args.label as string | undefined,
            col ?? "right"
          )
        );
        return;
      }

      if (name === "draw_shape") {
        enqueueWb(() =>
          whiteboardRef.current?.drawShape(
            (args.shape as string) ?? "rectangle",
            args.label as string | undefined,
            args.width as number | undefined,
            args.height as number | undefined,
            col
          )
        );
        return;
      }

      if (name === "highlight_step") {
        enqueueWb(() =>
          whiteboardRef.current?.highlightStep(
            args.step_index as number,
            args.style as "circle" | "underline" | "box"
          )
        );
        return;
      }

      if (name === "cross_out_step") {
        enqueueWb(() =>
          whiteboardRef.current?.crossOutStep(args.step_index as number)
        );
        return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const startSession = useCallback(async () => {
    setSessionState("connecting");
    setTranscript([]);
    whiteboardRef.current?.clearWhiteboard();
    setElapsedSeconds(0);
    setIsMuted(false);

    const id = newSessionId();
    setSessionId(id);
    setSessionTitle("Session");
    sessionTitleRef.current = "Session";
    transcriptRef.current = [];
    elapsedSecondsRef.current = 0;
    sessionStartedAtRef.current = Date.now();

    const player = new AudioPlayer();
    player.resume();
    playerRef.current = player;

    const gemini = new GeminiLiveSession({
      onAudio: (base64) => {
        setIsTutorSpeaking(true);
        playerRef.current?.enqueue(base64);
        setTimeout(() => setIsTutorSpeaking(false), 800);
      },
      onTranscript: (entry) => {
        setTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === entry.role) {
            return [...prev.slice(0, -1), { ...last, text: last.text + " " + entry.text }];
          }
          return [...prev, entry];
        });
      },
      onToolCall: handleToolCall,
      onConnected: async () => {
        setSessionState("active");
        // Send file context and the greeting as one completed turn.
        sessionRef.current?.sendInitialGreeting(filesRef.current);
        timerRef.current = setInterval(
          () => setElapsedSeconds((s) => s + 1),
          1000
        );
        try {
          let audioChunkCount = 0;
          const capture = new AudioCapture((base64) => {
            if (!mutedRef.current) {
              sessionRef.current?.sendAudio(base64);
              audioChunkCount++;
              if (audioChunkCount % 50 === 1) {
                console.log(`[Audio] Sending mic chunk #${audioChunkCount}`);
              }
            }
          });
          await capture.start();
          captureRef.current = capture;
        } catch {
          alert("Microphone access denied. Please allow mic access and try again.");
          endSession();
        }
      },
      onInterrupted: () => {
        playerRef.current?.flush();
        setIsTutorSpeaking(false);
      },
      onDisconnected: () => {
        saveSession({
          id,
          title: sessionTitleRef.current || "Session",
          startedAt: sessionStartedAtRef.current,
          endedAt: Date.now(),
          durationSec: elapsedSecondsRef.current,
          transcript: transcriptRef.current,
        });
        setSessionState("ended");
        cleanup();
      },
      onError: (msg) => {
        alert(msg);
        setSessionState("pre");
        cleanup();
      },
    });

    sessionRef.current = gemini;
    gemini.connect();
  }, [handleToolCall]);

  const endSession = useCallback(() => {
    if (sessionId) {
      saveSession({
        id: sessionId,
        title: sessionTitleRef.current || "Session",
        startedAt: sessionStartedAtRef.current,
        endedAt: Date.now(),
        durationSec: elapsedSecondsRef.current,
        transcript: transcriptRef.current,
      });
    }
    sessionRef.current?.disconnect();
    setSessionState("ended");
    cleanup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleAddFiles = useCallback((newFiles: UploadedFile[]) => {
    setFiles((prev) => {
      const updated = [...prev, ...newFiles];
      filesRef.current = updated;
      return updated;
    });
    // If a session is already active, send the new files immediately as context
    if (sessionStateRef.current === "active" && sessionRef.current) {
      sessionRef.current.sendFiles(newFiles);
    }
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => {
      const updated = prev.filter((f) => f.id !== id);
      filesRef.current = updated;
      return updated;
    });
  }, []);

  function cleanup() {
    captureRef.current?.stop();
    captureRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setIsTutorSpeaking(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "m" || e.key === "M") {
        if (sessionState === "active") setIsMuted((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessionState]);

  useEffect(() => {
    return () => {
      sessionRef.current?.disconnect();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div
      className="h-screen w-screen flex overflow-hidden"
      style={{ background: "#e2e2e2", padding: 10, gap: 10 }}
    >
      <LeftNav />

      {/* Canvas */}
      <section
        className="flex-1 min-w-0 flex flex-col overflow-hidden"
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 18px rgba(0,0,0,0.06)",
        }}
      >
        {/* Top bar */}
        <header
          className="h-14 px-7 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid #d0d0d0" }}
        >
          <div className="flex items-center gap-3 text-[13px]">
            {sessionState === "active" && (
              <>
                <span className="flex items-center gap-2">
                  <LiveDot />
                  <span className="font-semibold" style={{ color: "#0a0a0a" }}>Session</span>
                </span>
                <span style={{ color: "#d0d0d0" }} aria-hidden="true">·</span>
                <span
                  className="font-variant-numeric tabular-nums"
                  style={{ color: "#5a5a5a", fontVariantNumeric: "tabular-nums" }}
                >
                  {formatTime(elapsedSeconds)}
                </span>
              </>
            )}
            {sessionState === "pre" && (
              <span className="font-medium" style={{ color: "#909090" }}>No active session</span>
            )}
            {sessionState === "connecting" && (
              <span className="font-medium" style={{ color: "#909090" }}>Connecting…</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <TopBarBtn aria-label="Command palette">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </TopBarBtn>
            <TopBarIconBtn aria-label="Shortcuts"><QuestionIcon /></TopBarIconBtn>
            <TopBarIconBtn aria-label="More"><DotsIcon /></TopBarIconBtn>
          </div>
        </header>

        {/* Whiteboard */}
        <main className="flex-1 relative overflow-hidden">
          <Whiteboard ref={whiteboardRef} />
        </main>
      </section>

      <Sidebar
        sessionState={sessionState}
        transcript={transcript}
        isMuted={isMuted}
        isTutorSpeaking={isTutorSpeaking}
        files={files}
        onStart={startSession}
        onMute={() => setIsMuted((v) => !v)}
        onEnd={endSession}
        onAddFiles={handleAddFiles}
        onRemoveFile={handleRemoveFile}
      />
    </div>
  );
}

function LiveDot() {
  return (
    <span
      className="w-[7px] h-[7px] rounded-full"
      style={{ background: "#16a34a", animation: "live-pulse 2.2s cubic-bezier(0.22,1,0.36,1) infinite" }}
    />
  );
}

function TopBarBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      className="h-8 px-2.5 flex items-center gap-1.5 rounded-md text-[12px] transition-colors duration-150"
      style={{ color: "#5a5a5a" }}
      onMouseOver={(e) => { e.currentTarget.style.background = "#f0f0f0"; e.currentTarget.style.color = "#0a0a0a"; }}
      onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#5a5a5a"; }}
      {...props}
    >
      {children}
    </button>
  );
}

function TopBarIconBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      className="h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-150"
      style={{ color: "#5a5a5a" }}
      onMouseOver={(e) => { e.currentTarget.style.background = "#f0f0f0"; e.currentTarget.style.color = "#0a0a0a"; }}
      onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#5a5a5a"; }}
      {...props}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded"
      style={{
        minWidth: "1.25rem", padding: "0 0.3rem", height: "1.25rem",
        fontSize: "0.6875rem", fontWeight: 500, color: "#909090",
        background: "#f5f5f5", border: "1px solid #d0d0d0", borderBottomWidth: 1.5, fontFamily: "inherit",
      }}
    >
      {children}
    </span>
  );
}

function QuestionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
      <path d="M6 6.4c.2-1.1 1-1.6 2-1.6 1.2 0 2 .9 2 1.9 0 .9-.6 1.4-1.3 1.7-.5.2-.7.5-.7 1V9.5M8 11.5v.05" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="3" cy="8" r="1.1" fill="currentColor" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
      <circle cx="13" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}
