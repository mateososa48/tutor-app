"use client";

import { Accordion } from "@base-ui/react/accordion";
import { Plus } from "lucide-react";
import { Container, Label, Lede, Reveal, Section, Title } from "./Section";

// Questions as hairline rows: the heading stays put on the left, the rows open
// one at a time on the right, the plus turning into a cross. Base UI's
// accordion does the state and the keyboard; the height comes from its
// measured panel variable so the open is a real transition, not a keyframe.

const ITEMS = [
  {
    q: "Does it just give my kid the answer?",
    a: "No. Chalk asks for their attempt first, then gives the smallest hint that lets them take the next step. It only explains directly as a last resort, and then checks again with a fresh problem.",
  },
  {
    q: "What subjects and grades does it cover?",
    a: "Math, from upper elementary through high school: arithmetic, fractions and decimals, percent and ratios, negatives, algebra, geometry, graphs, and the basics of statistics. It is a math tutor only. Bring the actual homework and it adapts to the level.",
  },
  {
    q: "Can I upload a photo of the worksheet?",
    a: "Yes. Drop a photo, a PDF, or a text file into the session. Chalk reads it, asks which problem you want, and puts that problem on the board.",
  },
  {
    q: "What can parents see?",
    a: "Every session keeps a written transcript you can open afterwards. Voice audio is not stored.",
  },
  {
    q: "What does it cost?",
    a: "Sessions are free to try right now. Pricing will be posted here before anything changes.",
  },
];

export function Faq() {
  return (
    <Section id="faq">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <Label>Questions</Label>
          <Title className="max-w-[14ch]">What people ask before trying it.</Title>
          <Lede>Short answers. The rest is quicker to find out in a session.</Lede>
        </Reveal>

        <Reveal delay={0.08}>
          <Accordion.Root className="flex flex-col border-t border-(--lp-line-strong)">
            {ITEMS.map((item) => (
              <Accordion.Item key={item.q} className="border-b border-(--lp-line-strong)">
                <Accordion.Header className="m-0">
                  <Accordion.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) sm:py-6">
                    <span className="text-[17px] font-medium text-(--lp-ink) transition-colors duration-150 group-hover:text-(--lp-sky-deep) sm:text-[18px]">
                      {item.q}
                    </span>
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-(--lp-line-strong) text-(--lp-ink-2) transition-[transform,background-color,color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:bg-(--lp-gray) group-data-[panel-open]:rotate-45 group-data-[panel-open]:bg-(--lp-ink) group-data-[panel-open]:text-white">
                      <Plus size={15} strokeWidth={2.4} aria-hidden />
                    </span>
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel className="h-(--accordion-panel-height) overflow-hidden transition-[height,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0 motion-reduce:transition-none">
                  <p className="m-0 max-w-[58ch] pb-6 text-[15.5px] leading-[1.6] text-(--lp-ink-2)">{item.a}</p>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </Reveal>
      </Container>
    </Section>
  );
}
