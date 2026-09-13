# tutor-app — notes for agents and future sessions

## This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## What this is
A live voice tutor for students in grades 5–12 with a shared whiteboard. The student talks; the tutor talks back and writes on a tldraw canvas as it teaches. Brand working name: Chalk. `PRODUCT.md` is the design brief.

## Stack
- Next.js 16 App Router, React 19, TypeScript, Tailwind v4 (CSS-first, tokens in `app/globals.css`).
- Voice: **OpenAI GPT-Live-1** over WebRTC (`gpt-live-1`). Teaching brain: a Responses model via GPT-Live "Responses delegation" (`gpt-5.6-terra` by default).
- Board: tldraw v5 + KaTeX (`components/TldrawCore.tsx`, `lib/semantic-board.ts`).
- Auth: next-auth v5 (JWT). DB: Neon Postgres via Drizzle (`lib/db/schema.ts`). Route protection in `proxy.ts`.

## Architecture (branch `gpt-live`, Sept 2026)
- `app/api/live-session/route.ts` — POST with the browser's SDP offer. Loads the student's profile and memory notes, composes both prompts, registers the whiteboard tools with the backend, calls `client.live.create`, returns the SDP answer plus the greeting/resume lines. The OpenAI key never leaves the server.
- `lib/live-tutor.ts` — browser client: mic track + `oai-events` data channel, transcript assembly, backend tool loop, speaking meter (RMS on the remote track), reconnect-with-history on drop.
- `lib/live-events.ts` — pure reducers (`TranscriptAssembler`, `BackendTurnTracker`), unit-tested.
- `lib/tutor-prompts.ts` — the two prompts. Voice model: short persona + concrete "delegate when / do not delegate when" policy. Backend: output contract (spoken prose, one idea, no LaTeX), teaching loop, downshift, hint ladder, board policy, profile + memory, examples.
- `lib/whiteboard-tools.ts` — the 21 tool declarations (single source of truth) and `WHITEBOARD_FUNCTION_TOOLS` (Responses format). `lib/whiteboard-tool-dispatch.ts` executes them on the board handle. Every successful tool result carries a `[Board: …]` summary so the backend knows what the student sees.
- `app/api/profile/notes/route.ts` — durable tutor memory (`user_profiles.tutor_notes`), written by the `remember_about_student` tool and loaded into the backend prompt at session start.
- `app/api/voice-preview/route.ts` — TTS samples for the settings voice picker (`lib/voice-settings.ts` lists voices available on both GPT-Live and TTS).
- `app/session/[id]/page.tsx` — session orchestration and persistence (transcript events, board snapshots, heartbeat, pause/resume).

## GPT-Live protocol facts we verified (do not relearn these)
1. The Live model's clock is driven by **inbound audio**. With no mic track nothing happens: appended context is never injected and the model never speaks. Text-only QA sessions send faint synthetic room tone (`createSyntheticMicStream`).
2. `session.instructions.append` alone never makes the model speak. `session.commentary.append` does (a near-verbatim paraphrase within ~1 s). The greeting and the resume line are sent as commentary.
3. Client-triggered backend turns work: `response.item.create` (user message or attachments) + `response.create` → the Live service creates a delegation, the voice model bridges ("let me put that on the board"), then speaks the backend's text. Typed messages and file uploads use this path.
4. Tool loop: nested `response.output_item.done` (`function_call`) → execute on the board → `response.item.create {function_call_output}` → after the nested `response.completed`, send exactly one `response.create`.
5. Sessions expire after about 2 hours (`expires_at` in `session.started`). Voice and voice instructions are immutable per session; backend settings can change with `session.update`.
6. The voice model cannot see images. Photos and PDFs go to the backend as `input_image` / `input_file` items.
7. The SDK (`openai@7.15`) has typed Live events in `node_modules/openai/resources/live/live.d.ts` and a WebSocket client (`openai/resources/live/ws`) that is handy for Node probes.

## Landing page (branch `landing-v3`, Sept 2026)
- Lives in `components/landing/`. `LandingPage.tsx` composes: `Header` (full-width bar that morphs into a floating glass pill on scroll, driven by one Motion spring), `Hero` (dithered-wave WebGL backdrop in `DitherWave.tsx`, no three.js), `SessionMock` (the real session screen replayed: nav rail, board, transcript), `TopicsMarquee`, `HowItWorks` (React Bits CardSwap on sm+, static column on mobile), `Bento` (four double-bordered tiles with scripted product fragments), `Founder` (React Bits ScrollReveal), `Parents` (recap card), `Faq` (shadcn Accordion), `Footer`.
- Own tokens under `.lp` in `app/globals.css` (off-white / off-black / light gray + sky accent). Buttons are `.lp-btn`: white face, 2px ink border, solid offset shadow that the face slides into on hover. Radius rule: 10px interactive, 20px surfaces, `.lp-frame` = double border.
- Fonts via `next/font` in `components/landing/fonts.ts`: Schibsted Grotesk (display), Hanken Grotesk (body), Shantell Sans (board handwriting, the same face tldraw uses).
- Board drawings live in `Board.tsx` (strokes with pathLength animation: underline, ring, arrow, number line, sticky). Product fragments in `Fragments.tsx`; timed loops via `useScript.ts` (reduced motion = final frame).
- Registries in `components.json`: shadcn (base-nova style, Base UI), `@magicui`, `@animate-ui`, `@react-bits`, plus `@reactbits-starter` / `@reactbits-pro` which need `REACTBITS_LICENSE_KEY` in `.env.local` before `npx shadcn add @reactbits-pro/faq-2` or `@reactbits-starter/dither-wave-tw` will install. 21st.dev now requires an account for its registry.
- Vendored registry copies (`components/*.tsx`, `components/ui`, `components/animate-ui`) are ours to edit; a few carry small typing patches.
- The sign-in page and app home still use the older honey accent; retokening them to the landing palette is an open task.

## Commands
- `npm run dev` — dev server. `npm test` — `tsx --test lib/*.test.ts`. `npx tsc --noEmit`. `npm run lint` (two pre-existing `set-state-in-effect` errors in `Sidebar.tsx` and `LandingPage.tsx`).
- QA without a microphone: open `/api/dev/qa-login` (dev only) → lands on `/session?debug=1`, a text-only session with the QA panel. Add `&mic=1` for a real mic plus the panel. In dev, `window.__liveTutor` exposes `debugStats()` and `debugSend(event)`.

## Environment (`.env.local`)
`OPENAI_API_KEY` (required), `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`. Optional: `OPENAI_TUTOR_BACKEND_MODEL` (default `gpt-5.6-terra`; `gpt-5.6-luna` is ~10x cheaper), `OPENAI_TUTOR_REASONING_EFFORT` (default `low`). Vercel needs the same variables in BOTH the Preview and Production environments (the Preview environment was missing `DATABASE_URL`, `AUTH_SECRET`, and the tldraw key, which is why every branch deploy failed). The DB client no longer throws at build time when the variable is missing; the first query fails instead. Gemini is no longer used: remove the `GEMINI_API_KEY` / `NEXT_PUBLIC_GEMINI_API_KEY` lines and revoke the key in AI Studio.

## Costs
gpt-live-1 bills $0.05 per minute of session, plus backend tokens. Expect roughly $1.60–2.10 per 30-minute session with terra.

## Gotchas
- Branch order: `gpt-live` > `v2` > `main`. Never base work on `main`.
- Background agents must not run `git checkout` / `switch` / `stash`; one did during a read-only audit and moved the working tree to `main`.
- `.playwright-mcp/` is gitignored; Playwright MCP writes screenshots and snapshots there.
