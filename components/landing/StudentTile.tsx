"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Mic } from "lucide-react";
import { PetBubble } from "@/components/board/PetBubble";
import { DitherWave } from "./DitherWave";
import { SWIRL } from "./swirl";
import { cn } from "@/lib/utils";

// The student, in the landing hero's session (Sept 28 2026). People who saw
// the old hero thought Chalk was a chatbot: only the tutor ever "spoke", in a
// dark box. This is the other half of the call: a round tile, like a
// participant on a voice call, holding a voice waveform that moves while they
// talk (Mateo's reference: a voice-message waveform; an initial in the circle
// and rings rolling out of it were both cut) and their words coming out of the
// tile as they say them, in the same bubble the pet uses, so the two read as
// one conversation.
//
// `video` puts a clip in the circle (muted, looping). Without one it shows the
// waveform, which is what ships until a clip exists.

/** About how fast people talk: words arrive at 3.5 a second. */
export const WORD_MS = 285;

/**
 * A line said out loud, word by word. `key` changes for every new line (the
 * same words twice are still two lines). Returns what has been said so far and
 * whether the speaker is still going.
 */
export function useSpoken(line: string, key: number): { said: string; speaking: boolean } {
  const words = line ? line.split(/\s+/) : [];
  const first = words.length ? 1 : 0;
  const [shown, setShown] = useState({ key, count: first });
  // A new line starts on its first word (state derived during render).
  const current = shown.key === key ? shown : { key, count: first };
  if (current !== shown) setShown(current);

  useEffect(() => {
    if (!words.length) return;
    const id = window.setInterval(() => {
      setShown((s) => (s.key !== key || s.count >= words.length ? s : { key, count: s.count + 1 }));
    }, WORD_MS);
    return () => window.clearInterval(id);
  }, [key, words.length]);

  return { said: words.slice(0, current.count).join(" "), speaking: current.count > 0 && current.count < words.length };
}

type Props = {
  name: string;
  /** What they are saying (the whole line so far). Empty when quiet. */
  said: string;
  speaking: boolean;
  /** Their words stay up this long after they stop. */
  lingerMs?: number;
  video?: string;
  reduce: boolean;
  /** A phone: a smaller tile, and a narrower bubble. */
  compact?: boolean;
  className?: string;
};

const SIZE = { full: 112, compact: 60 } as const;

export function StudentTile({ name, said, speaking, lingerMs = 3200, video, reduce, compact = false, className }: Props) {
  const size = compact ? SIZE.compact : SIZE.full;
  // The bubble stays a moment after the last word, then goes: a voice, not a chat log.
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (speaking || !said) return;
    const on = window.setTimeout(() => setLingering(true), 0);
    const off = window.setTimeout(() => setLingering(false), lingerMs);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [speaking, said, lingerMs]);
  const open = Boolean(said) && (speaking || lingering);

  return (
    <div className={cn("pointer-events-none flex flex-col items-center gap-2", className)} aria-hidden>
      <div className="relative" style={{ width: size, height: size }}>
        {/* The disc: the app's own dithered voice field (the sign-in panel's and
            the hero's swirl, a shade deeper so white reads on it), with the
            waveform in white on top. While they talk the ring lights up. */}
        <span
          className={cn(
            "absolute -inset-[5px] rounded-full transition-[box-shadow] duration-300",
            speaking
              ? "shadow-[0_0_0_2px_var(--lp-sky),0_0_14px_2px_rgba(61,156,255,0.35)]"
              : "shadow-[0_0_0_1px_rgba(18,18,21,0.10)]",
          )}
        />
        <div className="relative size-full overflow-hidden rounded-full bg-[#5aa2ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_6px_18px_-6px_rgba(29,114,220,0.45)]">
          {video ? (
            <video src={video} autoPlay muted loop playsInline className="size-full object-cover" />
          ) : (
            <>
              <DitherWave {...SWIRL} pixelSize={compact ? 2 : 3} lightness={-0.12} animate={!reduce} className="absolute inset-0" />
              {/* A soft shade under the bars so white holds on the light patches. */}
              <span className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(29,114,220,0.26),transparent)]" />
              <span className="absolute inset-0 flex items-center justify-center">
                <VoiceBars speaking={speaking} reduce={reduce} height={Math.round(size * 0.46)} bar={compact ? 3 : 4.5} gap={compact ? 2.5 : 4} />
              </span>
            </>
          )}
        </div>
        {/* Their words, out of the tile. */}
        <PetBubble open={open} text={said} side="left" align="start" gap={compact ? 10 : 16} maxWidth={compact ? 168 : 230} />
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-(--lp-line-strong) bg-white font-medium text-(--lp-ink)",
          compact ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[13px]",
        )}
      >
        <Mic
          className={cn("size-3.5 transition-colors duration-200", speaking ? "text-(--lp-sky-deep)" : "text-(--lp-ink-2)")}
          strokeWidth={2.25}
        />
        {name}
      </span>
    </div>
  );
}

// A voice-message waveform: nine rounded bars, taller toward the middle, each
// rising and falling on its own rhythm while they talk, and resting as a low,
// still waveform when they stop (dots read as "loading"). Each bar animates
// its height, not scaleY: a scaled bar squashes its round ends flat.
const ENVELOPE = [0.42, 0.68, 0.52, 0.88, 1, 0.78, 0.58, 0.72, 0.4];

function VoiceBars({ speaking, reduce, height, bar, gap }: { speaking: boolean; reduce: boolean; height: number; bar: number; gap: number }) {
  const px = (f: number) => Math.max(bar, Math.round(f * height));
  return (
    <span className="flex items-center" style={{ height, gap }} aria-hidden>
      {ENVELOPE.map((peak, i) => {
        const quiet = peak * 0.3;
        const low = peak * 0.34;
        const moving = speaking && !reduce;
        return (
          <motion.span
            key={i}
            className={cn("block rounded-full bg-white shadow-[0_1px_2px_rgba(18,18,21,0.18)] transition-opacity duration-300", speaking ? "opacity-100" : "opacity-80")}
            style={{ width: bar }}
            initial={false}
            animate={{ height: moving ? [px(low), px(peak), px(low * 1.4), px(peak * 0.8), px(low)] : px(speaking ? peak : quiet) }}
            transition={
              moving
                ? { duration: 0.85 + (i % 4) * 0.16, repeat: Infinity, ease: "easeInOut", delay: (i * 0.07) % 0.3 }
                : { duration: 0.3, ease: "easeOut" }
            }
          />
        );
      })}
    </span>
  );
}
