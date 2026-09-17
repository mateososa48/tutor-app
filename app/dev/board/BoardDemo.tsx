"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Whiteboard, { type WhiteboardHandle } from "@/components/Whiteboard";
import { GraphExplorer } from "@/components/session/GraphExplorer";
import { useGraphExplore, type ExploreChannel } from "@/components/session/useGraphExplore";
import { preloadDesmos, whenDesmosSettled } from "@/components/board/desmos-renderer";
import { dispatchWhiteboardTool } from "@/lib/whiteboard-tool-dispatch";
import { BOARD_DEMOS } from "./demos";

export default function BoardDemo() {
  const ref = useRef<WhiteboardHandle>(null);
  const params = useSearchParams();
  const demoKey = params.get("demo") ?? "fractions";
  const stepMs = Math.max(0, Number(params.get("step") ?? 500));
  const count = Number(params.get("count") ?? 0) || Infinity;
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  // ?explore=1: graphs get Explore buttons; what a session would tell the
  // tutor goes to the log (?tutor=off: a session that cannot tell it).
  const exploreOn = params.get("explore") === "1";
  const tutorOff = params.get("tutor") === "off";
  const channel = useMemo<ExploreChannel>(() => ({
    canReport: () => !tutorOff,
    isQuiet: () => true,
    report: async ({ event, picture }) => {
      setLog((prev) => [...prev, `${picture ? `[picture ${Math.round(picture.length / 1024)} KB] ` : ""}${event}`]);
      return true;
    },
    log: (label, detail) => setLog((prev) => [...prev, `explore ${label}: ${JSON.stringify(detail)}`]),
  }), [tutorOff]);
  const { state: exploreState, explorerRef, open: openExplore, close: closeExplore, change: changeExplore, exited: exploreExited } = useGraphExplore(() => ref.current, channel);

  // The board mounts through a dynamic import, so wait for the handle, and for
  // Desmos, as a session does, so pictures draw the same way on every run.
  useEffect(() => {
    let live = true;
    preloadDesmos();
    const timer = setInterval(() => {
      if (!ref.current) return;
      clearInterval(timer);
      void whenDesmosSettled().then(() => {
        if (live) setReady(true);
      });
    }, 100);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  // A whole recorded session is too long for a URL, so scripts (Playwright)
  // can also call the dispatcher directly: window.__chalkDispatch(name, args).
  useEffect(() => {
    if (!ready) return;
    const w = window as unknown as { __chalkDispatch?: (name: string, args: Record<string, unknown>, callId?: string) => unknown };
    let seq = 0;
    w.__chalkDispatch = (name, args, callId) => {
      const result = dispatchWhiteboardTool(name, args, { whiteboard: ref.current, callId: callId ?? `d${seq++}` });
      const line = result.success ? result.message ?? "ok" : `ERROR ${result.error}`;
      setLog((prev) => [...prev, `${name}: ${line}`]);
      return result;
    };
    return () => {
      delete w.__chalkDispatch;
    };
  }, [ready]);

  // ?script=<URL-encoded JSON [{name,args}, …]> replays arbitrary calls, e.g.
  // the tool calls a model made in an eval transcript.
  const scriptParam = params.get("script");
  useEffect(() => {
    if (!ready) return;
    let scripted: Array<{ name: string; args: Record<string, unknown> }> | null = null;
    if (scriptParam) {
      try {
        const parsed = JSON.parse(scriptParam) as unknown;
        if (Array.isArray(parsed)) scripted = parsed.filter((c) => c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string") as Array<{ name: string; args: Record<string, unknown> }>;
      } catch {
        scripted = null;
      }
    }
    const demo = (scripted ?? BOARD_DEMOS[demoKey] ?? BOARD_DEMOS.fractions).slice(0, count);
    let cancelled = false;
    // Each call has an id (c0, c1, …); "__undo" with { call: "c2" } takes one
    // back the way a cancelled live tool call is taken back.
    const timers = demo.map((call, i) =>
      setTimeout(() => {
        if (cancelled) return;
        if (call.name === "__undo") {
          const undone = ref.current?.undoCall?.(String(call.args.call ?? "")) ?? "";
          setLog((prev) => [...prev, `undo ${String(call.args.call)}: ${undone || "nothing to undo"}`]);
          return;
        }
        const result = dispatchWhiteboardTool(call.name, call.args, { whiteboard: ref.current, callId: `c${i}` });
        const line = result.success ? result.message ?? "ok" : `ERROR ${result.error}`;
        setLog((prev) => [...prev, `${call.name}: ${line}`]);
      }, 200 + i * stepMs),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [ready, demoKey, stepMs, count, scriptParam]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff" }}>
      <Whiteboard
        ref={ref}
        onExplore={exploreOn ? openExplore : undefined}
        exploringItemId={exploreState?.open ? exploreState.target.itemId : null}
      />
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
      <nav
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          display: "flex",
          gap: 6,
          padding: 6,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid #e5e5ea",
          borderRadius: 10,
          fontSize: 12,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {Object.keys(BOARD_DEMOS).map((key) => (
          <a
            key={key}
            href={`/dev/board?demo=${key}&step=${stepMs}`}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              background: key === demoKey ? "#121215" : "transparent",
              color: key === demoKey ? "#fff" : "#121215",
              textDecoration: "none",
            }}
          >
            {key}
          </a>
        ))}
      </nav>
      <pre
        data-testid="board-demo-log"
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          maxWidth: 520,
          maxHeight: 180,
          overflow: "auto",
          margin: 0,
          padding: "8px 10px",
          background: "rgba(255,255,255,0.92)",
          border: "1px solid #e5e5ea",
          borderRadius: 10,
          fontSize: 11,
          lineHeight: 1.4,
          whiteSpace: "pre-wrap",
        }}
      >
        {log.length ? log.join("\n") : `demo: ${demoKey}`}
      </pre>
    </div>
  );
}
