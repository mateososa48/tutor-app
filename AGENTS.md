# tutor-app — notes for agents and future sessions

## This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## What this is
A live voice tutor for students in grades 5–12 with a shared whiteboard. The student talks; the tutor talks back and writes on a tldraw canvas as it teaches. Brand working name: Chalk. `PRODUCT.md` is the design brief.

## Stack
- Next.js 16 App Router, React 19, TypeScript, Tailwind v4 (CSS-first, tokens in `app/globals.css`).
- Voice: **OpenAI GPT-Live-1** over WebRTC (`gpt-live-1`). Teaching brain: a Responses model via GPT-Live "Responses delegation" (`gpt-5.6-terra` by default).
- Voice fallback: **Gemini Live** (`gemini-3.1-flash-live-preview`, one model talks and draws) behind the same client surface; picked per session, see "Voice provider switch".
- Board: tldraw v5 + KaTeX (`components/TldrawCore.tsx`, `lib/semantic-board.ts`).
- Auth: next-auth v5 (JWT). DB: Neon Postgres via Drizzle (`lib/db/schema.ts`). Route protection in `proxy.ts`.

## Architecture (branch `gpt-live`, Sept 2026)
- `app/api/live-session/route.ts` — POST with the browser's SDP offer. Loads the student's profile and memory notes, composes both prompts, registers the whiteboard tools with the backend, calls `client.live.create`, returns the SDP answer plus the greeting/resume lines. The OpenAI key never leaves the server.
- `lib/live-tutor.ts` — browser client: mic track + `oai-events` data channel, transcript assembly, backend tool loop, speaking meter (RMS on the remote track), reconnect-with-history on drop.
- `lib/live-events.ts` — pure reducers (`TranscriptAssembler`, `BackendTurnTracker`), unit-tested.
- `lib/tutor-prompts.ts` — the two prompts. Voice model: short persona + concrete "delegate when / do not delegate when" policy. Backend: output contract (spoken prose, one idea, no LaTeX), teaching loop, downshift, hint ladder, board policy, profile + memory, examples.
- `lib/whiteboard-tools.ts` — the 39 tool declarations (single source of truth) and `WHITEBOARD_FUNCTION_TOOLS` (Responses format). `lib/whiteboard-tool-dispatch.ts` validates arguments, calls the board handle, and returns a result that describes the picture ("Drew 1 circle cut into 2 equal parts, 1 shaded"); the session page appends a `[Board: …]` summary so the backend knows what the student sees.
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

## Math only (Sept 14 2026)
Chalk tutors math and nothing else (arithmetic, fractions, decimals, percent, ratios, negatives, algebra, geometry, graphs, basic statistics). The prompts say so in the persona, a "# Math only" section, and the Gemini contract; the landing FAQ, onboarding examples, and debug panel match. The board section carries a topic playbook: which picture tool for which topic. Picture tools added for the math focus, all in `components/TldrawCore.tsx` with pure helpers in `lib/board-diagrams.ts`:
- `draw_tape_diagram` (bar model: rows of boxes, `*` shades a box, `= total`, a bracket for the grand total) for ratios, parts and totals, a fraction of an amount.
- `draw_grid` (rows × columns, first N shaded) for percent, decimals, fraction of a set, area as counting squares.
- `write_vertical` (stacked +, −, × with carries and partial products, right-aligned mono) and `draw_long_division` (bracket, quotient, step lines; leading spaces place digits).
- `draw_transversal` (two parallels and a transversal, angles 1–8 clockwise from upper left, `mark_angles` arcs).
- `draw_figure` grew parallelogram, trapezoid, rhombus, pentagon, hexagon, and 3D rectangular_prism / cube / cylinder (`side_labels` = dimensions), plus `height_label` (dashed altitude with a right-angle mark). Side labels are positional: "12 | | 6" skips the right side.
- `add_function_graph` grew `mark_points`, `slope_run` (a rise/run triangle), and `second_expression` (two curves, crossing point marked: systems of equations); `draw_array` grew `shaded`; `draw_angle` grew `adjacent_degrees` (angles on a line / around a point); `add_number_line` grew `label_style` (tenths read as decimals by default) and `second_min`/`second_max` (a double number line for percent of an amount); `plot_points` grew `connect` (join into a polygon).
- `/dev/board?demo=math` replays all of them. Equation-line labels are plain text (`lib/latex-plain.ts`) so `point_at "5/6"` resolves. The eval has a `--set math` scenario set (12 topics).

## The tutor's hands (Sept 14 2026)
- **Board items.** Every tool call is one item with a short id (`b1`, `b2`, …). `dispatchWhiteboardTool` wraps each call in `board.beginItem/endItem`; the id rides in the result ("… (item b7)") and `getBoardSummary()` returns the item list (`formatBoardItems` in `lib/board-items.ts`) that the page appends as `[Board: …]`. Items resolve by id, label words, kind, or `last` (`resolveItemTarget`, unit-tested). Item bounds measure rendered text and typeset math, not their wide layout boxes.
- **Pointer and rings.** The tutor is a tldraw collaborator: an `instance_presence` record (`userId: "tutor"`, sky blue) drawn by `components/board/TutorPenOverlay.ts` (replaces tldraw's collaborator cursor overlay with a pen glyph and a name tag). `point_at` glides it onto an item with a small tap; `circle_item` draws a laser ring (presence `scribbles`, fades after ~3 s) or, with `keep=true`, an orange marker stroke. `erase_items` / `erase_older` delete items (shapes + typeset lines). The cursor hides after ~6 s idle.
- **Written, not pasted.** `revealItem` hides everything a tool call created and a queue writes it in reading order with the cursor leading (`lib/board-reveal.ts` plans order and durations): text types out, strokes and lines grow point by point (original points kept in `strokePointsRef`), boxes and arrows fade, typeset math wipes in. Small pieces flow several per frame; an item is capped at 1.8 s. Pointing and rings queue behind the writing. `onWriting` keeps the dock badge on "Writing on the board" while the queue runs. Reduced motion skips the animation.
- **The tutor sees the board.** `exportImage()` waits for the queue, then renders the board (explicit bounds covering the typeset overlay; equations drawn as plain text via `lib/latex-plain.ts`, with cross-outs and highlights) to a JPEG. The session page sends one to Gemini as a `realtimeInput.video` frame about 1 s after each tool call, and immediately for `look_at_board`. GPT-Live has no frame path yet (`TutorClient.sendBoardFrame` is optional).
- **Prompt.** "Every turn happens on the board": board moves by situation (new topic, explaining, asking, student answers, confused, referring, finished), pointing while talking, erasing when done, self-check from the picture. Examples A–G all include board moves. Same text feeds the GPT-Live backend and the single Gemini prompt.
- **Offline eval.** `npx tsx scripts/board-eval.ts [--model gemini-3.1-flash-lite] [--scenario fractions] [--turns 6] [--verbose]` replays scripted student lines through a Gemini text model with the real prompt, tools and dispatcher against a fake board and prints board-use, pointing, erase and error rates per scenario. The key is on the free tier (about 5 requests a minute), so a full run takes ~15 min; the script waits out 429s. No audio, a few cents.
- **Dev handles.** In development, `window.__chalkEditor` (tldraw Editor) and `window.__chalkBoard` (the `WhiteboardHandle`) are exposed on the session and `/dev/board` pages. `/dev/board?demo=marks` replays point/ring/erase.

## App UI (branch `session-redesign`, Sept 2026)
- One flat surface, no panels on a gray backdrop. `components/app/AppShell.tsx` = shadcn `SidebarProvider` + `AppSidebar` (light, square, edge to edge, `collapsible="icon"`, Cmd+B) + `SidebarInset`. `components/app/TopBar.tsx` is the 52px header every page shares (sidebar trigger, page content, actions). Home, Settings, the new-session loader and every session state use it.
- The session screen is the board plus a **voice dock** (`components/session/VoiceDock.tsx`, bottom right, 380px): status badge (beUI `AnimatedBadge`), the tutor's voice as a dithered wave (`VoiceWave.tsx`, WebGL, driven by the remote-audio `AnalyserNode` that `LiveTutorSession` hands out through `onAudioAnalyser`), the mic button, and a keyboard button that morphs the row into a composer (Sona UI `MorphSurface`). Two pills above it: Files (`FilesPopover.tsx`, drop zone + chips; dropping anywhere on the board also works via `useFileDrop`) and Transcript (the dock grows to full height and shows `TranscriptPanel.tsx`). End session lives in the top bar behind a confirm popover. Captions are `CaptionBar.tsx`.
- Brand tokens (`--lp-*`) are defined on `:root` as well as `.lp`, so the app and the landing share one palette and one font stack (Hanken body, Schibsted display via `lp-display`, loaded once in `app/layout.tsx`). shadcn theme variables are tuned to them (ink primary, sky ring, light sidebar). `.lp-btn` is the one pressed CTA style; use it once per screen at most.
- **Free design preview:** sign in, then open `/session?mock=1` (dev only). It creates a session and renders the live screen with a scripted transcript and a synthetic voice, never opening an OpenAI session. `/api/dev/qa-login?to=/` signs in as the QA user and lands on any path.
- The tldraw "made with" badge is moved to the bottom-left in `globals.css` so the dock never covers it (its license requires it to stay visible).
- Old `LeftNav`, `Sidebar`, `SubtitleBar`, `FloatingPanel` are gone. The sign-in and onboarding pages still use the older honey tokens.

## GPT-Live protocol facts we verified (do not relearn these)
1. The Live model's clock is driven by **inbound audio**. With no mic track nothing happens: appended context is never injected and the model never speaks. Text-only QA sessions send faint synthetic room tone (`createSyntheticMicStream`).
2. `session.instructions.append` alone never makes the model speak. `session.commentary.append` does (a near-verbatim paraphrase within ~1 s). The greeting and the resume line are sent as commentary.
3. Client-triggered backend turns work: `response.item.create` (user message or attachments) + `response.create` → the Live service creates a delegation, the voice model bridges ("let me put that on the board"), then speaks the backend's text. Typed messages and file uploads use this path.
4. Tool loop: nested `response.output_item.done` (`function_call`) → execute on the board → `response.item.create {function_call_output}` → after the nested `response.completed`, send exactly one `response.create`.
5. Sessions expire after about 2 hours (`expires_at` in `session.started`). Voice and voice instructions are immutable per session; backend settings can change with `session.update`.
6. The voice model cannot see images. Photos and PDFs go to the backend as `input_image` / `input_file` items.
7. The SDK (`openai@7.15`) has typed Live events in `node_modules/openai/resources/live/live.d.ts` and a WebSocket client (`openai/resources/live/ws`) that is handy for Node probes.

## Voice provider switch (Sept 2026)
Two live stacks share one interface (`TutorClient` in `lib/tutor-provider.ts`: `start/end/setMuted/sendText/sendFiles` with `LiveTutorCallbacks`). The session page picks one at start:
- The in-code default is **gemini** for now (OpenAI account out of credits, Sept 2026). `NEXT_PUBLIC_TUTOR_PROVIDER=openai|gemini` in `.env.local` (and on Vercel, build-time) overrides the default; `?provider=gemini` or `?provider=openai` on a session URL overrides it for that tab. The session chip shows a small "GEMINI" tag when Gemini is active. To go back to GPT-Live by default, flip the fallback in `resolveTutorProvider` or set the env var to `openai`.
- OpenAI path: `lib/live-tutor.ts` + `app/api/live-session/route.ts` (unchanged).
- Gemini path: `lib/gemini-tutor.ts` (adapter that speaks `LiveTutorCallbacks`) → `lib/gemini-live.ts` (WebSocket BidiGenerateContent client, resumable) + `lib/audio.ts` (mic capture at 16 kHz, PCM player with an AnalyserNode for the voice wave). `app/api/live-token/route.ts` composes the Gemini prompt (`buildGeminiInstructions` in `lib/tutor-prompts.ts`: voice persona + the backend teaching rules, for one model) and the voice (`geminiVoiceFor` maps the OpenAI voice choice to a Gemini prebuilt voice); `{ configOnly: true }` returns prompt + voice, a plain POST also mints a one-use ephemeral token.
- Ephemeral tokens only work on the `BidiGenerateContentConstrained` WebSocket method with `?access_token=`; the plain `BidiGenerateContent` method closes with 1008 "unregistered callers". Verified 2026-09-14 with a handshake probe.
- Gemini has no Responses-delegation split, so the whiteboard tools are called by the voice model directly. Expect it to draw less carefully than the OpenAI pair.

## Landing page (branch `landing-v3`, Sept 2026)
- Lives in `components/landing/`. `LandingPage.tsx` composes: `Header` (full-width bar that morphs into a floating glass pill on scroll, driven by one Motion spring), `Hero` (dithered-wave WebGL backdrop in `DitherWave.tsx`, no three.js), `SessionMock` (the real session screen replayed: nav rail, board, transcript), `TopicsMarquee`, `HowItWorks` (React Bits CardSwap on sm+, static column on mobile), `Bento` (four double-bordered tiles with scripted product fragments), `Founder` (React Bits ScrollReveal), `Parents` (recap card), `Faq` (shadcn Accordion), `Footer`.
- Own tokens under `.lp` in `app/globals.css` (off-white / off-black / light gray + sky accent). Buttons are `.lp-btn`: white face, 2px ink border, solid offset shadow that the face slides into on hover. Radius rule: 10px interactive, 20px surfaces, `.lp-frame` = double border.
- Fonts via `next/font` in `components/landing/fonts.ts`: Schibsted Grotesk (display), Hanken Grotesk (body), Shantell Sans (board handwriting, the same face tldraw uses).
- Board drawings live in `Board.tsx` (strokes with pathLength animation: underline, ring, arrow, number line, sticky). Product fragments in `Fragments.tsx`; timed loops via `useScript.ts` (reduced motion = final frame).
- Registries in `components.json`: shadcn (base-nova style, Base UI), `@magicui`, `@animate-ui`, `@react-bits`, plus `@reactbits-starter` / `@reactbits-pro` which need `REACTBITS_LICENSE_KEY` in `.env.local` before `npx shadcn add @reactbits-pro/faq-2` or `@reactbits-starter/dither-wave-tw` will install. 21st.dev now requires an account for its registry.
- Vendored registry copies (`components/*.tsx`, `components/ui`, `components/animate-ui`) are ours to edit; a few carry small typing patches.
- The sign-in page and app home still use the older honey accent; retokening them to the landing palette is an open task.

## Commands
- `npm run dev` — dev server. `npm test` — `tsx --test lib/*.test.ts` (board-diagrams, board-items, board-reveal, latex-plain, live-events, tutor-state). `npx tsc --noEmit`. `npm run lint` (six pre-existing errors in vendored landing components and `Sidebar.tsx`, none in `lib/` or `TldrawCore.tsx`).
- QA without a microphone: open `/api/dev/qa-login` (dev only) → lands on `/session?debug=1`, a text-only session with the QA panel. Add `&mic=1` for a real mic plus the panel. In dev, `window.__liveTutor` exposes `debugStats()` and `debugSend(event)`.

## Environment (`.env.local`)
`OPENAI_API_KEY` (required), `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`. Optional: `OPENAI_TUTOR_BACKEND_MODEL` (default `gpt-5.6-terra`; `gpt-5.6-luna` is ~10x cheaper), `OPENAI_TUTOR_REASONING_EFFORT` (default `low`). Vercel needs the same variables in BOTH the Preview and Production environments (the Preview environment was missing `DATABASE_URL`, `AUTH_SECRET`, and the tldraw key, which is why every branch deploy failed). The DB client no longer throws at build time when the variable is missing; the first query fails instead. Gemini: `GEMINI_API_KEY` (server only). `/api/live-token` falls back to `NEXT_PUBLIC_GEMINI_API_KEY`, which Vercel Production still carries from the browser-side era; once `GEMINI_API_KEY` is set on Vercel, remove the public one and rotate the key. `NEXT_PUBLIC_TUTOR_PROVIDER` picks the default provider (see "Voice provider switch").

## Costs
gpt-live-1 bills $0.05 per minute of session, plus backend tokens. Expect roughly $1.60–2.10 per 30-minute session with terra.

## Gotchas
- Branch order: `gpt-live` > `v2` > `main`. Never base work on `main`.
- Background agents must not run `git checkout` / `switch` / `stash`; one did during a read-only audit and moved the working tree to `main`.
- `.playwright-mcp/` is gitignored; Playwright MCP writes screenshots and snapshots there.
- Turbopack sometimes keeps serving a stale `globals.css` after an edit (the class you just added is missing from the served stylesheet). Fix: stop the dev server, `rm -rf .next`, start it again.
