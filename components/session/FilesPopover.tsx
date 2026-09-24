"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, FileText, Image as ImageIcon, LoaderCircle, Paperclip, RotateCw, Smartphone, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ACCEPTED_EXTENSIONS, fileTypeLabel, type UploadedFile } from "@/lib/file-processor";
import { acceptsPhotos, MAX_PHOTOS, minutesLeft } from "@/lib/phone-link";
import { cn } from "@/lib/utils";
import { PhoneQr } from "./PhoneQr";
import { useFileIntake } from "./useFileIntake";
import { usePhoneLink, type PhoneLink } from "./usePhoneLink";

type Props = {
  files: UploadedFile[];
  onAddFiles: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
  notice?: string;
  disabled?: boolean;
  className?: string;
};

export function FilesPopover({ files, onAddFiles, onRemoveFile, notice, disabled, className }: Props) {
  // Lives here, not in the popover's content, so a code stays open (and
  // photos keep arriving) while the popover is closed and the student is on
  // their phone.
  const phone = usePhoneLink(files, onAddFiles);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" className={className} disabled={disabled} />
        }
      >
        <Paperclip strokeWidth={2} />
        Files
        {files.length > 0 && (
          <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-(--lp-ink) px-1.5 text-[11px] font-semibold text-white tabular-nums">
            {files.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={10} className="w-[340px] rounded-[16px] p-2">
        <FilesPanel files={files} onAddFiles={onAddFiles} onRemoveFile={onRemoveFile} notice={notice} phone={phone} />
      </PopoverContent>
    </Popover>
  );
}

// The popover's body on its own: the two ways in (a file from this computer,
// or a photo from the student's phone through a QR code), and the list of
// what has been added. The session page shows it inside the Files popover,
// the session intake inside its window, the landing page in the open. The
// phone option shows only where a `phone` link is passed, and never on a
// touch screen, where the device already has a camera.
export function FilesPanel({
  files,
  onAddFiles,
  onRemoveFile,
  notice,
  phone,
  hint = "Or drop them anywhere on the board.",
}: Pick<Props, "files" | "onAddFiles" | "onRemoveFile" | "notice"> & {
  /** The line under the choices. The session says "drop them on the board"; other screens say their own thing. */
  hint?: string;
  /** "Use your phone" (usePhoneLink). Without it the panel offers files only. */
  phone?: PhoneLink;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { intake, processing, error } = useFileIntake(files, onAddFiles);
  const showPhone = phone && phone.phase !== "idle";

  return (
    <>
      <AnimatePresence mode="popLayout" initial={false}>
        {showPhone ? (
          <motion.div key="phone" {...SWAP}>
            <PhoneView phone={phone} />
          </motion.div>
        ) : (
          <motion.div key="choices" {...SWAP}>
            <div className={cn("grid gap-2", phone ? "grid-cols-2 pointer-coarse:grid-cols-1" : "grid-cols-1")}>
              <Choice
                icon={processing ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" strokeWidth={2} />}
                title={processing ? "Reading file…" : phone ? "Upload a file" : "Drop a photo or PDF, or browse"}
                detail={phone ? "Photo, PDF or notes" : "Homework photos, worksheets, notes."}
                onClick={() => inputRef.current?.click()}
                disabled={processing}
                dashed
                wide={!phone}
                // Alone on a touch screen (the phone option hides there), so centred like the old drop box.
                className={phone ? "pointer-coarse:items-center pointer-coarse:py-5 pointer-coarse:text-center" : undefined}
              />
              {phone && (
                <Choice
                  icon={<Smartphone className="size-4" strokeWidth={2} />}
                  title="Use your phone"
                  detail="Snap a picture of it"
                  onClick={phone.open}
                  className="pointer-coarse:hidden"
                />
              )}
            </div>
            {hint && <p className="m-0 px-1 pt-2 text-[12px] leading-[1.45] text-(--lp-ink-2)">{hint}</p>}
          </motion.div>
        )}
      </AnimatePresence>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            void intake(e.target.files);
            e.target.value = "";
          }
        }}
      />

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            key="error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="m-0 overflow-hidden px-2 pt-2 text-[12px] text-(--danger)"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {files.length > 0 && (
        <ul className="mt-2 flex max-h-[220px] flex-col gap-0.5 overflow-y-auto [scrollbar-width:thin]">
          <AnimatePresence initial={false}>
            {files.map((f) => {
              const kind = fileTypeLabel(f.mimeType);
              const isImage = f.mimeType.startsWith("image/");
              return (
                <motion.li
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className="group/file flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-(--lp-gray)"
                >
                  {isImage && f.base64 ? (
                    // A thumbnail of the photo itself, so a phone photo can be told apart from the last one.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:${f.mimeType};base64,${f.base64}`}
                      alt=""
                      className="size-7 shrink-0 rounded-[8px] object-cover outline outline-1 -outline-offset-1 outline-black/10"
                    />
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-(--lp-sky-soft) text-(--lp-sky-deep)">
                      {isImage ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-(--lp-ink)" title={f.name}>
                    {f.name}
                  </span>
                  <span className="shrink-0 text-[10.5px] font-semibold tracking-[0.04em] text-(--lp-ink-2) uppercase">{kind}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveFile(f.id)}
                    aria-label={`Remove ${f.name}`}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-(--lp-ink-2) opacity-0 transition-opacity group-hover/file:opacity-100 hover:bg-white hover:text-(--danger) focus-visible:opacity-100 pointer-coarse:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {notice && <p className="m-0 px-2 pt-2 pb-1 text-[12px] text-(--lp-ink-2)">{notice}</p>}
    </>
  );
}

// The two views trade places quickly and softly: a small rise out of a blur.
const SWAP = {
  initial: { opacity: 0, y: 4, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -2, filter: "blur(2px)", transition: { duration: 0.12 } },
  transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const },
};

function Choice({
  icon,
  title,
  detail,
  onClick,
  disabled,
  dashed,
  wide,
  className,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
  dashed?: boolean;
  /** One choice across the panel: centred, like the drop box it replaces. */
  wide?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex min-h-[92px] flex-col justify-center gap-1 rounded-[12px] border border-[rgba(18,18,21,0.14)] p-3 text-left outline-none",
        "transition-[background-color,border-color,scale] duration-150 ease-out hover:border-(--lp-sky) hover:bg-(--lp-sky-tint) active:scale-[0.98]",
        "focus-visible:border-(--lp-sky) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) disabled:pointer-events-none",
        dashed && "border-dashed",
        wide && "items-center py-6 text-center",
        className,
      )}
    >
      <span className="mb-1 flex size-8 items-center justify-center rounded-full bg-(--lp-gray) text-(--lp-ink-2) transition-colors duration-150 group-hover:bg-white group-hover:text-(--lp-sky-deep)">
        {icon}
      </span>
      <span className="text-[13.5px] leading-tight font-medium text-(--lp-ink)">{title}</span>
      <span className="text-[12px] leading-tight text-(--lp-ink-2)">{detail}</span>
    </button>
  );
}

/** The time, refreshed every few seconds; 0 until mounted, so nothing time-based renders on the server. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, everyMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [everyMs]);
  return now;
}

// The QR code and what is happening on the phone. The code runs out on this
// clock as well as the server's, so an old code greys out on time rather than
// on the next poll.
function PhoneView({ phone }: { phone: PhoneLink }) {
  const now = useNow(5000);
  const ranOut = phone.phase === "live" && now > 0 && phone.expiresAt > 0 && now >= phone.expiresAt;
  const state = ranOut && acceptsPhotos(phone.state) ? "expired" : phone.state;
  const ended = phone.phase === "live" && !acceptsPhotos(state);
  const renew = () => {
    void phone.close();
    phone.open();
  };
  const mins = minutesLeft(phone.expiresAt, now);

  return (
    <div className="rounded-[12px] border border-[rgba(18,18,21,0.14)]">
      <div className="flex gap-3.5 p-3">
        <div className="relative flex size-[148px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white outline outline-1 -outline-offset-1 outline-black/10">
          {phone.phase === "live" && phone.url ? (
            <PhoneQr
              value={phone.url}
              size={136}
              className={cn("transition-[opacity,filter] duration-300", ended && "opacity-[0.12] blur-[2px]")}
            />
          ) : phone.phase === "error" ? (
            <span className="px-3 text-center text-[12px] leading-[1.4] text-(--lp-ink-2)">Couldn&apos;t make a code.</span>
          ) : (
            <QrSkeleton />
          )}
          {(ended || phone.phase === "error") && (
            <button
              type="button"
              onClick={phone.phase === "error" ? phone.open : renew}
              className="absolute inset-x-0 bottom-3 mx-auto inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-(--lp-ink) px-3.5 text-[13px] font-medium text-white outline-none transition-[scale,background-color] duration-150 hover:bg-[#26262b] focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-[0.96]"
            >
              <RotateCw className="size-3.5" strokeWidth={2.25} aria-hidden />
              {phone.phase === "error" ? "Try again" : "New code"}
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="m-0 text-[14px] leading-tight font-medium text-(--lp-ink)">Scan with your phone</p>
          <ol className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 text-[12.5px] leading-[1.35] text-(--lp-ink-2)">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-1.5">
                <span className="w-3 shrink-0 font-medium text-(--lp-ink) tabular-nums">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-2">
            <PhoneStatus phase={phone.phase} state={state} received={phone.received} />
          </div>
        </div>
      </div>

      <div className="flex h-11 items-center justify-between gap-2 border-t border-(--lp-line) pr-1.5 pl-3">
        <span className="text-[12px] text-(--lp-ink-2) tabular-nums">
          {phone.phase === "live" && !ended && now > 0 ? (mins <= 1 ? "Works for 1 more minute" : `Works for ${mins} more minutes`) : ""}
        </span>
        <button
          type="button"
          onClick={() => void phone.close()}
          className="inline-flex h-8 items-center rounded-[8px] px-3 text-[13px] font-medium text-(--lp-ink) outline-none transition-[background-color,scale] duration-150 hover:bg-(--lp-gray) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-[0.96]"
        >
          Done
        </button>
      </div>

      {phone.localOnly && (
        <p className="m-0 border-t border-(--lp-line) px-3 py-2 text-[12px] leading-[1.45] text-(--lp-ink-2)">
          A phone can&apos;t open localhost. Open Chalk at this computer&apos;s network address to try it.
        </p>
      )}
    </div>
  );
}

const STEPS = ["Open your camera", "Point it at the code", "Tap the link"];

function PhoneStatus({ phase, state, received }: { phase: PhoneLink["phase"]; state: PhoneLink["state"]; received: number }) {
  const [text, mark] =
    phase === "creating"
      ? ["Making a code…", "wait"]
      : phase === "error"
        ? ["Check your connection.", "none"]
        : state === "full"
          ? [`That's ${MAX_PHOTOS} photos, the most for one code.`, "none"]
          : state === "expired"
            ? ["This code ran out.", "none"]
            : state === "closed"
              ? ["This code was closed.", "none"]
              : received > 0
                ? [received === 1 ? "1 photo added" : `${received} photos added`, "done"]
                : state === "connected"
                  ? ["Phone connected", "on"]
                  : ["Waiting for your phone", "wait"];

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.p
        key={text}
        role="status"
        initial={{ opacity: 0, y: 3, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -3, filter: "blur(2px)", transition: { duration: 0.1 } }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="m-0 flex items-start gap-1.5 text-[12.5px] leading-[1.35] font-medium text-(--lp-ink)"
      >
        {mark === "done" ? (
          <Check className="mt-px size-3.5 shrink-0 text-(--lp-sky-deep)" strokeWidth={2.75} aria-hidden />
        ) : mark !== "none" ? (
          <span aria-hidden className="relative mt-[5px] flex size-2 shrink-0">
            {mark === "wait" && <span className="absolute inset-0 animate-ping rounded-full bg-(--lp-sky) opacity-60 motion-reduce:hidden" />}
            <span className="relative size-2 rounded-full bg-(--lp-sky)" />
          </span>
        ) : null}
        <span>{text}</span>
      </motion.p>
    </AnimatePresence>
  );
}

/** While the code is being made: the shape of a QR code, so the box does not jump. */
function QrSkeleton() {
  return (
    <div aria-hidden className="relative size-[136px] animate-pulse motion-reduce:animate-none">
      {[
        "top-[6px] left-[6px]",
        "top-[6px] right-[6px]",
        "bottom-[6px] left-[6px]",
      ].map((pos) => (
        <span key={pos} className={cn("absolute size-[30px] rounded-[8px] border-[5px] border-(--lp-gray)", pos)} />
      ))}
      <span className="absolute inset-[44px] rounded-[6px] bg-(--lp-gray)" />
    </div>
  );
}

export function DropOverlay({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-white/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.96, y: 6 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 6 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="flex flex-col items-center gap-2 rounded-[20px] border-2 border-dashed border-(--lp-sky) bg-white px-10 py-8 text-center shadow-(--lp-shadow-card)"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-(--lp-sky-soft) text-(--lp-sky-deep)">
              <Upload className="size-5" strokeWidth={2} />
            </span>
            <span className="lp-display text-[17px] text-(--lp-ink)">Drop it on the board</span>
            <span className="text-[13px] text-(--lp-ink-2)">The tutor will read it and ask which problem to start with.</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
