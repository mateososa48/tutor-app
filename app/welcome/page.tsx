"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "motion/react";
import { ArrowRight, LoaderCircle, MessageCircle, Mic, PenLine, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OnboardingFrame } from "@/components/onboarding/OnboardingFrame";
import { MicCheck } from "@/components/onboarding/MicCheck";
import { useReduce } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";
import { draftFromProfile, FREE_LINE, INTERESTS, INTERESTS_MAX, onboardingNotes, type OnboardingDraft } from "@/lib/onboarding";

// The brief before someone's first session, whoever presses start: the
// student who just signed up, the child a parent set up who opens it later,
// or a parent trying it themselves. Three things to know, a mic check so the
// browser's permission popup arrives with context, and what they are into,
// which the tutor uses quietly for examples. Then the intake asks what they
// are working on, with starter topics if they have nothing in mind.
// /session sends anyone with no sessions here; the button goes back with
// ?ready=1 so it does not send them again.

type Profile = { displayName: string | null; gradeLevel: string | null; onboarding: unknown } | null;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// A one-time entrance: the pieces arrive in reading order, 80ms apart, so
// the sequence carries the hierarchy. Nothing moves under reduced motion.
function listVariants(reduce: boolean): Variants {
  return {
    hidden: {},
    show: { transition: reduce ? {} : { staggerChildren: 0.08, delayChildren: 0.05 } },
  };
}
function itemVariants(reduce: boolean): Variants {
  return {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 10, filter: "blur(3px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: reduce ? { duration: 0 } : { duration: 0.42, ease: EASE_OUT } },
  };
}

const POINTS: { icon: LucideIcon; lead: string; text: string }[] = [
  { icon: Mic, lead: "You talk, it talks back.", text: "Chalk listens through your mic and answers out loud. Your browser will ask about the mic, so let's do that now." },
  { icon: PenLine, lead: "It writes as it explains.", text: "Every step goes on the whiteboard, so you can see it, not just hear it." },
  { icon: MessageCircle, lead: "It won't just hand you the answer.", text: "It asks what you think first and gives hints when you're stuck. That's the part that sticks." },
];

export default function WelcomePage() {
  const router = useRouter();
  const reduce = useReduce() ?? false;
  const [preview] = useState(
    () =>
      typeof window !== "undefined" &&
      process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).get("preview") === "1",
  );
  const [profile, setProfile] = useState<Profile | undefined>(undefined);
  const [interests, setInterests] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/onboarding")
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Profile) => {
        if (!live) return;
        setProfile(p);
        setInterests(draftFromProfile(p).interests);
      })
      .catch(() => live && setProfile(null));
    return () => {
      live = false;
    };
  }, []);

  const draft: OnboardingDraft = { ...draftFromProfile(profile ?? null), interests };
  const notes = onboardingNotes(draft);

  function toggle(interest: string) {
    setInterests((list) =>
      list.includes(interest) ? list.filter((i) => i !== interest) : list.length >= INTERESTS_MAX ? list : [...list, interest],
    );
  }

  async function start() {
    if (starting) return;
    setStarting(true);
    // Interests are nice to have; a failed save must not hold the session up.
    if (!preview) {
      try {
        await fetch("/api/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interests }),
        });
      } catch {
        // The session starts anyway.
      }
    }
    // Preview goes the same way; /session only creates one on submit.
    router.push("/session?ready=1");
  }

  const list = listVariants(reduce);
  const item = itemVariants(reduce);

  return (
    <OnboardingFrame notes={notes} dense>
      <motion.div variants={list} initial="hidden" animate="show" className="mt-7">
        <motion.h1
          variants={item}
          className="lp-display m-0 text-[28px] leading-[1.15] tracking-[-0.02em] text-balance sm:text-[31px]"
        >
          Here&apos;s how your tutor works.
        </motion.h1>
        <motion.p variants={item} className="m-0 mt-2.5 text-[15px] leading-[1.5] text-(--lp-ink-2)">
          Three things, then you&apos;re in.
        </motion.p>

        <ol className="m-0 mt-6 flex list-none flex-col gap-4 p-0">
          {POINTS.map(({ icon: Icon, lead, text }) => (
            <motion.li key={lead} variants={item} className="flex gap-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-(--lp-sky-deep)" strokeWidth={2} aria-hidden />
              <p className="m-0 text-[15px] leading-[1.5] text-(--lp-ink-2)">
                <strong className="font-semibold text-(--lp-ink)">{lead}</strong> {text}
              </p>
            </motion.li>
          ))}
        </ol>

        <motion.div variants={item} className="mt-6">
          <MicCheck />
        </motion.div>

        <motion.div variants={item} className="mt-7">
          <h2 className="m-0 text-[16px] font-semibold leading-[1.3] text-(--lp-ink)">What are you into?</h2>
          <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-(--lp-ink-2)">Optional. It keeps the examples from being boring.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {INTERESTS.map((interest) => {
              const on = interests.includes(interest);
              return (
                <button
                  key={interest}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(interest)}
                  className={cn(
                    "inline-flex h-11 items-center rounded-[10px] border px-3.5 text-[14px] font-medium outline-none",
                    "transition-[background-color,border-color,scale] duration-150 ease-out active:scale-[0.96]",
                    "focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) motion-reduce:transition-none motion-reduce:active:scale-100",
                    on ? "border-(--lp-sky) bg-(--lp-sky-soft) text-(--lp-ink)" : "border-(--lp-line-strong) bg-white text-(--lp-ink) hover:border-(--lp-ink)/30",
                  )}
                >
                  {interest}
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.div variants={item} className="mt-7">
          <Button
            type="button"
            onClick={() => void start()}
            disabled={starting}
            className="btn-gloss-lift h-11 w-full gap-2 rounded-[10px] text-[14px] font-semibold sm:w-auto sm:px-5"
          >
            {starting ? (
              <>
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                Opening…
              </>
            ) : (
              <>
                Start my first session
                <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
              </>
            )}
          </Button>
          <p className="m-0 mt-4 text-[13px] text-(--lp-ink-3)">{FREE_LINE}</p>
        </motion.div>
      </motion.div>
    </OnboardingFrame>
  );
}
