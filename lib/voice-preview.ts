"use client";

import type { TutorVoiceName } from "./voice-settings";

// Plays a short TTS sample of a tutor voice via /api/voice-preview.

type PreviewCallbacks = {
  onAudioStart?: () => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

export type VoicePreviewController = {
  stop: () => void;
};

export function playTutorVoiceSample(
  voiceName: TutorVoiceName,
  sampleText: string,
  callbacks: PreviewCallbacks = {},
): VoicePreviewController {
  let stopped = false;
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  const controller = new AbortController();

  const cleanup = () => {
    if (audio) {
      audio.pause();
      audio.src = "";
      audio = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    cleanup();
  };

  fetch("/api/voice-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice: voiceName, text: sampleText }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`preview ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      if (stopped) return;
      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      audio.onplaying = () => callbacks.onAudioStart?.();
      audio.onended = () => {
        if (stopped) return;
        stopped = true;
        cleanup();
        callbacks.onDone?.();
      };
      audio.onerror = () => {
        if (stopped) return;
        stopped = true;
        cleanup();
        callbacks.onError?.("The voice preview could not play.");
      };
      return audio.play();
    })
    .catch((err: unknown) => {
      if (stopped || (err instanceof DOMException && err.name === "AbortError")) return;
      stopped = true;
      cleanup();
      callbacks.onError?.("The voice preview could not start.");
    });

  return { stop };
}
