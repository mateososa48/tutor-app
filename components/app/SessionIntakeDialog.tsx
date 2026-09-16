"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFileIntake } from "@/components/session/useFileIntake";
import { ACCEPTED_EXTENSIONS, fileTypeLabel, type UploadedFile } from "@/lib/file-processor";
import {
  EMPTY_INTAKE,
  INTAKE_GOALS,
  INTAKE_MINUTES,
  INTAKE_STAGES,
  SESSION_LANGUAGES,
  type IntakeGoal,
  type IntakeStage,
  type LanguageCode,
  type SessionIntake,
} from "@/lib/session-intake";
import { cn } from "@/lib/utils";

// Asked once, before the board opens, so the tutor's first sentence is about
// the student's actual problem. Everything except the language is optional: the
// tutor simply opens with less to go on.

const EXAMPLES = ["Adding fractions with different denominators", "Solving for x in 3x + 7 = 22", "Question 4 on the worksheet I attached"];

export function SessionIntakeDialog({
  onStart,
  onCancel,
  starting = false,
  error,
}: {
  onStart: (intake: SessionIntake, files: UploadedFile[]) => void;
  onCancel: () => void;
  starting?: boolean;
  error?: string | null;
}) {
  const [intake, setIntake] = useState<SessionIntake>(EMPTY_INTAKE);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { intake: readFiles, processing, error: fileError } = useFileIntake(files, (added) =>
    setFiles((prev) => [...prev, ...added]),
  );

  const set = <K extends keyof SessionIntake>(key: K, value: SessionIntake[K]) => setIntake((prev) => ({ ...prev, [key]: value }));
  const submit = () => {
    if (starting) return;
    onStart({ ...intake, topic: intake.topic.trim(), fileNames: files.map((f) => f.name) }, files);
  };

  return (
    <Dialog.Root open modal onOpenChange={(next) => !next && !starting && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--lp-ink)/25 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[20px] bg-(--lp-surface) outline-none",
            "shadow-[0_1px_2px_rgba(18,18,21,0.06),0_12px_32px_rgba(18,18,21,0.14),0_32px_64px_rgba(18,18,21,0.10)]",
            "max-h-[calc(100dvh-3rem)] transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0",
            "motion-reduce:transition-none motion-reduce:data-[starting-style]:scale-100",
          )}
        >
          <div className="px-6 pt-6">
            <Dialog.Title className="lp-display m-0 text-[20px] leading-tight text-(--lp-ink)">What are we working on?</Dialog.Title>
            <Dialog.Description className="mt-1.5 mb-0 text-[13.5px] leading-[1.5] text-(--lp-ink-2)">
              Your tutor opens on this, so the session starts with the problem instead of questions.
            </Dialog.Description>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-2 [scrollbar-width:thin]">
            <Field label="What do you need help with?" htmlFor="intake-topic">
              <Textarea
                id="intake-topic"
                autoFocus
                rows={3}
                value={intake.topic}
                placeholder="Adding fractions with different denominators, question 4…"
                onChange={(e) => set("topic", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                className="min-h-[86px] resize-none text-[14px]"
              />
              {intake.topic.trim() === "" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => set("topic", example)}
                      className="cursor-pointer rounded-full bg-(--lp-gray) px-2.5 py-1 text-[12px] text-(--lp-ink-2) transition-colors duration-150 outline-none hover:bg-(--lp-gray-2) hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field label="A photo of the work (optional)">
              <div
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
                  "rounded-[14px] border border-dashed p-3 transition-colors duration-150",
                  dragging ? "border-(--lp-sky) bg-(--lp-sky-tint)" : "border-(--lp-line-strong) bg-(--lp-bg)",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {files.map((file) => (
                    <span key={file.id} className="relative">
                      {file.mimeType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`data:${file.mimeType};base64,${file.base64}`}
                          alt={file.name}
                          className="size-14 rounded-[10px] object-cover shadow-[0_0_0_1px_rgba(18,18,21,0.1)]"
                        />
                      ) : (
                        <span className="flex h-14 items-center gap-2 rounded-[10px] bg-(--lp-surface) px-3 text-[12.5px] text-(--lp-ink-2) shadow-[0_0_0_1px_rgba(18,18,21,0.1)]">
                          <span className="font-medium text-(--lp-ink)">{fileTypeLabel(file.mimeType)}</span>
                          <span className="max-w-[140px] truncate">{file.name}</span>
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => setFiles((prev) => prev.filter((f) => f.id !== file.id))}
                        className="absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-(--lp-ink) text-(--lp-surface) outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
                      >
                        <X className="size-3" strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex h-14 cursor-pointer items-center gap-2 rounded-[10px] px-3 text-[13px] text-(--lp-ink-2) transition-colors duration-150 outline-none hover:bg-(--lp-gray) hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
                  >
                    {processing ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    {files.length ? "Add another" : "Add a photo, PDF or text file"}
                  </button>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_EXTENSIONS}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) void readFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              {fileError && <p className="mt-1.5 mb-0 text-[12.5px] text-(--danger)">{fileError}</p>}
            </Field>

            <Field label="Where are you with it?">
              <Chips
                options={INTAKE_STAGES.map((s) => [s.id, s.label] as [IntakeStage, string])}
                value={intake.stage}
                onChange={(v) => set("stage", v)}
              />
            </Field>

            <Field label="What's it for?">
              <Chips
                options={INTAKE_GOALS.map((g) => [g.id, g.label] as [IntakeGoal, string])}
                value={intake.goal}
                onChange={(v) => set("goal", v)}
              />
            </Field>

            <Field label="How long do you have?">
              <Chips
                options={INTAKE_MINUTES.map((m) => [m, `${m} min`] as [number, string])}
                value={intake.minutes}
                onChange={(v) => set("minutes", v)}
              />
            </Field>

            <Field label="Language">
              <Select.Root
                value={intake.language}
                onValueChange={(next) => next && set("language", next as LanguageCode)}
              >
                <Select.Trigger
                  aria-label="Session language"
                  className="group flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-(--lp-line-strong) bg-(--lp-surface) px-3 text-[14px] text-(--lp-ink) outline-none transition-colors duration-150 hover:bg-(--lp-gray) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) data-[popup-open]:ring-3 data-[popup-open]:ring-(--lp-sky-glow)"
                >
                  <Select.Value>
                    {(value: LanguageCode) => {
                      const lang = SESSION_LANGUAGES.find((l) => l.code === value);
                      return lang ? `${lang.label} (${lang.english})` : "";
                    }}
                  </Select.Value>
                  <ChevronDown
                    aria-hidden
                    strokeWidth={2.5}
                    className="size-4 shrink-0 opacity-60 transition-transform duration-200 group-data-[popup-open]:rotate-180"
                  />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} alignItemWithTrigger={false} className="z-[60] outline-none">
                    <Select.Popup className="max-h-[min(320px,60dvh)] w-[var(--anchor-width)] min-w-[220px] origin-(--transform-origin) overflow-y-auto rounded-[14px] bg-white p-1.5 ring-1 ring-[rgba(18,18,21,0.08)] outline-none shadow-[0_2px_4px_rgba(18,18,21,0.06),0_8px_8px_-6px_rgba(18,18,21,0.14)] transition-[scale,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0">
                      {SESSION_LANGUAGES.map((lang) => (
                        <Select.Item
                          key={lang.code}
                          value={lang.code}
                          className="flex cursor-pointer items-center gap-2 rounded-[9px] px-2 py-2 outline-none select-none data-[highlighted]:bg-(--lp-gray)"
                        >
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            <Select.ItemIndicator>
                              <Check className="size-4 text-(--lp-sky)" strokeWidth={2.75} />
                            </Select.ItemIndicator>
                          </span>
                          <Select.ItemText className="text-[14px] text-(--lp-ink)">
                            {lang.label} <span className="text-(--lp-ink-3)">({lang.english})</span>
                          </Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-(--lp-line) px-6 py-4">
            <p className="m-0 min-w-0 flex-1 text-[12.5px] text-(--lp-ink-2)">
              {error ? <span className="text-(--danger)">{error}</span> : "Everything except the language is optional."}
            </p>
            <div className="flex shrink-0 items-center gap-2">
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
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-medium text-(--lp-ink)">
          {label}
        </label>
      ) : (
        <p className="m-0 mb-1.5 text-[12.5px] font-medium text-(--lp-ink)">{label}</p>
      )}
      {children}
    </div>
  );
}

function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([id, label]) => {
        const active = value === id;
        return (
          <button
            key={String(id)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : id)}
            className={cn(
              "cursor-pointer rounded-full px-3 py-1.5 text-[13px] transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
              active
                ? "bg-(--lp-sky-soft) text-(--lp-ink) shadow-[inset_0_0_0_1px_var(--lp-sky)]"
                : "bg-(--lp-gray) text-(--lp-ink-2) hover:bg-(--lp-gray-2) hover:text-(--lp-ink)",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
