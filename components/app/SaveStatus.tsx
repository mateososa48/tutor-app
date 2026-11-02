"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";

// Save state for the top bar (Paper "Status · Save state"): "Saving" only
// after 400ms, so a quick save shows nothing but "Saved"; an error says so
// and offers Retry.

export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (state !== "saving") return;
    const timer = setTimeout(() => setSlow(true), 400);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [state]);

  const shown = state === "saving" ? (slow ? "saving" : null) : state === "idle" ? null : state;
  const enter = { opacity: 0, y: 3, filter: "blur(2px)" };
  const show = { opacity: 1, y: 0, filter: "blur(0px)" };
  return (
    <div aria-live="polite" className="flex h-7 min-w-[92px] items-center justify-end pr-1 text-[12.5px] font-medium">
      <AnimatePresence mode="wait" initial={false}>
        {shown === "saving" && (
          <motion.span key="saving" initial={enter} animate={show} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="flex items-center gap-1.5 text-(--lp-ink-2)">
            <Icon icon={Loading03Icon} size={14} className="animate-spin" />
            Saving
          </motion.span>
        )}
        {shown === "saved" && (
          <motion.span key="saved" initial={enter} animate={show} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="flex items-center gap-1.5 text-(--lp-ink-2)">
            <Icon icon={Tick02Icon} size={14} strokeWidth={2.5} className="text-(--lp-live)" />
            Saved
          </motion.span>
        )}
        {shown === "error" && (
          <motion.span key="error" initial={enter} animate={show} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="flex items-center gap-2 text-(--danger)">
            Couldn&apos;t save
            <button type="button" onClick={onRetry} className="cursor-pointer rounded-[6px] px-1 text-(--lp-ink) underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-(--lp-sky)">
              Retry
            </button>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
