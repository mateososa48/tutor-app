"use client";

import type { ReactNode } from "react";
import { TutorPet, type PetState } from "@/components/board/TutorPet";
import { PetBubble, type BubbleKind, type BubbleSide } from "@/components/board/PetBubble";
import { cn } from "@/lib/utils";
import { Label, Lede, Title } from "../Section";
import { useReduce } from "../useScript";

/** The section's heading. The title is Mateo's own line (Sept 21); its sky
    underline on "human" came off on Sept 22 at his request. */
export function HowHeading({ lede, className }: { lede?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>How it works</Label>
      <Title className="max-w-[30ch]">Talk to it like a human tutor.</Title>
      {lede && <Lede>{lede}</Lede>}
    </div>
  );
}

/* The pet with something to say. It stays 120px (Mateo, Sept 20): smaller and
   it reads as an icon. */
export function PetSays({
  state,
  text,
  open = true,
  kind = "speech",
  side = "right",
  align = "end",
  maxWidth = 260,
  look = { x: 0.3, y: 0.2 },
  className,
}: {
  state: PetState;
  text?: string;
  open?: boolean;
  kind?: BubbleKind;
  side?: BubbleSide;
  align?: "start" | "end";
  maxWidth?: number;
  look?: { x: number; y: number };
  className?: string;
}) {
  const reduce = useReduce();
  return (
    <div className={cn("relative size-[120px] shrink-0", className)}>
      <TutorPet shape="square" state={state} level={state === "speaking" ? 0.55 : 0} look={look} size={120} reduceMotion={!!reduce} />
      <PetBubble open={open} text={text} kind={kind} side={side} align={align} maxWidth={maxWidth} />
    </div>
  );
}
