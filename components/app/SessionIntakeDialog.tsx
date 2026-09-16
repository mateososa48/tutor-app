"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, ImagePlus, Languages, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FooterWave } from "@/components/landing/FooterWave";
import { useFileIntake } from "@/components/session/useFileIntake";
import { ACCEPTED_EXTENSIONS, fileTypeLabel, type UploadedFile } from "@/lib/file-processor";
import { EMPTY_INTAKE, SESSION_LANGUAGES, type LanguageCode, type SessionIntake } from "@/lib/session-intake";
import { cn } from "@/lib/utils";

// Two questions and nothing else: what they're stuck on, and a photo if they
// have one. The language sits quietly in the footer, on a pale band of the
// landing footer's voice wave. Anything more read as a form, not a tutor.

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
              onChange={(e) => setIntake((prev) => ({ ...prev, topic: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              className="mt-4 min-h-[92px] resize-none rounded-[14px] text-[15px] leading-[1.5]"
            />

            {files.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
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
                      <span className="flex h-14 items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] text-(--lp-ink-2) shadow-[0_0_0_1px_rgba(18,18,21,0.1)]">
                        <span className="font-medium text-(--lp-ink)">{fileTypeLabel(file.mimeType)}</span>
                        <span className="max-w-[120px] truncate">{file.name}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setFiles((prev) => prev.filter((f) => f.id !== file.id))}
                      className="absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-(--lp-ink) text-white outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
                    >
                      <X className="size-3" strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex min-h-8 items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-(--lp-gray) px-3 py-1.5 text-[13px] text-(--lp-ink-2) transition-colors duration-150 outline-none hover:bg-(--lp-gray-2) hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
              >
                {processing ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                {files.length > 0 ? "Add another photo" : "Add a photo"}
              </button>
              {fileError && <span className="text-[12.5px] text-(--danger)">{fileError}</span>}
              {error && !fileError && <span className="text-[12.5px] text-(--danger)">{error}</span>}
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

          <div className="relative mt-5">
            {/* The landing footer's voice wave, pale, as the floor of the window. */}
            <FooterWave
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[104px]"
              background={WAVE_BG}
              top={WAVE_TOP}
              deep={WAVE_DEEP}
              ink={WAVE_INK}
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
