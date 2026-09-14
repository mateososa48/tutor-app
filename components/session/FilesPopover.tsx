"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Image as ImageIcon, LoaderCircle, Paperclip, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ACCEPTED_EXTENSIONS, fileTypeLabel, type UploadedFile } from "@/lib/file-processor";
import { useFileIntake } from "./useFileIntake";

type Props = {
  files: UploadedFile[];
  onAddFiles: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
  notice?: string;
  disabled?: boolean;
  className?: string;
};

export function FilesPopover({ files, onAddFiles, onRemoveFile, notice, disabled, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { intake, processing, error } = useFileIntake(files, onAddFiles);

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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={processing}
          className="group flex w-full flex-col items-center gap-1.5 rounded-[12px] border border-dashed border-(--lp-line-strong) px-4 py-6 text-center transition-colors hover:border-(--lp-sky) hover:bg-(--lp-sky-tint) focus-visible:outline-2 focus-visible:outline-(--lp-sky)"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-(--lp-gray) text-(--lp-ink-2) transition-colors group-hover:bg-white group-hover:text-(--lp-sky-deep)">
            {processing ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" strokeWidth={2} />}
          </span>
          <span className="text-[13px] font-medium text-(--lp-ink)">
            {processing ? "Reading file…" : "Drop a photo or PDF, or browse"}
          </span>
          <span className="text-[11.5px] text-(--lp-ink-3)">Homework photos, worksheets, notes. Or drop them anywhere on the board.</span>
        </button>
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
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-(--lp-sky-soft) text-(--lp-sky-deep)">
                      {isImage ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-(--lp-ink)" title={f.name}>
                      {f.name}
                    </span>
                    <span className="shrink-0 text-[10.5px] font-semibold tracking-[0.04em] text-(--lp-ink-3) uppercase">{kind}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveFile(f.id)}
                      aria-label={`Remove ${f.name}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-(--lp-ink-3) opacity-0 transition-opacity group-hover/file:opacity-100 hover:bg-white hover:text-(--danger) focus-visible:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}

        {notice && <p className="m-0 px-2 pt-2 pb-1 text-[11.5px] text-(--lp-ink-3)">{notice}</p>}
      </PopoverContent>
    </Popover>
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
