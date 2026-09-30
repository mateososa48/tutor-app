// Who may touch a tutoring session, decided in one place (Sept 30 2026).
//
// Every session route used to compare `rows[0].userId !== session.user.id`
// inline, about a dozen times over, with the heartbeat and pause routes
// checking nothing. Family accounts make "who is asking" two things, so the
// rule lives here, pure and tested, and lib/access.ts applies it.

/** Who is asking. `learnerId` is the profile being used right now (today the
 *  signed-in user); `accountId` is the login behind it, which never changes;
 *  `actsAs` is every learner that login may use. */
export type Actor = {
  learnerId: string;
  accountId: string;
  actsAs: readonly string[];
};

/**
 * `own`: read or change a session as the learner it belongs to.
 * `write`: keep writing to a session that is already running. Any learner the
 * login may use is enough, so a recorder still sending for Ana after the
 * device switched to Leo lands its events on Ana's session, never on Leo's,
 * and never drops them.
 */
export type SessionMode = "own" | "write";

export type Verdict = "ok" | "missing" | "forbidden";

export function sessionVerdict(ownerId: string | null | undefined, actor: Actor, mode: SessionMode): Verdict {
  if (!ownerId) return "missing";
  if (ownerId === actor.learnerId) return "ok";
  if (mode === "write" && actor.actsAs.includes(ownerId)) return "ok";
  return "forbidden";
}

/** The status a refusal answers with. Reads hide that the session exists
 *  (404 either way); writes say which it was. */
export function refusalStatus(verdict: Exclude<Verdict, "ok">, hide: boolean): 403 | 404 {
  if (verdict === "missing" || hide) return 404;
  return 403;
}

/** The actor for a plain signed-in user: the login is its own learner. */
export function soloActor(userId: string): Actor {
  return { learnerId: userId, accountId: userId, actsAs: [userId] };
}
