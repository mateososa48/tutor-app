"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Mic, Plus } from "lucide-react";
import { TutorPet, type PetState } from "@/components/board/TutorPet";
import { PetBubble, type BubbleKind, type BubbleSide } from "@/components/board/PetBubble";
import { FooterWave } from "@/components/landing/FooterWave";
import { VoiceWave } from "@/components/session/VoiceWave";
import { cn } from "@/lib/utils";

// Where the pet could live, at the size and on the surface it would really
// sit on. Nothing here is wired into the app: this page exists to choose.

const DOTS = {
  backgroundImage: "radial-gradient(rgba(18,18,21,0.11) 1px, transparent 1.2px)",
  backgroundSize: "18px 18px",
  backgroundPosition: "9px 9px",
} as const;

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
// The home card's own wave, copied from HomePage so this reads like the page.
const HOME_WAVE = { background: rgb("#ffffff"), top: rgb("#b2d6ff"), deep: rgb("#3a80ef"), ink: rgb("#3a80ef") };

// A pet with its bubble, in one positioned box.
function Pet({
  size,
  state,
  level,
  look,
  text,
  kind = "speech",
  side = "top",
  align = "start",
  open = true,
  maxWidth,
  className,
}: {
  size: number;
  state: PetState;
  level?: number;
  look?: { x: number; y: number };
  text?: string;
  kind?: BubbleKind;
  side?: BubbleSide;
  align?: "start" | "end";
  open?: boolean;
  maxWidth?: number;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-block", className)} style={{ width: size, height: size }}>
      <TutorPet size={size} state={state} level={level} look={look} />
      <PetBubble open={open} text={text} kind={kind} side={side} align={align} maxWidth={maxWidth} />
    </span>
  );
}

export default function Places() {
  return (
    <main className="lp min-h-dvh bg-(--lp-bg) px-6 py-10 text-(--lp-ink)">
      <div className="mx-auto max-w-[1040px]">
        <h1 className="lp-display m-0 text-[24px]">Where the pet goes</h1>
        <p className="m-0 mt-1 max-w-[62ch] text-[14px] text-(--lp-ink-2)">
          Each block is the real surface at its real size. Nothing is wired into the app yet — this is for picking.
        </p>

        <Bubbles />

        <Stage
          n={1}
          title="In the session, on the dock"
          verdict="Start here. The pet is the tutor's face beside its voice, it never covers the board, and the dock already knows what the tutor is doing."
        >
          <Board>
            <div className="absolute right-4 bottom-4 w-[380px]">
              <div className="relative">
                <Pet size={120} state="speaking" level={0.5} className="absolute -top-[96px] left-3 z-10" open={false} />
                <Dock badge="Speaking" />
              </div>
            </div>
          </Board>
        </Stage>

        <Stage
          n={2}
          title="In the session, on the board"
          verdict="More alive, more risk. Bottom left is where tldraw's badge lives and the rest is the student's work, so the pet would have to move out of the way of every drawing."
        >
          <Board>
            <BoardWork />
            <Pet size={120} state="writing" look={{ x: 0.8, y: -0.4 }} className="absolute bottom-3 left-4" open={false} />
            <div className="absolute right-4 bottom-4 w-[380px] opacity-90">
              <Dock badge="Writing on the board" />
            </div>
          </Board>
        </Stage>

        <Stage
          n={3}
          title="Home, on the start card"
          verdict="The one place a mascot earns its keep on a home screen: it makes the primary action feel answered rather than clicked."
        >
          <div className="max-w-[560px]">
            <StartCard />
          </div>
        </Stage>

        <Stage n={4} title="Landing, in the hero demo" verdict="Free reach: the demo already replays a lesson, so the pet reacts to it. It also shows the collision to settle first — the tutor already has a presence on the board, the pen and its name tag.">
          <div className="relative w-full max-w-[640px] overflow-hidden rounded-[16px] border border-(--lp-line) bg-white">
            <Image src="/landing/session-board.png" alt="" width={1200} height={760} className="block h-auto w-full" />
            <Pet size={120} state="thinking" kind="thought" side="left" align="end" className="absolute right-[3%] bottom-[4%]" />
          </div>
        </Stage>

        <Stage n={5} title="Welcome, at the mic check" verdict="The strongest first impression: the pet reacts to the student's own voice, before any session costs anything.">
          <MicCheck />
        </Stage>

        <Stage n={6} title="Waiting and empty states" verdict="Cheap and kind. A held pose plus one line beats a spinner or a grey box.">
          <div className="flex flex-wrap gap-4">
            <Panel label="Opening a session">
              <Pet size={120} state="thinking" kind="thought" side="right" align="start" />
            </Panel>
            <Panel label="No past sessions yet">
              <Pet size={120} state="hello" text="Nothing here yet. Want to start?" side="top" align="start" maxWidth={190} />
            </Panel>
          </div>
        </Stage>
      </div>
    </main>
  );
}

// ── The bubble on its own ──────────────────────────────────────────────────

const LINES = [
  "Nice — that's the one.",
  "What do you get when you take 3 from both sides?",
  "Your turn.",
  "Let's put that on the board and look at it together.",
];

type Show = "speech" | "thought" | "dots";

function Bubbles() {
  const [i, setI] = useState(0);
  const [show, setShow] = useState<Show>("speech");
  const kind: BubbleKind = show === "speech" ? "speech" : "thought";
  const [open, setOpen] = useState(true);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || show === "dots") return;
    const id = setInterval(() => setI((v) => (v + 1) % LINES.length), 2600);
    return () => clearInterval(id);
  }, [auto, show]);

  return (
    <section className="mt-8 rounded-[20px] border border-(--lp-line) bg-white p-6">
      <h2 className="lp-display m-0 text-[16px]">The bubble</h2>
      <p className="m-0 mt-1 text-[13.5px] text-(--lp-ink-2)">
        It grows out of the pet, the words arrive one at a time, and it resizes on a spring when the line changes.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip active={show === "speech"} onClick={() => setShow("speech")}>speech</Chip>
        <Chip active={show === "thought"} onClick={() => setShow("thought")}>thought cloud</Chip>
        <Chip active={show === "dots"} onClick={() => setShow("dots")}>thinking</Chip>
        <span className="mx-2 h-4 w-px bg-(--lp-line)" />
        <Chip active={auto} onClick={() => setAuto((v) => !v)}>cycle lines</Chip>
        <Chip active={false} onClick={() => setI((v) => (v + 1) % LINES.length)}>next line</Chip>
        <Chip active={false} onClick={() => { setOpen(false); setTimeout(() => setOpen(true), 260); }}>replay</Chip>
      </div>

      <div className="mt-6 grid gap-6 rounded-[16px] border border-(--lp-line) p-8 sm:grid-cols-3" style={DOTS}>
        {(["top", "right", "left"] as BubbleSide[]).map((side) => (
          <div key={side} className="flex min-h-[230px] items-center justify-center">
            <Pet
              size={120}
              state={show === "speech" ? "speaking" : "thinking"}
              level={0.45}
              text={show === "dots" ? undefined : LINES[i]}
              kind={kind}
              side={side}
              align={side === "left" ? "end" : "start"}
              open={open}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Surfaces ───────────────────────────────────────────────────────────────

function Board({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-[16px] border border-(--lp-line) bg-white" style={DOTS}>
      {children}
    </div>
  );
}

// Enough of the session dock to judge the pet against it: the badge, the
// tutor's wave and the mic.
function Dock({ badge }: { badge: string }) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-(--lp-line-strong) bg-white shadow-[0_1px_2px_rgba(18,18,21,0.05),0_10px_28px_rgba(18,18,21,0.08)]">
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-(--lp-line) px-2.5 py-1 text-[12.5px] text-(--lp-ink-2)">
          <span className="size-1.5 rounded-full bg-(--lp-sky)" />
          {badge}
        </span>
      </div>
      <div className="mt-3 h-[64px]">
        <VoiceWave analyser={null} speaking />
      </div>
      <div className="flex items-center justify-between px-4 pt-3 pb-3.5">
        <span className="text-[12.5px] text-(--lp-ink-3)">00:42</span>
        <span className="flex size-10 items-center justify-center rounded-full bg-(--lp-ink) text-white">
          <Mic className="size-4.5" strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

// A little of the tutor's handwriting, so the board is not empty behind the pet.
function BoardWork() {
  return (
    <div className="pointer-events-none absolute top-8 left-8 select-none">
      <p className="lp-hand m-0 text-[19px] text-(--lp-ink)">2x + 5 = 19</p>
      <p className="lp-hand m-0 mt-2 text-[19px] text-(--lp-ink-2)">2x = 14</p>
      <p className="lp-hand m-0 mt-2 text-[19px] text-(--lp-ink-3)">x = ?</p>
    </div>
  );
}

function StartCard() {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative isolate flex h-[212px] w-full flex-col justify-start overflow-hidden rounded-[20px] border border-(--lp-line) bg-(--lp-surface) p-6 text-left sm:p-7"
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[60%]">
        <FooterWave className="absolute inset-0" {...HOME_WAVE} edge={18} swing={1.7} reserve={30} waveScale={2.2} speed={1.9} ramp={0.38} />
      </span>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="lp-display m-0 text-[20px]">Start a new session</p>
          <p className="m-0 mt-1 text-[14px] text-(--lp-ink-2)">Talk it through on the board.</p>
        </div>
        <span className="flex size-11 items-center justify-center rounded-full bg-[linear-gradient(180deg,#2c2c32_0%,#19191d_100%)] text-white">
          <Plus className="size-5" strokeWidth={2.4} />
        </span>
      </div>
      <Pet
        size={120}
        state={hover ? "hello" : "idle"}
        text="Ready when you are."
        side="left"
        align="start"
        open={hover}
        className="absolute right-[18px] bottom-[26px]"
      />
    </div>
  );
}

// The welcome page's mic check, with the pet listening to the real level.
function MicCheck() {
  const [level, setLevel] = useState(0);
  const [on, setOn] = useState(false);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  const listen = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += (v - 128) * (v - 128);
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) / 24));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      setOn(true);
      stop.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
    } catch {
      setOn(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-8 rounded-[16px] border border-(--lp-line) bg-white p-8 pt-16">
      {/* The bubble sits above the pet in its own column, or it reaches across
          the copy beside it. */}
      <div className="flex w-[230px] justify-start">
        <Pet
          size={120}
          state={on ? (level > 0.12 ? "listening" : "idle") : "hello"}
          level={level}
          text={on ? (level > 0.12 ? "I can hear you." : "Say something.") : "Let's check your mic."}
          side="top"
          align="start"
          maxWidth={190}
        />
      </div>
      <div className="min-w-[240px] flex-1">
        <p className="lp-display m-0 text-[18px]">Can you hear me?</p>
        <p className="m-0 mt-1 text-[14px] text-(--lp-ink-2)">Turn on the mic and say hello. The pet reacts to your own voice.</p>
        <button
          type="button"
          onClick={on ? () => { stop.current?.(); stop.current = null; setOn(false); setLevel(0); } : listen}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-[10px] bg-(--lp-ink) px-4 text-[14px] font-medium text-white"
        >
          <Mic className="size-4" />
          {on ? "Stop" : "Turn on the mic"}
        </button>
      </div>
    </div>
  );
}

// ── Bits ───────────────────────────────────────────────────────────────────

function Stage({ n, title, verdict, children }: { n: number; title: string; verdict: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <div className="flex items-baseline gap-3">
        <span className="text-[13px] text-(--lp-ink-3)">{n}</span>
        <h2 className="lp-display m-0 text-[17px]">{title}</h2>
      </div>
      <p className="m-0 mt-1 max-w-[70ch] text-[13.5px] text-(--lp-ink-2)">{verdict}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[150px] min-w-[280px] flex-1 flex-col items-start justify-center gap-3 rounded-[16px] border border-dashed border-(--lp-line-strong) bg-white px-8 py-6 pt-16">
      {children}
      <span className="text-[12.5px] text-(--lp-ink-3)">{label}</span>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-[8px] border px-3 text-[13px] transition-colors",
        active ? "border-(--lp-ink) bg-(--lp-ink) text-white" : "border-(--lp-line-strong) bg-white text-(--lp-ink-2) hover:text-(--lp-ink)",
      )}
    >
      {children}
    </button>
  );
}
