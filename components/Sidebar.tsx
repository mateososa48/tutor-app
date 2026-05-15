"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TranscriptEntry } from "@/lib/gemini-live";
import {
  UploadedFile,
  ACCEPTED_EXTENSIONS,
  readFileAsBase64,
  validateFile,
  fileTypeLabel,
} from "@/lib/file-processor";

type SessionState = "pre" | "connecting" | "active" | "ended";

interface SidebarProps {
  sessionState: SessionState;
  transcript: TranscriptEntry[];
  isMuted: boolean;
  isTutorSpeaking: boolean;
  files: UploadedFile[];
  onStart: () => void;
  onMute: () => void;
  onEnd: () => void;
  onAddFiles: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
}

export default function Sidebar({
  sessionState,
  transcript,
  isMuted,
  isTutorSpeaking,
  files,
  onStart,
  onMute,
  onEnd,
  onAddFiles,
  onRemoveFile,
}: SidebarProps) {
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const dragCountRef = useRef(0);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const processFiles = useCallback(
    async (rawFiles: FileList | File[]) => {
      const arr = Array.from(rawFiles);
      const errors: string[] = [];
      const valid: File[] = [];

      for (const f of arr) {
        const err = validateFile(f);
        if (err) { errors.push(err); continue; }
        valid.push(f);
      }

      if (errors.length > 0) {
        setFileError(errors[0]);
        setTimeout(() => setFileError(null), 4000);
      }
      if (valid.length === 0) return;

      setProcessing(true);
      const nextIndex = files.length;
      const newEntries: UploadedFile[] = await Promise.all(
        valid.map(async (f, i) => ({
          id: Math.random().toString(36).slice(2),
          label: `File ${nextIndex + i + 1}`,
          name: f.name,
          mimeType: f.type,
          base64: await readFileAsBase64(f),
        }))
      );
      setProcessing(false);
      onAddFiles(newEntries);
    },
    [files.length, onAddFiles]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current++;
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  };

  return (
    <aside
      className="w-[360px] flex-shrink-0 flex flex-col overflow-hidden"
      style={{
        background: "#fff",
        borderRadius: 14,
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 18px rgba(0,0,0,0.06)",
        position: "relative",
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "rgba(255,255,255,0.92)",
            borderRadius: 14,
            border: "2px dashed #0a0a0a",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          <UploadIcon size={28} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#0a0a0a" }}>
            Drop files here
          </span>
          <span style={{ fontSize: 12, color: "#909090" }}>
            JPG, PNG, text files
          </span>
        </div>
      )}

      {/* Transcript */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div
          className="px-6 pt-5 pb-3 flex items-baseline justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid #d0d0d0" }}
        >
          <h2
            className="text-[11px] uppercase tracking-[0.09em] font-semibold"
            style={{ color: "#909090" }}
          >
            Transcript
          </h2>
          {sessionState === "active" && (
            <span
              className="text-[10px] uppercase tracking-[0.09em] font-bold"
              style={{ color: "#16a34a" }}
            >
              live
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4 pb-4">
          {transcript.length === 0 ? (
            <p className="text-[13px] mt-2" style={{ color: "#c0c0c0" }}>
              {sessionState === "pre" ? "Start a session to begin." : "Listening…"}
            </p>
          ) : (
            <div className="flex flex-col gap-4 text-[14px] leading-[1.55]">
              {transcript.map((entry, i) => {
                const isLatest = i === transcript.length - 1;
                if (entry.role === "tutor") {
                  return (
                    <div
                      key={entry.id}
                      className="flex gap-3"
                      style={{
                        color: isLatest ? "#0a0a0a" : i >= transcript.length - 3 ? "#5a5a5a" : "#b0b0b0",
                        fontWeight: isLatest ? 600 : 500,
                      }}
                    >
                      <span
                        className="w-[7px] h-[7px] rounded-full flex-shrink-0 mt-[8px]"
                        style={{
                          background: isLatest ? "#0a0a0a" : i >= transcript.length - 3 ? "#5a5a5a" : "#b0b0b0",
                        }}
                        aria-hidden="true"
                      />
                      <span>{entry.text}</span>
                    </div>
                  );
                } else {
                  return (
                    <div
                      key={entry.id}
                      className="pl-8 italic font-medium"
                      style={{ color: "#5a5a5a" }}
                    >
                      {entry.text}
                    </div>
                  );
                }
              })}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Files panel */}
      <div className="flex-shrink-0" style={{ borderTop: "1px solid #e8e8e8" }}>
        <div className="px-6 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-[11px] uppercase tracking-[0.09em] font-semibold"
              style={{ color: "#909090" }}
            >
              Files
            </h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={processing}
              title="Upload files"
              className="h-6 w-6 flex items-center justify-center rounded-md transition-colors duration-150"
              style={{ color: "#5a5a5a" }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "#f0f0f0";
                e.currentTarget.style.color = "#0a0a0a";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#5a5a5a";
              }}
            >
              <PlusIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.length) {
                  processFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </div>

          {/* Error message */}
          {fileError && (
            <div
              className="mb-2 px-3 py-2 rounded-md text-[12px]"
              style={{ background: "#fff1f2", color: "#b91c1c" }}
            >
              {fileError}
            </div>
          )}

          {/* File list */}
          {files.length === 0 && !processing ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 rounded-lg border border-dashed text-[12px] transition-colors duration-150"
              style={{ borderColor: "#d0d0d0", color: "#b0b0b0" }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = "#909090";
                e.currentTarget.style.color = "#5a5a5a";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = "#d0d0d0";
                e.currentTarget.style.color = "#b0b0b0";
              }}
            >
              Drop or click to add images or text…
            </button>
          ) : (
            <div
              className="flex flex-col gap-1.5"
              style={{ maxHeight: 136, overflowY: "auto" }}
            >
              {files.map((f) => (
                <FileRow key={f.id} file={f} onRemove={() => onRemoveFile(f.id)} />
              ))}
              {processing && (
                <div
                  className="flex items-center gap-2 px-2 py-2 rounded-md"
                  style={{ background: "#f7f7f7" }}
                >
                  <Spinner />
                  <span style={{ fontSize: 12, color: "#909090" }}>Reading file…</span>
                </div>
              )}
            </div>
          )}

          {/* Hint: files available in session */}
          {files.length > 0 && sessionState === "pre" && (
            <p className="mt-2 text-[11px]" style={{ color: "#c0c0c0" }}>
              Files will be shared with the tutor when session starts.
            </p>
          )}
          {files.length > 0 && sessionState === "active" && (
            <p className="mt-2 text-[11px]" style={{ color: "#16a34a" }}>
              Tutor can see these files.
            </p>
          )}
        </div>
      </div>

      {/* Voice controls / Start button */}
      <div
        className="px-6 py-5 flex-shrink-0"
        style={{ borderTop: "1px solid #d0d0d0", background: "#f7f7f7" }}
      >
        {sessionState === "pre" && (
          <button
            onClick={onStart}
            className="w-full h-11 rounded-lg text-[14px] font-semibold transition-colors duration-150"
            style={{ background: "#0a0a0a", color: "#fff" }}
            onMouseOver={(e) => (e.currentTarget.style.background = "#2a2a2a")}
            onMouseOut={(e) => (e.currentTarget.style.background = "#0a0a0a")}
          >
            Start session
          </button>
        )}

        {sessionState === "connecting" && (
          <div
            className="w-full h-11 rounded-lg flex items-center justify-center text-[13px] font-medium"
            style={{ background: "#f0f0f0", color: "#909090" }}
          >
            Connecting…
          </div>
        )}

        {sessionState === "active" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <span
                className="text-[11px] font-semibold flex items-center gap-2"
                style={{ color: "#5a5a5a" }}
              >
                {isTutorSpeaking ? "Tutor speaking" : "Listening"}
              </span>
              {isTutorSpeaking && (
                <div className="flex items-end gap-[3px] h-3.5" aria-label="audio level">
                  {[0, 0.08, 0.16, 0.1, 0.22].map((delay, i) => (
                    <span
                      key={i}
                      className="w-[3px] h-full rounded-full"
                      style={{
                        background: "#5a5a5a",
                        animation: `meter-pulse 1.1s cubic-bezier(0.22,1,0.36,1) ${delay}s infinite`,
                        transformOrigin: "center",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={onMute}
                className="flex-1 h-11 rounded-lg flex items-center justify-center gap-2.5 transition-colors duration-150 font-semibold text-[13px] active:translate-y-px"
                style={{
                  background: isMuted ? "#0a0a0a" : "#fff",
                  color: isMuted ? "#fff" : "#0a0a0a",
                  border: "1px solid #d0d0d0",
                }}
              >
                <MicIcon muted={isMuted} />
                {isMuted ? "Unmute" : "Mute"}
                <Kbd>M</Kbd>
              </button>
              <button
                onClick={onEnd}
                className="h-11 px-5 text-[13px] rounded-lg transition-colors duration-150 font-semibold"
                style={{ color: "#b91c1c", border: "1px solid #fecaca" }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#fff1f2")}
                onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
              >
                End
              </button>
            </div>
          </>
        )}

        {sessionState === "ended" && (
          <div
            className="text-[13px] text-center font-medium"
            style={{ color: "#909090" }}
          >
            Session ended.
          </div>
        )}
      </div>
    </aside>
  );
}

// ── File row ────────────────────────────────────────────────────────────────
function FileRow({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);
  const ext = fileTypeLabel(file.mimeType);

  return (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md group"
      style={{ background: hovered ? "#f7f7f7" : "transparent" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Label badge */}
      <span
        className="flex-shrink-0 rounded text-[10px] font-bold px-1.5 py-0.5"
        style={{ background: "#f0f0f0", color: "#5a5a5a", letterSpacing: "0.03em" }}
      >
        {file.label.replace("File ", "F")}
      </span>

      {/* Filename */}
      <span
        className="flex-1 min-w-0 text-[12px] truncate"
        style={{ color: "#383838" }}
        title={file.name}
      >
        {file.name}
      </span>

      {/* Type chip */}
      <span
        className="flex-shrink-0 text-[10px] font-medium"
        style={{ color: "#b0b0b0" }}
      >
        {ext}
      </span>

      {/* Remove button (appears on hover) */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-opacity duration-100"
        style={{
          color: "#b0b0b0",
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? "auto" : "none",
        }}
        title={`Remove ${file.label}`}
        onMouseOver={(e) => (e.currentTarget.style.color = "#b91c1c")}
        onMouseOut={(e) => (e.currentTarget.style.color = "#b0b0b0")}
      >
        <XIcon />
      </button>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M10 13V4M10 4L7 7M10 4l3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 14v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <circle cx="7" cy="7" r="5.5" stroke="#d0d0d0" strokeWidth="1.5" />
      <path
        d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
        stroke="#5a5a5a"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M1 1l14 14M5.75 5.75v2.5A2.25 2.25 0 0 0 10 9.25V8M10.25 3.75A2.25 2.25 0 0 0 5.75 4v.25"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <path
          d="M3 7.25v.25a5 5 0 0 0 8.5 3.55M8 12.5v2M5.5 14.5h5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="5.75" y="1.5" width="4.5" height="8.5" rx="2.25" fill="currentColor" />
      <path
        d="M3 7.25v.25a5 5 0 0 0 10 0v-.25M8 12.5v2M5.5 14.5h5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded"
      style={{
        minWidth: "1.25rem",
        padding: "0 0.3rem",
        height: "1.25rem",
        fontSize: "0.6875rem",
        fontWeight: 500,
        color: "#909090",
        background: "#f5f5f5",
        border: "1px solid #d0d0d0",
        borderBottomWidth: 1.5,
        fontFamily: "inherit",
      }}
    >
      {children}
    </span>
  );
}
