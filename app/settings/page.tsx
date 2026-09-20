"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, LoaderCircle, LogOut, PenLine } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { TopBar } from "@/components/app/TopBar";
import { useTutorSpeed } from "@/components/session/SpeedControl";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientReady } from "@/lib/client-ready";
import {
  LEARNING_PREFS,
  levelPhrase,
  matchLevel,
  normalizePref,
  STUDENT_LEVELS,
  type LearningPrefKey,
  type PrefValue,
} from "@/lib/profile-options";
import { profileLines } from "@/lib/tutor-prompts";
import { BOARD_DOTS } from "@/components/app/board-dots";
import {
  DEFAULT_TUTOR_VOICE,
  isTutorVoiceName,
  saveTutorVoiceName,
  TUTOR_SPEEDS,
  TUTOR_VOICES,
  type TutorSpeedId,
  type TutorVoiceName,
} from "@/lib/voice-settings";
import { cn } from "@/lib/utils";

// Settings, written as a note to the tutor. The left side is three short
// passages with blanks to fill in; each blue phrase opens a small menu. The
// right side shows what the tutor actually reads (the lines profileLines builds
// for the prompt) on a little board, and what it remembers (tutor notes).
// Everything saves as it changes: the whole profile goes to PUT
// /api/onboarding through a queue, so the last change wins; learningPrefs keys
// this page doesn't edit are kept. Speaking speed lives in this browser and is
// shared with the speed control in the session.

type Prefs = Record<LearningPrefKey, PrefValue>;
type Profile = {
  displayName: string;
  gradeLevel: string;
  extraContext: string;
  prefs: Prefs;
  /** learningPrefs keys this page doesn't edit, kept so a save never drops them. */
  otherPrefs: Record<string, unknown>;
  voiceName: TutorVoiceName;
};
type SaveState = "idle" | "saving" | "saved" | "error";

const TYPING_SAVE_DELAY = 700;
const CONTEXT_MAX = 600;
const PREF_KEYS: readonly string[] = LEARNING_PREFS.map((pref) => pref.key);

const SPEED_PHRASES: Record<TutorSpeedId, string> = {
  slowest: "very slowly",
  slow: "slowly",
  normal: "at normal speed",
  fast: "quickly",
  "very-fast": "very quickly",
};

// Friendlier names for the keys profileLines writes. The values are shown
// exactly as the tutor gets them. Balanced preferences send no line at all, and
// set ones arrive as "Stated preferences (a soft default; …)", shown as Preferences.
const NOTE_LABELS: Record<string, string> = {
  Name: "Name",
  Level: "Level",
  Style: "Style",
  Register: "How to explain",
  "Context from the student": "Working on",
};
// Lines fed by typing are not re-written on every keystroke.
const TYPED_KEYS = new Set(["Name", "Context from the student"]);

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function readProfile(row: unknown): Profile {
  const r = (row ?? {}) as Record<string, unknown>;
  const prefs = (r.learningPrefs && typeof r.learningPrefs === "object" ? r.learningPrefs : {}) as Record<string, unknown>;
  return {
    displayName: typeof r.displayName === "string" ? r.displayName : "",
    gradeLevel: typeof r.gradeLevel === "string" ? r.gradeLevel : "",
    extraContext: typeof r.extraContext === "string" ? r.extraContext : "",
    prefs: {
      hintVsAnswer: normalizePref(prefs.hintVsAnswer),
      pace: normalizePref(prefs.pace),
      examplesVsTheory: normalizePref(prefs.examplesVsTheory),
      tone: normalizePref(prefs.tone),
    },
    otherPrefs: Object.fromEntries(Object.entries(prefs).filter(([key]) => !PREF_KEYS.includes(key))),
    voiceName: isTutorVoiceName(r.voiceName) ? r.voiceName : DEFAULT_TUTOR_VOICE,
  };
}

export default function SettingsPage() {
  return (
    <AppShell defaultOpen>
      <MotionConfig reducedMotion="user">
        <Settings />
      </MotionConfig>
    </AppShell>
  );
}

function Settings() {
  const mounted = useClientReady();
  const { data: auth } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notes, setNotes] = useState<string[] | null>(null);
  const [notesFailed, setNotesFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [speed, setSpeed] = useTutorSpeed();

  const latest = useRef<Profile | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const saveSeq = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    fetch("/api/onboarding")
      .then((res) => {
        if (!res.ok) throw new Error(`load ${res.status}`);
        return res.json();
      })
      .then((row) => {
        const next = readProfile(row);
        latest.current = next;
        setProfile(next);
        saveTutorVoiceName(next.voiceName);
      })
      .catch(() => setLoadFailed(true));
    fetch("/api/profile/notes")
      .then((res) => {
        if (!res.ok) throw new Error(`notes ${res.status}`);
        return res.json() as Promise<{ notes?: unknown }>;
      })
      .then((body) => setNotes(Array.isArray(body.notes) ? body.notes.filter((n): n is string => typeof n === "string") : []))
      .catch(() => {
        setNotesFailed(true);
        setNotes([]);
      });
  }, []);

  useEffect(() => {
    if (mounted) load();
  }, [mounted, load]);

  // Every save sends the newest profile, one request at a time.
  const persist = useCallback(() => {
    const mine = ++saveSeq.current;
    setSave("saving");
    queue.current = queue.current.then(async () => {
      const p = latest.current;
      if (!p) return;
      try {
        const res = await fetch("/api/onboarding", {
          method: "PUT",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: p.displayName.trim() || null,
            gradeLevel: p.gradeLevel || null,
            learningPrefs: { ...p.otherPrefs, ...p.prefs },
            extraContext: p.extraContext.trim() || null,
            voiceName: p.voiceName,
          }),
        });
        if (!res.ok) throw new Error(`save ${res.status}`);
        if (mine === saveSeq.current) setSave("saved");
      } catch {
        if (mine === saveSeq.current) setSave("error");
      }
    });
  }, []);

  const flushTyping = useCallback(() => {
    if (!typingTimer.current) return;
    clearTimeout(typingTimer.current);
    typingTimer.current = null;
    persist();
  }, [persist]);

  // Choices save at once; typing saves after a pause (or on blur).
  const update = useCallback(
    (patch: Partial<Profile>, when: "now" | "typing") => {
      const base = latest.current;
      if (!base) return;
      const next = { ...base, ...patch };
      latest.current = next;
      setProfile(next);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = null;
      if (when === "now") persist();
      else
        typingTimer.current = setTimeout(() => {
          typingTimer.current = null;
          persist();
        }, TYPING_SAVE_DELAY);
    },
    [persist],
  );

  useEffect(() => () => flushTyping(), [flushTyping]);

  useEffect(() => {
    if (save !== "saved") return;
    const timer = setTimeout(() => setSave("idle"), 2200);
    return () => clearTimeout(timer);
  }, [save]);

  const prefBlank = (key: LearningPrefKey) => {
    const pref = LEARNING_PREFS.find((p) => p.key === key)!;
    const current = profile ? pref.options.find((o) => o.value === profile.prefs[key]) : undefined;
    return (
      <Blank
        label={pref.label}
        value={profile?.prefs[key] ?? 0}
        display={current?.phrase ?? ""}
        options={pref.options.map((o) => ({ value: o.value, title: capitalize(o.phrase), detail: o.detail }))}
        onChange={(value) => {
          const base = latest.current;
          if (base) update({ prefs: { ...base.prefs, [key]: value } }, "now");
        }}
      />
    );
  };

  const level = profile ? matchLevel(profile.gradeLevel) : null;
  const voice = profile ? TUTOR_VOICES.find((v) => v.name === profile.voiceName) : undefined;

  return (
    <>
      <TopBar actions={<SaveStatus state={save} onRetry={persist} />}>
        <span className="font-medium text-(--lp-ink)">Settings</span>
      </TopBar>

      <div className="page-in flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1120px] px-5 pt-10 pb-28 sm:px-10 sm:pt-16">
          <div className="grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-20">
            <div className="min-w-0">
              <header>
                <h1 className="lp-display m-0 max-w-[18ch] text-[34px] leading-[1.08] text-balance text-(--lp-ink) sm:text-[44px]">
                  Tell your tutor about you.
                </h1>
                <p className="m-0 mt-4 max-w-[46ch] text-[15px] leading-[1.55] text-(--lp-ink-2)">
                  Tap anything in blue to change it. It saves on its own, and your tutor reads it when your next session starts.
                </p>
              </header>

              {loadFailed ? (
                <div role="alert" className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-(--lp-line-strong) px-4 py-3.5">
                  <p className="m-0 text-[14px] text-(--lp-ink)">Your settings didn&apos;t load.</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setLoadFailed(false);
                      load();
                    }}
                    className="h-8 rounded-[9px] border-(--lp-line-strong) px-3 text-[13px]"
                  >
                    Try again
                  </Button>
                </div>
              ) : !profile ? (
                <PassagesSkeleton />
              ) : (
                <div className="mt-14 flex flex-col gap-12">
                  <Passage title="About you">
                    <p className={PROSE}>
                      Hi, I&apos;m{" "}
                      <input
                        aria-label="Your name"
                        value={profile.displayName}
                        maxLength={40}
                        autoComplete="given-name"
                        placeholder="your name"
                        size={Math.max(8, profile.displayName.length + 1)}
                        onChange={(e) => update({ displayName: e.target.value }, "typing")}
                        onBlur={flushTyping}
                        className={cn(FILL, TYPING_FOCUS, "min-w-[5ch] [field-sizing:content]")}
                      />
                      . I&apos;m{" "}
                      <Blank
                        label="Level"
                        value={level?.value ?? null}
                        display={levelPhrase(profile.gradeLevel)}
                        placeholder="choose your level"
                        options={STUDENT_LEVELS.map((l) => ({ value: l.value, title: l.label, detail: l.detail }))}
                        onChange={(gradeLevel) => update({ gradeLevel }, "now")}
                      />
                      .
                    </p>
                    <p className={cn(PROSE, "mt-4")}>Right now I&apos;m working on</p>
                    <div className="relative mt-3">
                      <textarea
                        aria-label="What you're working on"
                        value={profile.extraContext}
                        maxLength={CONTEXT_MAX}
                        rows={2}
                        placeholder="fractions, a quiz on Friday, anything that feels hard"
                        onChange={(e) => update({ extraContext: e.target.value }, "typing")}
                        onBlur={flushTyping}
                        className={cn(FILL, TYPING_FOCUS, "block min-h-[100px] w-full resize-none rounded-[16px] px-4 pt-3 pb-8 text-[18px] leading-[1.55] [field-sizing:content]")}
                      />
                      <p
                        aria-live="polite"
                        className={cn(
                          "pointer-events-none absolute right-4 bottom-2.5 m-0 text-[12px] text-(--lp-sky) tabular-nums transition-opacity duration-150",
                          profile.extraContext.length > CONTEXT_MAX - 120 ? "opacity-100" : "opacity-0",
                        )}
                      >
                        {profile.extraContext.length} / {CONTEXT_MAX}
                      </p>
                    </div>
                  </Passage>

                  <Passage title="How you learn">
                    <p className={PROSE}>
                      When I&apos;m stuck, {prefBlank("hintVsAnswer")}. Take it {prefBlank("pace")}, start with {prefBlank("examplesVsTheory")}, and keep it{" "}
                      {prefBlank("tone")}.
                    </p>
                  </Passage>

                  <Passage title="Your tutor's voice">
                    <p className={PROSE}>
                      Use{" "}
                      <Blank
                        label="Voice"
                        value={profile.voiceName}
                        display={voice?.label ?? ""}
                        options={TUTOR_VOICES.map((v) => ({ value: v.name, title: v.label, detail: v.tone }))}
                        onChange={(voiceName) => {
                          saveTutorVoiceName(voiceName);
                          update({ voiceName }, "now");
                        }}
                      />
                      {" "}as my tutor&apos;s voice, and talk{" "}
                      <Blank
                        label="Speaking speed"
                        value={speed}
                        display={SPEED_PHRASES[speed]}
                        options={TUTOR_SPEEDS.map((s) => ({ value: s.id, title: s.label, detail: capitalize(SPEED_PHRASES[s.id]) }))}
                        onChange={(next) => {
                          setSpeed(next);
                          setSave("saved");
                        }}
                      />
                      .
                    </p>
                    <p className="m-0 mt-3 max-w-[52ch] text-[13.5px] leading-[1.5] text-(--lp-ink-2)">
                      A new voice starts with your next session. Speed changes right away, and you can change it mid-session too.
                    </p>
                  </Passage>

                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-(--lp-line) pt-7">
                    <p className="m-0 min-w-0 truncate text-[14px] text-(--lp-ink-2)">
                      Signed in as <span className="text-(--lp-ink)">{auth?.user?.email ?? "your account"}</span>
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="h-9 gap-2 rounded-[10px] border-(--lp-line-strong) px-3.5 text-[13.5px] text-(--lp-ink)"
                    >
                      <LogOut className="size-4" strokeWidth={2} />
                      Sign out
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {!loadFailed && (
              <aside className="min-w-0 lg:sticky lg:top-10">
                {profile ? (
                  <TutorNotes profile={profile} notes={notes} notesFailed={notesFailed} onCleared={() => setNotes([])} />
                ) : (
                  <NotesSkeleton />
                )}
              </aside>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── The letter ──────────────────────────────────────────────────────────────

const PROSE = "m-0 text-[21px] leading-[1.85] text-(--lp-ink) sm:text-[23px]";

// Anything the student can change: a soft sky field with text in the app's
// sky, the same blue as the sidebar's accents (Mateo's call; it is about 2.7:1
// on the tint, lighter than a text colour would usually be).
const FILL =
  "rounded-[10px] bg-(--lp-sky-tint) px-2.5 py-0.5 align-baseline font-medium leading-[1.35] text-(--lp-sky) outline-none transition-[background-color,box-shadow] duration-150 ease-out placeholder:text-(--lp-sky)/60 placeholder:italic hover:bg-(--lp-sky-soft)";
// Text fields keep a ring while you type in them; the menu blanks only show one for keyboard focus.
const TYPING_FOCUS = "focus:bg-(--lp-sky-soft) focus:shadow-[0_0_0_2px_var(--lp-sky)]";

function Passage({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="m-0 mb-2.5 text-[13px] font-medium text-(--lp-ink-2)">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A blank in a sentence: the phrase shows inline, a menu of choices opens under it. */
function Blank<T extends string | number>({
  label,
  value,
  display,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  display: string;
  placeholder?: string;
  options: readonly { value: T; title: string; detail?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (next !== null && next !== undefined) onChange(next as T);
      }}
    >
      <Select.Trigger
        aria-label={`${label}: ${display || "not set"}`}
        className={cn(
          FILL,
          "group inline-flex max-w-full cursor-pointer items-baseline gap-1.5 text-left active:scale-[0.98] motion-reduce:active:scale-100",
          "data-[popup-open]:bg-(--lp-sky-soft) data-[popup-open]:shadow-[0_0_0_2px_var(--lp-sky)] focus-visible:shadow-[0_0_0_3px_var(--lp-sky-glow)]",
        )}
      >
        <span className={cn(!display && "text-(--lp-sky)/60 italic")}>{display || placeholder}</span>
        <ChevronDown
          aria-hidden
          strokeWidth={2.5}
          className="size-[0.6em] shrink-0 self-center opacity-70 transition-transform duration-200 ease-out group-data-[popup-open]:rotate-180"
        />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner side="bottom" align="start" sideOffset={8} collisionPadding={12} alignItemWithTrigger={false} className="z-50 outline-none">
          <Select.Popup
            className={cn(
              "w-max max-w-[min(340px,calc(100vw-24px))] min-w-[232px] origin-(--transform-origin) rounded-[14px] bg-white p-1.5 ring-1 ring-[rgba(18,18,21,0.08)] outline-none",
              "shadow-[0_2px_4px_rgba(18,18,21,0.06),0_8px_8px_-6px_rgba(18,18,21,0.14)]",
              "transition-[scale,opacity,filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
              "data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[starting-style]:blur-[2px]",
              "data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:duration-100",
              "motion-reduce:data-[starting-style]:scale-100 motion-reduce:data-[starting-style]:blur-none motion-reduce:data-[ending-style]:scale-100",
            )}
          >
            {options.map((option) => (
              <Select.Item
                key={String(option.value)}
                value={option.value}
                className="flex cursor-pointer items-start gap-2 rounded-[9px] py-2 pr-3 pl-2 outline-none select-none data-[highlighted]:bg-(--lp-gray)"
              >
                <span className="mt-[3px] flex size-4 shrink-0 items-center justify-center">
                  <Select.ItemIndicator>
                    <Check className="size-4 text-(--lp-sky)" strokeWidth={2.75} />
                  </Select.ItemIndicator>
                </span>
                <span className="flex min-w-0 flex-col">
                  <Select.ItemText className="text-[14px] font-medium text-(--lp-ink)">{option.title}</Select.ItemText>
                  {option.detail && <span className="mt-0.5 text-[12.5px] leading-[1.35] text-(--lp-ink-2)">{option.detail}</span>}
                </span>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

// ── What the tutor reads ────────────────────────────────────────────────────

const UI_FONT = { fontFamily: "var(--lp-font-body), system-ui, sans-serif" } as const;

function TutorNotes({
  profile,
  notes,
  notesFailed,
  onCleared,
}: {
  profile: Profile;
  notes: string[] | null;
  notesFailed: boolean;
  onCleared: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);

  const lines = useMemo(
    () =>
      profileLines({
        displayName: profile.displayName.trim() || null,
        gradeLevel: profile.gradeLevel || null,
        learningPrefs: profile.prefs,
        extraContext: profile.extraContext,
      }).map((line) => {
        const cut = line.indexOf(": ");
        const key = cut > 0 ? line.slice(0, cut) : "";
        const label = NOTE_LABELS[key] ?? (key.startsWith("Stated preferences") ? "Preferences" : key);
        return { key, label, text: cut > 0 ? line.slice(cut + 2) : line };
      }),
    [profile],
  );

  const clear = async () => {
    setClearing(true);
    setClearFailed(false);
    try {
      const res = await fetch("/api/profile/notes", { method: "DELETE" });
      if (!res.ok) throw new Error(`clear ${res.status}`);
      onCleared();
      setConfirm(false);
    } catch {
      setClearFailed(true);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[18px] border border-(--lp-line-strong) bg-white">
      <div className="flex h-12 items-center gap-2 border-b border-(--lp-line) px-5">
        <PenLine aria-hidden className="size-4 text-(--lp-sky)" strokeWidth={2.25} />
        <h2 className="m-0 text-[13.5px] font-medium text-(--lp-ink)">What your tutor reads</h2>
      </div>

      <div className="px-5 pt-4 pb-5" style={BOARD_DOTS}>
        <ul className="lp-hand m-0 flex list-none flex-col gap-3 p-0 text-[16px] leading-[1.4] text-(--lp-ink)">
          {lines.map((line, index) => (
            <li
              key={TYPED_KEYS.has(line.key) ? line.key : `${line.key}|${line.text}`}
              className="transition-[clip-path,opacity] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-40 starting:[clip-path:inset(0_100%_0_0)] motion-reduce:transition-none"
              style={{ transitionDelay: `${index * 40}ms` }}
            >
              <span className="block text-[12px] text-(--lp-ink-2)" style={UI_FONT}>
                {line.label}
              </span>
              <span className="block">{line.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-(--lp-line) px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="m-0 text-[13.5px] font-medium text-(--lp-ink)">What it remembers</h3>
          {notes && notes.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="rounded-[6px] px-1 text-[12.5px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--danger) focus-visible:ring-2 focus-visible:ring-(--lp-sky)"
            >
              Clear
            </button>
          )}
        </div>
        {notes === null ? (
          <div aria-hidden className="mt-3 flex flex-col gap-2">
            <Skeleton className="h-4 w-4/5 rounded-md" />
            <Skeleton className="h-4 w-3/5 rounded-md" />
          </div>
        ) : notesFailed ? (
          <p className="m-0 mt-1.5 text-[13px] text-(--lp-ink-2)">Couldn&apos;t load what your tutor remembers.</p>
        ) : notes.length === 0 ? (
          <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-(--lp-ink-2)">
            Nothing yet. As you work together, your tutor jots down what helps, and it shows up here.
          </p>
        ) : (
          <ul className="lp-hand m-0 mt-2.5 flex list-none flex-col gap-1.5 p-0 text-[15px] leading-[1.4] text-(--lp-ink)">
            {notes
              .slice(-8)
              .reverse()
              .map((note) => (
                <li key={note} className="flex gap-2">
                  <span aria-hidden className="text-(--lp-sky)">
                    •
                  </span>
                  <span className="min-w-0">{note}</span>
                </li>
              ))}
          </ul>
        )}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear what your tutor remembers?</AlertDialogTitle>
            <AlertDialogDescription>
              Your tutor starts fresh at your next session. This can&apos;t be undone.
              {clearFailed && <span className="mt-2 block text-(--danger)">That didn&apos;t work. Try again.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} className="rounded-[10px]">
              Keep it
            </Button>
            <Button variant="destructive" onClick={clear} disabled={clearing} className="rounded-[10px]">
              {clearing ? "Clearing…" : "Clear memory"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Status and loading ──────────────────────────────────────────────────────

/** Save state in the top bar. "Saving" only shows if a save takes a moment. */
function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (state !== "saving") return;
    const timer = setTimeout(() => setSlow(true), 400);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [state]);

  const shown = state === "saving" ? (slow ? "saving" : null) : state === "idle" ? null : state;
  const enter = { opacity: 0, y: 3, filter: "blur(2px)" };
  const show = { opacity: 1, y: 0, filter: "blur(0px)" };
  return (
    <div aria-live="polite" className="flex h-7 min-w-[92px] items-center justify-end text-[12.5px] font-medium">
      <AnimatePresence mode="wait" initial={false}>
        {shown === "saving" && (
          <motion.span key="saving" initial={enter} animate={show} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="flex items-center gap-1.5 text-(--lp-ink-2)">
            <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.25} />
            Saving
          </motion.span>
        )}
        {shown === "saved" && (
          <motion.span key="saved" initial={enter} animate={show} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="flex items-center gap-1.5 text-(--lp-ink-2)">
            <Check className="size-3.5 text-(--lp-live)" strokeWidth={2.75} />
            Saved
          </motion.span>
        )}
        {shown === "error" && (
          <motion.span key="error" initial={enter} animate={show} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="flex items-center gap-2 text-(--danger)">
            Couldn&apos;t save
            <button type="button" onClick={onRetry} className="rounded-[6px] px-1 text-(--lp-ink) underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-(--lp-sky)">
              Retry
            </button>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function PassagesSkeleton() {
  return (
    <div aria-hidden className="mt-14 flex flex-col gap-12">
      {[["85%", "55%"], ["95%", "80%", "40%"], ["70%"]].map((widths, i) => (
        <div key={i}>
          <Skeleton className="mb-4 h-3.5 w-24 rounded-md" />
          <div className="flex flex-col gap-4">
            {widths.map((w) => (
              <Skeleton key={w} className="h-7 rounded-lg" style={{ width: w }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NotesSkeleton() {
  return (
    <div aria-hidden className="overflow-hidden rounded-[18px] border border-(--lp-line-strong)">
      <div className="flex h-12 items-center border-b border-(--lp-line) px-5">
        <Skeleton className="h-3.5 w-36 rounded-md" />
      </div>
      <div className="flex flex-col gap-4 px-5 py-5">
        {["60%", "45%", "90%", "80%"].map((w) => (
          <div key={w}>
            <Skeleton className="h-3 w-16 rounded-md" />
            <Skeleton className="mt-2 h-4 rounded-md" style={{ width: w }} />
          </div>
        ))}
      </div>
    </div>
  );
}
