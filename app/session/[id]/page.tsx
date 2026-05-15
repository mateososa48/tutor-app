"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LeftNav from "@/components/LeftNav";
import {
  getSessionById,
  SavedSession,
  TranscriptEntry,
  formatRelativeDate,
  formatDuration,
} from "@/lib/sessions";

export default function PastSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [session, setSession] = useState<SavedSession | null | "loading">("loading");
  const router = useRouter();

  useEffect(() => {
    setSession(getSessionById(id) ?? null);
  }, [id]);

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
        {/* Top bar */}
        <header
          className="h-14 px-7 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid #d0d0d0" }}
        >
          {session && session !== "loading" ? (
            <>
              <div
                className="flex items-center gap-3 min-w-0 flex-1 mr-4"
                style={{ fontSize: 13 }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#0a0a0a",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 360,
                    flexShrink: 0,
                  }}
                  title={session.title}
                >
                  {session.title}
                </span>
                <span style={{ color: "#d0d0d0" }} aria-hidden="true">·</span>
                <span style={{ color: "#5a5a5a", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {formatRelativeDate(session.startedAt)}
                </span>
                <span style={{ color: "#d0d0d0" }} aria-hidden="true">·</span>
                <span style={{ color: "#909090", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {formatDuration(session.durationSec)}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => router.push("/")}
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
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back
                </button>
                <button
                  onClick={() => router.push("/session")}
                  style={{
                    height: 32,
                    paddingLeft: 14,
                    paddingRight: 14,
                    background: "#0a0a0a",
                    color: "#fff",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "background 0.15s",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#2a2a2a")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#0a0a0a")}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  New session
                </button>
              </div>
            </>
          ) : session === null ? (
            <span style={{ fontSize: 14, color: "#909090" }}>Session not found</span>
          ) : null}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto page-in" style={{ padding: "44px 52px 60px" }}>
          {session === "loading" && null}

          {session === null && (
            <NotFoundState onHome={() => router.push("/")} />
          )}

          {session && session !== "loading" && (
            <TranscriptView transcript={session.transcript} />
          )}
        </div>
      </main>
    </div>
  );
}

function TranscriptView({ transcript }: { transcript: TranscriptEntry[] }) {
  if (transcript.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "#c0c0c0" }}>No transcript was recorded for this session.</p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
      {transcript.map((entry) =>
        entry.role === "tutor" ? (
          <div
            key={entry.id}
            style={{
              display: "flex",
              gap: 12,
              color: "#0a0a0a",
              fontWeight: 500,
              fontSize: 16,
              lineHeight: 1.65,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#0a0a0a",
                flexShrink: 0,
                marginTop: 9,
              }}
            />
            <span>{entry.text}</span>
          </div>
        ) : (
          <div
            key={entry.id}
            style={{
              paddingLeft: 40,
              fontStyle: "italic",
              color: "#5a5a5a",
              fontWeight: 400,
              fontSize: 16,
              lineHeight: 1.65,
            }}
          >
            {entry.text}
          </div>
        )
      )}
    </div>
  );
}

function NotFoundState({ onHome }: { onHome: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 0",
        gap: 10,
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 500, color: "#0a0a0a", margin: 0 }}>
        Session not found
      </p>
      <p style={{ fontSize: 14, color: "#b0b0b0", margin: 0, marginBottom: 14 }}>
        This session may have been cleared or never existed.
      </p>
      <button
        onClick={onHome}
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
          transition: "background 0.15s",
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = "#2a2a2a")}
        onMouseOut={(e) => (e.currentTarget.style.background = "#0a0a0a")}
      >
        Go to home
      </button>
    </div>
  );
}
