"use client";

import { AudioPlayer } from "./audio";
import type { TutorVoiceName } from "./voice-settings";

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const MODEL = "gemini-3.1-flash-live-preview";
const WS_URL = API_KEY
  ? `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`
  : "";

type PreviewCallbacks = {
  onAudioStart?: () => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

export type VoicePreviewController = {
  stop: () => void;
};

type GeminiPart = {
  text?: string;
  inlineData?: {
    data?: string;
  };
};

function parseMessageData(data: MessageEvent["data"]): Promise<string> {
  if (typeof data === "string") return Promise.resolve(data);
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return Promise.resolve(new TextDecoder().decode(data));
  return Promise.resolve("");
}

export function playTutorVoiceSample(
  voiceName: TutorVoiceName,
  sampleText: string,
  callbacks: PreviewCallbacks = {},
): VoicePreviewController {
  if (!API_KEY || !WS_URL) {
    callbacks.onError?.("Gemini API key is missing.");
    return { stop: () => {} };
  }

  const player = new AudioPlayer();
  player.resume();

  const ws = new WebSocket(WS_URL);
  let stopped = false;
  let audioStarted = false;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    stopped = true;
    if (doneTimer) clearTimeout(doneTimer);
    try {
      ws.close(1000, "voice preview stopped");
    } catch {}
    player.close();
  };

  const finishAfterPlayback = () => {
    if (stopped || doneTimer) return;
    const waitMs = Math.max(650, player.getPendingDurationMs() + 180);
    doneTimer = setTimeout(() => {
      if (stopped) return;
      stopped = true;
      try {
        ws.close(1000, "voice preview complete");
      } catch {}
      player.close();
      callbacks.onDone?.();
    }, waitMs);
  };

  const send = (payload: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  ws.onopen = () => {
    send({
      setup: {
        model: `models/${MODEL}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
        systemInstruction: {
          parts: [
            {
              text:
                "You are a voice preview. Say the requested line once, naturally and briefly. Do not add extra words.",
            },
          ],
        },
        outputAudioTranscription: {},
      },
    });
  };

  ws.onmessage = async (event) => {
    if (stopped) return;
    const raw = await parseMessageData(event.data);
    if (!raw) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.setupComplete) {
      send({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: `Say exactly: "${sampleText}"` }],
            },
          ],
          turnComplete: true,
        },
      });
      return;
    }

    if (msg.error) {
      stopped = true;
      player.close();
      callbacks.onError?.("The voice preview could not play.");
      return;
    }

    const serverContent = msg.serverContent as Record<string, unknown> | undefined;
    if (!serverContent) return;

    const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined;
    const parts = (modelTurn?.parts as GeminiPart[] | undefined) ?? [];
    for (const part of parts) {
      const audio = part.inlineData?.data;
      if (!audio) continue;
      if (!audioStarted) {
        audioStarted = true;
        callbacks.onAudioStart?.();
      }
      player.enqueue(audio);
    }

    if (serverContent.turnComplete || serverContent.generationComplete) {
      finishAfterPlayback();
    }
  };

  ws.onerror = () => {
    if (stopped) return;
    stopped = true;
    player.close();
    callbacks.onError?.("The voice preview connection failed.");
  };

  ws.onclose = () => {
    if (stopped || audioStarted) return;
    stopped = true;
    player.close();
    callbacks.onError?.("The voice preview ended before audio arrived.");
  };

  return { stop };
}
