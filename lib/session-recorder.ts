// Records a live session for the admin replay (Sept 15 2026): every event is
// queued with its time since the session started and sent in batches, and
// board pictures are uploaded once each (repeats point at the first upload).
// Nothing here may disturb the session: every network failure is swallowed.
import { clampPayload } from "./session-recording";

type Actor = "student" | "tutor" | "system";
type Pending = { kind: string; actor: Actor; offsetMs: number; payload: Record<string, unknown> };

const FLUSH_DELAY_MS = 1500;
const FLUSH_SIZE = 40;
const MAX_QUEUE = 2000;

async function hashText(text: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0;
    for (let i = 0; i < text.length; i += 7) h = (h * 31 + text.charCodeAt(i)) | 0;
    return `f${text.length}-${h >>> 0}`;
  }
}

export class SessionRecorder {
  private queue: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending: Promise<void> | null = null;
  private failures = 0;
  private frameIds = new Map<string, number>();

  constructor(
    private readonly sessionId: string,
    private readonly startedAt: () => number,
  ) {}

  private offset(at: number): number {
    const start = this.startedAt();
    return start > 0 ? Math.max(0, Math.round(at - start)) : 0;
  }

  private url(part: "events" | "frames"): string {
    return `/api/sessions/${encodeURIComponent(this.sessionId)}/${part}`;
  }

  record(kind: string, actor: Actor, payload: Record<string, unknown> = {}, at = Date.now()): void {
    const clamped = clampPayload(payload);
    this.queue.push({ kind, actor, offsetMs: this.offset(at), payload: clamped && typeof clamped === "object" ? (clamped as Record<string, unknown>) : {} });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    if (this.queue.length >= FLUSH_SIZE) void this.flush();
    else if (!this.timer) this.timer = setTimeout(() => void this.flush(), FLUSH_DELAY_MS);
  }

  /** Send everything queued. Safe to call often; batches go out one at a time. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.sending) await this.sending;
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, 200);
    const body = JSON.stringify({ events });
    this.sending = fetch(this.url("events"), { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60_000 })
      .then((res) => {
        if (!res.ok) throw new Error(`events ${res.status}`);
        this.failures = 0;
      })
      .catch(() => {
        // Try again a few times, then give up rather than grow without bound.
        this.failures += 1;
        if (this.failures <= 3) this.queue.unshift(...events);
      })
      .finally(() => {
        this.sending = null;
      });
    await this.sending;
    if (this.queue.length > 0 && !this.timer) this.timer = setTimeout(() => void this.flush(), FLUSH_DELAY_MS);
  }

  /** On page hide: hand the queue to the browser, which delivers it even as the page goes away. */
  flushBeacon(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, this.queue.length);
    try {
      navigator.sendBeacon(this.url("events"), new Blob([JSON.stringify({ events })], { type: "application/json" }));
    } catch {
      // the page is going away; nothing else to do
    }
  }

  /** Save a board picture (a data URL) and a board.frame event pointing at it. */
  async recordFrame(image: { url: string; width: number; height: number }, reason: string, sentToTutor: boolean, at = Date.now()): Promise<void> {
    const comma = image.url.indexOf(",");
    if (comma < 0) return;
    const data = image.url.slice(comma + 1);
    const mime = /^data:([^;,]+)/.exec(image.url)?.[1] ?? "image/jpeg";
    const hash = await hashText(data);
    const known = this.frameIds.get(hash);
    if (known !== undefined) {
      this.record("board.frame", "system", { frameId: known, reason, sentToTutor, repeat: true }, at);
      return;
    }
    try {
      const res = await fetch(this.url("frames"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, mime, hash, width: image.width, height: image.height, offsetMs: this.offset(at), reason }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { frameId?: unknown };
      if (typeof json.frameId !== "number") return;
      this.frameIds.set(hash, json.frameId);
      this.record("board.frame", "system", { frameId: json.frameId, reason, sentToTutor, width: image.width, height: image.height }, at);
    } catch {
      // a lost picture must never disturb the session
    }
  }
}
