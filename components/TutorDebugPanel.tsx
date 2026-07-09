"use client";

import { useState, type CSSProperties } from "react";

export type TutorDebugEvent = {
  id: string;
  at: number;
  offsetMs: number;
  kind: string;
  label: string;
  detail?: Record<string, unknown>;
};

type TutorDebugPanelProps = {
  events: TutorDebugEvent[];
  liveState: string;
  elapsedSeconds: number;
  isTextOnly: boolean;
  canSend: boolean;
  transcriptCount: number;
  fileCount: number;
  onClear: () => void;
  onExport: () => void;
  onSendScenario: (text: string) => void;
};

const SCENARIOS = [
  {
    label: "Factoring",
    text: "Teach me factoring x squared plus five x plus six. Go step by step and use the whiteboard.",
  },
  {
    label: "Inequality",
    text: "How do I solve 2x - 3 > 7? Please show it visually.",
  },
  {
    label: "Function",
    text: "Explain y = x squared minus four with a graph or plotted points.",
  },
  {
    label: "Physics",
    text: "A block is pushed right with friction. Help me set up the forces.",
  },
  {
    label: "Wrong answer",
    text: "I think x squared plus five x plus six factors into (x + 1)(x + 6). Is that right?",
  },
];

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(total / 60).toString().padStart(2, "0");
  const secs = (total % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatDetail(detail: Record<string, unknown> | undefined): string {
  if (!detail) return "";
  try {
    const text = JSON.stringify(detail);
    return text.length > 260 ? `${text.slice(0, 257)}...` : text;
  } catch {
    return "";
  }
}

export default function TutorDebugPanel({
  events,
  liveState,
  elapsedSeconds,
  isTextOnly,
  canSend,
  transcriptCount,
  fileCount,
  onClear,
  onExport,
  onSendScenario,
}: TutorDebugPanelProps) {
  const [showTrace, setShowTrace] = useState(false);
  const toolSuccesses = events.filter(
    (event) => event.kind === "tool" && event.detail?.success === true,
  ).length;
  const toolErrors = events.filter(
    (event) => event.kind === "tool" && event.detail?.success === false,
  ).length;
  const nudges = events.filter((event) => event.kind === "nudge").length;
  const latestEvents = events.slice(-80).reverse();

  return (
    <aside
      aria-label="Tutor QA trace"
      style={{
        position: "absolute",
        left: 14,
        bottom: 14,
        zIndex: 30,
        width: showTrace ? "min(980px, calc(100% - 28px))" : 294,
        maxHeight: showTrace ? 286 : "none",
        display: "grid",
        gridTemplateColumns: showTrace ? "270px minmax(0, 1fr)" : "1fr",
        gap: 12,
        padding: 12,
        borderRadius: 8,
        border: "1px solid rgba(10,10,10,0.18)",
        background: "rgba(255,255,255,0.94)",
        boxShadow: "0 12px 34px rgba(0,0,0,0.14)",
        backdropFilter: "blur(10px)",
        color: "#0a0a0a",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Tutor QA
            </div>
            <div style={{ fontSize: 11, color: "#5a5a5a", marginTop: 2 }}>
              {isTextOnly ? "text-only" : "mic enabled"} / {liveState} / {formatTime(elapsedSeconds * 1000)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              aria-pressed={showTrace}
              onClick={() => setShowTrace((value) => !value)}
              style={showTrace ? darkButtonStyle : smallButtonStyle}
            >
              Trace
            </button>
            <button type="button" onClick={onClear} style={smallButtonStyle}>
              Clear
            </button>
            <button type="button" onClick={onExport} style={darkButtonStyle}>
              Export
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
            marginBottom: 10,
          }}
        >
          <Metric label="Events" value={events.length} />
          <Metric label="Turns" value={transcriptCount} />
          <Metric label="Files" value={fileCount} />
          <Metric label="Tools" value={toolSuccesses} />
          <Metric label="Errors" value={toolErrors} />
          <Metric label="Nudges" value={nudges} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.label}
              type="button"
              disabled={!canSend}
              onClick={() => onSendScenario(scenario.text)}
              style={{
                ...scenarioButtonStyle,
                opacity: canSend ? 1 : 0.45,
                cursor: canSend ? "pointer" : "default",
              }}
            >
              {scenario.label}
            </button>
          ))}
        </div>
      </div>

      {showTrace ? (
        <div
          style={{
            minWidth: 0,
            overflowY: "auto",
            borderLeft: "1px solid #e8e8e8",
            paddingLeft: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          {latestEvents.length === 0 ? (
            <div style={{ color: "#909090" }}>No trace events yet.</div>
          ) : (
            latestEvents.map((event) => {
              const detail = formatDetail(event.detail);
              return (
                <div
                  key={event.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "46px 84px 1fr",
                    gap: 8,
                    padding: "3px 0",
                    borderBottom: "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  <span style={{ color: "#909090" }}>{formatTime(event.offsetMs)}</span>
                  <span style={{ color: kindColor(event.kind), fontWeight: 700 }}>{event.kind}</span>
                  <span style={{ color: "#383838", minWidth: 0 }}>
                    {event.label}
                    {detail ? <span style={{ color: "#909090" }}> {detail}</span> : null}
                  </span>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: "1px solid #e8e8e8",
        borderRadius: 6,
        padding: "5px 6px",
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 10, color: "#909090", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#0a0a0a" }}>{value}</div>
    </div>
  );
}

function kindColor(kind: string): string {
  if (kind === "error") return "#b91c1c";
  if (kind === "tool") return "#2563eb";
  if (kind === "nudge") return "#7c3aed";
  if (kind === "transcript") return "#15803d";
  if (kind === "connection") return "#a16207";
  return "#5a5a5a";
}

const smallButtonStyle = {
  height: 26,
  padding: "0 9px",
  borderRadius: 6,
  border: "1px solid #d0d0d0",
  background: "#fff",
  color: "#383838",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
} satisfies CSSProperties;

const darkButtonStyle = {
  ...smallButtonStyle,
  border: "1px solid #0a0a0a",
  background: "#0a0a0a",
  color: "#fff",
} satisfies CSSProperties;

const scenarioButtonStyle = {
  height: 26,
  padding: "0 8px",
  borderRadius: 6,
  border: "1px solid #d0d0d0",
  background: "#fff",
  color: "#0a0a0a",
  fontSize: 11,
  fontWeight: 700,
} satisfies CSSProperties;
