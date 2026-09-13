# Chalk — live voice tutor with a whiteboard

A student talks out loud with an AI tutor that listens, speaks, and writes every step on a shared whiteboard, and that never just hands over the answer.

**Stack:** Next.js 16 · React 19 · Tailwind v4 · tldraw v5 + KaTeX · OpenAI GPT-Live-1 (voice, WebRTC) with a Responses reasoning backend (teaching brain) · next-auth v5 · Neon Postgres via Drizzle.

## Run it

```bash
npm install
cp .env.local.example .env.local   # or create it; see below
npm run dev                          # http://localhost:3000
```

`.env.local` needs `OPENAI_API_KEY`, `DATABASE_URL` (Neon), `AUTH_SECRET`, and `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`. Optional: `OPENAI_TUTOR_BACKEND_MODEL`, `OPENAI_TUTOR_REASONING_EFFORT`.

## Check it

```bash
npm test            # unit tests (tool schema, prompts, transcript + tool-loop reducers)
npx tsc --noEmit    # typecheck
npm run lint
```

For a session without a microphone, open `/api/dev/qa-login` in dev: it signs in a QA user and starts a text-only session with the debug panel.

## How a session works

1. The browser creates a WebRTC offer and POSTs it to `/api/live-session`.
2. The server composes two prompts from the student's profile and memory notes: a short one for the voice model and the full teaching policy for the backend, registers the whiteboard tools, and creates the GPT-Live session.
3. The voice model talks with the student and delegates every teaching decision to the backend. The backend answers with a tool call (draw on the board) and the words to say; the browser executes tool calls on the tldraw canvas and returns results.
4. Transcript entries and board snapshots are persisted per session so a session can be resumed later.

See `AGENTS.md` for the architecture map, verified protocol details, and gotchas.
