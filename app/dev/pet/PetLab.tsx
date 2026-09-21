"use client";

import { useEffect, useRef, useState } from "react";
import { TutorPet, type PetShape, type PetState } from "@/components/board/TutorPet";
import { PetBubble } from "@/components/board/PetBubble";
import { cn } from "@/lib/utils";

const SHAPES: PetShape[] = ["circle", "square", "triangle"];
const STATES: PetState[] = ["idle", "listening", "thinking", "speaking", "writing", "happy", "hello", "puzzled", "surprised", "sleepy", "arrive"];
const SIZES = [40, 56, 80, 120];

// What the bubble says per state. Captions carry the tutor's words, so the
// bubble only ever shows state: dots while thinking, a short word otherwise.
const BUBBLE: Partial<Record<PetState, "dots" | string>> = { thinking: "dots", listening: "Your turn", happy: "Nice!", hello: "Hi!", puzzled: "Hmm?", surprised: "Oh!", sleepy: "zzz" };

const DOTS = {
  backgroundImage: "radial-gradient(rgba(18,18,21,0.11) 1px, transparent 1.2px)",
  backgroundSize: "18px 18px",
  backgroundPosition: "9px 9px",
} as const;

export default function PetLab() {
  const [shape, setShape] = useState<PetShape>("square");
  const [state, setState] = useState<PetState>("idle");
  const [size, setSize] = useState(80);
  const [reduce, setReduce] = useState(false);
  const [level, setLevel] = useState(0);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);

  // A synthetic voice while "speaking", the same curve the dock uses in previews.
  useEffect(() => {
    if (state !== "speaking") return;
    let raf = 0;
    const tick = (now: number) => {
      const s = now / 1000;
      const v = 0.42 + 0.26 * Math.sin(s * 7.3) * Math.sin(s * 2.1) + 0.14 * Math.sin(s * 13.7 + 1.3);
      setLevel(Math.max(0, Math.min(1, v)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const bubble = BUBBLE[state];

  return (
    <main className="lp min-h-dvh bg-(--lp-bg) px-6 py-10 text-(--lp-ink)">
      <div className="mx-auto max-w-[880px]">
        <h1 className="lp-display m-0 text-[24px]">Pet lab</h1>
        <p className="m-0 mt-1 text-[14px] text-(--lp-ink-2)">Move the mouse over the board to change where it looks. Nothing here is wired to a session.</p>

        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
          <Group label="Shape">
            {SHAPES.map((s) => (
              <Chip key={s} active={shape === s} onClick={() => setShape(s)}>{s}</Chip>
            ))}
          </Group>
          <Group label="State">
            {STATES.map((s) => (
              <Chip key={s} active={state === s} onClick={() => setState(s)}>{s}</Chip>
            ))}
          </Group>
          <Group label="Size">
            {SIZES.map((s) => (
              <Chip key={s} active={size === s} onClick={() => setSize(s)}>{s}px</Chip>
            ))}
          </Group>
          <Group label="Motion">
            <Chip active={!reduce} onClick={() => setReduce(false)}>full</Chip>
            <Chip active={reduce} onClick={() => setReduce(true)}>reduced</Chip>
          </Group>
        </div>

        <div
          ref={stageRef}
          data-stage
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setLook({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) });
          }}
          onMouseLeave={() => setLook({ x: 0, y: 0 })}
          className="relative mt-6 h-[360px] overflow-hidden rounded-[20px] border border-(--lp-line) bg-white"
          style={DOTS}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="relative block" style={{ width: size, height: size }}>
              <TutorPet shape={shape} state={state} level={state === "speaking" ? level : 0} look={look} size={size} reduceMotion={reduce} />
              <PetBubble
                open={Boolean(bubble)}
                text={bubble === "dots" ? undefined : bubble}
                kind={bubble === "dots" ? "thought" : "speech"}
                side="right"
                align="start"
              />
            </span>
          </div>
        </div>

        <h2 className="lp-display m-0 mt-10 text-[16px]">Side by side, idle</h2>
        <div className="mt-3 flex flex-wrap gap-6">
          {SHAPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setShape(s)}
              className={cn(
                "flex w-[160px] cursor-pointer flex-col items-center gap-3 rounded-[16px] border p-5 outline-none transition-colors hover:bg-(--lp-gray)/60 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
                shape === s ? "border-(--lp-sky) bg-(--lp-sky-tint)" : "border-(--lp-line) bg-white",
              )}
            >
              <TutorPet shape={s} state="idle" size={72} reduceMotion={reduce} />
              <span className="text-[13px] text-(--lp-ink-2)">{s}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="m-0 mb-1.5 text-[12px] font-medium text-(--lp-ink-2)">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-3 py-1.5 text-[13px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
        active ? "bg-(--lp-sky-soft) text-(--lp-ink) shadow-[inset_0_0_0_1px_var(--lp-sky)]" : "bg-(--lp-gray) text-(--lp-ink-2) hover:bg-(--lp-gray-2) hover:text-(--lp-ink)",
      )}
    >
      {children}
    </button>
  );
}
