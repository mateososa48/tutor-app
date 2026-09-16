"use client";

import { DitherWave } from "@/components/landing/DitherWave";
import { SWIRL } from "@/components/landing/swirl";
import { useReduce } from "@/components/landing/useScript";
import { cn } from "@/lib/utils";
import { SESSIONS, STUDENT } from "../data";
import { Composer, ContextLine, ContinueTile, EarlierList, MemoryPanel, Suggestions, TopicsPanel, WeekPanel } from "../pieces";
import { MobileBar, RING, Rise } from "../parts";

// 18. Studio. The bento, with the composer living inside the shader tile
// instead of floating above an empty blue field, and every other tile sized to
// what it actually holds.
export default function StudioHome() {
  const reduce = useReduce();
  const [current, ...rest] = SESSIONS;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-(--lp-bg)">
      <MobileBar />
      <div className="mx-auto max-w-[1280px] px-4 pt-4 pb-16 sm:px-6 sm:pt-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6 lg:grid-cols-12 lg:gap-4">
          <Rise className="relative isolate flex min-h-[404px] flex-col justify-end overflow-hidden rounded-[28px] bg-[#8dbcff] p-2 md:col-span-6 lg:col-span-7 lg:row-span-2">
            <DitherWave {...SWIRL} animate={reduce === false} className="absolute inset-0 -z-10 h-full w-full" />
            <div className="px-4 pt-6 pb-5 sm:px-5">
              <ContextLine onShader text={STUDENT.workingOn} />
              <h1 className="lp-display m-0 mt-2 max-w-[15ch] text-[clamp(1.9rem,2.9vw,2.5rem)] leading-[1.06] text-(--lp-ink)">What are we working on?</h1>
            </div>
            <Composer glass />
            <Suggestions glass className="px-1 pt-2 pb-0.5" />
          </Rise>

          <Rise i={1} className="md:col-span-6 lg:col-span-5 lg:row-span-2">
            <ContinueTile s={current} className="h-full" />
          </Rise>

          <Rise i={2} className="md:col-span-3 lg:col-span-4">
            <WeekPanel className="h-full" />
          </Rise>
          <Rise i={3} className="md:col-span-3 lg:col-span-4">
            <MemoryPanel className="h-full" />
          </Rise>
          <Rise i={4} className="md:col-span-6 lg:col-span-4">
            <TopicsPanel className="h-full" />
          </Rise>

          <Rise i={5} className="md:col-span-6 lg:col-span-12">
            <section className={cn("rounded-[20px] bg-white px-5 py-4", RING)}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="m-0 text-[14px] font-medium text-(--lp-ink-2)">Earlier</h2>
                <a href="#" className="text-[12.5px] font-medium text-(--lp-ink-2) underline-offset-4 hover:text-(--lp-ink) hover:underline">
                  See all
                </a>
              </div>
              <EarlierList items={rest.slice(0, 4)} columns={2} className="mt-1" />
            </section>
          </Rise>
        </div>
      </div>
    </div>
  );
}
