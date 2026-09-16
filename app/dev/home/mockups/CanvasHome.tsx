"use client";

import type { CSSProperties } from "react";
import { Keyboard, Mic, Paperclip } from "lucide-react";
import { SpeedGauge } from "@/components/session/SpeedControl";
import { cn } from "@/lib/utils";
import { SESSIONS, type MockSession } from "../data";
import { DOTS, IconButton, MobileBar, RING, RING_HOVER, Rise, Thumb } from "../parts";

// 9. Table. Home is the whiteboard's own plane: the boards lie on it where
// they were left, the paused one largest, and the session's tools float at
// the bottom the way tldraw's toolbar does. Nothing else on the page.
const SPOTS = [
  { "--l": "5%", "--t": "8%", "--w": "42%" },
  { "--l": "53%", "--t": "5%", "--w": "27%" },
  { "--l": "61%", "--t": "46%", "--w": "25%" },
  { "--l": "27%", "--t": "60%", "--w": "23%" },
  { "--l": "84%", "--t": "27%", "--w": "14%" },
  { "--l": "3%", "--t": "70%", "--w": "18%" },
] as unknown as CSSProperties[];

export default function CanvasHome() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white" style={{ ...DOTS, backgroundAttachment: "local" }}>
      <MobileBar />
      <div className="relative flex flex-1 flex-col gap-5 px-5 pt-6 pb-4 md:block md:min-h-[720px] md:p-0">
        {SESSIONS.map((s, i) => (
          <Rise
            key={s.id}
            i={i}
            className={cn("md:absolute md:left-(--l) md:top-(--t) md:w-(--w)", i % 2 ? "w-[62%] self-end" : "w-[74%] self-start")}
            style={SPOTS[i]}
          >
            <BoardTile s={s} />
          </Rise>
        ))}
      </div>
      <Toolbar />
    </div>
  );
}

function BoardTile({ s }: { s: MockSession }) {
  const paused = s.status === "paused";
  return (
    <a
      href="#"
      className={cn(
        "group block rounded-[12px] bg-white p-1 outline-none transition-[translate,box-shadow] duration-150 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-(--lp-sky) focus-visible:ring-offset-2",
        RING,
        RING_HOVER,
      )}
    >
      <Thumb s={s} sizes="(max-width: 768px) 80vw, 520px" className="aspect-[4/3] rounded-[8px]" />
      <div className="flex items-baseline gap-2 px-2 pt-2 pb-1">
        {paused && <span aria-hidden className="size-1.5 shrink-0 translate-y-px rounded-full bg-(--lp-sky)" />}
        <span className="min-w-0 truncate text-[13px] font-medium text-(--lp-ink)">{s.title}</span>
        <span className="ml-auto shrink-0 text-[12px] text-(--lp-ink-3) tabular-nums">{paused ? "Paused" : s.day}</span>
      </div>
    </a>
  );
}

function Toolbar() {
  return (
    <div className="sticky bottom-0 z-10 mt-auto flex justify-center px-4 pt-6 pb-5">
      <div className="flex items-center gap-1 rounded-[14px] bg-white p-1.5 shadow-[0_0_0_1px_rgba(18,18,21,0.08),0_1px_2px_rgba(18,18,21,0.06),0_14px_36px_-12px_rgba(18,18,21,0.3)]">
        <IconButton label="Add a worksheet" className="size-11 rounded-[8px]">
          <Paperclip />
        </IconButton>
        <button
          type="button"
          className="btn-gloss inline-flex h-11 items-center gap-2 rounded-[8px] ps-3.5 pe-4 text-[14.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          <Mic className="size-[18px]" strokeWidth={2} />
          Start talking
        </button>
        <IconButton label="Type instead" className="size-11 rounded-[8px]">
          <Keyboard />
        </IconButton>
        <span aria-hidden className="mx-1 h-6 w-px bg-(--lp-line-strong)" />
        <IconButton label="Tutor speed: slow" className="size-11 rounded-[8px]">
          <SpeedGauge index={1} className="size-5" />
        </IconButton>
      </div>
    </div>
  );
}
