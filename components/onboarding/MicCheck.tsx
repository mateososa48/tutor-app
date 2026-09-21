"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Mic, MicOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceWave } from "@/components/session/VoiceWave";
import { cn } from "@/lib/utils";

// The mic check on /welcome. "Turn on the mic" asks the browser with context
// instead of the session asking out of nowhere, then the voice dock's own
// wave shows the student their voice: the first thing on the screen that
// moves is them. The stream stays open while the screen is up (the wave
// keeps answering) and is released when it goes; browsers remember the
// grant, so the session does not ask again. Declining is fine: the session
// has a composer, and the copy says so.

type State = "idle" | "asking" | "live" | "denied" | "unsupported";

export function MicCheck({ className }: { className?: string }) {
  const [state, setState] = useState<State>("idle");
  const [heard, setHeard] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audio, setAudio] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Whatever is open is closed when it is replaced or the screen goes away.
  useEffect(
    () => () => {
      stream?.getTracks().forEach((track) => track.stop());
      void audio?.close();
    },
    [stream, audio],
  );

  async function turnOn() {
    if (state === "asking" || state === "live") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("asking");
    setHeard(false);
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      node.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(next).connect(node);
      setStream(next);
      setAudio(ctx);
      setAnalyser(node);
      setState("live");
    } catch {
      setState("denied");
    }
  }

  // The first real sound turns "say something" into "we can hear you".
  useEffect(() => {
    if (!analyser || heard) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      const hi = Math.min(90, data.length);
      for (let i = 2; i < hi; i++) sum += data[i];
      if (sum / Math.max(1, hi - 2) / 255 > 0.08) {
        setHeard(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, heard]);

  return (
    <div className={cn("rounded-[14px] border border-(--lp-line-strong) bg-white p-4", className)}>
      {state === "live" ? (
        <div>
          <div className="h-14 overflow-hidden rounded-[10px]">
            <VoiceWave analyser={analyser} speaking={false} className="h-full w-full" />
          </div>
          <p className="m-0 mt-3 text-[14px] leading-[1.5] text-(--lp-ink-2)" aria-live="polite">
            {heard ? (
              <>
                <strong className="font-semibold text-(--lp-ink)">We can hear you.</strong>
                {" That's all the mic needs."}
              </>
            ) : (
              "Say something. Anything works."
            )}
          </p>
        </div>
      ) : state === "denied" ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 flex gap-3 text-[14px] leading-[1.5] text-(--lp-ink-2)">
            <MicOff className="mt-0.5 size-5 shrink-0 text-(--lp-ink-3)" strokeWidth={2} aria-hidden />
            <span>
              <strong className="font-semibold text-(--lp-ink)">The mic is blocked.</strong>
              {" You can still type to your tutor, or allow it in your browser and try again."}
            </span>
          </p>
          <Button type="button" variant="outline" onClick={turnOn} className="h-11 shrink-0 gap-2 rounded-[10px] px-4 text-[14px] font-semibold">
            <RotateCcw className="size-4" strokeWidth={2.25} aria-hidden />
            Try again
          </Button>
        </div>
      ) : state === "unsupported" ? (
        <p className="m-0 flex gap-3 text-[14px] leading-[1.5] text-(--lp-ink-2)">
          <MicOff className="mt-0.5 size-5 shrink-0 text-(--lp-ink-3)" strokeWidth={2} aria-hidden />
          <span>This browser can&apos;t use a mic. You can still type to your tutor.</span>
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-[14px] leading-[1.5] text-(--lp-ink-2)">
            <strong className="font-semibold text-(--lp-ink)">Quick mic check.</strong> So your tutor can hear you.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={turnOn}
            disabled={state === "asking"}
            className="h-11 shrink-0 gap-2 rounded-[10px] border-(--lp-line-strong) bg-white px-4 text-[14px] font-semibold text-(--lp-ink)"
          >
            {state === "asking" ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Mic className="size-4" strokeWidth={2.25} aria-hidden />
            )}
            {state === "asking" ? "Asking…" : "Turn on the mic"}
          </Button>
        </div>
      )}
    </div>
  );
}
