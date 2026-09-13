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
- `lib/whiteboard-tools.ts` — the 29 tool declarations (single source of truth) and `WHITEBOARD_FUNCTION_TOOLS` (Responses format). `lib/whiteboard-tool-dispatch.ts` validates arguments, calls the board handle, and returns a result that describes the picture ("Drew 1 circle cut into 2 equal parts, 1 shaded"); the session page appends a `[Board: …]` summary so the backend knows what the student sees.
- `lib/board-diagrams.ts` — pure, unit-tested math and parsers behind the picture tools (fractions, tick steps and fraction labels, intervals/jumps syntax, figure vertices and label placement, sketch strokes). `components/TldrawCore.tsx` turns the parsed inputs into tldraw shapes.

- `app/api/profile/notes/route.ts` — durable tutor memory (`user_profiles.tutor_notes`), written by the `remember_about_student` tool and loaded into the backend prompt at session start.
- `app/api/voice-preview/route.ts` — TTS samples for the settings voice picker (`lib/voice-settings.ts` lists voices available on both GPT-Live and TTS).
- `app/session/[id]/page.tsx` — session orchestration and persistence (transcript events, board snapshots, heartbeat, pause/resume).

## The board (Sept 2026 rebuild)
- Picture tools, all rendered from real tldraw shapes: `draw_fraction` (pie or bar, improper fractions get extra wholes, typeset "= 3/4" beside the model), `add_number_line` (step, fraction tick labels, dots, shaded intervals with open/closed ends and rays, hop arrows), `draw_figure` (triangle, right triangle, square, rectangle, circle with side/vertex/angle/radius/diameter labels), `draw_angle`, `draw_array` (with dashed group splits), `add_area_model`, `draw_balance` (equation as a scale), `draw_bar_chart`, `draw_sketch` (polylines in a 0–100 box, the escape hatch). `add_function_graph`, `add_coordinate_axes`, `plot_points` draw vector axes with arrowheads and ticks; nothing is a PNG any more.
- Style rules in `TldrawCore.tsx`: `INK` (black) for structure, `PENCIL` (grey) for the student's attempts and captions, and a marker palette (`MARKERS`: blue, violet, green, orange, red, light blue) for the tutor's drawings. `takePens(n)` hands each new diagram, and each series inside one, the next pen, so two fractions, five bars or three forces never share a colour; the counter resets on `start_new_problem`. Highlights are green, cross-outs red. Headings are sans; notes and student work are tldraw's handwriting face; diagram labels are sans. Box heights come from `measureText` (tldraw's own text measurer), never from character counts. Diagrams use solid strokes; only `draw_sketch` keeps the hand-drawn wobble.
- Typeset labels on diagrams are `EqItem`s with `role: "label"`; they render inline (no display margins) and are skipped by `highlight_step` / `cross_out_step` and by the snapshot summary.
- Camera: `focusOn` treats "visible but zoomed out below 0.8" as not visible, so new content always comes back to a readable zoom (this is why the first drawing looked tiny when the student had zoomed out).
- Backend prompt (`lib/tutor-prompts.ts`) has a board-first rule: one diagnostic question at most, then draw the picture in the same reply as the idea; never describe a picture in words or fake one with brackets; one to three board actions per reply. Examples B, B2, B3 show fractions, a sketch and the balance.
- **Free visual QA:** `npm run dev` then open `/dev/board?demo=fractions|algebra|geometry|data|all&step=300&count=N`. It mounts the whiteboard and replays scripted tool calls with no OpenAI session (`app/dev/board/demos.ts`). The route is dev-only (404 in production, public in `proxy.ts` only in development). Screenshot it before touching a renderer.

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
- `npm run dev` — dev server. `npm test` — `tsx --test lib/*.test.ts`. `npx tsc --noEmit`. `npm run lint` (six pre-existing errors in vendored landing components and `Sidebar.tsx`, none in `lib/` or `TldrawCore.tsx`).
- QA without a microphone: open `/api/dev/qa-login` (dev only) → lands on `/session?debug=1`, a text-only session with the QA panel. Add `&mic=1` for a real mic plus the panel. In dev, `window.__liveTutor` exposes `debugStats()` and `debugSend(event)`.

## Environment (`.env.local`)
`OPENAI_API_KEY` (required), `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`. Optional: `OPENAI_TUTOR_BACKEND_MODEL` (default `gpt-5.6-terra`; `gpt-5.6-luna` is ~10x cheaper), `OPENAI_TUTOR_REASONING_EFFORT` (default `low`). Vercel needs the same variables in BOTH the Preview and Production environments (the Preview environment was missing `DATABASE_URL`, `AUTH_SECRET`, and the tldraw key, which is why every branch deploy failed). The DB client no longer throws at build time when the variable is missing; the first query fails instead. Gemini is no longer used: remove the `GEMINI_API_KEY` / `NEXT_PUBLIC_GEMINI_API_KEY` lines and revoke the key in AI Studio.

## Costs
gpt-live-1 bills $0.05 per minute of session, plus backend tokens. Expect roughly $1.60–2.10 per 30-minute session with terra.

## Gotchas
- Branch order: `gpt-live` > `v2` > `main`. Never base work on `main`.
- Background agents must not run `git checkout` / `switch` / `stash`; one did during a read-only audit and moved the working tree to `main`.
- `.playwright-mcp/` is gitignored; Playwright MCP writes screenshots and snapshots there.
