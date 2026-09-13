# Tutor-App v2 — Phase 1: Salvage & Unify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the uncommitted server generation from the stash, unify the three code generations onto one `v2` branch that builds green, secure the API key server-side, make tool results real, and make sessions survive network blips and the 15-minute Gemini cap.

**Architecture:** `tutor-redesign` (base, has the newest tutor behavior + matching `gemini-live.ts`) + stash@{0} (the complete server generation: NextAuth v5, Drizzle/Neon, sessions/events API, onboarding) = the canonical app. The legacy localStorage `/session` page dies; `/session/[id]` becomes the only session surface. Server becomes the source of truth.

**Tech Stack:** Next.js 16, React 19, next-auth v5 (JWT), Drizzle + @neondatabase/serverless (Neon project `spring-snow-25673112`), tldraw v5, Gemini Live API (`gemini-3.1-flash-live-preview`) over raw WebSocket.

**Context you must know before starting:**
- `main` does NOT build — it has phantom imports. Do not base work on `main`.
- The missing modules all exist in the stash. Backup branches `salvage-stash` (full stash merge commit) and `salvage-stash-untracked` (untracked-files tree) already exist — never delete these until v2 is verified and pushed.
- The stash was created ON `tutor-redesign` HEAD (`61d1ef1`), so it applies cleanly there.
- `.env.local` exists (gitignored) and already has `DATABASE_URL` and `NEXT_PUBLIC_GEMINI_API_KEY`.

---

### Task 1: Create `v2` and apply the stash

**Files:** none created by hand — git operations only.

- [ ] **Step 1: Branch from tutor-redesign**

```bash
git switch -c v2 tutor-redesign
```

- [ ] **Step 2: Apply (not pop) the stash**

```bash
git stash apply stash@{0}
```

Expected: no conflicts (stash base == branch HEAD). Restores tracked modifications (`app/page.tsx`, `app/session/page.tsx`, `app/session/[id]/page.tsx`, `lib/sessions.ts`, `lib/audio.ts`, `components/LeftNav.tsx`, `components/Whiteboard.tsx`, `app/globals.css`, `app/layout.tsx`, `next.config.ts`, `package-lock.json`) AND all 32 untracked files (`app/api/**`, `lib/db/**`, `lib/auth.ts`, `proxy.ts`, `app/onboarding/`, `app/signin/`, `app/settings/`, `components/TutorDebugPanel.tsx`, `components/SubtitleBar.tsx`, `lib/math-expression.ts`, `lib/semantic-board.ts`, `lib/tool-args.ts`, `lib/board-agent-types.ts`, `drizzle.config.ts`, `PRODUCT.md`, …). If it conflicts, stop: `git checkout -- . && git clean -fd` (careful: only if nothing else uncommitted) and investigate before retrying.

- [ ] **Step 3: Verify the phantom modules now exist**

```bash
ls lib/db/schema.ts lib/db/client.ts lib/auth.ts proxy.ts lib/math-expression.ts lib/semantic-board.ts lib/tool-args.ts components/TutorDebugPanel.tsx components/SubtitleBar.tsx app/api/sessions/route.ts app/onboarding/page.tsx
```

Expected: every path prints (no "No such file").

- [ ] **Step 4: Commit the restoration**

```bash
git add -A
git commit -m "feat: restore server generation (auth, Neon/Drizzle, sessions+events API, onboarding) from stash"
```

Do NOT `git stash drop` — keep it until Task 9's push succeeds.

### Task 2: Dependencies, env, and typecheck

**Files:**
- Modify: `package.json` (add `tsx` devDep — the `test` script uses it but it was never installed)

- [ ] **Step 1: Install**

```bash
npm install && npm install -D tsx
```

- [ ] **Step 2: Verify env vars exist (do not print values)**

```bash
grep -c "DATABASE_URL\|AUTH_SECRET\|GEMINI" .env.local
```

next-auth v5 requires `AUTH_SECRET`. If missing, generate and append:

```bash
echo "AUTH_SECRET=$(openssl rand -base64 33)" >> .env.local
```

- [ ] **Step 3: Clear stale build artifacts and typecheck**

```bash
rm -rf .next && npx tsc --noEmit
```

Expected: zero errors, or a small residue. Known-likely categories and their fixes:
- Errors in `.next/types/*` → already fixed by the `rm -rf .next`.
- `Cannot find module 'tsx'`-adjacent test errors → fixed by Step 1.
- Any remaining mismatch between `app/session/[id]/page.tsx` and `lib/gemini-live.ts`/`components/Sidebar.tsx` → the tutor-redesign versions have `constructor(callbacks, studentContext)`, `sendResumeContext`, and Sidebar's `errorMessage/fileNotice/onSendText` props, so these should be gone; if one remains, align the call site to the tutor-redesign API (the branch versions are canonical).

- [ ] **Step 4: Run the unit tests**

```bash
npm test
```

Expected: `lib/tutor-state.test.ts` passes.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: install deps (tsx), env hygiene, typecheck green"
```

### Task 3: Build green + database reachable

**Files:** none new.

- [ ] **Step 1: Production build**

```bash
npm run build
```

Expected: compiles. If a page fails on prerender because it touches the DB at build time, mark it `export const dynamic = "force-dynamic";` at the top of that `page.tsx`/`route.ts`.

- [ ] **Step 2: Confirm schema is live on Neon**

```bash
npx drizzle-kit push
```

Expected: reports no changes (tables `users`, `accounts`, `verificationToken`, `user_profiles`, `tutor_sessions`, `session_events` already exist — this generation ran in May) or creates them. Either result is success.

- [ ] **Step 3: Smoke-run dev**

```bash
npm run dev
```

Visit `http://localhost:3000` → expect redirect to `/signin` (proxy.ts route protection). Sign in with Credentials (register via the signin page if the dev DB has no user). Home page loads. **Click a recent-session card — the crash that existed on `main` must be gone.**

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: build green, drizzle schema pushed, auth flow smoke-tested"
```

### Task 4: One canonical session route

The stash's `app/page.tsx` already routes "Start new session" through `createSession()` → `/session/[id]`. The legacy `/session` page (localStorage, 8-tool handler, `alert()`s) must stop being reachable.

**Files:**
- Inspect then replace: `app/session/page.tsx`

- [ ] **Step 1: Inspect what the stash made of it**

```bash
git diff HEAD~2 -- app/session/page.tsx | head -50
```

If the stash already converted it to a redirect/stub, skip to Step 3.

- [ ] **Step 2: Replace with a redirect that creates a session**

```tsx
// app/session/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { tutorSessions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function NewSessionRedirect() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const id = `session_${Date.now()}`;
  const now = Date.now();
  await db.insert(tutorSessions).values({
    id, userId: session.user.id, title: "Session",
    startedAt: now, endedAt: now, lastActiveAt: now,
  });
  redirect(`/session/${id}`);
}
```

(If `lib/sessions.ts`'s `createSession()` already does this client-side and home uses it, prefer the simpler `redirect("/")` here — the goal is: no second live-session implementation exists.)

- [ ] **Step 3: Verify only one page constructs `GeminiLiveSession`**

```bash
grep -rn "new GeminiLiveSession" app/ components/
```

Expected: exactly one hit, in `app/session/[id]/page.tsx`.

- [ ] **Step 4: Typecheck, build, commit**

```bash
npx tsc --noEmit && npm run build
git add -A && git commit -m "refactor: single canonical session route; legacy /session page removed"
```

### Task 5: Real tool results (the tutor stops hallucinating its board)

Today `lib/gemini-live.ts` acks every tool call `{success: true}` before the whiteboard runs. The dispatcher (`lib/whiteboard-tool-dispatch.ts`) already returns rich results — they just never reach the model.

**Files:**
- Modify: `lib/gemini-live.ts` (callback type, `handleMessage` toolCall branch, `sendToolResponse`)
- Modify: `app/session/[id]/page.tsx` (the `onToolCall` callback returns the dispatch result)

- [ ] **Step 1: Change the callback contract**

In `lib/gemini-live.ts`, change:

```ts
onToolCall: (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; message?: string }>;
```

- [ ] **Step 2: Await dispatch, ack with truth**

Replace the toolCall branch in `handleMessage` (currently fire-and-forget + immediate `sendToolResponse(id, name)`):

```ts
if (toolCall) {
  const calls = (toolCall.functionCalls as Array<Record<string, unknown>> | undefined) ?? [];
  for (const call of calls) {
    const id = call.id as string;
    const name = call.name as string;
    const args = (call.args as Record<string, unknown>) ?? {};
    this.callbacks.onToolCall(name, args)
      .then((result) => this.sendToolResponse(id, name, result))
      .catch((err) => this.sendToolResponse(id, name, { success: false, message: String(err) }));
  }
}
```

And:

```ts
private sendToolResponse(id: string, name: string, result: { success: boolean; message?: string }) {
  this.send({
    toolResponse: {
      functionResponses: [
        { id, name, response: { output: result } },
      ],
    },
  });
}
```

- [ ] **Step 3: Return the dispatcher result from the page callback**

In `app/session/[id]/page.tsx`'s `onToolCall`, return `dispatchWhiteboardTool(...)`'s result object (it's synchronous-fast; wrap in `Promise.resolve` if needed to satisfy the type).

- [ ] **Step 4: Manual verification**

Start a session, say: *"cross out the third step"* before any equation exists. Expected: the tutor verbally acknowledges there's nothing to cross out (it received `success:false, message:"No matching equation step..."`) instead of narrating a fictional board.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: tool responses carry real dispatch results — model can see failures"
```

### Task 6: API key off the client (launch blocker)

**Files:**
- Create: `app/api/live-token/route.ts`
- Modify: `lib/gemini-live.ts` (connect with a fetched ephemeral token, not a bundled key)
- Modify: `.env.local` (add server-only `GEMINI_API_KEY`; delete `NEXT_PUBLIC_GEMINI_API_KEY`)

- [ ] **Step 1: Add the server SDK**

```bash
npm install @google/genai
```

- [ ] **Step 2: Rotate the key.** The old key shipped in client bundles — treat it as compromised. Create a fresh key in AI Studio, put it in `.env.local` as `GEMINI_API_KEY=...` (no `NEXT_PUBLIC_`), then disable the old key in AI Studio.

- [ ] **Step 3: Token-minting route (auth-gated)**

```ts
// app/api/live-token/route.ts
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
    httpOptions: { apiVersion: "v1alpha" },
  });
  const token = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
    },
  });
  return NextResponse.json({ token: token.name });
}
```

- [ ] **Step 4: Client connects with the ephemeral token**

In `lib/gemini-live.ts`, remove the module-level `API_KEY`/`WS_URL` constants. Make `connect()` async:

```ts
async connect() {
  const res = await fetch("/api/live-token", { method: "POST" });
  if (!res.ok) { this.callbacks.onError("Could not start a session. Please try again."); return; }
  const { token } = await res.json();
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?access_token=${encodeURIComponent(token)}`;
  this.ws = new WebSocket(url);
  // ...existing handlers unchanged
}
```

Update the call site in `app/session/[id]/page.tsx` to `await` it. Note the `v1alpha` path segment — ephemeral tokens are a v1alpha feature; if Google has promoted it by the time you run this, `v1beta` + the current docs pattern wins. Verify against https://ai.google.dev/gemini-api/docs/ephemeral-tokens.

- [ ] **Step 5: Prove the key is out of the bundle**

```bash
rm -rf .next && npm run build && grep -r "NEXT_PUBLIC_GEMINI" .next/ | wc -l
```

Expected: `0`. Also `grep -rn "NEXT_PUBLIC_GEMINI" app/ lib/ components/` → 0 hits.

- [ ] **Step 6: Manual verification + commit**

Full session works end-to-end (token → WS → audio both ways → tools draw).

```bash
git add -A && git commit -m "feat: ephemeral-token auth for Gemini Live; API key server-only; old key rotated"
```

### Task 7: Session resumption, goAway, auto-reconnect

Gemini Live enforces ~10-min connections / 15-min audio sessions. Without this task, every long session dies mid-sentence, and billing re-charges the full accumulated context every turn.

**Files:**
- Modify: `lib/gemini-live.ts`

- [ ] **Step 1: Request resumption + context compression in setup**

In `sendSetup()`, add to the `setup` object:

```ts
sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
contextWindowCompression: { slidingWindow: {} },
```

with `private resumeHandle: string | null = null;` on the class.

- [ ] **Step 2: Track the handle and the goAway warning**

In `handleMessage`, add:

```ts
const resumptionUpdate = msg.sessionResumptionUpdate as { resumable?: boolean; newHandle?: string } | undefined;
if (resumptionUpdate?.resumable && resumptionUpdate.newHandle) {
  this.resumeHandle = resumptionUpdate.newHandle;
}
const goAway = msg.goAway as { timeLeft?: string } | undefined;
if (goAway) {
  this.pendingReconnect = true; // reconnect when this socket closes
}
```

- [ ] **Step 3: Reconnect on unexpected close**

Replace the `onclose` handler:

```ts
this.ws.onclose = (e) => {
  if (this.intentionalClose) { this.callbacks.onDisconnected(); return; }
  if ((this.pendingReconnect || this.resumeHandle) && this.reconnectAttempts < 3) {
    this.reconnectAttempts++;
    this.pendingReconnect = false;
    setTimeout(() => this.connect(), 500 * this.reconnectAttempts);
  } else {
    this.callbacks.onDisconnected();
  }
};
```

with `private intentionalClose = false; private pendingReconnect = false; private reconnectAttempts = 0;` (set `intentionalClose = true` in `disconnect()`, reset `reconnectAttempts = 0` on `setupComplete`). Note: each reconnect needs a fresh ephemeral token — Task 6's `connect()` already fetches one per call (mint tokens with `uses: 3` in Task 6 if you prefer fewer round-trips).

- [ ] **Step 4: Manual verification**

Start a session, toggle Wi-Fi off/on for ~3 seconds mid-conversation. Expected: brief pause, conversation resumes with context intact (tutor still knows the problem). Then run a session past 15 minutes: no hard death.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: session resumption + context compression + auto-reconnect on goAway/drop"
```

### Task 8: Failure-UX sweep

The `[id]` page already has upfront mic permission, inline error states, and text input. This task removes the last developer-facing debris.

**Files:**
- Modify: `lib/gemini-live.ts` (error copy)
- Verify: `app/session/[id]/page.tsx`, `components/Sidebar.tsx`

- [ ] **Step 1: No `alert()` anywhere**

```bash
grep -rn "alert(" app/ components/ lib/
```

Expected: 0 hits (legacy page died in Task 4). Fix any stragglers → route to the Sidebar `errorMessage` state.

- [ ] **Step 2: User-appropriate error copy**

In `lib/gemini-live.ts`, `onerror`: replace `"Connection error. Check your API key and network."` with `"Lost connection to your tutor. Check your internet and try again."` (students don't have API keys).

- [ ] **Step 3: Manual verification matrix**

Deny mic → inline message + working "try again" (no reload needed). Offline start → friendly error. Text input works when muted.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "fix: humane failure UX — no alerts, student-appropriate copy"
```

### Task 9: Push, protect, and merge forward

- [ ] **Step 1: Push v2 with upstream**

```bash
git push -u origin v2 && git push origin salvage-stash salvage-stash-untracked
```

Pushing the salvage branches means the recovery is off this machine forever.

- [ ] **Step 2: Fast-forward main once v2 is verified**

Only after Tasks 1–8 are all verified:

```bash
git switch main && git merge --no-ff v2 -m "merge: v2 — unified generation, server auth, real tool results, resumption" && git push
```

- [ ] **Step 3: Now (and only now) drop the stash**

```bash
git stash drop stash@{0}
```

**Rule going forward: push at the end of every working session. The auth system was lost for two months because it lived only in a stash.**

---

## Out of scope for this plan (each gets its own plan doc)

- **Onboarding redesign** → `docs/superpowers/plans/2026-07-10-onboarding-redesign.md` (spec written; implementation plan finalized after this phase lands)
- **Seeing tutor** (student pen, board-snapshot-to-model with KaTeX compositing, camera homework capture, PDF pipeline)
- **Memory & personalization spine** (post-session extraction → `user_profiles`/mastery, session bootstrap via `student-context.ts`, materials library, "what your tutor knows" page)
- **Parent & money layer** (weekly digest, Stripe, free-tier metering, PostHog, landing page)
