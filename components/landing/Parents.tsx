"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BlurFade } from "@/components/ui/blur-fade";
import { TranscriptList } from "@/components/session/TranscriptPanel";
import type { TranscriptEntry } from "@/lib/live-types";

const POINTS = [
  ["Homework stays theirs", "Chalk guides. It never hands over the answer, so what your kid turns in is their own work."],
  ["Patient at 9 pm on the fifth try", "No sighing, no rushing. When something does not land, it finds a smaller step."],
  ["You can read the session", "Every session keeps a transcript you can open. Voice audio is never stored."],
] as const;

const LINES: TranscriptEntry[] = [
  { id: "p1", role: "student", text: "I don't get why the 3 moves to the other side." },
  { id: "p2", role: "tutor", text: "Let's not move it yet. What's the opposite of adding three?" },
  { id: "p3", role: "student", text: "subtracting 3?" },
  { id: "p4", role: "tutor", text: "Exactly. Do that to both sides and read me what's left." },
];

// What a parent actually opens after a session: the review screen, with the
// app's own header row, summary and transcript.
function RecapCard() {
  return (
    <div className="lp-frame">
      <div className="lp-card overflow-hidden rounded-[20px]">
        <div className="flex h-[52px] items-center gap-3 border-b border-(--lp-line) px-5 text-[13.5px]">
          <span className="truncate font-medium text-(--lp-ink)">Solving 2x + 3 = 11</span>
          <span className="shrink-0 text-(--lp-ink-3)">Wednesday</span>
          <span className="shrink-0 text-(--lp-ink-3)">14 min</span>
          <Badge variant="outline" className="ml-auto shrink-0 rounded-full border-(--lp-line-strong) text-(--lp-ink-2)">
            Ended
          </Badge>
        </div>

        <div className="px-5 pt-5 pb-6">
          <h3 className="lp-display m-0 mb-2 text-[16px] text-(--lp-ink)">Summary</h3>
          <p className="m-0 flex items-start gap-2.5 text-[14px] leading-[1.5] text-(--lp-ink)">
            <span className="mt-[3px] inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-(--lp-sky-soft) text-(--lp-sky-deep)">
              <Check size={10} strokeWidth={3} aria-hidden />
            </span>
            Undoing an operation on both sides, after two tries. Next: equations with x on both sides.
          </p>
          <h3 className="lp-display m-0 mt-6 mb-3 text-[16px] text-(--lp-ink)">Transcript</h3>
          <TranscriptList transcript={LINES} />
        </div>
      </div>
    </div>
  );
}

export function Parents() {
  return (
    <section id="parents" className="scroll-mt-24 py-16 sm:py-24">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <div
          className="relative overflow-hidden rounded-[28px] border px-6 py-12 sm:px-12 sm:py-16"
          style={{
            borderColor: "var(--lp-line)",
            background: "radial-gradient(70% 60% at 100% 0%, rgba(61,156,255,0.14), transparent 60%), linear-gradient(180deg, #fff, var(--lp-bg))",
          }}
        >
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-16">
            <BlurFade inView>
              <p className="text-[12px] font-semibold tracking-[0.08em] uppercase" style={{ color: "var(--lp-sky-deep)" }}>
                For parents
              </p>
              <h2 className="lp-display mt-4 max-w-[16ch] text-[clamp(2rem,3.6vw,3rem)] leading-[1.06]">
                See the learning, not just the grades.
              </h2>
              <ul className="mt-9 flex flex-col">
                {POINTS.map(([title, body]) => (
                  <li key={title} className="border-t py-5" style={{ borderColor: "var(--lp-line)" }}>
                    <p className="lp-display text-[17px]">{title}</p>
                    <p className="mt-1 max-w-[46ch] text-[15px] leading-[1.5] text-(--lp-ink-2)">{body}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-9">
                <Link href="/signin" className="lp-btn">
                  Try a session free
                  <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
                </Link>
              </div>
            </BlurFade>

            <BlurFade inView delay={0.12}>
              <RecapCard />
            </BlurFade>
          </div>
        </div>
      </div>
    </section>
  );
}
