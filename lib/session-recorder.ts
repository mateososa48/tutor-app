// Records a live session for the admin replay (Sept 15 2026): every event is
// queued with its time since the session started and sent in batches, and
// board pictures are uploaded once each (repeats point at the first upload).
// Nothing here may disturb the session: every network failure is swallowed.
//
// Order matters (Sept 16): transcripts used to go out one POST per fragment
// and came back shuffled. Every event now carries a client sequence number
// (cseq) and batches go out strictly one at a time, in order.
import { clampPayload } from "./session-recording";

type Actor = "student" | "tutor" | "system";
type Pending = { kind: string; actor: Actor; offsetMs: number; payload: Record<string, unknown>; cseq: number; large: boolean };

const FLUSH_DELAY_MS = 1500;
const FLUSH_SIZE = 40;
const MAX_BATCH = 200;
const MAX_QUEUE = 2000;
const MAX_FAILURES = 3;

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

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "json">>;

function wire(e: Pending) {
  return { kind: e.kind, actor: e.actor, offsetMs: e.offsetMs, payload: e.payload, cseq: e.cseq };
}

export class SessionRecorder {
  private queue: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private failures = 0;
  private cseq = 0;
  private frameIds = new Map<string, number>();
  private lastLarge = new Map<string, string>();

  constructor(
    private readonly sessionId: string,
    private readonly startedAt: () => number,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
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
    this.enqueue({
      kind,
      actor,
      offsetMs: this.offset(at),
      payload: clamped && typeof clamped === "object" ? (clamped as Record<string, unknown>) : {},
      cseq: ++this.cseq,
      large: false,
    });
  }

  /**
   * A big payload (a board snapshot) is kept whole and sent in a request of
   * its own. An identical payload to the last one of the same kind is skipped.
   */
  recordLarge(kind: string, actor: Actor, payload: Record<string, unknown>, at = Date.now()): void {
    let text: string;
    try {
      text = JSON.stringify(payload);
    } catch {
      return;
    }
    if (this.lastLarge.get(kind) === text) return;
    this.lastLarge.set(kind, text);
    this.enqueue({ kind, actor, offsetMs: this.offset(at), payload, cseq: ++this.cseq, large: true });
  }

  private enqueue(event: Pending): void {
    this.queue.push(event);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    if (event.large || this.queue.length >= FLUSH_SIZE) void this.flush();
    else this.schedule(FLUSH_DELAY_MS);
  }

  private schedule(delayMs: number): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
  }

  /** Send everything queued. Safe to call often: requests go out one at a time, in order. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.chain = this.chain.then(() => this.drain());
    return this.chain;
  }

  private takeBatch(): Pending[] {
    if (this.queue[0]?.large) return this.queue.splice(0, 1);
    let n = 0;
    while (n < this.queue.length && n < MAX_BATCH && !this.queue[n].large) n++;
    return this.queue.splice(0, n);
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.takeBatch();
      if (batch.length === 0) return;
      const body = JSON.stringify({ events: batch.map(wire) });
      let ok = false;
      try {
        const res = await this.fetchImpl(this.url("events"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: body.length < 60_000,
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (ok) {
        this.failures = 0;
        continue;
      }
      // Try a batch again a few times (it keeps its place at the front), then
      // give up on it rather than block everything behind it.
      this.failures += 1;
      if (this.failures <= MAX_FAILURES) this.queue.unshift(...batch);
      else this.failures = 0;
      this.schedule(FLUSH_DELAY_MS * (this.failures + 1));
      return;
    }
  }

  /** On page hide: hand the queue to the browser, which delivers it even as the page goes away. */
  flushBeacon(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, this.queue.length);
    const send = (list: Pending[]) => {
      try {
        navigator.sendBeacon(this.url("events"), new Blob([JSON.stringify({ events: list.map(wire) })], { type: "application/json" }));
      } catch {
        // the page is going away; nothing else to do
      }
    };
    const small = events.filter((e) => !e.large);
    if (small.length > 0) send(small);
    for (const e of events) if (e.large) send([e]);
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
      const res = await this.fetchImpl(this.url("frames"), {
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
