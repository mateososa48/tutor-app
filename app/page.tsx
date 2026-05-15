"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LeftNav from "@/components/LeftNav";
import { loadSessions, SavedSession, formatRelativeDate, formatDuration } from "@/lib/sessions";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function HomePage() {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setSessions(loadSessions());
    setMounted(true);
  }, []);

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
          <span
            className="text-[14px] font-semibold"
            style={{ color: "#0a0a0a" }}
          >
            Tutor
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[13px]" style={{ color: "#909090" }}>
              {mounted ? getFormattedDate() : ""}
            </span>
            <div className="flex items-center gap-1.5">
              <TopBarBtn aria-label="Command palette">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </TopBarBtn>
              <TopBarIconBtn aria-label="Help"><QuestionIcon /></TopBarIconBtn>
              <TopBarIconBtn aria-label="More"><DotsIcon /></TopBarIconBtn>
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <div
          className="flex-1 overflow-y-auto page-in"
          style={{ padding: "44px 52px 60px" }}
        >
          {/* ── Hero ── */}
          <section style={{ marginBottom: 52 }}>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: "#0a0a0a",
                marginBottom: 6,
                letterSpacing: "-0.02em",
              }}
            >
              {mounted ? getGreeting() : ""}
            </h1>
            <p style={{ fontSize: 15, color: "#5a5a5a", marginBottom: 28 }}>
              What would you like to work on today?
            </p>
            <button
              onClick={() => router.push("/session")}
              style={{
                height: 44,
                paddingLeft: 22,
                paddingRight: 22,
                background: "#0a0a0a",
                color: "#fff",
                borderRadius: 10,
                fontSize: 14,
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
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Start new session
            </button>
          </section>

          {/* ── Recent sessions ── */}
          <section style={{ marginBottom: 44 }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#909090",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                marginBottom: 16,
              }}
            >
              Recent sessions
            </h2>

            {!mounted ? null : sessions.length === 0 ? (
              <EmptyState onStart={() => router.push("/session")} />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 14,
                }}
              >
                {sessions.slice(0, 9).map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onClick={() => router.push(`/session/${s.id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Placeholder section for future features ── */}
          <section>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#c0c0c0",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                marginBottom: 16,
              }}
            >
              Coming soon
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 14,
              }}
            >
              {["Practice problems", "Progress tracker", "Subject library"].map((label) => (
                <div
                  key={label}
                  style={{
                    border: "1px dashed #d0d0d0",
                    borderRadius: 10,
                    padding: "18px 20px",
                    minHeight: 80,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#c0c0c0",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function SessionCard({
  session,
  onClick,
}: {
  session: SavedSession;
  onClick: () => void;
}) {
  return (
    <article
      onClick={onClick}
      title={session.title}
      style={{
        border: "1px solid #d0d0d0",
        borderRadius: 10,
        padding: "18px 20px",
        cursor: "pointer",
        background: "#fff",
        transition: "background 0.12s, box-shadow 0.12s",
      }}
      onMouseOver={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "#f9f9f9";
        el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
      onMouseOut={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "#fff";
        el.style.boxShadow = "none";
      }}
    >
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#0a0a0a",
          marginBottom: 5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {session.title}
      </p>
      <p style={{ fontSize: 13, color: "#5a5a5a", marginBottom: 3 }}>
        {formatRelativeDate(session.startedAt)}
      </p>
      <p style={{ fontSize: 12, color: "#909090" }}>
        {formatDuration(session.durationSec)}
      </p>
    </article>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 0",
        gap: 14,
      }}
    >
      <p style={{ fontSize: 14, color: "#909090", margin: 0 }}>No sessions yet</p>
      <button
        onClick={onStart}
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
        Start your first session
      </button>
    </div>
  );
}

function TopBarBtn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      className="h-8 px-2.5 flex items-center gap-1.5 rounded-md text-[12px] transition-colors duration-150"
      style={{ color: "#5a5a5a" }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = "#f0f0f0";
        e.currentTarget.style.color = "#0a0a0a";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#5a5a5a";
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function TopBarIconBtn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      className="h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-150"
      style={{ color: "#5a5a5a" }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = "#f0f0f0";
        e.currentTarget.style.color = "#0a0a0a";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#5a5a5a";
      }}
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

function QuestionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M6 6.4c.2-1.1 1-1.6 2-1.6 1.2 0 2 .9 2 1.9 0 .9-.6 1.4-1.3 1.7-.5.2-.7.5-.7 1V9.5M8 11.5v.05"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
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
