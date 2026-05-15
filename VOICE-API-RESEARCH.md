# Voice API Comparison: Gemini Live vs. OpenAI Realtime
## For the AI Tutor Prototype — May 2026

---

## Executive Summary

**Short answer: Stay on Gemini Live for now. The cost gap is real (~4x cheaper), the migration is non-trivial, and a critical gap in OpenAI Realtime (no binary file injection) would break the homework-upload feature we just built. But watch gpt-realtime-mini — it's the serious contender if voice quality becomes the top user complaint.**

However, this research also uncovered a bug in the *current* Gemini implementation that needs fixing regardless: **PDFs are not supported in Gemini Live sessions**. Our `sendFiles()` method sends PDFs as `inlineData`, but Google's Live API does not accept PDF MIME types in BidiGenerateContent — only images and audio. PDFs silently fail or are ignored.

---

## 1. Model Landscape

### Gemini Live (Google)

| Model | Status | Notes |
|---|---|---|
| `gemini-3.1-flash-live-preview` | Preview (Mar 2026) | Current flagship, highest audio quality, synchronous tools only |
| `gemini-2.5-flash-native-audio` | **GA on Vertex AI** | Production-safe SLA, async tool calls, recommended for prod |
| `gemini-2.0-flash-live-001` | **Shut down Dec 2025** | — |
| `gemini-live-2.5-flash-preview` | **Shut down Dec 2025** | — |

We are currently using `gemini-3.1-flash-live-preview`. That's the latest and best-sounding, but it carries no SLA. For a prototype this is fine; for a real product we'd move to Vertex AI + `gemini-2.5-flash-native-audio`.

### OpenAI Realtime (OpenAI)

| Model | Status | Notes |
|---|---|---|
| `gpt-realtime-2` | GA (May 7, 2026) | Current flagship, GPT-5-class reasoning, configurable reasoning effort |
| `gpt-realtime-1.5` | GA | Previous generation, same price as `gpt-realtime-2`, lower quality |
| `gpt-realtime-mini` | GA | Cost-optimized, lower latency, narrower capabilities |
| `gpt-realtime-translate` | GA (May 7, 2026) | Speech-to-speech live translation |
| `gpt-4o-realtime-preview-*` | **Deprecated Sep 2025** | Old line, different pricing structure |

The user asked about "gpt-realtime-2 and 1.5." These are the two full-size models. They have the same listed pricing but `gpt-realtime-2` benchmarks ~14% higher on audio reasoning tasks. gpt-realtime-1.5 has no meaningful advantage over gpt-realtime-2 — it's strictly the previous generation. **gpt-realtime-mini is the real alternative to evaluate** if cost matters.

---

## 2. Pricing — The Dominant Factor

> **Note:** The web research returned incorrect per-minute figures. The correct calculation is straightforward: token price × tokens per minute.

### Audio Token Rates

| Model | Audio Input | Audio Output | Audio Tokens/Min |
|---|---|---|---|
| Gemini 3.1 Flash Live | $3.00 / 1M tokens | $12.00 / 1M tokens | ~1,920 tokens/min (32 tokens/sec) |
| Gemini 2.5 Flash Native Audio | $3.00 / 1M tokens | $12.00 / 1M tokens | ~1,920 tokens/min |
| gpt-realtime-2 | $32.00 / 1M tokens | $64.00 / 1M tokens | ~600 in / ~1,200 out (1 token/100ms in, 1/50ms out) |
| gpt-realtime-1.5 | $32.00 / 1M tokens | $64.00 / 1M tokens | Same as above |
| gpt-realtime-mini | Not officially confirmed | — | — |

### Correct Per-Minute Costs

| Model | Audio Input/min | Audio Output/min |
|---|---|---|
| Gemini Live (both models) | **~$0.006** | **~$0.023** |
| gpt-realtime-2 | ~$0.019 | ~$0.077 |
| gpt-realtime-1.5 | ~$0.019 | ~$0.077 |

**gpt-realtime-2 costs ~3–4x more per minute of audio than Gemini Live.**

### Real-Session Cost Estimate

A typical tutoring session: 30 minutes total, student speaks 15 min, tutor speaks 10 min.

| Model | Student audio | Tutor audio | Total/session |
|---|---|---|---|
| Gemini Live | $0.090 | $0.230 | **~$0.32** |
| gpt-realtime-2 | $0.285 | $0.770 | **~$1.06** |

At 100 sessions/month:
- Gemini: **~$32/month** in audio costs
- gpt-realtime-2: **~$106/month** in audio costs

At 1,000 sessions/month (early traction):
- Gemini: **~$320/month**
- gpt-realtime-2: **~$1,060/month**

The gap is real but not catastrophic. At small scale, it's ~$74/month difference. At scale it matters more. For a bootstrapped student project, Gemini's cost profile is substantially better.

---

## 3. Audio Quality

### Gemini Live
- **30 named voices** across 23–24 languages (Zephyr, Puck, Aoede, Coral, Kore, etc.)
- New in 3.1 Flash Live: **Affective Dialog** — the model adjusts its tone based on detected student frustration or confusion. For a tutoring app this is genuinely useful.
- Improved background noise filtering (distinguishes speech from traffic, TV, etc.)
- Better consistency at holding long context (~2x longer than 2.5 Flash)

### OpenAI Realtime
- **10 voices**, English-focused (`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`)
- `marin` and `cedar` released May 2026, widely considered OpenAI's best voices yet
- Developer consensus: OpenAI voices have better English prosody and emotional expressiveness
- **Semantic VAD** (new): reduces mid-sentence interruptions vs the older server VAD — relevant for a tutoring app where the tutor speaks in longer complete thoughts

### Verdict for Tutoring
OpenAI voices sound slightly more natural in English. For a tutoring app, this matters because students will hear the tutor voice for 20–30 minutes straight. However, Gemini's Affective Dialog (detecting student frustration and adjusting tone) is a feature OpenAI doesn't currently match — and it's highly relevant when a confused 10th grader is struggling with calculus.

**Slight edge to OpenAI on pure voice quality; slight edge to Gemini on tutoring-specific expressiveness.**

---

## 4. Tool Calling / Whiteboard Integration

This is the most critical dimension for this app. The whiteboard runs entirely on tool calls — every equation, shape, and graph is a function call.

### Gemini Live — Tool Call Behavior

**gemini-3.1-flash-live-preview (what we use):**
- **Synchronous only.** The model fully pauses — stops speaking, stops generating — until your client sends back the tool response.
- Our current `sendToolResponse()` fires immediately and acknowledges with `{ success: true }`, so the pause is minimal (~100–200ms round-trip over WebSocket). This is acceptable in practice.
- **Known reliability issues** (from developer forums, March 2026):
  - ~30% malformed function calls per session in real-world use
  - ~20% duplicate tool invocations per session
  - ~40% of calls produce unwanted narration ("let me draw that for you...")
  - The system prompt additions we already have (forbidding narration) and the immediate acknowledgment pattern address most of this
- **The stops-talking bug**: The system prompt was updated to say "Tool calls do not end your turn. Keep speaking." This is a workaround for a known Gemini issue where the model treats tool calls as turn endings.

**gemini-2.5-flash-native-audio (GA model):**
- Supports **async function calling** (`NON_BLOCKING` mode). The model can speak *while* a tool executes in the background, then deliver the result when idle. This is exactly the behavior we want for whiteboard drawing during speech.
- Tool scheduling policies: `INTERRUPT`, `WHEN_IDLE`, `SILENT`
- However: the `SILENT` scheduling is reportedly stripped by Vertex AI's protobuf serialization, causing narration anyway

### OpenAI Realtime — Tool Call Behavior
- The model announces what it's doing in natural language while tools are in flight: "let me plot that for you" — which actually matches a tutoring UX well
- Tool call round-trip adds ~400–800ms when the tool response returns quickly (under 200ms). Our whiteboard tools return immediately, so this is ~400ms pause per tool call.
- **Known bug (May 2026):** gpt-realtime-2 fails on tool definitions that use `object`-type parameters. Our whiteboard tools use only primitive types (string, number, enum), so this likely doesn't affect us. But it's a fresh unresolved bug.
- Unlike Gemini's full synchronous block, OpenAI's model can be configured to narrate or stay silent during tool execution.

### Verdict for Whiteboard
Both APIs have tool calling issues. Gemini's 30% malformed call rate is alarming on paper — but our implementation already works around most of it (immediate acknowledgment, silent mode in system prompt). OpenAI's per-tool-call latency overhead (~400ms) would be noticeable when the tutor draws 5–6 equations in sequence.

**Gemini 2.5 Flash Native Audio's async non-blocking tool calls are the ideal architecture for this app** — the model talks while drawing. This is better than either gpt-realtime model today.

---

## 5. File / Multimodal Support

This is the biggest architectural difference and directly affects the homework-upload feature.

### What Gemini Live Actually Supports in Sessions

| Content | Supported? | Notes |
|---|---|---|
| Images (JPEG/PNG) via inlineData | ✅ Yes | Up to 1 frame/second |
| Audio (PCM) | ✅ Yes | Core feature |
| Text (clientContent) | ✅ Yes | — |
| **PDFs via inlineData** | ❌ **No** | NOT supported in live sessions |
| fileData (Gemini File API URIs) | ❌ **No** | generateContent only, not BidiGenerateContent |
| Video files | ❌ No | Only JPEG/PNG frames at ≤1 FPS |

> **⚠️ Bug in current implementation:** Our `sendFiles()` method sends all files including PDFs as `inlineData`. PDFs are not supported in Gemini Live sessions. PDF uploads currently fail silently — the model receives nothing for PDF files. This needs to be fixed regardless of which API we use.

### What OpenAI Realtime Supports in Sessions

| Content | Supported? | Notes |
|---|---|---|
| Images (JPEG/PNG) via frames | ✅ Yes | Push frames on demand |
| Audio (PCM16) | ✅ Yes | Core feature |
| Text | ✅ Yes | `conversation.item.create` |
| **PDFs** | ❌ **No** | Not supported in realtime sessions |
| Binary files in general | ❌ No | No `inlineData` equivalent in conversation turns |
| Video (sampled frames) | ✅ Yes | Same pattern as images |

**OpenAI Realtime has no equivalent of Gemini's `inlineData` for sending file content in a session.** The only way to get file content into an OpenAI Realtime session is to pre-process it (extract text from PDFs server-side, OCR images with a separate API call) and inject the result as text.

### Impact on Homework Upload Feature

| File type | Gemini Live | OpenAI Realtime |
|---|---|---|
| Image (homework photo, slides screenshot) | ✅ Works natively | ⚠️ Works but needs image-frame injection (different API) |
| PDF (lecture notes, homework PDF) | ❌ Broken (currently silent failure) | ❌ Would need server-side text extraction pipeline |
| Text file (.txt, .md) | ✅ Works (send as text) | ✅ Works (inject as text conversation item) |

**If we switched to OpenAI Realtime, images would still work but would require re-engineering the injection method. PDFs would require a full server-side pipeline (PDF parser → text → inject). This is a significant regression from the current Gemini model (where we at least have a clear fix path for images).**

---

## 6. Technical Migration Cost

Based on the codebase audit:

### What stays the same (zero changes needed)
- `app/session/page.tsx` — callback interface is preserved
- `components/` — everything
- `lib/system-prompt.ts` — no model-specific content
- `lib/audio.ts` / `AudioPlayer` — same 24kHz PCM16 output format

### What changes

| File | Change | Effort |
|---|---|---|
| `lib/gemini-live.ts` | Full rewrite as `openai-realtime.ts` (same callback interface, entirely new internals) | 4–6 hours |
| `lib/whiteboard-tools.ts` | Add `"type": "function"` to each of 8 declarations; change `parameters` nesting | 15 min |
| `lib/audio.ts` / AudioCapture | Change mic sample rate from 16kHz → 24kHz | 15 min |
| `lib/file-processor.ts` | Drop image/PDF inlineData support or build pre-processing pipeline | 4–8 hours |
| New: Auth proxy | Next.js API route for ephemeral token (OpenAI WebSocket auth can't use API key in headers from browser directly) | 2–4 hours |
| Transcript delta handling | OpenAI sends incremental transcript deltas; need accumulation logic | 1 hour |

**Total: 1–3 days of focused work.** The auth proxy and file regression are the riskiest parts.

### The Auth Problem
Gemini Live authenticates with an API key in the WebSocket URL (`?key=...`). OpenAI Realtime requires an `Authorization: Bearer` header, which browsers cannot set on WebSocket connections. Solutions:
1. OpenAI ephemeral token endpoint: server mints a short-lived token, client uses it to connect directly — cleanest option
2. Server-side WebSocket proxy — more overhead, adds latency

We'd need a new Next.js API route either way. Not hard, but adds server-side infrastructure that currently doesn't exist.

---

## 7. Session Limits

| Dimension | Gemini 3.1 Flash Live | Gemini 2.5 Flash Native Audio | gpt-realtime-2 |
|---|---|---|---|
| Max session duration | 15 min (audio-only) | 15 min, extendable | 60 min |
| Context window | 128K tokens | 128K tokens | 128K tokens |
| Context compression | Yes (configurable) | Yes | Truncates at 28,672 tokens by default |
| Session resumption | Yes (within 24h) | Yes | Not documented |
| 2-min video limit | Yes (audio+video mode) | Yes | No equivalent hard limit |

Gemini's 15-minute session limit is a real constraint for long tutoring sessions. Context compression helps but requires explicit configuration. OpenAI's 60-minute limit is more forgiving. For a tutoring app where a session could easily run 30–40 minutes, this is worth noting.

---

## 8. Developer Experience

| Dimension | Gemini Live | OpenAI Realtime |
|---|---|---|
| Official TypeScript SDK | Limited (js-genai) | Strong (openai-agents-js) |
| Open source examples | Fewer, newer | Many, well-maintained |
| Documentation quality | Good but inconsistent | Excellent, comprehensive |
| Community resources | Growing | Large, active forum |
| Known open bugs | Mid-sentence cutoff (8+ months open) | Object-type tool params (fresh, May 2026) |
| VAD tuning | Limited params | Granular + Semantic VAD option |
| Browser WebSocket auth | API key in URL (easy) | Requires ephemeral token or proxy (harder) |

OpenAI's developer experience is meaningfully better. If Mateo is learning to build while doing this, OpenAI's documentation, community answers, and SDK quality will make debugging easier.

---

## 9. Specific Recommendation for This App

### Phase 1 (Now — Prototype): **Stay on Gemini Live**

Reasons:
1. **Cost**: ~$0.32/session vs ~$1.06/session. At prototype scale this is ~$75/month difference — meaningful for a student project.
2. **Working implementation**: The current app works. Migration costs real time.
3. **File upload feature**: Already built for Gemini inlineData. OpenAI would require building a pre-processing pipeline to get equivalent functionality — that's new infrastructure, not just a swap.
4. **Async tools on 2.5 Flash**: If tool calling becomes the main pain point, switching from `gemini-3.1-flash-live-preview` to `gemini-2.5-flash-native-audio` gets us async non-blocking tool calls without changing providers at all.
5. **Affective Dialog**: The model picking up on student frustration and adjusting tone is a real tutoring differentiator.

### Phase 2 (First real users, ~6 months out): **Evaluate gpt-realtime-mini**

If user feedback shows voice quality is the #1 complaint, or the tool calling reliability (30% malformed calls) becomes a real blocker at scale, run a comparison test with gpt-realtime-mini. It's still ~2–3x more expensive than Gemini but likely much better voice quality and stronger tool reliability.

### When to Consider gpt-realtime-2

Only if:
- You want GPT-5-class reasoning for very hard problems (advanced calculus, physics proofs)
- Revenue makes the ~$1.06/session cost comfortable
- You've maxed out what Gemini can do on reasoning quality and it's clearly the bottleneck

### Never Consider gpt-realtime-1.5

It's strictly worse than gpt-realtime-2 at the same price. There's no reason to choose it.

---

## 10. Bugs to Fix Now (Regardless of API Decision)

**Fix 1: PDF files don't actually work in Gemini Live.**
The `sendFiles()` method sends all file types as inlineData. Gemini Live only supports JPEG/PNG images — not PDFs. PDFs are silently ignored.

Fix options:
- **Short-term**: On upload, reject PDFs with a clear error message ("PDF not supported — please screenshot the page or take a photo"). Update `ACCEPTED_MIME_TYPES` to exclude `application/pdf`.
- **Better**: Before the session starts, send PDFs to `gemini-2.5-flash` (not Live) via a Next.js API route to extract text/descriptions, then inject the text into the Live session. This gives the tutor actual PDF understanding.

**Fix 2: Text files (.txt) are supported but aren't being sent as text.**
Currently all files go through `readFileAsBase64` and are sent as inlineData. Text files should be sent as a text part, not as binary. This is minor but easy to fix.

---

## 11. Summary Table

| Dimension | Gemini 3.1 Flash Live | gpt-realtime-2 | gpt-realtime-mini |
|---|---|---|---|
| Audio cost/session (30 min) | **~$0.32** | ~$1.06 | ~$0.40 est. |
| Voice quality (English) | Good | **Best available** | Very good |
| Tutoring-specific expressiveness | **Affective Dialog** | Standard | Standard |
| Whiteboard tool calls | Sync only (works) | Async (works) | Async (works) |
| Tool call reliability | ~70% clean (issues) | **Better** (new bug) | **Better** |
| Image file injection | ✅ Native inlineData | ⚠️ Different method | ⚠️ Different method |
| PDF injection | ❌ Not supported | ❌ Not supported | ❌ Not supported |
| Session max duration | 15 min (extendable) | **60 min** | **60 min** |
| Context window | 128K | 128K | ~32K est. |
| Browser WebSocket auth | ✅ Simple (API key) | ⚠️ Ephemeral token needed | ⚠️ Same |
| Migration effort from current | — | **2–3 days** | **2–3 days** |
| DX / documentation | Good | **Excellent** | **Excellent** |
| GA / production SLA | Preview only | **GA** | **GA** |

---

*Research compiled May 14, 2026. Sources: Google AI documentation, Google Cloud Vertex AI docs, OpenAI API documentation, OpenAI developer community forum, Gemini developer forum (Hard-Won Patterns, March 2026), open GitHub issues (python-genai #2117, js-genai #707), Speko and Skywork AI benchmarks, OpenAI Latent Space missing manual.*
