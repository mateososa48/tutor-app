"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LeftNav from "@/components/LeftNav";
import { loadSessions, deleteSession, SavedSession, SessionStatus, formatRelativeDate, formatDuration } from "@/lib/sessions";
import { useClientReady } from "@/lib/client-ready";
import { useSession } from "next-auth/react";

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
  const mounted = useClientReady();
  const { data: authSession } = useSession();
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!mounted) return;
    loadSessions(20).then(setSessions);
  }, [mounted]);

  async function handleDelete(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    await deleteSession(id);
  }

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
          <span className="text-[14px] font-semibold" style={{ color: "#0a0a0a" }}>
            Home
          </span>
          <span className="text-[13px]" style={{ color: "#909090" }}>
            {mounted ? getFormattedDate() : ""}
          </span>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto page-in" style={{ padding: "44px 52px 60px" }}>

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
              {mounted
                ? `${getGreeting()}${authSession?.user?.name ? `, ${authSession.user.name.split(" ")[0]}` : ""}`
                : ""}
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
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#909090",
                  textTransform: "uppercase",
                  letterSpacing: "0.09em",
                  margin: 0,
                }}
              >
                Recent sessions
              </h2>
              {mounted && sessions.length > 0 && (
                <span style={{ fontSize: 12, color: "#b0b0b0" }}>
                  {sessions.length} session{sessions.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

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
                    onDelete={() => handleDelete(s.id)}
                  />
                ))}
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}

// ── Session card ──────────────────────────────────────────────────────────────

const STATUS_DOT: Record<SessionStatus, string> = {
  active: "#16a34a",
  paused: "#d97706",
  ended: "#c0c0c0",
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};

function SessionCard({
  session,
  onClick,
  onDelete,
}: {
  session: SavedSession;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
    }
  }

  return (
    <article
      onClick={onClick}
      title={session.title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      style={{
        border: "1px solid #d0d0d0",
        borderRadius: 10,
        padding: "16px 18px",
        cursor: "pointer",
        background: "#fff",
        transition: "background 0.12s, box-shadow 0.12s",
        position: "relative",
        boxShadow: hovered ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
        ...(hovered ? { background: "#f9f9f9" } : {}),
      }}
    >
      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 18,
            padding: "0 7px",
            background: "#f5f5f5",
            border: "1px solid #e8e8e8",
            borderRadius: 5,
            fontSize: 10,
            fontWeight: 600,
            color: "#5a5a5a",
            letterSpacing: "0.03em",
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: STATUS_DOT[session.status], flexShrink: 0 }} />
          {STATUS_LABEL[session.status]}
        </span>

        {/* Delete button — shows on hover */}
        <button
          onClick={handleDeleteClick}
          title={confirmDelete ? "Click again to confirm" : "Delete session"}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: confirmDelete ? "1px solid #fecaca" : "1px solid transparent",
            background: confirmDelete ? "#fff1f2" : "transparent",
            color: confirmDelete ? "#b91c1c" : "#b0b0b0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.12s, background 0.12s, color 0.12s, border-color 0.12s",
            pointerEvents: hovered ? "auto" : "none",
            flexShrink: 0,
          }}
          onMouseOver={(e) => { if (!confirmDelete) { e.currentTarget.style.color = "#b91c1c"; e.currentTarget.style.background = "#fff1f2"; e.currentTarget.style.borderColor = "#fecaca"; } }}
          onMouseOut={(e) => { if (!confirmDelete) { e.currentTarget.style.color = "#b0b0b0"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; } }}
        >
          {confirmDelete ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 3h8M5 3V2h2v1M4.5 3v6.5h3V3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#0a0a0a",
          marginBottom: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {session.title}
      </p>
      <p style={{ fontSize: 12, color: "#5a5a5a", marginBottom: 2 }}>
        {formatRelativeDate(session.startedAt)}
      </p>
      <p style={{ fontSize: 12, color: "#909090" }}>
        {formatDuration(session.durationSec)}
      </p>
    </article>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 14 }}>
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
