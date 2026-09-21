"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ArrowRight, ChevronLeft, GraduationCap, LoaderCircle, Plus, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingFrame } from "@/components/onboarding/OnboardingFrame";
import { OptionGrid } from "@/components/onboarding/OptionGrid";
import { TutorNotesBoard } from "@/components/onboarding/TutorNotesBoard";
import { useReduce } from "@/lib/reduced-motion";
import {
  CONCERNS,
  EMPTY_DRAFT,
  FREE_LINE,
  GRADE_OPTIONS,
  NOTE_MAX,
  onboardingNotes,
  type ConcernKey,
  type OnboardedBy,
  type OnboardingDraft,
} from "@/lib/onboarding";

// The first thing a new account sees. One question a screen, in the frame the
// sign-in page and /welcome share. The first screen asks who is here: a
// student answers a name and a grade and goes on to /welcome, the brief
// before a first session; a parent answers the child's name and grade, then
// what is going on, and hands the device over. Nothing is a preference or an
// ability rating (lib/onboarding.ts says why).
//
// On the panel the tutor takes notes as the answers come in, in the same
// handwriting the settings page uses for "what your tutor reads". For a
// parent's answer the note is the rule the tutor will follow: check it
// myself. That is the whole idea of the flow, made visible.

type Step = "who" | "name" | "grade" | "concern" | "handoff";

const BACK: Partial<Record<Step, Step>> = { name: "who", grade: "name", concern: "grade" };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// A screen rises out of a slight blur and its pieces follow each other; it
// leaves faster and softer than it came. Under reduced motion only opacity.
function stepVariants(reduce: boolean): Variants {
  return {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(4px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: reduce ? { duration: 0.15 } : { type: "spring", duration: 0.34, bounce: 0, staggerChildren: 0.07 },
    },
    exit: reduce
      ? { opacity: 0, transition: { duration: 0.1 } }
      : { opacity: 0, y: -6, filter: "blur(2px)", transition: { duration: 0.14, ease: EASE_OUT } },
  };
}

function itemVariants(reduce: boolean): Variants {
  return {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(3px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: reduce ? { duration: 0.15 } : { type: "spring", duration: 0.34, bounce: 0 },
    },
  };
}

const GRADE_CHIPS = GRADE_OPTIONS.map((g) => ({ value: g.value, label: g.label, wide: !/grade$/.test(g.value) }));
const CONCERN_CHIPS = CONCERNS.map((c) => ({ value: c.key, label: c.label }));

export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const reduce = useReduce() ?? false;

  // In development, /onboarding?preview=1 walks the flow from an onboarded
  // account without writing anything (proxy.ts lets the page through).
  const [preview] = useState(
    () =>
      typeof window !== "undefined" &&
      process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).get("preview") === "1",
  );
  const [step, setStep] = useState<Step>("who");
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [noteOpen, setNoteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parent = draft.by === "parent";
  const first = draft.name.trim().split(/\s+/)[0] || "";
  const notes = onboardingNotes(draft);
  const item = itemVariants(reduce);

  // Switching roles changes what every later question means ("your name"
  // becomes "your child's name"), so the answers start over; re-picking the
  // same role keeps them.
  function choose(by: OnboardedBy) {
    setDraft((d) => (d.by === by ? d : { ...EMPTY_DRAFT, by }));
    setNoteOpen((open) => (draft.by === by ? open : false));
    setStep("name");
  }

  function back() {
    const to = BACK[step];
    if (!to || saving) return;
    setError(null);
    setStep(to);
  }

  // The profile: a name, a grade, and who answered. A parent's answer rides
  // along as a record the prompt reads as a lead, never as a fact.
  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    if (preview) return true;
    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: draft.name.trim(),
          gradeLevel: draft.grade,
          onboarding: parent
            ? { by: "parent", concern: draft.concern ?? undefined, note: draft.note.trim() || undefined }
            : { by: "student" },
        }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      await update({ onboarded: true });
      return true;
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
      setSaving(false);
      return false;
    }
  }

  function submitName(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.name.trim()) return;
    setStep("grade");
  }

  async function submitGrade() {
    if (!draft.grade || saving) return;
    if (parent) {
      setStep("concern");
      return;
    }
    // A student goes on to the brief before their first session.
    if (await save()) router.push(preview ? "/welcome?preview=1" : "/welcome");
  }

  async function submitConcern() {
    if (!draft.concern || saving) return;
    if (await save()) {
      setSaving(false);
      setStep("handoff");
    }
  }

  return (
    <OnboardingFrame notes={notes}>
      {/* A fixed slot for Back, so the question sits at the same height on every screen. */}
      <div className="mt-4 flex h-11 items-center">
        {BACK[step] && (
          <Button
            type="button"
            variant="ghost"
            onClick={back}
            disabled={saving}
            className="-ml-2.5 h-11 gap-1 rounded-[10px] px-2.5 text-[13.5px] font-medium text-(--lp-ink-2) hover:text-(--lp-ink)"
          >
            <ChevronLeft className="size-4" strokeWidth={2.25} aria-hidden />
            Back
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} variants={stepVariants(reduce)} initial="hidden" animate="show" exit="exit" className="mt-2">
          {step === "who" && (
            <StepFrame item={item} title="Who's setting this up?" sub="So your tutor knows who it's talking to.">
              <motion.div variants={item} className="mt-7 flex flex-col gap-3">
                <ChoiceTile
                  icon={GraduationCap}
                  title="I'm the student"
                  detail="I'll be the one talking to the tutor."
                  onClick={() => choose("student")}
                />
                <ChoiceTile
                  icon={Users}
                  title="I'm a parent"
                  detail="I'm setting this up for my child."
                  onClick={() => choose("parent")}
                />
              </motion.div>
            </StepFrame>
          )}

          {step === "name" && (
            <StepFrame
              item={item}
              focusHeading={false}
              title={parent ? "What's your child's name?" : "What should your tutor call you?"}
              sub={parent ? "What their tutor should call them." : "Just a first name is perfect."}
            >
              <motion.form variants={item} noValidate onSubmit={submitName} className="mt-7">
                <Input
                  id="onboarding-name"
                  name="name"
                  autoFocus
                  autoComplete={parent ? "off" : "given-name"}
                  autoCapitalize="words"
                  spellCheck={false}
                  maxLength={40}
                  placeholder="First name"
                  aria-labelledby="onboarding-question"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="h-12 rounded-[10px] border-(--lp-line-strong) bg-white px-4 text-[17px] md:text-[17px]"
                />
                <Continue disabled={!draft.name.trim()} onClick={() => submitName()} />
              </motion.form>
            </StepFrame>
          )}

          {step === "grade" && (
            <StepFrame
              item={item}
              title={parent ? `What grade is ${first} in?` : "What grade are you in?"}
              sub="This shapes how your tutor explains things."
            >
              <motion.div variants={item} className="mt-7">
                <OptionGrid
                  labelledBy="onboarding-question"
                  columns={4}
                  options={GRADE_CHIPS}
                  value={draft.grade || null}
                  onChange={(grade) => setDraft((d) => ({ ...d, grade }))}
                />
              </motion.div>
              <motion.div variants={item}>
                <Continue busyLabel="Saving…" disabled={!draft.grade} busy={saving} onClick={() => void submitGrade()} />
                <ErrorLine error={error} />
              </motion.div>
            </StepFrame>
          )}

          {step === "concern" && (
            <StepFrame
              item={item}
              title="What's going on with math right now?"
              sub="Your tutor will find out for itself. This just tells it where to look first."
            >
              <motion.div variants={item} className="mt-7">
                <OptionGrid
                  labelledBy="onboarding-question"
                  options={CONCERN_CHIPS}
                  value={draft.concern}
                  onChange={(concern) => setDraft((d) => ({ ...d, concern: concern as ConcernKey }))}
                />
              </motion.div>
              <motion.div variants={item} className="mt-3">
                {noteOpen ? (
                  <Textarea
                    id="onboarding-note"
                    autoFocus
                    rows={2}
                    maxLength={NOTE_MAX}
                    placeholder="Anything that would help. Optional."
                    aria-label="A note for the tutor"
                    value={draft.note}
                    onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                    className="min-h-[72px] resize-none rounded-[10px] border-(--lp-line-strong) bg-white px-4 py-3 text-[15px] leading-[1.5]"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setNoteOpen(true)}
                    className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-[8px] px-2 text-[13.5px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
                  >
                    <Plus className="size-4" strokeWidth={2.25} aria-hidden />
                    Add a note
                  </button>
                )}
              </motion.div>
              <motion.div variants={item}>
                <Continue busyLabel="Saving…" disabled={!draft.concern} busy={saving} onClick={() => void submitConcern()} />
                <ErrorLine error={error} />
              </motion.div>
            </StepFrame>
          )}

          {step === "handoff" && (
            <StepFrame
              item={item}
              title={`${first} is all set.`}
              sub={`Hand this to ${first} when they're ready, or try a session yourself first to see how it teaches.`}
            >
              {/* Below the panel's breakpoint the notepad is the content of this screen. */}
              <motion.div variants={item} className="mt-6 lg:hidden">
                <TutorNotesBoard notes={notes} />
              </motion.div>
              <motion.div variants={item} className="mt-7 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={() => router.push(preview ? "/welcome?preview=1" : "/session")}
                  className="btn-gloss-lift h-11 gap-2 rounded-[10px] px-5 text-[14px] font-semibold"
                >
                  Start a session now
                  <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push("/")}
                  className="h-11 rounded-[10px] px-4 text-[14px] font-medium text-(--lp-ink-2) hover:text-(--lp-ink)"
                >
                  I&apos;ll do it later
                </Button>
              </motion.div>
              <motion.p variants={item} className="m-0 mt-5 text-[13px] text-(--lp-ink-3)">
                {FREE_LINE}
              </motion.p>
            </StepFrame>
          )}
        </motion.div>
      </AnimatePresence>
    </OnboardingFrame>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

// The question and its one line of help. Focus moves to the question when a
// screen opens, so a screen reader hears where it is; the name screen focuses
// its input instead.
function StepFrame({
  item,
  title,
  sub,
  focusHeading = true,
  children,
}: {
  item: Variants;
  title: string;
  sub: string;
  focusHeading?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) ref.current?.focus({ preventScroll: true });
  }, [focusHeading]);
  return (
    <>
      <motion.h1
        ref={ref}
        id="onboarding-question"
        tabIndex={-1}
        variants={item}
        className="lp-display m-0 text-[28px] leading-[1.15] tracking-[-0.02em] text-balance outline-none sm:text-[31px]"
      >
        {title}
      </motion.h1>
      <motion.p variants={item} className="m-0 mt-2.5 text-[15px] leading-[1.5] text-(--lp-ink-2)">
        {sub}
      </motion.p>
      {children}
    </>
  );
}

function ChoiceTile({ icon: Icon, title, detail, onClick }: { icon: LucideIcon; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-[14px] border border-(--lp-line-strong) bg-white px-5 py-4 text-left outline-none transition-[border-color,scale] duration-150 ease-out hover:border-(--lp-ink)/30 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <Icon className="size-6 shrink-0 text-(--lp-sky-deep)" strokeWidth={2} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-semibold leading-[1.3] text-(--lp-ink)">{title}</span>
        <span className="mt-0.5 text-[13.5px] leading-[1.4] text-(--lp-ink-2)">{detail}</span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-(--lp-ink-3) transition-[translate,color] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-(--lp-ink) motion-reduce:transition-none"
        strokeWidth={2.25}
        aria-hidden
      />
    </button>
  );
}

function Continue({
  label = "Continue",
  busyLabel = "Saving…",
  disabled,
  busy = false,
  onClick,
}: {
  label?: string;
  busyLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="btn-gloss-lift mt-6 h-11 w-full gap-2 rounded-[10px] text-[14px] font-semibold sm:w-auto sm:min-w-[164px] sm:px-5"
    >
      {busy ? (
        <>
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {busyLabel}
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
        </>
      )}
    </Button>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="m-0 mt-3 text-[13.5px] leading-[1.45] text-(--danger)">
      {error}
    </p>
  );
}
