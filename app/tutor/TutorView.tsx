"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Cancel01Icon, PencilEdit02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "@/components/app/AppShell";
import { BOARD_DOTS } from "@/components/app/board-dots";
import { FIELD, FieldSelect } from "@/components/app/FieldSelect";
import { Icon } from "@/components/app/Icon";
import { CARD, PageBody, Panel, ROW_LINE, Segmented, SettingRow } from "@/components/app/page-kit";
import { SaveStatus, type SaveState } from "@/components/app/SaveStatus";
import { usePrefs } from "@/components/app/usePrefs";
import { TutorPet } from "@/components/board/TutorPet";
import { InterestChips } from "@/components/onboarding/InterestChips";
import { useTutorSpeed } from "@/components/session/SpeedControl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientReady } from "@/lib/client-ready";
import { sanitizeOnboarding } from "@/lib/onboarding";
import { LEARNING_PREFS, matchLevel, normalizePref, STUDENT_LEVELS, type LearningPrefKey, type PrefValue } from "@/lib/profile-options";
import { useReduce } from "@/lib/reduced-motion";
import { SESSION_LANGUAGES, type LanguageCode } from "@/lib/session-intake";
import { profileLines } from "@/lib/tutor-prompts";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TUTOR_VOICE,
  isTutorVoiceName,
  saveTutorVoiceName,
  TUTOR_SPEEDS,
  TUTOR_VOICES,
  type TutorSpeedId,
  type TutorVoiceName,
} from "@/lib/voice-settings";

// Your tutor (Oct 2026): everything that shapes how the tutor sounds and
// teaches, and everything it knows about the student, in one place. The left
// column changes it; the right column shows the result: the exact lines the
// tutor reads at the start of a session (profileLines, the prompt's own
// builder) and the notes it has kept, each of which can be forgotten.
//
// The profile saves as it changes (PUT /api/onboarding, newest snapshot wins,
// typing after a pause); interests go through PATCH, which only touches the
// onboarding record. Speaking speed and language live on this device.

type Prefs = Record<LearningPrefKey, PrefValue>;
type Profile = {
  displayName: string;
  gradeLevel: string;
  extraContext: string;
  prefs: Prefs;
  otherPrefs: Record<string, unknown>;
  voiceName: TutorVoiceName;
  interests: string[];
  onboarding: unknown;
};

const PREF_KEYS: readonly string[] = LEARNING_PREFS.map((p) => p.key);

// What each setting does, shown while it sits on the middle choice; a side
// choice shows what that choice means instead.
const PREF_HINTS: Record<LearningPrefKey, string> = {
  hintVsAnswer: "What it does first when you can't see the next step.",
  pace: "How quickly it moves on once you've got something.",
  examplesVsTheory: "Whether it starts from an example or from the rule.",
  tone: "How it talks to you.",
};

/** The grades, plus an older stored school band so the field never looks empty for it. */
function gradeOptions(stored: string | null | undefined) {
  const options: { value: string; title: string; detail?: string }[] = STUDENT_LEVELS.map((l) => ({ value: l.value, title: l.label, detail: l.detail }));
  const match = matchLevel(stored);
  if (match && !options.some((o) => o.value === match.value)) options.unshift({ value: match.value, title: match.label, detail: "Pick your grade to be exact" });
  return options;
}
const CONTEXT_MAX = 600;
const TYPING_SAVE_DELAY = 700;

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
    interests: sanitizeOnboarding(r.onboarding)?.interests ?? [],
    onboarding: r.onboarding ?? null,
  };
}

export function TutorView() {
  const mounted = useClientReady();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notes, setNotes] = useState<string[] | null>(null);
  const [notesFailed, setNotesFailed] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [speed, setSpeed] = useTutorSpeed();
  const [prefs, setPrefs] = usePrefs();

  const latest = useRef<Profile | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const seq = useRef(0);
  const typing = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    fetch("/api/onboarding")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
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
        if (!res.ok) throw new Error(String(res.status));
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

  // One request at a time, always the newest profile.
  const run = useCallback((send: () => Promise<Response>) => {
    const mine = ++seq.current;
    setSave("saving");
    queue.current = queue.current.then(async () => {
      try {
        const res = await send();
        if (!res.ok) throw new Error(String(res.status));
        if (mine === seq.current) setSave("saved");
      } catch {
        if (mine === seq.current) setSave("error");
      }
    });
  }, []);

  const persist = useCallback(() => {
    run(() => {
      const p = latest.current!;
      return fetch("/api/onboarding", {
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
    });
  }, [run]);

  const flushTyping = useCallback(() => {
    if (!typing.current) return;
    clearTimeout(typing.current);
    typing.current = null;
    persist();
  }, [persist]);

  const update = useCallback(
    (patch: Partial<Profile>, when: "now" | "typing") => {
      if (!latest.current) return;
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setProfile(next);
      if (typing.current) clearTimeout(typing.current);
      typing.current = null;
      if (when === "now") persist();
      else
        typing.current = setTimeout(() => {
          typing.current = null;
          persist();
        }, TYPING_SAVE_DELAY);
    },
    [persist],
  );

  const setInterests = useCallback(
    (interests: string[]) => {
      if (!latest.current) return;
      const next = { ...latest.current, interests };
      latest.current = next;
      setProfile(next);
      run(() =>
        fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interests }) }),
      );
    },
    [run],
  );

  useEffect(() => () => flushTyping(), [flushTyping]);
  useEffect(() => {
    if (save !== "saved") return;
    const timer = setTimeout(() => setSave("idle"), 2200);
    return () => clearTimeout(timer);
  }, [save]);

  const nameId = useId();
  const contextId = useId();

  return (
    <AppShell bar actions={<SaveStatus state={save} onRetry={persist} />}>
      <PageBody width="wide">
        <Hero name={profile?.displayName ?? ""} />

        {loadFailed ? (
          <div role="alert" className={cn(CARD, "mt-8 flex flex-wrap items-center justify-between gap-3 px-5 py-4")}>
            <p className="m-0 text-[14.5px] text-(--lp-ink)">Your tutor&apos;s settings didn&apos;t load.</p>
            <button
              type="button"
              onClick={() => {
                setLoadFailed(false);
                load();
              }}
              className="h-9 cursor-pointer rounded-[10px] border border-(--lp-line-strong) px-3.5 text-[13.5px] font-medium text-(--lp-ink) outline-none hover:bg-(--lp-gray)/70 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
            <div className="flex min-w-0 flex-col gap-5">
              <Panel id="voice" title="Voice" description="How your tutor sounds. A new voice starts with your next session.">
                <div className="px-5 pt-3 pb-5 sm:px-6">
                  {profile ? (
                    <VoicePicker
                      value={profile.voiceName}
                      onChange={(voiceName) => {
                        saveTutorVoiceName(voiceName);
                        update({ voiceName }, "now");
                      }}
                    />
                  ) : (
                    <Skeleton className="h-[132px] rounded-[14px]" />
                  )}
                </div>
                <SettingRow label="Speaking speed" hint="Changes right away, even in the middle of a session." className="border-t">
                  <Segmented<TutorSpeedId>
                    size="sm"
                    label="Speaking speed"
                    value={speed}
                    onChange={setSpeed}
                    options={TUTOR_SPEEDS.map((s) => ({ value: s.id, label: s.label }))}
                  />
                </SettingRow>
                <SettingRow label="Language" hint="What it speaks in new sessions. You can still change it when you start one.">
                  <FieldSelect<LanguageCode>
                    label="Language"
                    value={prefs.language}
                    onChange={(language) => setPrefs({ language })}
                    options={SESSION_LANGUAGES.map((l) => ({ value: l.code, title: l.label, detail: l.english === l.label ? undefined : l.english }))}
                  />
                </SettingRow>
              </Panel>

              <Panel id="teaching" title="How it teaches you" description="A starting point. Your tutor still adjusts to what it sees you do.">
                <div className="pt-2">
                  {LEARNING_PREFS.map((pref) => {
                    const value = profile?.prefs[pref.key] ?? 0;
                    const chosen = pref.options.find((o) => o.value === value)!;
                    return (
                      <SettingRow key={pref.key} label={pref.label} hint={value === 0 ? PREF_HINTS[pref.key] : chosen.detail}>
                        <Segmented<PrefValue>
                          size="sm"
                          label={pref.label}
                          value={value}
                          onChange={(next) => latest.current && update({ prefs: { ...latest.current.prefs, [pref.key]: next } }, "now")}
                          options={pref.options.map((o) => ({ value: o.value, label: o.short }))}
                        />
                      </SettingRow>
                    );
                  })}
                </div>
              </Panel>

              <Panel id="about" title="About you" description="Your tutor reads this at the start of every session.">
                <div className="pt-2">
                  <SettingRow label="Name" hint="What your tutor calls you." htmlFor={nameId}>
                    <input
                      id={nameId}
                      value={profile?.displayName ?? ""}
                      disabled={!profile}
                      maxLength={40}
                      autoComplete="given-name"
                      placeholder="Your name"
                      onChange={(e) => update({ displayName: e.target.value }, "typing")}
                      onBlur={flushTyping}
                      className={cn(FIELD, "w-full sm:w-[240px]")}
                    />
                  </SettingRow>
                  <SettingRow label="Grade" hint="Sets how it explains and which lessons come first.">
                    <FieldSelect
                      label="Grade"
                      value={profile ? (matchLevel(profile.gradeLevel)?.value ?? null) : null}
                      placeholder="Choose your grade"
                      onChange={(gradeLevel) => update({ gradeLevel }, "now")}
                      options={gradeOptions(profile?.gradeLevel)}
                    />
                  </SettingRow>
                  <SettingRow label="What you're working on" hint="A test coming up, a topic that feels hard, anything." htmlFor={contextId} stack>
                    <div className="relative">
                      <textarea
                        id={contextId}
                        value={profile?.extraContext ?? ""}
                        disabled={!profile}
                        maxLength={CONTEXT_MAX}
                        rows={2}
                        placeholder="Fractions, and a quiz on Friday"
                        onChange={(e) => update({ extraContext: e.target.value }, "typing")}
                        onBlur={flushTyping}
                        className={cn(FIELD, "block h-auto min-h-[76px] w-full resize-none py-2.5 leading-[1.5] [field-sizing:content]")}
                      />
                      {profile && profile.extraContext.length > CONTEXT_MAX - 120 && (
                        <span aria-live="polite" className="pointer-events-none absolute right-3 bottom-2 text-[12px] text-(--lp-ink-3) tabular-nums">
                          {profile.extraContext.length} / {CONTEXT_MAX}
                        </span>
                      )}
                    </div>
                  </SettingRow>
                  <SettingRow label="What you're into" hint="Your tutor uses these for examples, lightly. Up to six." stack>
                    {profile ? <InterestChips value={profile.interests} onChange={setInterests} /> : <Skeleton className="h-20 rounded-[12px]" />}
                  </SettingRow>
                </div>
              </Panel>
            </div>

            <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6">
              <ReadsCard profile={profile} />
              <MemoryCard notes={notes} failed={notesFailed} onChange={setNotes} />
            </aside>
          </div>
        )}
      </PageBody>
    </AppShell>
  );
}

// ── The header: the tutor itself ─────────────────────────────────────────────

function Hero({ name }: { name: string }) {
  const reduce = useReduce();
  const [state, setState] = useState<"hello" | "idle">("hello");
  useEffect(() => {
    const timer = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(timer);
  }, []);
  const first = name.trim().split(/\s+/)[0];
  return (
    <header className="flex items-center gap-5">
      <span className="relative flex size-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-(--lp-line) bg-white" style={BOARD_DOTS}>
        <TutorPet size={64} state={state} reduceMotion={reduce === true} />
      </span>
      <div className="min-w-0">
        <h1 className="lp-display m-0 text-[30px] leading-[1.12] font-medium text-(--lp-ink) sm:text-[34px]">Your tutor</h1>
        <p className="m-0 mt-2 max-w-[60ch] text-[15px] leading-[1.55] text-(--lp-ink-2)">
          {first ? `How it sounds, how it teaches you, and everything it knows about you, ${first}.` : "How it sounds, how it teaches you, and everything it knows about you."}{" "}
          Changes reach it when your next session starts.
        </p>
      </div>
    </header>
  );
}

// ── Voice: a radio group of tiles ────────────────────────────────────────────

function VoicePicker({ value, onChange }: { value: TutorVoiceName; onChange: (v: TutorVoiceName) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, TUTOR_VOICES.findIndex((v) => v.name === value));
  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + TUTOR_VOICES.length) % TUTOR_VOICES.length;
    onChange(TUTOR_VOICES[next].name);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-label="Voice" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {TUTOR_VOICES.map((voice, i) => {
        const on = voice.name === value;
        return (
          <button
            key={voice.name}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onKeyDown={onKey}
            onClick={() => onChange(voice.name)}
            className={cn(
              "relative flex min-h-[60px] cursor-pointer flex-col items-start justify-center rounded-[14px] border px-3.5 py-2.5 text-left outline-none transition-[border-color,background-color,scale] duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
              "focus-visible:shadow-[0_0_0_3px_var(--lp-sky-glow)]",
              on ? "border-(--lp-sky) bg-(--lp-sky-tint)" : "border-(--lp-gray-2) bg-white hover:border-(--lp-ink)/20",
            )}
          >
            <span className="text-[14.5px] font-semibold text-(--lp-ink)">{voice.label}</span>
            <span className="text-[13px] text-(--lp-ink-2)">{voice.tone}</span>
            <span
              aria-hidden
              className={cn(
                "absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-full bg-(--lp-sky-deep) text-white transition-[opacity,scale] duration-200",
                on ? "scale-100 opacity-100" : "scale-75 opacity-0",
              )}
            >
              <Icon icon={Tick02Icon} size={12} strokeWidth={2.5} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── What it reads ────────────────────────────────────────────────────────────

const NOTE_LABELS: Record<string, string> = {
  Name: "Name",
  Level: "Grade",
  Register: "How to explain",
  "Context from the student": "Working on",
  Likes: "Into",
};
const TYPED_KEYS = new Set(["Name", "Context from the student"]);
const UI_FONT = { fontFamily: "var(--lp-font-body), system-ui, sans-serif" } as const;

function ReadsCard({ profile }: { profile: Profile | null }) {
  const lines = useMemo(() => {
    if (!profile) return null;
    return profileLines({
      displayName: profile.displayName.trim() || null,
      gradeLevel: profile.gradeLevel || null,
      learningPrefs: profile.prefs,
      extraContext: profile.extraContext,
      onboarding: { ...(sanitizeOnboarding(profile.onboarding) ?? { by: "student" }), interests: profile.interests },
    }).map((line) => {
      const cut = line.indexOf(": ");
      const key = cut > 0 ? line.slice(0, cut) : "";
      const label = NOTE_LABELS[key] ?? (key.startsWith("Stated preferences") ? "Preferences" : key || "Note");
      let text = cut > 0 ? line.slice(cut + 2) : line;
      // The interests line carries an instruction for the tutor; the student sees the list.
      if (key === "Likes") text = text.split(". Use these")[0];
      return { key, label, text };
    });
  }, [profile]);

  return (
    <section className={cn(CARD, "overflow-hidden")} aria-labelledby="reads-heading">
      <div className="flex h-12 items-center gap-2 border-b border-(--lp-line) px-5">
        <Icon icon={PencilEdit02Icon} size={16} className="text-(--lp-sky-deep)" />
        <h2 id="reads-heading" className="m-0 text-[14px] font-semibold text-(--lp-ink)">
          What your tutor reads
        </h2>
      </div>
      <div className="px-5 pt-4 pb-5" style={BOARD_DOTS}>
        {lines === null ? (
          <div className="flex flex-col gap-4">
            {["55%", "40%", "85%"].map((w) => (
              <div key={w}>
                <Skeleton className="h-3 w-16 rounded-md" />
                <Skeleton className="mt-2 h-4 rounded-md" style={{ width: w }} />
              </div>
            ))}
          </div>
        ) : (
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
        )}
      </div>
    </section>
  );
}

// ── What it remembers ────────────────────────────────────────────────────────

function MemoryCard({ notes, failed, onChange }: { notes: string[] | null; failed: boolean; onChange: (notes: string[]) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(false);

  async function forget(note: string | null) {
    setError(false);
    const before = notes ?? [];
    onChange(note === null ? [] : before.filter((n) => n !== note));
    try {
      const res = await fetch("/api/profile/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: note === null ? undefined : JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      onChange(before);
      setError(true);
    }
  }

  const shown = notes ? [...notes].reverse() : null;

  return (
    <section className={CARD} aria-labelledby="memory-heading">
      <div className="flex items-center justify-between gap-3 px-5 pt-4.5 pb-1">
        <h2 id="memory-heading" className="m-0 text-[14px] font-semibold text-(--lp-ink)">
          What it remembers
        </h2>
        {shown && shown.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="-mr-1.5 inline-flex min-h-8 cursor-pointer items-center rounded-[8px] px-1.5 text-[12.5px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--danger) focus-visible:ring-2 focus-visible:ring-(--lp-sky)"
          >
            Forget all
          </button>
        )}
      </div>
      <p className="m-0 px-5 text-[13px] leading-[1.45] text-(--lp-ink-2)">Notes it keeps between sessions about what helps you.</p>
      {shown === null ? (
        <div className="flex flex-col gap-2 px-5 pt-3 pb-5">
          <Skeleton className="h-4 w-4/5 rounded-md" />
          <Skeleton className="h-4 w-3/5 rounded-md" />
        </div>
      ) : failed ? (
        <p className="m-0 px-5 pt-3 pb-5 text-[13.5px] text-(--lp-ink-2)">Couldn&apos;t load what your tutor remembers.</p>
      ) : shown.length === 0 ? (
        <p className="m-0 px-5 pt-3 pb-5 text-[13.5px] leading-[1.5] text-(--lp-ink-3)">Nothing yet. As you work together, it jots down what helps.</p>
      ) : (
        <ul className="m-0 mt-2 flex list-none flex-col p-0 pb-2">
          {shown.map((note) => (
            <li key={note} className={cn("group/note flex items-start gap-2 border-t px-5 py-2.5 first:border-t-0", ROW_LINE)}>
              <span className="lp-hand min-w-0 flex-1 text-[15px] leading-[1.4] text-(--lp-ink)">{note}</span>
              <button
                type="button"
                onClick={() => void forget(note)}
                aria-label={`Forget: ${note}`}
                className="-mr-1.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-(--lp-ink-3) outline-none transition-[opacity,color] duration-150 hover:text-(--danger) focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-(--lp-sky) sm:opacity-0 sm:group-hover/note:opacity-100"
              >
                <Icon icon={Cancel01Icon} size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="m-0 px-5 pb-4 text-[13px] text-(--danger)">That didn&apos;t work. Try again.</p>}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="rounded-[16px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Forget everything it remembers?</AlertDialogTitle>
            <AlertDialogDescription>Your tutor starts fresh at your next session. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction className="bg-(--danger) text-white hover:bg-[#b8261a]" onClick={() => void forget(null)}>
              Forget all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
