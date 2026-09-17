"use client";

import type { ReactNode } from "react";
import { BookOpenText, Check, FileText, Minus, Mic, Sigma, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Caption, Container, Label, Lede, Reveal, Section, Title } from "./Section";

// The four things a parent wants to know, each as a small settings card
// standing in a grey well, with the plain statement under it. Everything on
// these cards is true of the product today; nothing is a roadmap.

function Well({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[236px] items-end justify-center overflow-hidden rounded-[20px] bg-(--lp-gray) px-6 pt-6">
      <div className="w-full max-w-[236px] translate-y-3 rounded-[14px] border border-(--lp-line) bg-white shadow-(--lp-shadow-card)">{children}</div>
    </div>
  );
}

function CardHead({ icon: Icon, title, meta }: { icon: LucideIcon; title: string; meta?: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-(--lp-line) px-3.5 py-3">
      <span className="inline-flex size-7 items-center justify-center rounded-[8px] bg-(--lp-ink) text-white">
        <Icon size={14} strokeWidth={2.2} aria-hidden />
      </span>
      <span className="text-[13.5px] font-semibold text-(--lp-ink)">{title}</span>
      {meta && <span className="ml-auto text-[12px] text-(--lp-ink-3)">{meta}</span>}
    </div>
  );
}

function Row({ label, value, tone = "plain" }: { label: string; value: ReactNode; tone?: "plain" | "yes" | "no" | "sky" }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px]">
      <span className="text-(--lp-ink-2)">{label}</span>
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium",
          tone === "plain" && "bg-(--lp-gray) text-(--lp-ink)",
          tone === "yes" && "bg-[#e3f4ea] text-[#0f7a52]",
          tone === "no" && "bg-(--lp-gray) text-(--lp-ink-3)",
          tone === "sky" && "bg-(--lp-sky-soft) text-(--lp-sky-deep)",
        )}
      >
        {tone === "yes" && <Check size={12} strokeWidth={3} aria-hidden />}
        {tone === "no" && <Minus size={12} strokeWidth={3} aria-hidden />}
        {value}
      </span>
    </div>
  );
}

const TILES: { lead: string; body: string; card: ReactNode }[] = [
  {
    lead: "Hints, not answers.",
    body: "It asks for their attempt first and gives the smallest nudge that gets them moving. What they turn in is theirs.",
    card: (
      <>
        <CardHead icon={BookOpenText} title="How it helps" />
        <div className="py-1">
          <Row label="First" value="Your try" tone="sky" />
          <Row label="Then" value="A nudge" />
          <Row label="Then" value="A hint" />
          <Row label="The answer" value="Last resort" tone="no" />
        </div>
      </>
    ),
  },
  {
    lead: "Every session is written down.",
    body: "Open the transcript afterwards and read how it went, line by line, including where it got stuck.",
    card: (
      <>
        <CardHead icon={FileText} title="Wednesday" meta="14 min" />
        <div className="py-1">
          <Row label="Solving 2x + 3 = 11" value="Ended" />
          <Row label="Transcript" value="Open" tone="sky" />
          <Row label="Board" value="Saved" tone="yes" />
        </div>
      </>
    ),
  },
  {
    lead: "Voice isn't stored.",
    body: "What they said is kept as text so you can read it. The audio itself is not saved.",
    card: (
      <>
        <CardHead icon={Mic} title="What's kept" />
        <div className="py-1">
          <Row label="Voice audio" value="Not stored" tone="no" />
          <Row label="Transcript" value="Kept" tone="yes" />
          <Row label="Board" value="Kept" tone="yes" />
        </div>
      </>
    ),
  },
  {
    lead: "Math only, grades 5 to 12.",
    body: "Ask it about anything else and it says so, politely, and comes back to the math.",
    card: (
      <>
        <CardHead icon={Sigma} title="Subjects" />
        <div className="py-1">
          <Row label="Fractions" value="Yes" tone="yes" />
          <Row label="Algebra" value="Yes" tone="yes" />
          <Row label="Geometry" value="Yes" tone="yes" />
          <Row label="Essays" value="No" tone="no" />
        </div>
      </>
    ),
  },
];

export function ForParents() {
  return (
    <Section id="parents">
      <Container>
        <Reveal className="flex flex-col items-center text-center">
          <Label>For parents</Label>
          <Title className="max-w-[18ch]">Your kid does the work. You can see it.</Title>
          <Lede className="max-w-[48ch]">It guides instead of answering, writes every session down, and stays a math tutor.</Lede>
        </Reveal>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {TILES.map((t, i) => (
            <Reveal key={t.lead} delay={i * 0.07} className="flex flex-col">
              <Well>{t.card}</Well>
              <Caption lead={t.lead} className="mt-5 px-1">
                {t.body}
              </Caption>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
