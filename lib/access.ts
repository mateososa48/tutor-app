import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { tutorSessions } from "@/lib/db/schema";
import { refusalStatus, sessionVerdict, soloActor, type Actor, type SessionMode } from "@/lib/access-rules";

// The server side of lib/access-rules.ts: who is signed in, and whether they
// may touch a session. Route handlers call these instead of comparing ids
// themselves, so the rule changes in one place when family profiles arrive.

export type { Actor, SessionMode } from "@/lib/access-rules";

/** The signed-in actor, or null. */
export async function currentActor(): Promise<Actor | null> {
  const session = await auth();
  const id = session?.user?.id;
  return id ? soloActor(id) : null;
}

type Refused = { response: NextResponse };

/** The signed-in actor, or a 401 to return. */
export async function requireActor(): Promise<{ actor: Actor } | Refused> {
  const actor = await currentActor();
  if (!actor) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { actor };
}

/** The columns routes read along with the ownership check, so most need no
 *  second query. */
export type SessionRow = {
  userId: string;
  title: string;
  status: string;
  startedAt: number;
};

/**
 * The signed-in actor and the session, or a response to return. `hide` makes a
 * refusal a 404 whatever the reason, for reads that should not reveal that a
 * session exists.
 */
export async function requireSession(
  sessionId: string,
  mode: SessionMode,
  { hide = false }: { hide?: boolean } = {},
): Promise<{ actor: Actor; row: SessionRow } | Refused> {
  const gate = await requireActor();
  if ("response" in gate) return gate;
  const [row] = await db
    .select({ userId: tutorSessions.userId, title: tutorSessions.title, status: tutorSessions.status, startedAt: tutorSessions.startedAt })
    .from(tutorSessions)
    .where(eq(tutorSessions.id, sessionId))
    .limit(1);
  const verdict = sessionVerdict(row?.userId, gate.actor, mode);
  if (verdict !== "ok") {
    const status = refusalStatus(verdict, hide);
    return { response: NextResponse.json({ error: status === 404 ? "not found" : "Forbidden" }, { status }) };
  }
  return { actor: gate.actor, row };
}
