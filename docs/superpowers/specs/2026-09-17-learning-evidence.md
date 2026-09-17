# Learning Evidence and Adaptive Tutoring Specification

**Date:** 2026-09-17

## Goal

Make Chalk teach with a durable, evidence-based loop instead of letting each live model improvise and forget. Both voice providers must share one tutoring runtime, every judged answer must carry a canonical skill and an honest assistance level, and the next session and home page must be driven by that evidence.

This is the implementation of roadmap items 5–9:

1. extract the shared tutoring kernel;
2. add canonical skills and immutable attempts;
3. add an assistance ledger and Bridge-style decisions;
4. derive learner states and next-session briefs;
5. replace home-page learning placeholders.

## Product principles

- A correct answer after help is progress, not independent mastery.
- The app records what happened; it does not ask a model to declare mastery.
- Assistance is the maximum of declared help and observable teaching moves. Missing help is never treated as H0.
- A skill becomes `retained` only after correct H0 work on a distinct problem at least 24 hours later.
- A single slip does not erase retained knowledge. A later misconception, guess, stuck response, or ordinary incorrect answer does reopen the skill.
- Unknown model-written skill labels remain unresolved. They do not silently create permanent skills.
- The tutoring loop remains fast. Math checking and session policy are synchronous; persistence is queued in the background.
- This release is shadow-first: learning evidence informs prompts and UI, but does not autonomously lock content or make high-stakes claims.

## Shared tutoring runtime

`TutorRuntime` is the one owner of session-level teaching state. A session page creates one runtime and injects it into either the OpenAI or Gemini transport. Reconnecting or changing transports does not reset attempts, current skill, teaching moves, student signals, notes, or tool cancellations.

The runtime owns:

- the existing `TutorPolicy`;
- the current assistance ledger by skill;
- tool execution for `check_answer` and `record_teaching_move`;
- effective-help calculation;
- cancellation rollback;
- typed domain events for persistence;
- hydration of this session's previously stored attempts and moves.

The provider classes remain responsible for audio, transcripts, connection state, and tool transport. They do not own pedagogical memory.

## Canonical skills

The initial catalog is deliberately small and stable. It covers the arithmetic, fraction, percent, algebra, equation, and graph skills that the deterministic checker can already judge. Each skill has a permanent key, display label, domain, and aliases.

Resolution is conservative:

1. normalize the supplied label;
2. match a canonical key, label, or explicit alias;
3. store the raw label even when unresolved;
4. never invent a catalog row from free text.

This lets the catalog improve without rewriting historic attempts.

## Assistance ledger

The tutor receives a fast `record_teaching_move` tool. It records:

- raw and canonical skill;
- H0–H5 help level;
- move type such as focusing question, strategy hint, shown step, worked example, counterexample, or independent check;
- optional misconception diagnosis, remediation strategy, and intent.

`check_answer.help_level` becomes required. The runtime still treats a missing or invalid value conservatively for older clients: at least H1, or the highest recorded move for that skill. The attempt's effective help is the maximum of the model's claim and the ledger.

The ledger resets for that skill after an answer is checked so help from one problem does not contaminate the next.

## Immutable evidence and learner projection

Stored attempts are append-only facts. Cancellation marks an attempt cancelled; it does not rewrite history. Every attempt stores the problem, a stable problem fingerprint, student answer, checker verdict, raw/canonical skill, effective help, optional note, call id, and occurrence time.

Derived learner states are projections over non-cancelled, checkable attempts:

- `building`: activity exists but there is no successful evidence yet;
- `supported`: the latest useful success required H1–H5;
- `independent_recent`: a correct H0 attempt on a distinct problem is recent;
- `review_due`: the latest independent evidence is at least 24 hours old and has not yet been confirmed later;
- `retained`: correct H0 work on distinct problems separated by at least 24 hours;
- `needs_revisit`: a misconception, guess, stuck response, or incorrect answer occurs after the latest positive evidence.

Unchecked answers never contribute. `partial` is not mastery. A `slip` can lower confidence in recent work but does not by itself erase `retained`.

The projection stores its evidence counts and timestamps so the UI can explain why a state exists.

## Persistence and trust boundary

New database tables store the skill catalog, teaching moves, attempts, and per-user skill projections. The browser queues typed runtime events, but the authenticated server owns the record:

- verifies that the session belongs to the user;
- resolves canonical skills server-side;
- recomputes math verdicts server-side rather than trusting the browser;
- applies idempotent inserts by event id;
- recomputes only the affected skill projections.

The session learning endpoint also returns stored attempts and moves so a resumed session can hydrate the shared runtime.

## Next-session brief

An authenticated learning overview produces two outputs from the same projections:

- a compact machine-oriented brief appended to the tutor prompt;
- focus items for the home page.

The brief lists at most three useful priorities with the evidence behind them. It may suggest one relevant retrieval check, but it does not override an explicit student request and does not turn every session into a forced quiz.

The closing policy offers an optional independent exit check and respects a student's decision to stop. It no longer insists that the session cannot end on “I don't know.”

## Home page

The hard-coded focus rows are removed. The home page loads the learning overview alongside sessions and renders real priorities with honest labels and evidence notes. New users get an empty state rather than fabricated progress.

Priority order is `needs_revisit`, `review_due`, `supported`, then `building`. `retained` skills are omitted from the focus list, and `independent_recent` skills appear only when there are fewer actionable priorities.

## Out of scope

- changing the voice, avatar, or visual design of a live session;
- autonomous curriculum sequencing;
- parent or school dashboards;
- teen-safety work from roadmap items 1–4;
- production deployment.

## Acceptance criteria

- OpenAI and Gemini transports share one runtime instance per page session.
- A reconnect does not lose attempts or teaching moves.
- Every stored attempt has an immutable event id, raw skill, problem fingerprint, server-verified verdict, and effective H0–H5 level.
- A helped correct answer cannot become `independent_recent` or `retained`.
- Retention requires delayed, distinct, H0 evidence.
- Cancelling a tool call removes it from the active projection without deleting its audit record.
- The live prompt receives a concise, evidence-backed learner brief.
- The home page has no static learning claims.
- Unit tests, typecheck, lint, build, and desktop/mobile localhost review pass before handoff.

