"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { readFileAsBase64, validateFile, type UploadedFile } from "@/lib/file-processor";

// Turns dropped or picked File objects into UploadedFile entries, with the
// validation and the "reading…" state shared by the popover and the board.
export function useFileIntake(files: UploadedFile[], onAddFiles: (files: UploadedFile[]) => void) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const intake = useCallback(
    async (raw: FileList | File[]) => {
      const valid: File[] = [];
      let firstError: string | null = null;
      for (const f of Array.from(raw)) {
        const problem = validateFile(f);
        if (problem) {
          firstError ??= problem;
          continue;
        }
        valid.push(f);
      }
      if (firstError) {
        setError(firstError);
        if (errorTimer.current) clearTimeout(errorTimer.current);
        errorTimer.current = setTimeout(() => setError(null), 4000);
      }
      if (valid.length === 0) return;
      setProcessing(true);
      const start = files.length;
      const entries: UploadedFile[] = await Promise.all(
        valid.map(async (f, i) => ({
          id: Math.random().toString(36).slice(2),
          label: `File ${start + i + 1}`,
          name: f.name,
          mimeType: f.type,
          base64: await readFileAsBase64(f),
        })),
      );
      setProcessing(false);
      onAddFiles(entries);
    },
    [files.length, onAddFiles],
  );

  return { intake, processing, error };
}

// Drag-anywhere support: counts enter/leave pairs so nested children do not
// flicker the overlay, and hands the dropped files to `onDrop`.
export function useFileDrop(onDrop: (files: FileList) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const onDragEnter = useCallback((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    depth.current += 1;
    setDragging(true);
  }, []);
  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }, []);
  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  }, []);
  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) onDrop(e.dataTransfer.files);
    },
    [onDrop],
  );

  return { dragging, handlers: { onDragEnter, onDragLeave, onDragOver, onDrop: handleDrop } };
}
