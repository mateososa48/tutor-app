"use client";

import { Container, Label, Reveal, Section } from "./Section";

// The first thing after the hero: what is wrong with the usual help, and what
// Chalk does instead. A label on the left, two bold-lead paragraphs on the
// right, no heading: the paragraphs are the argument.

export function Intro() {
  return (
    <Section rule={false} className="py-16 sm:py-20">
      <Container className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)] lg:gap-16">
        <Reveal>
          <Label href="#how-it-works">Introducing Chalk</Label>
        </Reveal>
        <Reveal delay={0.08} className="flex flex-col gap-6 text-[1.0625rem] leading-[1.6] text-(--lp-ink-2) sm:text-[1.25rem]">
          <p>
            <strong className="font-semibold text-(--lp-ink)">Homework help is stuck in a chat box.</strong>{" "}
            You type the problem, it hands back a wall of steps, and the one line you were confused about scrolls past somewhere in the middle.
          </p>
          <p>
            <strong className="font-semibold text-(--lp-ink)">Chalk sits next to you instead.</strong>{" "}
            You say what you&rsquo;re stuck on, out loud. It answers in a voice, writes the step on a shared whiteboard as it explains, and stops so you can try
            the next one.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
