"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "hidden" | "visible" | "fading";

export function SubtitleBar({ text }: { text: string }) {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [displayText, setDisplayText] = useState("");
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>("hidden");

  // Keep phaseRef in sync so we can read current phase without stale closures
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const updateTimer = setTimeout(() => {
      if (text) {
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        setDisplayText(text);
        // Only transition to "visible" if not already there — prevents animation re-trigger on each chunk
        if (phaseRef.current !== "visible") {
          phaseRef.current = "visible";
          setPhase("visible");
        }
      } else {
        if (phaseRef.current === "visible") {
          phaseRef.current = "fading";
          setPhase("fading");
          fadeTimerRef.current = setTimeout(() => {
            phaseRef.current = "hidden";
            setPhase("hidden");
            setDisplayText("");
          }, 480);
        }
      }
    }, 0);

    return () => {
      clearTimeout(updateTimer);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [text]);

  if (phase === "hidden") return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: "68%",
        width: "max-content",
        zIndex: 50,
        pointerEvents: "none",
        opacity: phase === "visible" ? 1 : 0,
        transition: "opacity 480ms ease",
        animation: phase === "visible" ? "subtitleIn 260ms cubic-bezier(0.34, 1.56, 0.64, 1) both" : undefined,
      }}
    >
      <div
        style={{
          background: "rgba(10, 10, 10, 0.82)",
          backdropFilter: "blur(12px) saturate(180%)",
          WebkitBackdropFilter: "blur(12px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 12,
          padding: "10px 22px",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#ffffff",
            fontSize: 17,
            fontWeight: 500,
            lineHeight: 1.55,
            letterSpacing: "-0.01em",
            textAlign: "center",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            maxWidth: "56ch",
          }}
        >
          {displayText}
        </p>
      </div>
    </div>
  );
}
