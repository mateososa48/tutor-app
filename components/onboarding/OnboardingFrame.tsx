"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { DitherWave } from "@/components/landing/DitherWave";
import { SWIRL } from "@/components/landing/swirl";
import { ChalkMark } from "@/components/app/ChalkMark";
import { TutorNotesBoard } from "@/components/onboarding/TutorNotesBoard";
import { useReduce } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";
import type { BoardNote } from "@/lib/onboarding";

// The frame the onboarding and welcome screens share: the sign-in page's
// layout (a narrow column beside the swirl panel), with the tutor's notepad
// on the panel. Signing up, setting up and the first session's brief read as
// one thing because they stand in the same room.

// The sign-in page's constants: the panel shader only runs where it shows,
// and the corner behind the white wordmark stays blue.
const WIDE = "(min-width: 1024px)";
const subscribeWide = (onChange: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const CALM_SPOT = { x: 0, y: 0, rx: 420, ry: 230, cap: 0.55 };

export function OnboardingFrame({
  notes,
  dense = false,
  children,
}: {
  notes: BoardNote[];
  /** Less room above the column, for a screen that has to fit a laptop without scrolling. */
  dense?: boolean;
  children: ReactNode;
}) {
  const reduce = useReduce() ?? false;
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);

  return (
    <div className="flex min-h-[100dvh] bg-white p-3 text-(--lp-ink) sm:p-4">
      <main className={cn("flex flex-1 justify-center px-4 pb-10", dense ? "pt-[clamp(20px,6vh,64px)]" : "pt-[clamp(28px,11vh,112px)]")}>
        <div className="w-full max-w-[400px]">
          <ChalkMark size={28} />
          {children}
        </div>
      </main>

      <aside className="relative hidden w-[min(46%,720px)] shrink-0 overflow-hidden rounded-[20px] bg-[#4696f7] lg:block">
        {wide && <DitherWave {...SWIRL} calmSpot={CALM_SPOT} animate={!reduce} className="absolute inset-0" />}
        <div className="absolute inset-0 flex items-center justify-center p-10">
          <TutorNotesBoard
            notes={notes}
            className="w-full max-w-[360px] shadow-[0_1px_2px_rgba(18,18,21,0.06),0_16px_40px_rgba(18,40,80,0.18)]"
          />
        </div>
        <p aria-hidden className="absolute bottom-6 left-6 m-0 flex items-center gap-2">
          <ChalkMark size={28} color="var(--paper)" />
          <span className="lp-brand text-[28px] leading-none text-(--paper)">chalk</span>
        </p>
      </aside>
    </div>
  );
}
