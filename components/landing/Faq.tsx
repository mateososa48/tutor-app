"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReduce } from "./useScript";

// A chat thread, rebuilt by eye from React Bits Pro "FAQ 2" (no code copied):
// each question is a grey bubble; opening it tints the bubble sky and grows the
// answer in underneath as a blue reply on the right. One answer open at a time.
// Timings were measured frame by frame on the original: height 400 ms and the
// reply's scale/drop 300 ms on the standard curve, the fade 300 ms ease-in-out.

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
// The original's blue-500 reply gives white text 3.7:1; this deeper sky gives 4.7:1.
const REPLY = "#1d72dc";

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  const reduce = useReduce();
  const base = useId();
  const toggle = (i: number) => setOpen((cur) => (cur === i ? null : i));

  return (
    <section id="faq" className="scroll-mt-24 bg-(--lp-ink) px-4 py-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-12 lg:grid-cols-[auto_1fr] lg:gap-16">
          <div className="flex flex-col lg:sticky lg:top-24 lg:self-start">
            <h2
              className="m-0 text-[48px] leading-[60px] font-medium tracking-[-0.04em] text-white"
              style={{ fontFamily: "var(--lp-font-display), var(--lp-font-body), system-ui, sans-serif" }}
            >
              Ready to try it?
            </h2>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/signin"
                className="rounded-full border border-white bg-white px-6 py-3 text-center text-[14px] leading-5 font-medium text-(--lp-ink) transition-colors duration-200 hover:border-[#e4e4e7] hover:bg-[#e4e4e7] sm:px-8 sm:py-3.5 sm:text-[16px] sm:leading-6"
              >
                Try a session free
              </Link>
              <a
                href="#how-it-works"
                className="group flex items-center justify-center gap-2 rounded-full border border-[#3f3f46] px-6 py-3 text-[14px] leading-5 font-medium text-white transition-colors duration-200 hover:bg-white/[0.06] sm:px-8 sm:py-3.5 sm:text-[16px] sm:leading-6"
              >
                <span>See how it works</span>
                <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            </div>
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
                      className="group/q max-w-[85%] cursor-pointer rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-(--lp-sky) focus-visible:ring-offset-2 focus-visible:ring-offset-(--lp-ink) sm:max-w-[75%]"
                    >
                      <div
                        className={cn(
                          "rounded-full border px-4 py-3 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] sm:px-5 sm:py-3.5",
                          isOpen
                            ? "border-(--lp-sky)/30 bg-(--lp-sky)/10"
                            : "border-transparent bg-[#27272a] group-hover/q:bg-[#3f3f46]",
                        )}
                      >
                        <p
                          className={cn(
                            "m-0 text-[14px] leading-relaxed transition-colors duration-200 sm:text-[16px]",
                            isOpen ? "text-(--lp-sky)" : "text-white",
                          )}
                        >
                          {item.q}
                        </p>
                      </div>
                    </button>
                    {/* The same toggle for the pointer; keyboard users get one stop, the bubble. */}
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden
                      onClick={() => toggle(i)}
                      className={cn(
                        "mt-3 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors duration-200 sm:size-7",
                        isOpen
                          ? "border-(--lp-sky)/50 text-(--lp-sky) hover:border-(--lp-sky)"
                          : "border-[#52525b] text-[#a1a1aa] hover:border-[#a1a1aa]",
                      )}
                    >
                      {isOpen ? <Minus className="size-3 sm:size-3.5" /> : <Plus className="size-3 sm:size-3.5" />}
                    </button>
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
                          <div className="rounded-[20px] px-4 py-3 sm:px-5 sm:py-3.5" style={{ backgroundColor: REPLY }}>
                            <p className="m-0 text-[14px] leading-relaxed text-white sm:text-[16px]">{item.a}</p>
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
      </div>
    </section>
  );
}
