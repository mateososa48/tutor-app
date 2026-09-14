"use client";


import ScrollReveal from "@/components/ScrollReveal";
import { useReduce } from "./useScript";

const QUOTE =
  "I built Chalk for my little sister. She could do the math. She just needed someone with the patience to sit with her while she worked it out.";

const TEXT_CLASS = "lp-display text-[clamp(1.6rem,3.2vw,2.5rem)] leading-[1.28] text-(--lp-ink)";

export function Founder() {
  const reduce = useReduce();
  return (
    <section className="py-16 sm:py-24">
      <figure className="mx-auto max-w-[820px] px-5 sm:px-8">
        {reduce ? (
          <blockquote>
            <p className={TEXT_CLASS}>{QUOTE}</p>
          </blockquote>
        ) : (
          <ScrollReveal baseOpacity={0.12} baseRotation={2} blurStrength={3} textClassName={TEXT_CLASS}>
            {QUOTE}
          </ScrollReveal>
        )}
        <figcaption className="mt-7 text-[14px] text-(--lp-ink-3)">
          <span className="font-medium text-(--lp-ink-2)">Mateo Sosa</span>, founder of Chalk
        </figcaption>
      </figure>
    </section>
  );
}
