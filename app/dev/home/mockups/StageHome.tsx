"use client";

import { DitherWave } from "@/components/landing/DitherWave";
import { SWIRL } from "@/components/landing/swirl";
import { useReduce } from "@/components/landing/useScript";
import { SESSIONS, STUDENT } from "../data";
import { Composer, ContextLine, ContinueRow, EarlierList, MemoryPanel, Suggestions, TopicsPanel, WeekPanel } from "../pieces";
import { MobileBar, Rise } from "../parts";

// 21. Stage. The swirl is a band, not a wall, and the composer overlaps its
// edge so the two read as one object. Everything the tutor knows sits in a
// single row underneath.
export default function StageHome() {
  const reduce = useReduce();
  const [current, ...rest] = SESSIONS;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-(--lp-bg)">
      <MobileBar />
      <div className="mx-auto max-w-[1180px] px-4 pt-4 pb-16 sm:px-6 sm:pt-6">
        <Rise className="relative isolate overflow-hidden rounded-[24px] bg-[#8dbcff] px-6 pt-10 pb-[104px] sm:px-10 sm:pt-14 sm:pb-[116px]">
          <DitherWave {...SWIRL} animate={reduce === false} className="absolute inset-0 -z-10 h-full w-full" />
          <ContextLine onShader text={STUDENT.workingOn} />
          <h1 className="lp-display m-0 mt-2 max-w-[17ch] text-[clamp(2rem,3.5vw,2.9rem)] leading-[1.04] text-(--lp-ink)">
            Ask anything, or pick up {current.title.replace("Solving ", "")}.
          </h1>
        </Rise>

        <Rise i={1} className="relative z-10 mx-auto -mt-[78px] w-full max-w-[860px] sm:-mt-[86px]">
          <Composer />
          <Suggestions className="mt-3 sm:justify-center" />
        </Rise>

        <Rise i={2} className="mt-10">
          <ContinueRow s={current} />
        </Rise>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Rise i={3}>
            <MemoryPanel className="h-full" />
          </Rise>
          <Rise i={4}>
            <WeekPanel className="h-full" />
          </Rise>
          <Rise i={5}>
            <TopicsPanel className="h-full" />
          </Rise>
        </div>

        <Rise i={6} className="mt-10">
          <h2 className="m-0 mb-1 text-[14px] font-medium text-(--lp-ink-2)">Earlier</h2>
          <EarlierList items={rest.slice(0, 4)} columns={2} />
        </Rise>
      </div>
    </div>
  );
}
