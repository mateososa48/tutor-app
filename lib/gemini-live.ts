import { WHITEBOARD_TOOL_DECLARATIONS } from "./whiteboard-tools";
import { TUTOR_SYSTEM_PROMPT } from "./system-prompt";
import type { UploadedFile } from "./file-processor";

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
const MODEL = "gemini-3.1-flash-live-preview";
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

export type TranscriptEntry = {
  role: "tutor" | "student";
  text: string;
  id: string;
};

export type SessionCallbacks = {
  onAudio: (base64: string) => void;
  onTranscript: (entry: TranscriptEntry) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (msg: string) => void;
  onInterrupted: () => void;
};

type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function decodeBase64Text(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private callbacks: SessionCallbacks;
  private idCounter = 0;

  constructor(callbacks: SessionCallbacks) {
    this.callbacks = callbacks;
  }

  connect() {
    console.log("[Gemini] Connecting to WebSocket...");
    this.ws = new WebSocket(WS_URL);
    this.ws.onopen = () => {
      console.log("[Gemini] WebSocket open — sending setup");
      this.sendSetup();
    };
    this.ws.onmessage = async (e) => {
      let text: string;
      if (typeof e.data === "string") {
        text = e.data;
      } else if (e.data instanceof Blob) {
        text = await e.data.text();
      } else if (e.data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(e.data);
      } else {
        console.warn("[Gemini] Unhandled message type:", typeof e.data);
        return;
      }
      this.handleMessage(text);
    };
    this.ws.onclose = (e) => {
      console.log("[Gemini] WebSocket closed", e.code, e.reason);
      this.callbacks.onDisconnected();
    };
    this.ws.onerror = (e) => {
      console.error("[Gemini] WebSocket error", e);
      this.callbacks.onError("Connection error. Check your API key and network.");
    };
  }

  private sendSetup() {
    this.send({
      setup: {
        model: `models/${MODEL}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
        },
        systemInstruction: {
          parts: [{ text: TUTOR_SYSTEM_PROMPT }],
        },
        tools: [{ functionDeclarations: WHITEBOARD_TOOL_DECLARATIONS }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    });
  }

  sendAudio(base64: string) {
    this.send({
      realtimeInput: {
        audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
      },
    });
  }

  sendText(text: string) {
    this.sendUserTurn([{ text }]);
  }

  sendInitialGreeting(files: UploadedFile[]) {
    const parts = this.buildFileParts(files);
    parts.push({ text: "Hi" });
    this.sendUserTurn(parts);
  }

  sendFiles(files: UploadedFile[]) {
    const parts = this.buildFileParts(files);
    if (parts.length === 0) return;
    parts.push({
      text:
        "The student just uploaded these files during the session. " +
        "Briefly say you can see them and ask what they want to work on. " +
        "Do not summarize or solve the files until the student asks.",
    });
    this.sendUserTurn(parts);
  }

  private sendUserTurn(parts: GeminiContentPart[]) {
    this.send({
      clientContent: {
        turns: [{ role: "user", parts }],
        turnComplete: true,
      },
    });
  }

  private buildFileParts(files: UploadedFile[]): GeminiContentPart[] {
    if (files.length === 0) return [];
    const parts: GeminiContentPart[] = [
      {
        text:
          "The student has uploaded the following course materials. " +
          "They may refer to these by label (e.g. \"File 1\", \"my homework\"). " +
          "Keep them available as context, but do not discuss them until the student asks.",
      },
    ];

    for (const f of files) {
      parts.push({ text: `${f.label} — "${f.name}":` });

      if (f.mimeType === "text/plain") {
        parts.push({ text: decodeBase64Text(f.base64) || "(empty text file)" });
        continue;
      }

      if (f.mimeType === "image/jpeg" || f.mimeType === "image/png") {
        parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 } });
        continue;
      }

      parts.push({
        text: `Skipped unsupported file type (${f.mimeType || "unknown"}).`,
      });
    }

    return parts;
  }

  private sendToolResponse(id: string, name: string) {
    this.send({
      toolResponse: {
        functionResponses: [
          { id, name, response: { output: { success: true } } },
        ],
      },
    });
  }

  private nextId(): string {
    return `t${++this.idCounter}`;
  }

  private handleMessage(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.warn("[Gemini] Failed to parse message:", raw.slice(0, 200));
      return;
    }

    console.log("[Gemini] msg keys:", Object.keys(msg));

    // Setup handshake complete
    if (msg.setupComplete) {
      console.log("[Gemini] Setup complete — session active");
      this.callbacks.onConnected();
      return;
    }

    // API-level error
    if (msg.error) {
      console.error("[Gemini] API error:", JSON.stringify(msg.error));
      this.callbacks.onError(`Gemini error: ${JSON.stringify(msg.error)}`);
      return;
    }

    // Audio + transcripts from the model
    const serverContent = msg.serverContent as Record<string, unknown> | undefined;
    if (serverContent) {
      // Audio chunks
      const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined;
      const parts = (modelTurn?.parts as Array<Record<string, unknown>> | undefined) ?? [];
      for (const part of parts) {
        const inlineData = part.inlineData as Record<string, unknown> | undefined;
        if (typeof inlineData?.data === "string") {
          this.callbacks.onAudio(inlineData.data);
        }
      }

      // Model was interrupted by student speech — flush audio queue
      if (serverContent.interrupted) {
        console.log("[Gemini] Interrupted");
        this.callbacks.onInterrupted();
      }

      // Tutor speech transcript
      const outTx = serverContent.outputTranscription as Record<string, unknown> | undefined;
      if (typeof outTx?.text === "string" && outTx.text.trim()) {
        this.callbacks.onTranscript({
          role: "tutor",
          text: outTx.text.trim(),
          id: this.nextId(),
        });
      }

      // Student speech transcript (some models put it in serverContent)
      const inTx = serverContent.inputTranscription as Record<string, unknown> | undefined;
      if (typeof inTx?.text === "string" && inTx.text.trim()) {
        this.callbacks.onTranscript({
          role: "student",
          text: inTx.text.trim(),
          id: this.nextId(),
        });
      }
    }

    // Student transcript at top level (model-dependent placement)
    const topInputTx = msg.inputTranscription as Record<string, unknown> | undefined;
    if (typeof topInputTx?.text === "string" && topInputTx.text.trim()) {
      this.callbacks.onTranscript({
        role: "student",
        text: topInputTx.text.trim(),
        id: this.nextId(),
      });
    }

    // Whiteboard tool calls
    const toolCall = msg.toolCall as Record<string, unknown> | undefined;
    if (toolCall) {
      const calls = (toolCall.functionCalls as Array<Record<string, unknown>> | undefined) ?? [];
      for (const call of calls) {
        const id = call.id as string;
        const name = call.name as string;
        const args = (call.args as Record<string, unknown>) ?? {};
        this.callbacks.onToolCall(name, args);
        // Acknowledge immediately so the model can continue speaking
        this.sendToolResponse(id, name);
      }
    }
  }

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}
