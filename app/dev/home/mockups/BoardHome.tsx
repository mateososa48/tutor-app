"use client";

import { ArrowRight, Keyboard, Mic, Paperclip } from "lucide-react";
import { VoiceWave } from "@/components/session/VoiceWave";
import { cn } from "@/lib/utils";
import { DATE_LINE, SESSIONS, STUDENT, type MockSession } from "../data";
import { BoardShot, DOTS, Highlight, IconButton, MobileBar, RING, RING_GROUP_HOVER, Rise, TutorPen } from "../parts";

// 1. The board. Home is an empty page of the whiteboard: the tutor has written
// a greeting, the last boards are pinned beside it, and the voice dock waits in
// the corner where it sits during a session.
export default function BoardHome() {
  const [current, ...rest] = SESSIONS;
  const pinned = rest.filter((s) => s.shot).slice(0, 3);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white" style={{ ...DOTS, backgroundAttachment: "local" }}>
      <MobileBar />
      <div className="px-5 pt-8 pb-10 sm:px-10 lg:pt-14 lg:pr-[436px] lg:pl-14">
        <Rise>
          <p className="lp-hand m-0 text-[15px] text-(--lp-ink-3)">{DATE_LINE}</p>
          <h1 className="lp-hand m-0 mt-2 max-w-[17ch] text-[clamp(2.25rem,4.3vw,3.6rem)] leading-[1.2] font-medium tracking-[-0.01em] text-(--lp-ink)">
            Hi {STUDENT.name}, what are we <Highlight>working on</Highlight> today? <TutorPen />
          </h1>
        </Rise>
        <div className="mt-10 grid gap-x-8 gap-y-10 lg:mt-12 xl:grid-cols-6">
          <Rise i={1} className="xl:col-span-4">
            <CurrentBoard s={current} />
          </Rise>
          <Rise i={2} className="grid grid-cols-2 gap-6 sm:grid-cols-3 xl:col-span-2 xl:grid-cols-1 xl:pt-10">
            {pinned.map((s) => (
              <Pinned key={s.id} s={s} />
            ))}
          </Rise>
        </div>
      </div>
      <Dock />
    </div>
  );
}

function CurrentBoard({ s }: { s: MockSession }) {
  return (
    <div>
      <div className={cn("rounded-[20px] bg-white p-2", RING)}>
        {s.shot && <BoardShot shot={s.shot} className="aspect-[16/10] rounded-[12px]" priority />}
      </div>
      <p className="lp-hand m-0 mt-4 max-w-[46ch] text-[17px] leading-snug text-(--lp-ink-2)">
        We stopped at: &ldquo;{s.lastLine}&rdquo;
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" className="lp-btn lp-btn-lift lp-btn-sm">
          Pick it up
          <ArrowRight className="size-4" />
        </button>
        <span className="text-[13.5px] text-(--lp-ink-3)">
          {s.title}, {s.minutes} min so far
        </span>
      </div>
    </div>
  );
}

function Pinned({ s }: { s: MockSession }) {
  return (
    <a href="#" className="group block rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-(--lp-sky) focus-visible:ring-offset-4">
      <div className={cn("rounded-[14px] bg-white p-1.5 transition-[box-shadow] duration-150 ease-out", RING, RING_GROUP_HOVER)}>
        {s.shot && <BoardShot shot={s.shot} className="aspect-[4/3] rounded-[8px]" sizes="240px" />}
      </div>
      <p className="m-0 mt-2.5 truncate text-[14px] font-medium text-(--lp-ink)">{s.title}</p>
      <p className="lp-hand m-0 mt-0.5 text-[13.5px] text-(--lp-ink-3)">
        {s.day}, {s.minutes} min
      </p>
    </a>
  );
}

function Dock() {
  return (
    <aside className="sticky bottom-0 z-10 px-3 pb-3 sm:px-10 sm:pb-10 lg:fixed lg:right-6 lg:bottom-6 lg:w-[384px] lg:p-0">
      <div className="rounded-[20px] bg-white p-2.5 shadow-[0_0_0_1px_rgba(18,18,21,0.07),0_16px_40px_-12px_rgba(18,18,21,0.22)]">
        <div className="flex items-center justify-between px-1.5 pt-1 pb-2.5">
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-(--lp-ink)">
            <span className="size-2 rounded-full bg-(--lp-live)" />
            Your tutor is ready
          </span>
          <span className="text-[12.5px] text-(--lp-ink-3)">
            {STUDENT.voice}, {STUDENT.speed.toLowerCase()}
          </span>
        </div>
        <div className="hidden h-[92px] overflow-hidden rounded-[10px] sm:block">
          <VoiceWave analyser={null} speaking className="block h-full w-full" />
        </div>
        <div className="flex items-center gap-1.5 sm:mt-2.5">
          <IconButton label="Add a worksheet">
            <Paperclip />
          </IconButton>
          <button
            type="button"
            className="btn-gloss inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold active:scale-[0.96]"
          >
            <Mic className="size-[18px]" />
            Start talking
          </button>
          <IconButton label="Type instead">
            <Keyboard />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}
