"use client";

import { useEffect, useMemo, useRef } from "react";
import { animate } from "motion/react";
import { makeConfetti, type ConfettiParticle } from "@/lib/confetti";

// The short burst from the green check on a right answer (lib/confetti).
// It sits over the board like the strip and the Explore buttons, in the
// board's own pixels, never takes a click, and removes itself when done.
// Under reduced motion nothing flies: a few pieces fade in where the burst
// would scatter them and fade away.

export type ConfettiBurst = { id: number; x: number; y: number };

function Piece({ p, reduce }: { p: ConfettiParticle; reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const play = reduce
      ? animate(el, { transform: Array(3).fill(p.transform[Math.round(p.transform.length * 0.3)]), opacity: [0, 0.9, 0] }, { duration: 0.6, ease: "easeOut" })
      : animate(el, { transform: p.transform, opacity: p.opacity }, { duration: p.duration, ease: "linear" });
    return () => play.cancel();
  }, [p, reduce]);
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: -p.w / 2,
        top: -p.h / 2,
        width: p.w,
        height: p.h,
        borderRadius: p.radius,
        backgroundColor: p.color,
        opacity: 0,
        willChange: "transform, opacity",
      }}
    />
  );
}

function Burst({ burst, reduce, onDone }: { burst: ConfettiBurst; reduce: boolean; onDone: (id: number) => void }) {
  const pieces = useMemo(() => makeConfetti(reduce ? { count: 10 } : {}), [reduce]);
  useEffect(() => {
    const t = setTimeout(() => onDone(burst.id), (reduce ? 0.6 : pieces[0]?.duration ?? 1) * 1000 + 150);
    return () => clearTimeout(t);
  }, [burst.id, onDone, pieces, reduce]);
  return (
    <div style={{ position: "absolute", left: burst.x, top: burst.y, width: 0, height: 0, perspective: 600 }}>
      {pieces.map((p, i) => (
        <Piece key={i} p={p} reduce={reduce} />
      ))}
    </div>
  );
}

export function ConfettiLayer({ bursts, reduce, onDone }: { bursts: ConfettiBurst[]; reduce: boolean; onDone: (id: number) => void }) {
  if (bursts.length === 0) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
      {bursts.map((b) => (
        <Burst key={b.id} burst={b} reduce={reduce} onDone={onDone} />
      ))}
    </div>
  );
}
