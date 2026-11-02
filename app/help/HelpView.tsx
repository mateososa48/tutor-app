"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp02Icon,
  ChartHistogramIcon,
  Mic01Icon,
  PencilEdit02Icon,
  PenTool03Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "@/components/app/AppShell";
import { Icon } from "@/components/app/Icon";
import { CARD, PageBody, PageHeader, Panel, ROW_LINE } from "@/components/app/page-kit";
import { cn } from "@/lib/utils";

// Help (Oct 2026): how a session works, what to do when something isn't
// working, the keyboard, and a box to ask anything else. Every answer here is
// a fact about this app as built; the ask box answers from the same written
// facts as the landing page's FAQ (lib/faq.ts, POST /api/faq).

const LINK = "font-medium text-(--lp-ink) underline decoration-(--lp-ink)/25 underline-offset-[3px] transition-colors hover:decoration-(--lp-ink) outline-none focus-visible:rounded-[3px] focus-visible:ring-2 focus-visible:ring-(--lp-sky)";

const STEPS: { icon: IconSvgElement; title: string; body: ReactNode }[] = [
  {
    icon: PencilEdit02Icon,
    title: "Say what you're stuck on",
    body: (
      <>
        Start a <Link href="/session" className={LINK}>new session</Link> and type the problem, or add a photo or PDF of your homework. On a laptop, “Use your phone” shows a code to scan so you can send photos straight from your phone.
      </>
    ),
  },
  {
    icon: Mic01Icon,
    title: "Talk it through",
    body: "Your tutor talks with you out loud and listens for your answer. Rather type? Press the keyboard button on the dock. It asks what you think first and won't just hand you the answer.",
  },
  {
    icon: PenTool03Icon,
    title: "Watch the board",
    body: "It writes and draws as it explains: the problem, pictures of the idea, your answers in your own words, then a ring or a check when you get it. Some graphs have an Explore button so you can drag them yourself.",
  },
  {
    icon: ChartHistogramIcon,
    title: "Look back after",
    body: (
      <>
        When you end a session you get a short summary with its boards. Everything is in <Link href="/sessions" className={LINK}>Sessions</Link>, and <Link href="/progress" className={LINK}>Progress</Link>{" "}shows what you&apos;ve done on your own.
      </>
    ),
  },
];

const FIXES: { q: string; a: ReactNode }[] = [
  {
    q: "My tutor can't hear me",
    a: (
      <>
        Check the dock: if the badge turns amber, it says what&apos;s wrong. Make sure the mic button isn&apos;t off (press M), then run the microphone test in <Link href="/settings#mic" className={LINK}>Settings</Link> and pick the right microphone there. You can always type instead.
      </>
    ),
  },
  {
    q: "I can't hear my tutor",
    a: (
      <>
        Play the test sound in <Link href="/settings#mic" className={LINK}>Settings</Link> to check your speakers. If it talks too fast, use the speed button beside Files in a session, or set it in <Link href="/tutor#voice" className={LINK}>Your tutor</Link>.
      </>
    ),
  },
  {
    q: "It went quiet or the connection dropped",
    a: "It reconnects on its own and picks up where you were, board and all. If it stays quiet, say something or type a line. If a session stops, open it again from Sessions to continue.",
  },
  {
    q: "The board writes too fast or too slow",
    a: (
      <>
        Change the writing speed in <Link href="/settings" className={LINK}>Settings</Link>. To look closer, pinch or use your trackpad to zoom the board; it comes back to the newest work on its own.
      </>
    ),
  },
  {
    q: "My photo or worksheet didn't come through",
    a: "Photos and PDFs work (the first six pages of a PDF). A phone code lasts 20 minutes and takes up to 12 photos; if it runs out, open Files and make a new one.",
  },
];

const KEYS: { keys: string[]; what: string }[] = [
  { keys: ["⌘", "K"], what: "Search your sessions, or go to any page" },
  { keys: ["⌘", "B"], what: "Show or hide the sidebar" },
  { keys: ["M"], what: "Turn your microphone on or off, in a session" },
  { keys: ["Enter"], what: "Send what you typed to your tutor" },
  { keys: ["Esc"], what: "Close a menu, a popup or search" },
];


export function HelpView() {
  const [mac, setMac] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the platform is only known in the browser
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  return (
    <AppShell bar>
      <PageBody>
        <PageHeader title="Help" lede="How sessions work, and what to do when something isn't working." />

        <div className="mt-8 flex flex-col gap-5">
          <Panel title="How a session works">
            <ol className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-6 p-0 px-5 pt-4 pb-6 sm:grid-cols-2 sm:px-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-3.5">
                  <span aria-hidden className="relative flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-(--lp-sky-tint) text-(--lp-sky-deep)">
                    <Icon icon={step.icon} size={18} />
                    <span className="absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full border border-white bg-(--lp-ink) text-[10.5px] font-semibold text-white tabular-nums">
                      {i + 1}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-(--lp-ink)">{step.title}</span>
                    <span className="mt-1 block text-[14px] leading-[1.55] text-(--lp-ink-2)">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="When something isn't working">
            <div className="pt-1.5 pb-2">
              {FIXES.map((fix) => (
                <Fix key={fix.q} q={fix.q} a={fix.a} />
              ))}
            </div>
          </Panel>

          <Panel title="Keyboard">
            <ul className="m-0 list-none p-0 pt-1.5 pb-2">
              {KEYS.map((k) => (
                <li key={k.what} className={cn("flex items-center justify-between gap-6 border-t px-5 py-3 first:border-t-0 sm:px-6", ROW_LINE)}>
                  <span className="text-[14.5px] text-(--lp-ink)">{k.what}</span>
                  <span className="flex shrink-0 gap-1">
                    {k.keys.map((key) => (
                      <kbd key={key} className="inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-(--lp-gray) px-1.5 font-sans text-[12.5px] font-medium text-(--lp-ink-2)">
                        {key === "⌘" && !mac ? "Ctrl" : key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <AskBox />
        </div>
      </PageBody>
    </AppShell>
  );
}

function Fix({ q, a }: { q: string; a: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cn("border-t first:border-t-0", ROW_LINE)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-4 px-5 py-3 text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--lp-sky)] sm:px-6"
      >
        <span className="text-[14.5px] font-medium text-(--lp-ink)">{q}</span>
        <Icon icon={ArrowDown01Icon} size={16} className={cn("text-(--lp-ink-2) transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div id={id} hidden={!open} className="px-5 pb-4 sm:px-6">
        <p className="m-0 max-w-[62ch] text-[14px] leading-[1.6] text-(--lp-ink-2)">{a}</p>
      </div>
    </div>
  );
}

// ── Ask anything else ────────────────────────────────────────────────────────

function AskBox() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setAsked(q);
    setAnswer(null);
    try {
      const res = await fetch("/api/faq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const body = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      setAnswer(body.answer ?? body.error ?? "I couldn't answer that just now. Try again in a moment.");
      setQuestion("");
    } catch {
      setAnswer("I couldn't answer that just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cn(CARD, "px-5 pt-5 pb-5 sm:px-6")} aria-labelledby="ask-heading">
      <h2 id="ask-heading" className="m-0 text-[16px] font-semibold text-(--lp-ink)">
        Ask about Chalk
      </h2>
      <p className="m-0 mt-1 text-[13.5px] text-(--lp-ink-2)">Questions about how the app works. For math, start a session.</p>
      <form onSubmit={ask} className="mt-4 flex items-center gap-2 rounded-[12px] border border-(--lp-gray-2) bg-white py-1 pr-1 pl-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-(--lp-sky) focus-within:shadow-[0_0_0_3px_var(--lp-sky-glow)]">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={200}
          placeholder="Can I use it on my phone?"
          aria-label="Your question about Chalk"
          className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] text-(--lp-ink) outline-none placeholder:text-(--lp-ink-3)"
        />
        <button
          type="submit"
          disabled={!question.trim() || busy}
          aria-label="Ask"
          className="btn-gloss flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[9px] outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon icon={ArrowUp02Icon} size={16} strokeWidth={2} />
        </button>
      </form>
      {asked && (
        <div aria-live="polite" className="mt-4 rounded-[14px] bg-(--lp-gray)/55 px-4 py-3.5">
          <p className="m-0 text-[13px] font-medium text-(--lp-ink-2)">{asked}</p>
          <p className="m-0 mt-1.5 text-[14.5px] leading-[1.55] text-(--lp-ink)">{answer ?? (busy ? "Thinking…" : "")}</p>
        </div>
      )}
    </section>
  );
}
