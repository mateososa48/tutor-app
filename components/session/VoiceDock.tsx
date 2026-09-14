"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
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

// The voice dock never changes size. The transcript is a sheet that rises
// behind it; the dock sits on top of the sheet like a card on a page.

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

const CONTROLS_H = 68;
const DOCK_H = 200;
const INSET = 12; // gap between the dock and the open sheet's edges
const PILL =
  "h-9 rounded-full border-(--lp-line-strong) bg-white/92 px-3.5 text-[13px] font-medium text-(--lp-ink) shadow-(--lp-shadow-card) backdrop-blur-md hover:bg-white";

const BADGE: Record<DockActivity, { status: AnimatedBadgeStatus; label: string; icon?: ReactNode }> = {
  connecting: { status: "loading", label: "Connecting" },
  listening: { status: "neutral", label: "Listening" },
  thinking: { status: "loading", label: "Thinking" },
  writing: { status: "info", label: "Writing on the board", icon: <PenLine className="size-3" /> },
  speaking: { status: "info", label: "Tutor speaking", icon: <AudioLines className="size-3" /> },
};

const SPRING = { type: "spring", stiffness: 260, damping: 32, mass: 0.9 } as const;

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
  const [sheetH, setSheetH] = useState(560);

  // The open sheet reaches up to just under the chips at the top of the board.
  useEffect(() => {
    const update = () => setSheetH(Math.max(360, window.innerHeight - 196));
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
  const badge = BADGE[activity];
  const spring = reduce ? { duration: 0 } : SPRING;

  return (
    <div className="absolute right-4 bottom-4 z-30 w-[380px] max-w-[calc(100%-32px)]">
      {/* The sheet: grows upward behind the dock. */}
      <motion.div
        initial={false}
        animate={{ height: open ? sheetH : DOCK_H, opacity: open ? 1 : 0 }}
        transition={spring}
        style={{ pointerEvents: open ? "auto" : "none", left: -INSET * 2, right: 0 }}
        aria-hidden={!open}
        className="absolute bottom-0 overflow-hidden rounded-[22px] border border-(--lp-line-strong) bg-white shadow-(--lp-shadow-window)"
      >
        <div className="h-full" style={{ paddingBottom: DOCK_H + INSET * 2 }}>
          <TranscriptPanel
            transcript={transcript}
            live={activity !== "connecting"}
            emptyText="Say something to the tutor, or type below."
          />
        </div>
      </motion.div>

      {/* Pills ride the top edge of whatever is open. */}
      <motion.div
        initial={false}
        animate={{ y: open ? -(sheetH - DOCK_H) : 0 }}
        transition={spring}
        className="absolute right-0 bottom-[calc(100%+10px)] flex items-center gap-2"
      >
        <FilesPopover files={files} onAddFiles={onAddFiles} onRemoveFile={onRemoveFile} notice={fileNotice} className={PILL} />
        <Button variant="outline" onClick={onToggleTranscript} aria-expanded={open} className={PILL}>
          {open ? <ChevronDown strokeWidth={2} /> : <MessageSquareText strokeWidth={2} />}
          {open ? "Hide transcript" : "Transcript"}
        </Button>
      </motion.div>

      {/* The dock: wave, status, mic, composer. Always the same size; it
          steps in from the sheet's edges when the transcript is open. */}
      <motion.div
        initial={false}
        animate={{ x: open ? -INSET : 0, y: open ? -INSET : 0 }}
        transition={spring}
        className="relative z-10"
      >
      <div
        className="relative overflow-hidden rounded-[20px] border border-(--lp-line-strong) bg-white shadow-(--lp-shadow-window)"
        style={{ height: DOCK_H }}
      >
        <div className="absolute inset-0">
          <VoiceWave analyser={analyser} speaking={activity === "speaking"} />
        </div>
        {/* The wave fades into the controls instead of stopping at a bar. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[110px]"
          style={{ background: "linear-gradient(to top, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.9) 40px, rgba(255,255,255,0.45) 74px, rgba(255,255,255,0) 100%)" }}
        />
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

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end px-3" style={{ height: CONTROLS_H }}>
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
                  className="h-10 min-w-0 flex-1 rounded-[10px] border border-(--lp-line-strong) bg-white px-3 text-[14px] text-(--lp-ink) outline-none placeholder:text-(--lp-ink-3) focus-visible:border-(--lp-sky) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
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

                <span className={cn("text-[12.5px] font-medium transition-colors", isMuted ? "text-(--danger)" : "text-(--lp-ink-3)")}>
                  {isMuted ? "Mic is off" : "Mic is on"}
                </span>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={onMute}
                        aria-pressed={isMuted}
                        aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                        className={cn(
                          "relative flex size-12 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
                          isMuted ? "btn-mic-off" : "btn-mic",
                        )}
                      />
                    }
                  >
                    <span className="relative flex">
                      {isMuted ? <MicOff className="size-5" strokeWidth={2} /> : <Mic className="size-5" strokeWidth={2} />}
                    </span>
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
