"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, Languages, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FooterWave } from "@/components/landing/FooterWave";
import { FilesPanel } from "@/components/session/FilesPopover";
import { useFileIntake } from "@/components/session/useFileIntake";
import type { UploadedFile } from "@/lib/file-processor";
import { EMPTY_INTAKE, SESSION_LANGUAGES, type LanguageCode, type SessionIntake } from "@/lib/session-intake";
import { TopicTiles } from "@/components/onboarding/TopicTiles";
import { lessonTopic, type StagedLesson } from "@/lib/staged-lessons";
import { cn } from "@/lib/utils";

// Two questions and nothing else: what they're stuck on, and a photo if they
// have one, through the session screen's own upload box (`FilesPanel`). The
// language sits quietly in the footer, over a pale wave of the landing
// footer's shader. Anything more read as a form, not a tutor.

// The footer wave, washed out for a small strip behind the buttons.
const WAVE_BG: [number, number, number] = [1, 1, 1];
const WAVE_TOP: [number, number, number] = [0.85, 0.91, 1];
const WAVE_DEEP: [number, number, number] = [0.72, 0.84, 1];
const WAVE_INK: [number, number, number] = [0.64, 0.79, 0.99];

export function SessionIntakeDialog({
  onStart,
  onCancel,
  starting = false,
  error,
  initialTopic = "",
  initialLessonKey,
  lessons = [],
}: {
  onStart: (intake: SessionIntake, files: UploadedFile[]) => void;
  onCancel: () => void;
  starting?: boolean;
  error?: string | null;
  /** Prefills the text box, e.g. from a "practice this" link on the home page. */
  initialTopic?: string;
  /** A lesson already picked during onboarding, so the session stays staged. */
  initialLessonKey?: string;
  /** Lessons to offer when the box is empty (lib/staged-lessons.ts, picked for the grade). */
  lessons?: readonly StagedLesson[];
}) {
  const [intake, setIntake] = useState<SessionIntake>({
    ...EMPTY_INTAKE,
    topic: initialTopic,
    ...(initialLessonKey ? { lessonKey: initialLessonKey } : {}),
  });
  const [open, setOpen] = useState(false);
  const empty = intake.topic.trim() === "";

  // Picking fills the box with the lesson's real first problem and keeps the
  // key, which is what turns the session into the staged one.
  const pick = (key: string) => {
    const lesson = lessons.find((l) => l.key === key);
    if (!lesson) return;
    setIntake((prev) => ({ ...prev, topic: lessonTopic(lesson), lessonKey: lesson.key }));
    setOpen(false);
  };
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const addFiles = (added: UploadedFile[]) => setFiles((prev) => [...prev, ...added]);
  // The panel has its own picker; this one is for dropping onto the window.
  const { intake: readFiles, error: dropError } = useFileIntake(files, addFiles);

  const submit = () => {
    if (starting) return;
    onStart({ ...intake, topic: intake.topic.trim(), fileNames: files.map((f) => f.name) }, files);
  };

  return (
    <Dialog.Root open modal onOpenChange={(next) => !next && !starting && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--lp-ink)/25 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) void readFiles(e.dataTransfer.files);
          }}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[22px] bg-(--lp-surface) outline-none",
            "shadow-[0_1px_2px_rgba(18,18,21,0.06),0_16px_40px_rgba(18,18,21,0.16),0_40px_80px_rgba(18,18,21,0.10)]",
            "transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0",
            "motion-reduce:transition-none motion-reduce:data-[starting-style]:scale-100",
            dragging && "ring-2 ring-(--lp-sky)",
          )}
        >
          <div className="px-6 pt-6">
            <Dialog.Title className="lp-display m-0 text-[22px] leading-tight text-(--lp-ink)">
              What are we working on?
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 mb-0 text-[14px] leading-[1.5] text-(--lp-ink-2)">
              Tell me what you&apos;re stuck on and I&apos;ll start right there.
            </Dialog.Description>

            <Textarea
              id="intake-topic"
              autoFocus
              rows={3}
              value={intake.topic}
              placeholder="Adding fractions, question 4"
              onChange={(e) => setIntake((prev) => ({ ...prev, topic: e.target.value, lessonKey: undefined }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              className="mt-4 min-h-[84px] resize-none rounded-[14px] text-[15px] leading-[1.5]"
            />

            {/* The suggestions live outside the window (below). Under its
                breakpoint there is nowhere to put them, so they stay one tap
                away rather than sitting in the way. */}
            {lessons.length > 0 && empty && (
              <div className="mt-2.5 lg:hidden">
                {open ? (
                  <TopicTiles
                    labelledBy="intake-suggest-label"
                    columns={1}
                    lessons={lessons.slice(0, 4)}
                    value={intake.lessonKey ?? null}
                    onChange={pick}
                  />
                ) : (
                  <button
                    type="button"
                    id="intake-suggest-label"
                    onClick={() => setOpen(true)}
                    className="-ml-1 inline-flex h-9 items-center gap-1.5 rounded-[8px] px-1 text-[13px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
                  >
                    <Sparkles className="size-3.5" strokeWidth={2.25} aria-hidden />
                    Nothing in mind?
                  </button>
                )}
              </div>
            )}

            <div className="mt-4">
              <FilesPanel
                files={files}
                onAddFiles={addFiles}
                onRemoveFile={(id) => setFiles((prev) => prev.filter((f) => f.id !== id))}
                hint="Homework photos, worksheets, notes."
              />
            </div>

            {(dropError || error) && (
              <p className="m-0 mt-2 text-[12.5px] text-(--danger)">{dropError ?? error}</p>
            )}
          </div>

          <div className="relative mt-5">
            {/* The landing footer's voice wave, pale, as the floor of the window. */}
            <FooterWave
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[124px]"
              background={WAVE_BG}
              top={WAVE_TOP}
              deep={WAVE_DEEP}
              ink={WAVE_INK}
              edge={11}
              swing={1.5}
              reserve={16}
              waveScale={3.2}
            />
            <div className="relative flex items-center justify-between gap-2 px-5 pt-6 pb-5">
              <LanguagePicker value={intake.language} onChange={(language) => setIntake((prev) => ({ ...prev, language }))} />
              <div className="flex items-center gap-1">
                <Button variant="ghost" onClick={onCancel} disabled={starting}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={starting} className="px-4">
                  {starting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Starting
                    </>
                  ) : (
                    "Start session"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Dialog.Popup>

        {/* Outside the window, not in it: a bubble beside the dialog, its tail
            pointing back at it. The dialog is 440px at most and centred, so
            220px clears its right edge. Hidden where there is no room. */}
        {lessons.length > 0 && empty && (
          <div
            className={cn(
              "fixed top-1/2 left-1/2 z-50 hidden w-[292px] -translate-y-1/2 translate-x-[236px] lg:block",
              "transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "starting:translate-x-[220px] starting:opacity-0 motion-reduce:transition-none",
            )}
          >
            <div className="relative rounded-[18px] bg-(--lp-surface) p-4 shadow-[0_1px_2px_rgba(18,18,21,0.06),0_12px_32px_rgba(18,18,21,0.12)] ring-1 ring-[rgba(18,18,21,0.07)]">
              <div aria-hidden className="absolute top-8 -left-[5px] size-2.5 rotate-45 rounded-[2px] bg-(--lp-surface) ring-1 ring-[rgba(18,18,21,0.07)]" />
              <div className="relative rounded-[2px] bg-(--lp-surface)">
                <h3 id="intake-bubble-label" className="lp-display m-0 text-[17px] leading-[1.25] text-(--lp-ink)">
                  Nothing in mind?
                </h3>
                <p className="m-0 mt-1 text-[13px] leading-[1.45] text-(--lp-ink-2)">
                  Pick one and your tutor has it planned out already.
                </p>
              </div>
              <TopicTiles
                labelledBy="intake-bubble-label"
                columns={1}
                lessons={lessons.slice(0, 4)}
                value={intake.lessonKey ?? null}
                onChange={pick}
                className="mt-3"
              />
            </div>
          </div>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LanguagePicker({ value, onChange }: { value: LanguageCode; onChange: (v: LanguageCode) => void }) {
  return (
    <Select.Root value={value} onValueChange={(next) => next && onChange(next as LanguageCode)}>
      <Select.Trigger
        aria-label="Session language"
        className="group inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[13px] text-(--lp-ink-2) transition-colors duration-150 outline-none hover:bg-(--lp-ink)/[0.05] hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) data-[popup-open]:bg-(--lp-ink)/[0.05] data-[popup-open]:text-(--lp-ink)"
      >
        <Languages aria-hidden className="size-4 shrink-0 opacity-70" />
        <Select.Value>{(code: LanguageCode) => SESSION_LANGUAGES.find((l) => l.code === code)?.label ?? ""}</Select.Value>
        <ChevronDown aria-hidden strokeWidth={2.5} className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 group-data-[popup-open]:rotate-180" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner side="top" align="start" sideOffset={8} collisionPadding={12} alignItemWithTrigger={false} className="z-[60] outline-none">
          <Select.Popup className="max-h-[min(300px,55dvh)] min-w-[200px] origin-(--transform-origin) overflow-y-auto rounded-[14px] bg-white p-1.5 shadow-[0_2px_4px_rgba(18,18,21,0.06),0_8px_8px_-6px_rgba(18,18,21,0.14)] ring-1 ring-[rgba(18,18,21,0.08)] outline-none transition-[scale,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0">
            {SESSION_LANGUAGES.map((lang) => (
              <Select.Item
                key={lang.code}
                value={lang.code}
                className="flex cursor-pointer items-center gap-2 rounded-[9px] px-2 py-1.5 outline-none select-none data-[highlighted]:bg-(--lp-gray)"
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <Select.ItemIndicator>
                    <Check className="size-4 text-(--lp-sky)" strokeWidth={2.75} />
                  </Select.ItemIndicator>
                </span>
                <Select.ItemText className="text-[13.5px] text-(--lp-ink)">{lang.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
