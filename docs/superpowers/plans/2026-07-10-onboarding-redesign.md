# Onboarding Redesign — Design Spec + Task Breakdown

> **Status:** Design spec, approved direction. The step-by-step implementation plan (with exact code) gets finalized once Phase 1 (`2026-07-10-v2-salvage-and-unify.md`) lands, because these tasks build on the unified session page and auth flow.
>
> **Execution rule:** All UI work in this plan MUST start by invoking the `frontend-design` skill, use `PRODUCT.md` as the design brief (tone: warm, focused, calm — anti-references: Kahoot/Duolingo gamification, LMS corporate, sterile dashboards), and follow the screenshot-compare loop (`node serve.mjs` is replaced by `npm run dev`; `node screenshot.mjs http://localhost:3000 <label>` exists in the repo, restored from the stash).

## Why the current onboarding is being deleted

The current flow (`app/onboarding/page.tsx`, restored from stash) is a 5-step modal wizard gating the whole app: name → grade → **four abstract preference sliders** ("examples vs theory", "hint vs answer", pace, tone) → free-text context → voice picker. Its failures:

1. **It interrogates before it demonstrates.** A new user answers 5 screens of questions before ever hearing the tutor speak or seeing it draw — the product's only magic moment is buried behind its most boring surface.
2. **The questions are unanswerable.** No 13-year-old knows their position on an "examples vs theory" slider. The answers are noise, and the tutor could learn all of it by *talking to them* — which is literally what the product does.
3. **The full gauntlet is:** land → signup → 5-step wizard → home → find "Start session" → mic permission surprise → finally, the product. That's ~8 interactions to the wow. Activation is the whole business right now; every screen in that chain costs users.

## The redesign: the tutor onboards you

**Principle: time-to-wow under 60 seconds; never ask a form what a tutor can learn by listening; the first session IS the onboarding, and the memory pipeline (Phase 4) is what makes that possible permanently.**

### New flow

1. **Public landing** (`/` signed-out — currently proxy.ts just bounces to `/signin`):
   - One sentence: *"A real tutor's whiteboard session, whenever you need it."* Sub-line: *"Talk out loud with an AI tutor that draws every step on a whiteboard — and never just gives you the answer."*
   - A looping 20-second demo video (screen recording: board drawing a derivation while the tutor's voice explains — this asset doubles as TikTok content).
   - Single CTA: **"Try a session — free"**. Secondary: "Sign in".
   - Three tappable starter chips under the CTA: *"Factor x² + 5x + 6"* / *"Help with my homework (upload a photo)"* / *"Just start talking"*.
2. **CTA → guest session, instantly.** No signup. Clicking creates a guest identity server-side (a `users` row with `email: null` + an `isGuest` flag column, session cookie) and routes straight into `/session/[id]`. Mic permission is requested here with a one-line explainer above the browser prompt ("Your tutor listens and talks — allow the mic to start").
3. **Intake mode.** For any user whose `user_profiles.onboardedAt` is null, the server injects an *intake block* into the system prompt (via the existing `student-context.ts` injection point):
   - Tutor greets, asks the student's name — and **writes it on the whiteboard** (first 10 seconds: the board is alive).
   - Asks what they're working on *this week* and what grade they're in — conversationally, one question at a time, then flows straight into a real problem.
   - Hard rule in the block: intake must not exceed ~3 exchanges before actual tutoring begins.
4. **Invisible profile extraction.** On session end, a server job sends the transcript to `gemini-2.5-flash` with a JSON schema → `{displayName, gradeLevel, currentCourse, goals, observedStruggles}` → upserts `user_profiles`, sets `onboardedAt`. The wizard's data, collected without a wizard. (This is the first brick of the Phase-4 memory pipeline — built here, reused there.)
5. **Soft save wall.** Guests get one full session (capped ~15 min). At session end — after value delivery — the summary screen offers: *"Want me to remember you and what we worked on? Save your progress"* → email or Google → guest rows migrate to the account. Declining still shows the session summary (they can screenshot it; the FOMO is the retention hook).
6. **Voice picker → settings**, plus a conversational path ("You can ask me to change my voice anytime"). It is not a gate.
7. **Parents lane (deferred to Phase 5):** a "For parents" section on the landing page capturing email for the weekly digest waitlist.

### What gets measured (success criteria)

- Land → tutor speaking: **< 60 seconds, ≤ 2 clicks** (CTA + mic allow).
- Wizard deleted; `onboardedAt` set by extraction, not by form submission.
- Instrument (PostHog, Phase 5 — console events until then): landing views → CTA clicks → mic granted → first tool call rendered → session ≥ 3 min → save-wall conversion.

## Task breakdown (finalize into bite-sized steps post-Phase-1)

1. **Guest identities** — `isGuest` column migration; `POST /api/guest-session` creating user+session; cookie via next-auth anonymous session or a signed guest cookie checked in `proxy.ts` (allowlist `/`, `/session/[id]` for guests; block `/settings`, history).
2. **Landing page** — new signed-out `/` (frontend-design skill, PRODUCT.md brief, screenshot loop, ≥2 compare rounds); starter chips pass an initial prompt into session creation.
3. **Intake prompt block** — `buildIntakeBlock()` in `lib/student-context.ts`, injected when `onboardedAt` is null; includes the write-their-name-on-the-board move and the ≤3-exchange rule.
4. **Profile extraction** — `POST /api/sessions/[id]/extract-profile` called on session end; Flash + JSON schema; upsert `user_profiles`; idempotent.
5. **Soft save wall + guest migration** — end-of-session summary modal; signup attaches `tutorSessions.userId` + profile from guest row to the new account; guest session cap enforced server-side (metering groundwork).
6. **Delete the wizard** — remove `app/onboarding/page.tsx` 5-step UI; `/api/onboarding` PUT stays (settings page reuses it); voice picker moves to `app/settings/page.tsx`.
7. **QA loop** — mobile-width screenshots included (the audience is on phones); mic-denied path on the landing CTA; guest → save → history survives.
