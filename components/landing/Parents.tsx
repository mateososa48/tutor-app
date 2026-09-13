"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";

const POINTS = [
  ["Homework stays theirs", "Chalk guides. It never hands over the answer, so what your kid turns in is their own work."],
  ["Patient at 9 pm on the fifth try", "No sighing, no rushing. When something does not land, it finds a smaller step."],
  ["You can read the session", "Every session keeps a transcript you can open. Voice audio is never stored."],
] as const;

const LINES = [
  { who: "you", text: "I don't get why the 3 moves to the other side." },
  { who: "tutor", text: "Let's not move it yet. What's the opposite of adding three?" },
  { who: "you", text: "subtracting 3?" },
  { who: "tutor", text: "Exactly. Do that to both sides and read me what's left." },
];

// What a parent actually opens after a session: the recap card.
function RecapCard() {
  const reduce = useReducedMotion();
  return (
    <div className="lp-frame">
      <div className="lp-card overflow-hidden rounded-[20px]">
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--lp-line)" }}>
          <div>
            <p className="lp-display text-[15px]">Solving 2x + 3 = 11</p>
            <p className="mt-0.5 text-[12px] text-(--lp-ink-3)">Wednesday, 7:42 pm, 14 min</p>
          </div>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--lp-sky-soft)", color: "var(--lp-sky-deep)" }}>
            Algebra
          </span>
        </div>

        <ul className="flex flex-col gap-3 px-5 py-4">
          {LINES.map((l, i) => (
            <motion.li
              key={l.text}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.45, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className={l.who === "you" ? "text-[13.5px] italic text-(--lp-ink-2)" : "flex gap-2.5 text-[13.5px] leading-[1.45] font-medium"}
            >
              {l.who === "tutor" && <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-(--lp-ink)" aria-hidden />}
              {l.text}
            </motion.li>
          ))}
        </ul>

        <div className="border-t px-5 py-4" style={{ borderColor: "var(--lp-line)", background: "var(--lp-bg)" }}>
          <p className="mb-2 text-[10.5px] font-semibold tracking-[0.08em] text-(--lp-ink-3) uppercase">What clicked</p>
          <p className="flex items-start gap-2.5 text-[13.5px] leading-[1.45]">
            <span className="mt-[2px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--lp-sky-soft)", color: "var(--lp-sky-deep)" }}>
              <Check size={10} strokeWidth={3} aria-hidden />
            </span>
            Undoing an operation on both sides, after two tries.
          </p>
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
