"use client";

import { useEffect, useState } from "react";
export { useReduce } from "@/lib/reduced-motion";

export type ScriptStep<K extends string> = { at: number; key: K };

// Plays a timed script while `active`, restarting at `loopAt`. Under reduced
// motion every step counts as fired so the final frame renders statically.
export function useScript<K extends string>(
  steps: readonly ScriptStep<K>[],
  loopAt: number,
  active: boolean,
  reduce: boolean | null,
) {
  const [phase, setPhase] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduce || !active) return;
    let cancelled = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      if (cancelled) return;
      setPhase(0);
      setCycle((c) => c + 1);
      timers = steps.map((s, i) =>
        setTimeout(() => {
          if (!cancelled) setPhase(i + 1);
        }, s.at),
      );
      timers.push(
        setTimeout(() => {
          if (!cancelled) run();
        }, loopAt),
      );
    };
    const kickoff = setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(kickoff);
      timers.forEach(clearTimeout);
    };
  }, [active, reduce, steps, loopAt]);

  const effective = reduce ? steps.length : phase;
  const fired = (key: K) => steps.findIndex((s) => s.key === key) < effective;
  return { fired, cycle, phase: effective };
}
