"use client";

import ScrollReveal from "@/components/ScrollReveal";
import { Container, Section } from "./Section";
import { useReduce } from "./useScript";

// Why it exists, in one paragraph that darkens word by word as it scrolls into
// view. Centred and large: the one place on the page the type is the picture.

const QUOTE =
  "I built Chalk for my little sister. She could do the math. She just needed someone with the patience to sit with her while she worked it out.";

const TEXT_CLASS = "lp-title text-center text-[clamp(1.75rem,3.5vw,2.875rem)] leading-[1.22] text-(--lp-ink)";

export function Statement() {
  const reduce = useReduce();
  return (
    <Section>
      <Container>
        <figure className="mx-auto max-w-[900px]">
          {reduce ? (
            <blockquote className="m-0">
              <p className={TEXT_CLASS}>{QUOTE}</p>
            </blockquote>
          ) : (
            <ScrollReveal baseOpacity={0.14} baseRotation={0} enableBlur={false} textClassName={TEXT_CLASS} wordAnimationEnd="bottom 70%">
              {QUOTE}
            </ScrollReveal>
          )}
          <figcaption className="mt-8 text-center text-[14.5px] text-(--lp-ink-3)">
            <span className="font-medium text-(--lp-ink-2)">Mateo Sosa</span>, founder of Chalk
          </figcaption>
        </figure>
      </Container>
    </Section>
  );
}
