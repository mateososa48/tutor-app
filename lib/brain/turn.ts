// One brain turn (the LiveKit voice path, Oct 2026): what the agent and the
// bench both run for a student line.
//
// Normally one model call: the words stream out (onText) and each board call
// is handed over the moment its input is complete (onBoard), so the board can
// draw while the words are still being spoken.
//
// When the line is an answer the app's auto-check could not read
// (`hooks.forceCheck`), the answer checker still owns right and wrong. Two
// calls start together: the reply, and a small call that must call
// check_answer (tool_choice), whose arguments the app's checker runs. A reply
// sentence that judges ("Yes, six a cup.", "Not quite.") waits for the
// verdict; one that doesn't ("How'd you get fifteen?") goes out at once. If
// the verdict contradicts what the reply was about to say, that reply is
// dropped before a word of it is heard, along with its board calls, and the
// brain answers again knowing the verdict. Measured Oct 24 2026: a check-first
// second step cost 1.5-2.5 s on every answer turn; this costs nothing when the
// reply does not judge, and the check's own ~1 s when it does.
import type { ToolCallResult } from "../live-types";
import { streamBrain, type BrainRequest, type BrainUsage, type Message } from "./haiku";

export type BoardCall = { id: string; name: string; args: Record<string, unknown> };

export type TurnHooks = {
  onText(text: string): void;
  onBoard(call: BoardCall): void;
  /** Runs check_answer in the app (TutorRuntime.runTool). */
  check(args: Record<string, unknown>, id: string): Promise<ToolCallResult> | ToolCallResult;
  /** Tool names the brain may use on the board; others are dropped. */
  allowed: Set<string>;
  /** The line is an answer the app's checker could not read: check it alongside the reply. */
  forceCheck?: boolean;
};

export type TurnResult = {
  text: string;
  calls: BoardCall[];
  dropped: string[];
  usage: BrainUsage;
  firstTokenMs: number | null;
  ms: number;
  /** Model calls made: 1, 2 with a check alongside, 3 when the reply was redone. */
  steps: number;
  /** The checker's verdict on the line, when it was checked here. */
  verdict: string | null;
  /** How long a judging sentence waited for the verdict (ms). */
  heldMs: number;
  /** The first reply judged against the verdict and was dropped before it was heard. */
  redone: boolean;
  model: string;
  attempt: number;
  stopReason: string | null;
};

// A sentence that tells them whether they're right.
const AFFIRM = /^\s*(?:(?:yes|yep|yeah|yup|right|correct|exactly|perfect|bingo)\b|that'?s (?:right|it|correct)|you got it)|\b(?:is|was|that'?s|it'?s|thats|its) (?:right|correct)\b|\byou(?:'re| are) right\b/i;
const DENY = /^\s*(?:no\b|nope\b|not quite|close\b|almost\b)|\b(?:not right|isn'?t right|not correct|isn'?t correct|is wrong|that'?s wrong|not quite|a little off|doesn'?t work)\b/i;

export function judges(sentence: string): "affirm" | "deny" | null {
  if (DENY.test(sentence)) return "deny";
  if (AFFIRM.test(sentence)) return "affirm";
  return null;
}

/** What a checker result says: correct, wrong (incorrect or partial), or unknown (cannot_check, failure). */
export function verdictOf(message: string | null): "correct" | "wrong" | "unknown" {
  if (!message) return "unknown";
  if (/Verdict:\s*correct|→\s*correct/i.test(message)) return "correct";
  if (/Verdict:\s*(?:incorrect|partial)|→\s*(?:incorrect|partial)/i.test(message)) return "wrong";
  return "unknown";
}

/** Would saying this be a lie, given the verdict? */
export function contradicts(judgement: "affirm" | "deny", verdict: "correct" | "wrong" | "unknown"): boolean {
  return (judgement === "affirm" && verdict === "wrong") || (judgement === "deny" && verdict === "correct");
}

// The checker reads digits and symbols; a problem written with words ("5 cups at 6 each") comes back cannot_check.
export const CHECK_ORDER = "[Check the answer in their line: problem as plain math in digits and symbols only, the exact question they answered ('12 / 2', '5 * 6', '-7 - 4', '0.5 > 0.35', '2x + 3 = 11', 'f(4) where f(x) = 3x - 1'), never words or units; student_answer the same way ('6', '30', 'x = 4').]";

const SENTENCE = /^([\s\S]*?[.!?])(?=\s|$)/;

function addUsage(into: BrainUsage, u: BrainUsage) {
  into.input += u.input;
  into.output += u.output;
  into.cacheRead += u.cacheRead;
  into.cacheWrite += u.cacheWrite;
}

export async function runBrainTurn(req: BrainRequest, hooks: TurnHooks): Promise<TurnResult> {
  const started = Date.now();
  const usage: BrainUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const out: TurnResult = { text: "", calls: [], dropped: [], usage, firstTokenMs: null, ms: 0, steps: 1, verdict: null, heldMs: 0, redone: false, model: "", attempt: 0, stopReason: null };

  // The check, alongside the reply.
  let check: Promise<string | null> | null = null;
  if (hooks.forceCheck) {
    out.steps = 2;
    let resolve: (v: string | null) => void = () => undefined;
    check = new Promise<string | null>((r) => (resolve = r));
    void (async () => {
      try {
        const last = req.messages[req.messages.length - 1];
        const messages: Message[] = [...req.messages.slice(0, -1), { role: last.role, content: [...last.content, { type: "text", text: CHECK_ORDER }] }];
        for await (const ev of streamBrain({ ...req, messages, forceTool: "check_answer", maxTokens: 300, hedgeMs: undefined })) {
          if (ev.type === "tool" && ev.name === "check_answer") {
            const r = await hooks.check(ev.args, ev.id);
            out.verdict = r.success ? r.message ?? null : null;
            resolve(out.verdict);
          }
          if (ev.type === "done") addUsage(usage, ev.usage);
        }
      } catch {
        // a failed check leaves the brain's own judgement standing, as cannot_check does
      }
      resolve(null);
    })();
  }

  const runReply = async (messages: Message[], gate: boolean): Promise<"done" | "redo"> => {
    const abort = new AbortController();
    req.signal?.addEventListener("abort", () => abort.abort(), { once: true });
    let held = "";
    let holding = false; // a judging sentence is waiting for the verdict
    let open = !gate; // the verdict is in and agrees: pass everything through
    const heldCalls: BoardCall[] = [];
    let heldSince = 0;
    let redo = false;

    const release = () => {
      if (held) {
        out.text += held;
        hooks.onText(held);
        held = "";
      }
      for (const c of heldCalls.splice(0)) {
        out.calls.push(c);
        hooks.onBoard(c);
      }
    };
    // Decide on the verdict once it is in (or immediately, when it already is).
    const settle = async () => {
      const v = verdictOf(await check);
      if (heldSince) out.heldMs = Date.now() - heldSince;
      const said = held.trim();
      const j = judges(said.match(SENTENCE)?.[1] ?? said) ?? judges(said);
      if (j && contradicts(j, v)) {
        redo = true;
        abort.abort();
        return;
      }
      open = true;
      holding = false;
      release();
    };
    let settling: Promise<void> | null = null;

    const feed = (text: string) => {
      if (open) {
        out.text += text;
        hooks.onText(text);
        return;
      }
      held += text;
      if (holding) return;
      // Pass whole sentences that don't judge; hold from the first one that does.
      for (let m = SENTENCE.exec(held); m; m = SENTENCE.exec(held)) {
        if (judges(m[1])) {
          holding = true;
          heldSince = Date.now();
          settling ??= settle();
          return;
        }
        out.text += m[1];
        hooks.onText(m[1]);
        held = held.slice(m[1].length);
      }
    };

    try {
      for await (const ev of streamBrain({ ...req, messages, signal: abort.signal })) {
        if (ev.type === "text") {
          out.firstTokenMs ??= Date.now() - started;
          feed(ev.text);
        } else if (ev.type === "tool") {
          if (ev.name === "check_answer") continue; // the check runs alongside, never from the reply
          if (!hooks.allowed.has(ev.name)) {
            out.dropped.push(ev.name);
            continue;
          }
          if (open) {
            out.calls.push(ev);
            hooks.onBoard(ev);
          } else heldCalls.push(ev);
        } else if (ev.type === "done") {
          addUsage(usage, ev.usage);
          out.model = ev.model;
          out.attempt = ev.attempt;
          out.stopReason = ev.stopReason;
        }
      }
    } catch (err) {
      if (!redo && !req.signal?.aborted) throw err;
    }
    if (redo) return "redo";
    if (!open) {
      // The reply ended before the verdict: the rest may still judge (a last sentence with no full stop).
      if (!settling) {
        holding = true;
        heldSince = Date.now();
        settling = settle();
      }
      await settling;
      if (redo) return "redo";
    } else if (settling) await settling;
    return "done";
  };

  const first = await runReply(req.messages, Boolean(check));
  if (first === "redo" && !req.signal?.aborted) {
    // The first reply would have said the opposite of the checker: answer again knowing the verdict.
    out.redone = true;
    out.steps += 1;
    const last = req.messages[req.messages.length - 1];
    const withVerdict: Message[] = [
      ...req.messages.slice(0, -1),
      { role: last.role, content: [...last.content, { type: "text", text: `[Checker on this line: ${out.verdict ?? "unknown"}. Your reply must agree with it.]` }] },
    ];
    await runReply(withVerdict, false);
  }
  out.ms = Date.now() - started;
  return out;
}
