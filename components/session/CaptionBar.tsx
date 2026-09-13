"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

// Live captions of what the tutor is saying. Sits over the board, clear of
// the voice dock, and lingers briefly after the sentence ends so it can be
// read to the end.

export function CaptionBar({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (text) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      const t = setTimeout(() => setShown(text), 0);
      return () => clearTimeout(t);
    }
    hideTimer.current = setTimeout(() => setShown(""), 900);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [text]);

  return (
    <div className="pointer-events-none absolute inset-x-5 bottom-6 z-20 flex justify-center md:right-[424px]">
      <AnimatePresence>
        {shown && (
          <motion.div
            key="caption"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.32 } }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="max-w-[60ch] rounded-[14px] px-5 py-3 text-center backdrop-blur-md"
            style={{
              background: "rgba(18, 18, 21, 0.86)",
              boxShadow: "0 1px 2px rgba(18,18,21,0.2), 0 12px 32px rgba(18,18,21,0.18)",
            }}
          >
            <p className="m-0 line-clamp-3 text-[15.5px] leading-[1.5] font-medium tracking-[-0.005em] text-white">{shown}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
