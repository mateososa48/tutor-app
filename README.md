# Chalk — live voice tutor with a whiteboard

A student talks out loud with an AI tutor that listens, speaks, and writes every step on a shared whiteboard, and that never just hands over the answer.

**Stack:** Next.js 16 · React 19 · Tailwind v4 · tldraw v5 + KaTeX · Gemini Live or OpenAI GPT-Live-1 with a Responses reasoning backend · next-auth v5 · Neon Postgres via Drizzle.

## Run it

```bash
npm install
cp .env.local.example .env.local   # or create it; see below
npm run dev                          # http://localhost:3000
```

`.env.local` needs `OPENAI_API_KEY`, `DATABASE_URL` (Neon), `AUTH_SECRET`, and `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`. Optional: `OPENAI_TUTOR_BACKEND_MODEL`, `OPENAI_TUTOR_REASONING_EFFORT`.

For learning evidence and home-page focus, apply `lib/db/sql/2026-09-17-learning-evidence.sql` once in the Neon SQL editor. Until that migration exists, live tutoring still starts, but evidence storage and learning focus remain unavailable.

## Check it

```bash
npm test            # unit tests (tool schema, prompts, transcript + tool-loop reducers)
npx tsc --noEmit    # typecheck
npm run lint
```

For a session without a microphone, open `/api/dev/qa-login` in dev: it signs in a QA user and starts a text-only session with the debug panel.

## How a session works

1. The browser creates a WebRTC offer and POSTs it to `/api/live-session`.
2. The server composes prompts from the student's profile, memory notes, and checked learning evidence, registers the tools, and creates the selected live session.
3. The voice model talks with the student and delegates every teaching decision to the backend. The backend answers with a tool call (draw on the board) and the words to say; the browser executes tool calls on the tldraw canvas and returns results.
4. Transcript entries and board snapshots are persisted per session so a session can be resumed later.
5. Both voice providers share one `TutorRuntime`. `record_teaching_move` records how much help occurred; `check_answer` verifies the math and creates an immutable attempt. The server rechecks the answer and assistance before deriving `building`, `supported`, `independent_recent`, `review_due`, `retained`, or `needs_revisit`.

A helped correct answer is never called independent. `retained` requires correct H0 work on distinct problems at least 24 hours apart. The home page and the next-session brief read those same projections; new learners see an empty state, not sample progress.

See `AGENTS.md` for the architecture map, verified protocol details, and gotchas.
