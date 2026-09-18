import type { TutorRuntimeHydration, TutoringDomainEvent } from "./tutor-runtime";
import type { LearningOverview } from "./learning-overview";

const FLUSH_DELAY_MS = 1_200;
const MAX_BATCH = 100;
const MAX_QUEUE = 1_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "json">>;

function eventId(event: TutoringDomainEvent): string | null {
  if (event.type === "attempt.recorded") return event.attempt.id;
  if (event.type === "teaching_move.recorded") return event.teachingMove.id;
  return null;
}

function endpoint(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/learning`;
}

export async function loadSessionLearning(
  sessionId: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<TutorRuntimeHydration> {
  try {
    const response = await fetchImpl(endpoint(sessionId));
    if (!response.ok) return { attempts: [], teachingMoves: [] };
    const value = await response.json() as Partial<TutorRuntimeHydration>;
    return {
      attempts: Array.isArray(value.attempts) ? value.attempts : [],
      teachingMoves: Array.isArray(value.teachingMoves) ? value.teachingMoves : [],
    };
  } catch {
    return { attempts: [], teachingMoves: [] };
  }
}

export async function loadLearningOverviewClient(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<LearningOverview | null> {
  try {
    const response = await fetchImpl("/api/learning/overview");
    if (!response.ok) return null;
    const value = await response.json() as Partial<LearningOverview>;
    if (!Array.isArray(value.states) || !Array.isArray(value.focus) || typeof value.brief !== "string") return null;
    return { states: value.states, focus: value.focus, brief: value.brief };
  } catch {
    return null;
  }
}

export class LearningRecorder {
  private queue: TutoringDomainEvent[] = [];
  private seenIds = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly sessionId: string,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  get pendingCount(): number {
    return this.queue.length;
  }

  record(event: TutoringDomainEvent): void {
    const id = eventId(event);
    if (id && this.seenIds.has(id)) return;
    if (id) this.seenIds.add(id);
    this.queue.push(event);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    if (this.queue.length >= MAX_BATCH) void this.flush();
    else this.schedule();
  }

  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.chain = this.chain.then(() => this.drain());
    return this.chain;
  }

  flushBeacon(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0 || typeof navigator === "undefined") return;
    const events = this.queue.splice(0, this.queue.length);
    try {
      navigator.sendBeacon(endpoint(this.sessionId), new Blob([JSON.stringify({ events })], { type: "application/json" }));
    } catch {
      this.queue.unshift(...events);
    }
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_DELAY_MS);
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, MAX_BATCH);
      let ok = false;
      try {
        const body = JSON.stringify({ events: batch });
        const response = await this.fetchImpl(endpoint(this.sessionId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: body.length < 60_000,
        });
        ok = response.ok;
      } catch {
        ok = false;
      }
      if (ok) continue;
      this.queue.unshift(...batch);
      this.schedule();
      return;
    }
  }
}
