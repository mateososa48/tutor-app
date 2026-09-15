"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import Magnet from "@/components/Magnet";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";
import { useReduce } from "./useScript";

// The FAQ as a chat thread, the layout and motion of React Bits Pro "FAQ 2"
// (rebuilt by eye, no code copied) in our own parts: the page's section heading,
// the pressed `.lp-btn` CTAs, questions in the soft grey chip the app's transcript
// uses for the student, the shadcn outline icon button, and the answer as a sky
// reply. One answer open at a time. Timings were measured frame by frame on the
// original: height 400 ms and the reply's scale/drop 300 ms on the standard
// curve, the fade 300 ms ease-in-out.

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

const STANDARD = [0.4, 0, 0.2, 1] as const;
const IN_OUT = [0.42, 0, 0.58, 1] as const;
// A deeper sky than --lp-sky-deep so white text on the reply passes 4.5:1 (4.7:1).
const REPLY = "#1d72dc";

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  const reduce = useReduce();
  const base = useId();
  const toggle = (i: number) => setOpen((cur) => (cur === i ? null : i));

  return (
    <section id="faq" className="scroll-mt-24 py-16 sm:py-24">
      <div className="mx-auto grid max-w-[1180px] gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <BlurFade inView>
            <h2 className="lp-display max-w-[16ch] text-[clamp(2rem,3.6vw,3rem)] leading-[1.06]">Ready to try it?</h2>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Magnet padding={48} magnetStrength={22} disabled={!!reduce}>
                <Link href="/signin" className="lp-btn">
                  Try a session free
                  <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
                </Link>
              </Magnet>
              <a href="#how-it-works" className="lp-btn lp-btn-quiet">
                See how it works
              </a>
            </div>
          </BlurFade>
        </div>

        <div className="flex flex-col gap-7">
          {ITEMS.map((item, i) => {
            const isOpen = open === i;
            const answerId = `${base}-a${i}`;
            return (
              <div key={item.q} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => toggle(i)}
                    className="group/q max-w-[85%] cursor-pointer rounded-[12px] text-left outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) sm:max-w-[75%]"
                  >
                    <div
                      className={cn(
                        "rounded-[12px] border px-4 py-3 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] sm:px-5 sm:py-3.5",
                        isOpen
                          ? "border-(--lp-sky)/40 bg-(--lp-sky-soft)"
                          : "border-transparent bg-(--lp-gray) group-hover/q:bg-(--lp-gray-2)",
                      )}
                    >
                      <p className="m-0 text-[15px] leading-relaxed font-medium text-(--lp-ink) sm:text-[16px]">{item.q}</p>
                    </div>
                  </button>
                  {/* The same toggle for the pointer; keyboard users get one stop, the question. */}
                  <Button
                    variant="outline"
                    size="icon-sm"
                    tabIndex={-1}
                    aria-hidden
                    onClick={() => toggle(i)}
                    className={cn(
                      "mt-3 size-6 text-(--lp-ink-2) transition-colors duration-200 sm:size-7",
                      isOpen && "border-(--lp-sky)/50 bg-(--lp-sky-tint) text-(--lp-sky-deep) hover:border-(--lp-sky) hover:bg-(--lp-sky-soft) hover:text-(--lp-sky-deep)",
                    )}
                  >
                    {isOpen ? <Minus strokeWidth={2.4} /> : <Plus strokeWidth={2.4} />}
                  </Button>
                </div>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="answer"
                      id={answerId}
                      role="region"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={
                        reduce
                          ? { height: { duration: 0 }, opacity: { duration: 0.15 } }
                          : { height: { duration: 0.4, ease: STANDARD }, opacity: { duration: 0.3, ease: IN_OUT } }
                      }
                      className="flex flex-col overflow-hidden"
                    >
                      <motion.div
                        initial={reduce ? false : { scale: 0.2, y: -10 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={reduce ? undefined : { scale: 0.5, y: -10 }}
                        transition={{ duration: 0.3, ease: STANDARD }}
                        className="mt-4 max-w-[85%] self-end sm:max-w-[75%]"
                      >
                        <div className="rounded-[12px] px-4 py-3 sm:px-5 sm:py-3.5" style={{ backgroundColor: REPLY }}>
                          <p className="m-0 text-[15px] leading-relaxed text-white sm:text-[16px]">{item.a}</p>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
