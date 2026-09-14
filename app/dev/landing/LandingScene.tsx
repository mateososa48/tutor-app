"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Whiteboard, { type WhiteboardHandle } from "@/components/Whiteboard";
import { dispatchWhiteboardTool } from "@/lib/whiteboard-tool-dispatch";
import { SCENES } from "@/components/landing/lesson";

export default function LandingScene() {
  const ref = useRef<WhiteboardHandle>(null);
  const params = useSearchParams();
  const sceneKey = params.get("scene") ?? "hero";
  const stepMs = Math.max(0, Number(params.get("step") ?? 120));
  const count = Number(params.get("count") ?? 0) || Infinity;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (ref.current) {
        setReady(true);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // The screenshot script waits for data-scene-done and data-writing="0".
  useEffect(() => {
    if (!ready) return;
    const scene = (SCENES[sceneKey] ?? SCENES.hero).slice(0, count);
    let cancelled = false;
    document.body.dataset.sceneDone = "0";
    const timers = scene.map((call, i) =>
      setTimeout(() => {
        if (cancelled) return;
        dispatchWhiteboardTool(call.name, call.args, { whiteboard: ref.current });
        if (i === scene.length - 1) document.body.dataset.sceneDone = "1";
      }, 200 + i * stepMs),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [ready, sceneKey, stepMs, count]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff" }}>
      <Whiteboard
        ref={ref}
        onWriting={(busy) => {
          document.body.dataset.writing = busy ? "1" : "0";
        }}
      />
    </div>
  );
}
