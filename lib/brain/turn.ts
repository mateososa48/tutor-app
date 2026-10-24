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
import { decimalWords, fractionWords, numberWords } from "./speech";

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
  /** The student's line: a check whose answer they never said is dropped. */
  line?: string;
  /** A short prompt for the check instead of the whole lesson. Tried Oct 24 2026: no faster, and it lost the problem (cannot_check on 4 of 5 lines), so nothing passes it. */
  checkContext?: { tutor: string; board: string; line: string };
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
export const CHECK_ORDER = "[Check the answer in their line: problem as plain math in digits and symbols only, the exact question they answered ('12 / 2', '5 * 6', '-7 - 4', '0.5 > 0.35', '2x + 3 = 11', 'f(4) where f(x) = 3x - 1'), never words or units, and in the same units as their answer (dollars stay dollars: 85 * 0.85 for 72.25, not 0.85 * 0.85); student_answer exactly the number they said ('6', '72.25', 'x = 4').]";

const CHECK_SYSTEM = "You turn a student's spoken answer in a math lesson into a call to the answer checker: the exact question they answered, as plain math, and their answer. Nothing else.";

/** Every number in the answer appears in the line, as digits or as words ("2/9" or "two ninths"). */
export function saidIn(answer: string, line: string): boolean {
  const nums = answer.match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) ?? [];
  if (!nums.length) return /[a-z]/i.test(answer) && line.toLowerCase().includes(answer.toLowerCase().trim());
  const said = line.toLowerCase().replace(/[−–]/g, "-");
  return nums.every((n) => {
    const plain = n.replace(/^-/, "");
    if (new RegExp(`(^|[^\\d.])${plain.replace(/[.]/g, "\\.")}(?![\\d])`).test(said)) return true;
    const [a, b] = plain.split("/");
    const words = b ? fractionWords(Number(a), Number(b)) : plain.includes(".") ? decimalWords(plain) : numberWords(Number(plain));
    return said.includes(words) || said.includes(words.replace(/-/g, " "));
  });
}

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
        const cx = hooks.checkContext;
        const last = req.messages[req.messages.length - 1];
        const small = cx
          ? { system: CHECK_SYSTEM, tools: req.tools.filter((t) => t.name === "check_answer"), messages: [{ role: "user" as const, content: [{ type: "text" as const, text: `Tutor said: "${cx.tutor.slice(-600)}"\nBoard: ${cx.board.slice(0, 900) || "empty"}\nStudent answered: "${cx.line.slice(0, 400)}"\n${CHECK_ORDER}` }] }] }
          : { messages: [...req.messages.slice(0, -1), { role: last.role, content: [...last.content, { type: "text" as const, text: CHECK_ORDER }] }] };
        for await (const ev of streamBrain({ ...req, ...small, forceTool: "check_answer", maxTokens: 300, hedgeMs: undefined })) {
          if (ev.type === "tool" && ev.name === "check_answer") {
            // The check is the brain's reading of their line, not their words: it never writes
            // "working" in their hand (Oct 24 2026: "You said 0.85³ = 0.45", which Ethan never said).
            const { working: _w, ...args } = ev.args;
            void _w;
            // A check of an answer they never said is the brain's guess, not their attempt
            // (Oct 24 2026: "can we do number 8?" was checked as "-4 + 9 = 5" and ringed in her hand).
            if (hooks.line && !saidIn(String(args.student_answer ?? ""), hooks.line)) {
              resolve(null);
              continue;
            }
            const r = await hooks.check(args, ev.id);
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
      // The check is the brain's own reading of the problem, so it can be wrong too (it once
      // turned a right 72.25 into 0.85 * 0.85): never call the answer right, and never
      // call it wrong on this alone either; ask how they got it.
      { role: last.role, content: [...last.content, { type: "text", text: `[The answer checker read this as: ${(out.verdict ?? "unknown").slice(0, 300)}. It disagrees with what you were about to say. Don't say right or wrong: ask how they got it, in a few words.]` }] },
    ];
    await runReply(withVerdict, false);
  }
  out.ms = Date.now() - started;
  return out;
}
