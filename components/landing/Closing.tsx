"use client";

import { useRef } from "react";
import Link from "next/link";
import { useInView } from "motion/react";
import { ArrowRight } from "lucide-react";
import Magnet from "@/components/Magnet";
import { DitherWave } from "./DitherWave";
import { Container, Reveal, Section, Title } from "./Section";
import { SWIRL } from "./swirl";
import { useReduce } from "./useScript";

// The last word: the hero's swirl again, calm, inside a rounded card, with the
// same button the page opened with. The shader only runs while the card is on
// screen, and stands still under reduced motion.

export function Closing() {
  const reduce = useReduce();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "120px" });

  return (
    <Section rule={false} className="pt-4 pb-20 sm:pt-6 sm:pb-24">
      <Container>
        <Reveal amount={0.3}>
          <div ref={ref} className="relative isolate overflow-hidden rounded-[28px] border border-(--lp-line)">
            <div aria-hidden className="absolute inset-0 -z-10">
              <DitherWave {...SWIRL} lightness={0.12} animate={!reduce && inView} />
              <div className="absolute inset-0 bg-(--lp-bg) opacity-55" />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_bottom,transparent,rgba(251,251,252,0.9))]" />
            </div>
            <div className="flex flex-col items-center px-6 py-20 text-center sm:py-28">
              <Title className="mt-0 max-w-[24ch]">Stuck on tonight&rsquo;s homework? Start talking.</Title>
              <p className="mt-5 max-w-[40ch] text-[1.0625rem] leading-[1.55] text-(--lp-ink-2) sm:text-[1.125rem]">
                Free to try right now. Bring one problem and say where you&rsquo;re stuck.
              </p>
              <div className="mt-9">
                <Magnet padding={48} magnetStrength={22} disabled={!!reduce}>
                  <Link href="/signin" className="lp-btn">
                    Try a session free
                    <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
                  </Link>
                </Magnet>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
