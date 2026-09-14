"use client";

import { useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";

// The motion preference, read only after hydration. Motion's own hook knows
// the answer on the client's first render, earlier than the server could, and
// the two disagreeing is a hydration error for anyone with reduced motion on.
// Null until hydrated, then the real preference.
export function useReduce(): boolean | null {
  const reduce = useReducedMotion();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return hydrated ? reduce : null;
}
