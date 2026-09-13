"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AudioLines, ChevronDown, Keyboard, MessageSquareText, Mic, MicOff, PenLine, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import MorphSurface from "@/components/ui/morph-surface/morph-surface";
import { AnimatedBadge, type AnimatedBadgeStatus } from "@/components/motion/animated-badge";
import type { TranscriptEntry } from "@/lib/live-types";
import type { UploadedFile } from "@/lib/file-processor";
import { cn } from "@/lib/utils";
import { VoiceWave } from "./VoiceWave";
import { TranscriptPanel } from "./TranscriptPanel";
import { FilesPopover } from "./FilesPopover";

// The voice dock: the tutor's voice as a wave, the mic, a way to type, and
// the transcript folded away above it until asked for. Everything else on
// the screen is the board.

export type DockActivity = "connecting" | "listening" | "thinking" | "writing" | "speaking";

type Props = {
  activity: DockActivity;
  isMuted: boolean;
  onMute: () => void;
  analyser: AnalyserNode | null;
  onSendText: (text: string) => void;
  transcript: TranscriptEntry[];
  transcriptOpen: boolean;
  onToggleTranscript: () => void;
  files: UploadedFile[];
  onAddFiles: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
  fileNotice?: string;
};

const WAVE_H = 132;
const WAVE_H_OPEN = 60;
const CONTROLS_H = 68;
const PILL =
  "h-9 rounded-full border-(--lp-line-strong) bg-white/90 px-3.5 text-[13px] font-medium text-(--lp-ink) shadow-(--lp-shadow-card) backdrop-blur-md hover:bg-white";

const BADGE: Record<DockActivity, { status: AnimatedBadgeStatus; label: string; icon?: ReactNode }> = {
  connecting: { status: "loading", label: "Connecting" },
  listening: { status: "neutral", label: "Listening" },
  thinking: { status: "loading", label: "Thinking" },
  writing: { status: "info", label: "Writing on the board", icon: <PenLine className="size-3" /> },
  speaking: { status: "info", label: "Tutor speaking", icon: <AudioLines className="size-3" /> },
};

const SPRING = { type: "spring", stiffness: 300, damping: 34, mass: 0.9 } as const;

export function VoiceDock({
  activity,
  isMuted,
  onMute,
  analyser,
  onSendText,
  transcript,
  transcriptOpen,
  onToggleTranscript,
  files,
  onAddFiles,
  onRemoveFile,
  fileNotice,
}: Props) {
  const reduce = useReducedMotion();
  const [composer, setComposer] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [panelH, setPanelH] = useState(560);

  // The open transcript reaches up to just under the top bar.
  useEffect(() => {
    const update = () => setPanelH(Math.max(320, window.innerHeight - 140));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (composer) inputRef.current?.focus();
  }, [composer]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSendText(t);
    setText("");
    inputRef.current?.focus();
  };
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      setComposer(false);
    }
  };

  const open = transcriptOpen;
  const height = open ? panelH : WAVE_H + CONTROLS_H;
  const badge = BADGE[activity];
  const spring = reduce ? { duration: 0 } : SPRING;

  return (
    <div className="absolute right-4 bottom-4 z-30 flex w-[380px] max-w-[calc(100%-32px)] flex-col items-end gap-2.5">
      <div className="flex items-center gap-2">
        <FilesPopover files={files} onAddFiles={onAddFiles} onRemoveFile={onRemoveFile} notice={fileNotice} className={PILL} />
        <Button variant="outline" onClick={onToggleTranscript} aria-expanded={open} className={PILL}>
          {open ? <ChevronDown strokeWidth={2} /> : <MessageSquareText strokeWidth={2} />}
          {open ? "Hide transcript" : "Transcript"}
        </Button>
      </div>

      <motion.div
        initial={false}
        animate={{ height }}
        transition={spring}
        className="w-full overflow-hidden rounded-[20px] border border-(--lp-line-strong) bg-white/88 shadow-(--lp-shadow-window) backdrop-blur-xl"
      >
        <div className="flex h-full flex-col">
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="transcript"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.14, duration: 0.24 } }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                className="min-h-0 flex-1"
              >
                <TranscriptPanel
                  transcript={transcript}
                  live={activity !== "connecting"}
                  emptyText="Say something to the tutor, or type below."
                />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={false}
            animate={{ height: open ? WAVE_H_OPEN : WAVE_H }}
            transition={spring}
            className={cn("relative shrink-0 overflow-hidden", open && "border-t border-(--lp-line)")}
          >
            <VoiceWave analyser={analyser} speaking={activity === "speaking"} />
            <div className="absolute top-3 left-3">
              <AnimatedBadge
                size="sm"
                status={badge.status}
                icon={badge.icon}
                showIcon={badge.status !== "neutral"}
                contentKey={activity}
                className="border-(--lp-line) bg-white/85 text-(--lp-ink-2) backdrop-blur-sm data-[status=info]:text-(--lp-sky-deep)"
              >
                {badge.label}
              </AnimatedBadge>
            </div>
          </motion.div>

          <div className="flex h-[68px] shrink-0 items-center justify-end px-3">
            <MorphSurface.Root value={composer ? "typing" : "voice"} origin="right" className="rounded-[14px]">
              {composer ? (
                <div className="flex w-[348px] items-center gap-1.5">
                  <Button variant="ghost" size="icon" onClick={() => setComposer(false)} aria-label="Back to voice" className="size-10 rounded-full text-(--lp-ink-2)">
                    <X className="size-[18px]" strokeWidth={2} />
                  </Button>
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onInputKey}
                    placeholder="Type to the tutor…"
                    className="h-10 min-w-0 flex-1 rounded-[10px] border border-(--lp-line-strong) bg-white px-3 text-[14px] text-(--lp-ink) outline-none placeholder:text-(--lp-ink-3) focus:border-(--lp-sky) focus:ring-3 focus:ring-(--lp-sky-glow)"
                  />
                  <Button size="icon" onClick={send} disabled={!text.trim()} aria-label="Send" className="size-10 rounded-[10px]">
                    <SendHorizontal className="size-[18px]" strokeWidth={2} />
                  </Button>
                </div>
              ) : (
                <div className="flex w-[348px] items-center justify-between">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button variant="ghost" size="icon" onClick={() => setComposer(true)} aria-label="Type to the tutor" className="size-10 rounded-full text-(--lp-ink-2) hover:text-(--lp-ink)" />
                      }
                    >
                      <Keyboard className="size-[19px]" strokeWidth={1.9} />
                    </TooltipTrigger>
                    <TooltipContent>Type to the tutor</TooltipContent>
                  </Tooltip>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={isMuted ? "muted" : "live"}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className={cn("text-[12.5px] font-medium", isMuted ? "text-(--danger)" : "text-(--lp-ink-3)")}
                    >
                      {isMuted ? "Your mic is off" : "Your mic is on"}
                    </motion.span>
                  </AnimatePresence>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={onMute}
                          aria-pressed={isMuted}
                          aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                          className={cn(
                            "flex size-12 items-center justify-center rounded-full transition-[transform,background-color,box-shadow,border-color] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-95",
                            isMuted
                              ? "border-2 border-(--lp-ink) bg-white text-(--lp-ink)"
                              : "bg-(--lp-ink) text-white shadow-[0_6px_18px_rgba(18,18,21,0.22)] hover:bg-[#26262c]",
                          )}
                        />
                      }
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={isMuted ? "off" : "on"}
                          initial={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                          exit={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                          transition={{ duration: 0.16 }}
                          className="flex"
                        >
                          {isMuted ? <MicOff className="size-5" strokeWidth={2} /> : <Mic className="size-5" strokeWidth={2} />}
                        </motion.span>
                      </AnimatePresence>
                    </TooltipTrigger>
                    <TooltipContent className="flex items-center gap-1.5">
                      {isMuted ? "Unmute" : "Mute"} <Kbd>M</Kbd>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </MorphSurface.Root>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
