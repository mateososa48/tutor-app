"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getRecentSessions, SavedSession } from "@/lib/sessions";
import { useClientReady } from "@/lib/client-ready";

// Collapsed width: 52px. Section containers have 6px h-padding each side.
// So button content width collapsed = 52 - 12 = 40px.
// Icon is 16px. To center it: paddingLeft = (40 - 16) / 2 = 12px.
// This paddingLeft is FIXED — icon never moves during expand/collapse.
// Only the label slides in/out via maxWidth transition.
const ICON_PAD = 12;
const ICON_GAP = 9;

export default function LeftNav() {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useClientReady();
  const [sessions, setSessions] = useState<SavedSession[]>([]);

  useEffect(() => {
    if (!mounted) return;
    getRecentSessions(8).then(setSessions);
  }, [mounted, pathname]);

  return (
    <nav
      style={{
        width: expanded ? 236 : 52,
        minWidth: expanded ? 236 : 52,
        background: "#111111",
        borderRadius: 14,
        boxShadow: "0 2px 8px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.16)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 260ms cubic-bezier(0.4,0,0.2,1), min-width 260ms cubic-bezier(0.4,0,0.2,1)",
      }}
      aria-label="Navigation"
    >
      {/* ── Header / toggle ── */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          // When collapsed: button (32px) left edge at (52-32)/2 = 10px → center at 26px
          // When expanded:  padding-left 10px → button left at 10px → center at 26px  ← same!
          paddingLeft: 10,
          gap: 8,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse" : "Expand"}
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.38)",
            cursor: "pointer",
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "rgba(255,255,255,0.8)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(255,255,255,0.38)";
          }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M1.5 3.5h12M1.5 7.5h12M1.5 11.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        {/* Logo — slides in beside the toggle button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            overflow: "hidden",
            maxWidth: expanded ? 160 : 0,
            opacity: expanded ? 1 : 0,
            transition: "max-width 260ms cubic-bezier(0.4,0,0.2,1), opacity 200ms cubic-bezier(0.4,0,0.2,1)",
            whiteSpace: "nowrap",
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              background: "rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1L9.5 9H.5L5 1Z" stroke="rgba(255,255,255,0.8)" strokeWidth="1" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#f0f0f0", letterSpacing: "-0.01em" }}>
            Tutor
          </span>
        </div>
      </div>

      {/* ── Top action ── */}
      <div style={{ padding: "8px 6px 4px", flexShrink: 0 }}>
        <NavBtn
          expanded={expanded}
          active={pathname === "/session" && !pathname.startsWith("/session/session_")}
          icon={<PlusIcon />}
          label="New session"
          onClick={() => router.push("/session")}
        />
      </div>

      {/* ── Session list ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "0 6px" }}>
        {sessions.length > 0 && (
          <>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "rgba(255,255,255,0.22)",
                overflow: "hidden",
                maxHeight: expanded ? 28 : 0,
                opacity: expanded ? 1 : 0,
                padding: "8px 12px 4px",
                whiteSpace: "nowrap",
                transition: "max-height 260ms cubic-bezier(0.4,0,0.2,1), opacity 200ms cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              Recent
            </div>
            {sessions.map((s) => (
              <NavBtn
                key={s.id}
                expanded={expanded}
                active={pathname === `/session/${s.id}`}
                icon={<DocIcon />}
                label={s.title}
                onClick={() => router.push(`/session/${s.id}`)}
              />
            ))}
          </>
        )}
      </div>

      {/* ── Bottom nav ── */}
      <div
        style={{
          padding: "4px 6px 10px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          flexShrink: 0,
        }}
      >
        <NavBtn
          expanded={expanded}
          active={pathname === "/"}
          icon={<HomeIcon />}
          label="Home"
          onClick={() => router.push("/")}
        />
        <NavBtn
          expanded={expanded}
          active={pathname === "/settings"}
          icon={<SettingsIcon />}
          label="Settings"
          onClick={() => router.push("/settings")}
        />
      </div>
    </nav>
  );
}

function NavBtn({
  expanded,
  active,
  icon,
  label,
  onClick,
  disabled,
}: {
  expanded: boolean;
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const baseColor = disabled
    ? "rgba(255,255,255,0.18)"
    : active
    ? "rgba(255,255,255,0.88)"
    : "rgba(255,255,255,0.46)";

  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={label}
      style={{
        width: "100%",
        height: 34,
        display: "flex",
        alignItems: "center",
        // Fixed left padding — icon stays at exact same x position always
        paddingLeft: ICON_PAD,
        paddingRight: 8,
        justifyContent: "flex-start",
        borderRadius: 8,
        border: "none",
        background: active ? "rgba(255,255,255,0.1)" : "transparent",
        color: baseColor,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        transition: "background 0.12s, color 0.12s",
        marginBottom: 1,
        flexShrink: 0,
      }}
      onMouseOver={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = "rgba(255,255,255,0.07)";
          e.currentTarget.style.color = "rgba(255,255,255,0.7)";
        }
      }}
      onMouseOut={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = baseColor;
        }
      }}
    >
      {/* Icon — never moves */}
      <span
        style={{
          width: 16,
          height: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>

      {/* Label — slides in/out via maxWidth, no layout shift on icon */}
      <span
        style={{
          marginLeft: ICON_GAP,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: expanded ? 148 : 0,
          opacity: expanded ? 1 : 0,
          transition: "max-width 260ms cubic-bezier(0.4,0,0.2,1), opacity 180ms cubic-bezier(0.4,0,0.2,1)",
          display: "block",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 2v11M2 7.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 2.5h9M2.5 5.5h9M2.5 8.5h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        d="M2 7L7.5 2 13 7v6.5a.5.5 0 0 1-.5.5H10V10H5v4H2.5a.5.5 0 0 1-.5-.5V7z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M11.7 3.3l-1.06 1.06M4.36 10.64l-1.06 1.06M11.7 11.7l-1.06-1.06M4.36 4.36L3.3 3.3"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
