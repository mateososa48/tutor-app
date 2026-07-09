"use client";

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from "react";
import { TranscriptEntry } from "@/lib/gemini-live";
import {
  UploadedFile,
  ACCEPTED_EXTENSIONS,
  readFileAsBase64,
  validateFile,
  fileTypeLabel,
} from "@/lib/file-processor";

type SessionState = "pre" | "connecting" | "active" | "ending" | "ended" | "error";

interface FloatingPanelProps {
  sessionState: SessionState;
  transcript: TranscriptEntry[];
  isMuted: boolean;
  isTutorSpeaking: boolean;
  files: UploadedFile[];
  errorMessage: string;
  fileNotice: string;
  onMute: () => void;
  onEnd: () => void;
  onAddFiles: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
  onSendText?: (text: string) => void;
}

const PANEL_W = 316;
const ICON_SIZE = 60;
const EDGE = 16;
const MUTEEND_H = 52;
// Push bar up 28px above the tldraw watermark (bottom-right, z-index 200)
const BAR_BOTTOM = EDGE + 28; // 44
// Bottom edge for panel / icon cluster: sits above the Mute/End bar
const ABOVE_BAR = BAR_BOTTOM + MUTEEND_H + 8; // 104

export default function FloatingPanel({
  sessionState,
  transcript,
  isMuted,
  isTutorSpeaking,
  files,
  errorMessage,
  fileNotice,
  onMute,
  onEnd,
  onAddFiles,
  onRemoveFile,
  onSendText,
}: FloatingPanelProps) {
  const [panelLevel, setPanelLevel] = useState<0 | 1 | 2 | 3>(0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [chatText, setChatText] = useState("");

  useEffect(() => {
    if (panelLevel >= 3) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, panelLevel]);

  function handleIconClick(level: 1 | 2 | 3) {
    setPanelLevel((prev) =>
      prev === level ? (Math.max(0, level - 1) as 0 | 1 | 2 | 3) : level
    );
  }

  function submitChat() {
    const text = chatText.trim();
    if (!text || !onSendText) return;
    onSendText(text);
    setChatText("");
    chatInputRef.current?.focus();
  }

  function onChatKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitChat();
    }
  }

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

  const panelOpen = panelLevel > 0;
  const sessionIsLive = sessionState === "active";
  const sessionIsBusy =
    sessionState === "connecting" || sessionState === "ending";
  const showBar = sessionIsLive || sessionIsBusy;
  const iconBottom = showBar ? ABOVE_BAR : EDGE;
  const panelBottom = showBar ? ABOVE_BAR : EDGE;

  return (
    <>
      <style>{`
        @keyframes fp-beat {
          0%, 100% { transform: scaleY(0.3); }
          50%       { transform: scaleY(1); }
        }
      `}</style>

      {/* ── Icon cluster ──────────────────────────────────────────────── */}
      {/* Independently positioned — no full-screen overlay blocking whiteboard */}
      <div
        style={{
          position: "absolute",
          right: EDGE,
          bottom: iconBottom,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          opacity: panelOpen ? 0 : 1,
          pointerEvents: panelOpen ? "none" : "auto",
          transition: "opacity 0.18s ease",
          zIndex: 30,
        }}
      >
        <BigIcon
          icon={<TranscriptIcon />}
          label="Transcript"
          onClick={() => handleIconClick(3)}
        />
        <BigIcon
          icon={<FilesIcon />}
          label="Files"
          onClick={() => handleIconClick(2)}
        />
        <BigIcon
          icon={<TypeIcon />}
          label="Message"
          onClick={() => handleIconClick(1)}
        />
      </div>

      {/* ── Sliding panel ─────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          right: EDGE,
          top: EDGE,
          bottom: panelBottom,
          width: PANEL_W,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          transform: panelOpen
            ? "translateX(0)"
            : `translateX(${PANEL_W + 32}px)`,
          opacity: panelOpen ? 1 : 0,
          transition:
            "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease",
          pointerEvents: panelOpen ? "auto" : "none",
          zIndex: 25,
        }}
      >
        {/* Small cascade-toggle row */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <SmallToggle
            icon={<TranscriptIcon />}
            label="Transcript"
            active={panelLevel >= 3}
            onClick={() => handleIconClick(3)}
          />
          <SmallToggle
            icon={<FilesIcon />}
            label="Files"
            active={panelLevel >= 2}
            onClick={() => handleIconClick(2)}
          />
          <SmallToggle
            icon={<TypeIcon />}
            label="Message"
            active={panelLevel >= 1}
            onClick={() => handleIconClick(1)}
          />
        </div>

        {/* Panel cards: anchor to bottom when partial, fill from top at full */}
        <div
          style={{
            flex: "1 1 0",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: panelLevel === 3 ? "flex-start" : "flex-end",
            gap: 8,
          }}
        >
          {/* Transcript card */}
          {panelLevel >= 3 && (
            <div
              style={{
                flex: "1 1 0",
                minHeight: 0,
                background: "#fff",
                borderRadius: 12,
                boxShadow:
                  "0 2px 16px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "11px 16px 9px",
                  borderBottom: "1px solid #ebebeb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{ fontSize: 13, fontWeight: 700, color: "#0a0a0a" }}
                >
                  Transcript
                </span>
                {sessionIsLive && (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#e53e3e",
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#e53e3e",
                        display: "inline-block",
                      }}
                    />
                    Live
                  </span>
                )}
              </div>
              <div
                style={{
                  flex: "1 1 0",
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "11px 16px 13px",
                }}
              >
                {transcript.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#c0c0c0", margin: 0 }}>
                    {sessionState === "error"
                      ? errorMessage || "Connection error."
                      : "Listening…"}
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {transcript.map((entry, i) => {
                      const isLatest = i === transcript.length - 1;
                      const isRecent = i >= transcript.length - 3;
                      if (entry.role === "tutor") {
                        return (
                          <div
                            key={entry.id}
                            style={{
                              display: "flex",
                              gap: 10,
                              fontSize: 13.5,
                              lineHeight: 1.6,
                              color: isLatest
                                ? "#0a0a0a"
                                : isRecent
                                ? "#606060"
                                : "#c0c0c0",
                              fontWeight: isLatest ? 600 : 500,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                flexShrink: 0,
                                marginTop: 7,
                                background: isLatest
                                  ? "#0a0a0a"
                                  : isRecent
                                  ? "#606060"
                                  : "#c0c0c0",
                              }}
                            />
                            <span>{entry.text}</span>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={entry.id}
                          style={{
                            paddingLeft: 16,
                            fontSize: 13.5,
                            lineHeight: 1.6,
                            fontStyle: "italic",
                            fontWeight: 500,
                            color: "#808080",
                          }}
                        >
                          {entry.text}
                        </div>
                      );
                    })}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Files card */}
          {panelLevel >= 2 && (
            <div
              style={{
                flexShrink: 0,
                background: "#fff",
                borderRadius: 12,
                boxShadow:
                  "0 2px 16px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "14px 18px 11px",
                  borderBottom: "1px solid #ebebeb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{ fontSize: 14, fontWeight: 700, color: "#0a0a0a" }}
                >
                  Upload Files
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={processing}
                  title="Add files"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#707070",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = "#f0f0f0";
                    e.currentTarget.style.color = "#0a0a0a";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#707070";
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
              <div style={{ padding: "10px 16px 12px" }}>
                {fileError && (
                  <div
                    style={{
                      marginBottom: 8,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: "#fff1f2",
                      color: "#b91c1c",
                      fontSize: 12,
                    }}
                  >
                    {fileError}
                  </div>
                )}
                {files.length === 0 && !processing ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: "100%",
                      padding: "20px 16px",
                      borderRadius: 10,
                      border: "1.5px dashed #d4d4d4",
                      background: "transparent",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                      fontFamily: "inherit",
                    }}
                    onMouseOver={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "#a0a0a0";
                      (
                        e.currentTarget as HTMLButtonElement
                      ).style.background = "#fafafa";
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "#d4d4d4";
                      (
                        e.currentTarget as HTMLButtonElement
                      ).style.background = "transparent";
                    }}
                  >
                    <UploadIcon />
                    <span
                      style={{
                        fontSize: 12,
                        color: "#a0a0a0",
                        textAlign: "center",
                        lineHeight: 1.5,
                      }}
                    >
                      Drop or click to add
                      <br />
                      homework, notes, slides…
                    </span>
                  </button>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      maxHeight: 140,
                      overflowY: "auto",
                    }}
                  >
                    {files.map((f) => (
                      <FileRow
                        key={f.id}
                        file={f}
                        onRemove={() => onRemoveFile(f.id)}
                      />
                    ))}
                    {processing && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 8px",
                          borderRadius: 6,
                          background: "#f7f7f7",
                        }}
                      >
                        <Spinner />
                        <span style={{ fontSize: 12, color: "#909090" }}>
                          Reading…
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {files.length > 0 && sessionIsLive && (
                  <p style={{ marginTop: 8, fontSize: 11, color: "#16a34a" }}>
                    {fileNotice || "Tutor can see these files."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Type card */}
          {panelLevel >= 1 && (
            <div
              style={{
                flexShrink: 0,
                background: "#fff",
                borderRadius: 12,
                boxShadow:
                  "0 2px 16px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "10px 12px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    borderBottom: "1.5px solid #ebebeb",
                    paddingBottom: 10,
                  }}
                >
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={onChatKeyDown}
                    placeholder={
                      sessionIsLive ? "Type here…" : "Session not active"
                    }
                    disabled={!sessionIsLive}
                    style={{
                      flex: 1,
                      height: 30,
                      fontSize: 14,
                      color: "#0a0a0a",
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={submitChat}
                    disabled={!chatText.trim() || !sessionIsLive}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border: "none",
                      flexShrink: 0,
                      background:
                        chatText.trim() && sessionIsLive
                          ? "#0a0a0a"
                          : "#ebebeb",
                      cursor:
                        chatText.trim() && sessionIsLive
                          ? "pointer"
                          : "default",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background 0.12s",
                    }}
                  >
                    <SendIcon active={!!chatText.trim() && sessionIsLive} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Mute / End bar ────────────────────────────────────────────── */}
      {showBar && (
        <div
          style={{
            position: "absolute",
            right: EDGE,
            bottom: BAR_BOTTOM,
            width: PANEL_W,
            height: MUTEEND_H,
            background: "#fff",
            borderRadius: 14,
            boxShadow:
              "0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            padding: "0 8px",
            gap: 6,
            zIndex: 30,
          }}
        >
          <button
            onClick={onMute}
            disabled={!sessionIsLive}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              border: "none",
              background: isMuted ? "#0a0a0a" : "#f0f0f0",
              color: isMuted ? "#fff" : "#383838",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: sessionIsLive ? "pointer" : "default",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <MicIcon muted={isMuted} size={15} />
            {sessionIsBusy
              ? sessionState === "connecting"
                ? "Connecting…"
                : "Ending…"
              : isMuted
              ? "Unmute"
              : "Mute"}
            {!sessionIsBusy && <Kbd>M</Kbd>}
            {isTutorSpeaking && !isMuted && sessionIsLive && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  height: 12,
                }}
                aria-hidden
              >
                {[0, 0.12, 0.24].map((delay, i) => (
                  <span
                    key={i}
                    style={{
                      width: 2.5,
                      height: "100%",
                      borderRadius: 2,
                      background: "currentColor",
                      animation: `fp-beat 0.85s ease-in-out ${delay}s infinite`,
                      transformOrigin: "bottom",
                    }}
                  />
                ))}
              </span>
            )}
          </button>
          <button
            onClick={onEnd}
            style={{
              flexShrink: 0,
              height: 44,
              paddingLeft: 18,
              paddingRight: 18,
              borderRadius: 12,
              border: "1.5px solid #fca5a5",
              background: "transparent",
              color: "#dc2626",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.background = "#fef2f2")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            End
          </button>
        </div>
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BigIcon({
  icon, label, onClick,
}: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: 16,
        border: "none",
        background: "#fff",
        color: "#383838",
        boxShadow:
          "0 4px 20px rgba(0,0,0,0.11), 0 1px 4px rgba(0,0,0,0.07)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        cursor: "pointer",
        flexShrink: 0,
        transition: "transform 0.12s, box-shadow 0.12s, background 0.12s",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = "scale(1.05)";
        e.currentTarget.style.boxShadow =
          "0 6px 24px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)";
        e.currentTarget.style.background = "#fafafa";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow =
          "0 4px 20px rgba(0,0,0,0.11), 0 1px 4px rgba(0,0,0,0.07)";
        e.currentTarget.style.background = "#fff";
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
    >
      {icon}
    </button>
  );
}

function SmallToggle({
  icon, label, active, onClick,
}: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: "none",
        background: active ? "#0a0a0a" : "#fff",
        color: active ? "#fff" : "#606060",
        boxShadow:
          "0 2px 10px rgba(0,0,0,0.09), 0 1px 3px rgba(0,0,0,0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.12s, color 0.12s, transform 0.1s",
      }}
      onMouseOver={(e) => {
        if (!active) e.currentTarget.style.background = "#f0f0f0";
        e.currentTarget.style.transform = "scale(1.06)";
      }}
      onMouseOut={(e) => {
        if (!active) e.currentTarget.style.background = "#fff";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {icon}
    </button>
  );
}

function FileRow({
  file, onRemove,
}: { file: UploadedFile; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);
  const ext = fileTypeLabel(file.mimeType);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 6px",
        borderRadius: 6,
        background: hovered ? "#f7f7f7" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={{
          flexShrink: 0,
          borderRadius: 4,
          fontSize: 9.5,
          fontWeight: 700,
          padding: "2px 5px",
          background: "#f0f0f0",
          color: "#707070",
          letterSpacing: "0.03em",
        }}
      >
        {file.label.replace("File ", "F")}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          color: "#383838",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={file.name}
      >
        {file.name}
      </span>
      <span style={{ flexShrink: 0, fontSize: 10, color: "#b8b8b8" }}>
        {ext}
      </span>
      <button
        onClick={onRemove}
        style={{
          flexShrink: 0,
          width: 16,
          height: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          border: "none",
          background: "transparent",
          color: "#c0c0c0",
          cursor: "pointer",
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? "auto" : "none",
          transition: "color 0.1s",
        }}
        title={`Remove ${file.label}`}
        onMouseOver={(e) => (e.currentTarget.style.color = "#dc2626")}
        onMouseOut={(e) => (e.currentTarget.style.color = "#c0c0c0")}
      >
        <XIcon />
      </button>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "1.2rem",
        padding: "0 0.25rem",
        height: "1.2rem",
        fontSize: "0.625rem",
        fontWeight: 600,
        color: "#909090",
        background: "#f0f0f0",
        border: "1px solid #d0d0d0",
        borderBottomWidth: 1.5,
        borderRadius: 4,
        fontFamily: "inherit",
      }}
    >
      {children}
    </span>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function TranscriptIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M4 6h14M4 11h10M4 16h7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M5 3h8.5l4.5 4.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 3v4.5H18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TypeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect
        x="2.5"
        y="6"
        width="17"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M7 11h8M13 8.5l2.5 2.5-2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path
        d="M14 20V9M14 9l-5 5M14 9l5 5"
        stroke="#c0c0c0"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 20v2a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2"
        stroke="#c0c0c0"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 2v10M2 7h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M1.5 1.5l7 7M8.5 1.5l-7 7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      style={{ animation: "spin 0.7s linear infinite" }}
    >
      <circle cx="6.5" cy="6.5" r="5" stroke="#d8d8d8" strokeWidth="1.5" />
      <path
        d="M6.5 1.5A5 5 0 0 1 11.5 6.5"
        stroke="#5a5a5a"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicIcon({ muted, size = 16 }: { muted: boolean; size?: number }) {
  if (muted) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path
          d="M1.5 1.5l13 13M6 6v2.25a2 2 0 0 0 3.2 1.6M9.75 3.75A2 2 0 0 0 6 5.5v.25"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M3.5 7v.5a4.5 4.5 0 0 0 7.65 3.2M8 12v2M6 14h4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect
        x="5.75"
        y="1.5"
        width="4.5"
        height="8"
        rx="2.25"
        fill="currentColor"
      />
      <path
        d="M3.5 7v.5a4.5 4.5 0 0 0 9 0V7M8 12v2M6 14h4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        d="M2 7.5h11M9 3l4 4.5L9 12"
        stroke={active ? "#fff" : "#c0c0c0"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
