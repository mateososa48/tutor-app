# Learning Evidence and Adaptive Tutoring Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give both live providers one durable tutoring runtime, persist canonical skill attempts and assistance, derive honest learner states, feed a learner brief into the tutor, and replace the home page's fabricated focus data.

**Architecture:** A synchronous `TutorRuntime` wraps the existing policy and tutor tools, emits typed append-only learning events, and is injected into both transports. Authenticated server routes resolve skills and re-check answers before storing events in Neon, then update a deterministic per-skill projection. A small client queue keeps persistence off the voice tool-call path. The home page and live prompts consume one learning-overview service.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM with Neon Postgres, Vercel AI SDK-adjacent live transports, Node test runner through `tsx --test`.

**Specification:** `docs/superpowers/specs/2026-09-17-learning-evidence.md`

---

### Task 1: Canonical skill catalog

**Files:**
- Create: `lib/skill-catalog.ts`
- Test: `lib/skill-catalog.test.ts`

1. Write failing tests for exact keys, label/alias normalization, ambiguous or unknown labels, and catalog uniqueness.
2. Run `npx tsx --test lib/skill-catalog.test.ts` and observe the module-not-found failure.
3. Add the smallest typed catalog covering checker-supported arithmetic, fractions, decimals, percent, ratios, integer operations, algebraic expressions, equations, slope/intercepts, linear equations, and systems.
4. Implement conservative `resolveSkill` and `normalizeSkillLabel` helpers.
5. Re-run the focused test and commit when green.

### Task 2: Evidence projection

**Files:**
- Create: `lib/learning-evidence.ts`
- Test: `lib/learning-evidence.test.ts`

1. Write failing tests for building, supported, independent recent, review due, retained, needs revisit, unchecked attempts, distinct-problem and 24-hour requirements, and the retained-slip exception.
2. Run the focused test and verify it fails for missing implementation.
3. Implement immutable evidence types, problem fingerprinting, `projectSkillEvidence`, focus ranking, and a concise learner-brief formatter.
4. Re-run the focused test and commit when green.

### Task 3: Shared runtime and assistance ledger

**Files:**
- Create: `lib/tutor-runtime.ts`
- Create: `lib/tutor-runtime.test.ts`
- Modify: `lib/tutor-tools.ts`
- Modify: `lib/tutor-tools.test.ts`
- Modify: `lib/tutor-policy.ts`

1. Extend tool-schema tests first: `check_answer.help_level` is required and `record_teaching_move` declares its required fields and bounded enums.
2. Add runtime tests for one shared policy, effective help as the maximum ledger level, conservative fallback for missing help, ledger reset after a check, event emission, hydration without re-emission, and cancellation.
3. Run both focused tests and observe failures.
4. Add the teaching-move declaration and typed parsing.
5. Implement `TutorRuntime` as the sole wrapper around existing session policy and tutor-tool execution.
6. Keep deterministic answer checking synchronous; emit serializable domain events after state mutation.
7. Re-run focused and policy tests and commit when green.

### Task 4: Inject the runtime into both providers

**Files:**
- Modify: `lib/live-tutor.ts`
- Modify: `lib/live-tutor.test.ts`
- Modify: `lib/gemini-live.ts`
- Modify: `lib/gemini-live.test.ts`
- Modify: `lib/tutor-provider.ts`
- Modify: `app/session/[id]/page.tsx`

1. Write/adjust tests that construct two provider transports with the same runtime and prove attempts survive transport replacement.
2. Run the focused provider tests and observe failure.
3. Remove provider-owned `TutorPolicy` instances and delegate utterances, tutor turns, tool calls, notes, files, and cancellation to injected `TutorRuntime`.
4. Create one runtime ref in the session page and reuse it across start, reconnect, resume, and provider selection.
5. Re-run focused tests and commit when green.

### Task 5: Database schema and migration

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/sql/2026-09-17-learning-evidence.sql`
- Create: `lib/db/learning.ts`
- Create: `lib/db/learning.test.ts`

1. Write pure database-boundary tests for event validation, idempotency keys, server-side canonical resolution, checker recomputation, cancellation semantics, and projection inputs.
2. Run the focused test and observe failure.
3. Add `skills`, `teaching_moves`, `learning_attempts`, and `learner_skill_states` tables with session/user foreign keys and useful indexes.
4. Add the SQL migration, including seeded canonical skill rows.
5. Implement authenticated-user-scoped storage helpers; never trust the client verdict or canonical key.
6. Recompute only the affected user/skill projection after an insert or cancellation.
7. Re-run focused tests and commit when green.

### Task 6: Reliable learning-event client and session API

**Files:**
- Create: `lib/learning-client.ts`
- Create: `lib/learning-client.test.ts`
- Create: `app/api/sessions/[id]/learning/route.ts`
- Create: `app/api/sessions/[id]/learning/route.test.ts`
- Modify: `app/session/[id]/page.tsx`

1. Write failing queue tests for batching, retry without loss, idempotent event ids, final flush, and hydration ordering.
2. Write route tests for unauthenticated access, ownership, malformed payloads, server-side verdicts, and current-session hydration.
3. Implement the small retrying queue and authenticated GET/POST route.
4. Connect runtime events to the queue; hydrate the runtime before accepting live teaching events; flush on session end and page hide.
5. Run focused tests and commit when green.

### Task 7: Learning overview and next-session brief

**Files:**
- Create: `lib/learning-overview.ts`
- Create: `lib/learning-overview.test.ts`
- Create: `app/api/learning/overview/route.ts`
- Modify: `app/api/live-session/route.ts`
- Modify: `app/api/live-token/route.ts`
- Modify: `lib/tutor-prompts.ts`
- Modify: `lib/tutor-prompts.test.ts`

1. Write failing tests for focus ordering, new-user empty output, concise three-item briefs, evidence language, and explicit-request precedence.
2. Add prompt-contract tests requiring use of `record_teaching_move`, honest H0 semantics, optional exit checks, and respect for stopping.
3. Implement the overview service from materialized projections and expose it through an authenticated route.
4. Append the brief server-side to both live prompt paths. It may recommend one relevant retrieval check but cannot override the student's stated goal.
5. Update the tutor prompt to record help before checking answers and remove the “never end on I don't know” rule.
6. Run focused tests and commit when green.

### Task 8: Evidence-backed home focus

**Files:**
- Modify: `components/HomePage.tsx`
- Create or Modify: `lib/sessions.ts`
- Test: `lib/learning-overview.test.ts`

1. Add a failing transformation test for the exact home focus view model, including empty and error states.
2. Remove the static `FOCUS` constant and load the overview in parallel with recent sessions.
3. Render real status labels and evidence notes without claiming mastery. Preserve the existing visual system and supply honest loading, empty, and retry states.
4. Run focused tests and commit when green.

### Task 9: Documentation and complete verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

1. Document the runtime boundary, event flow, schema/migration, learner-state rules, and local verification commands.
2. Run `npm test`.
3. Run `npx tsc --noEmit`.
4. Run `npm run lint`.
5. Run `npm run build` with required environment configuration available; if unavailable, report the exact boundary.
6. Start the existing local development server, use the QA login, and inspect the home/session flows at approximately 1440px and 390px. Capture and view both screenshots; make at least two visual passes for any touched UI.
7. Inspect `git diff --check`, `git status --short`, and the final diff. Report only observed evidence.

