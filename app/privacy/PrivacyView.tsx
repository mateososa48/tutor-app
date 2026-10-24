"use client";

import { useState } from "react";
import Link from "next/link";
import { Delete02Icon, Download04Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "@/components/app/AppShell";
import { Icon } from "@/components/app/Icon";
import { forgetSessionList } from "@/components/app/useSessionList";
import { PageBody, PageHeader, Panel, QUIET_BUTTON, ROW_LINE, SettingRow } from "@/components/app/page-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// Privacy & data (Oct 2026): what Chalk keeps, who handles it, and the
// controls, in plain words. Every line here describes the app as built (the
// session recorder, the learning record, the phone-photo relay); it is not a
// legal privacy policy, and says so.

const KEPT: { what: string; detail: string }[] = [
  { what: "What you tell your tutor about yourself", detail: "Your name, grade, what you're working on, what you're into, and how you like to be taught." },
  { what: "What your tutor remembers", detail: "Short notes it keeps between sessions. You can read and forget each one on Your tutor." },
  { what: "Each session", detail: "The written transcript of what was said, pictures of the board, the files you added, and the summary written after." },
  { what: "Your checked answers", detail: "Each answer the tutor checked, whether it was right, and how much help you had. Progress is built from these." },
  { what: "How the session ran", detail: "Timings and technical events, so we can find where the tutor went wrong." },
];

const NOT_KEPT = [
  "Recordings of your voice or the tutor's. Speech is turned into text as you go, and only the text is kept.",
  "Photos sent from your phone, once they reach your laptop. They wait on our server only until then.",
];

const HANDLED: { who: string; why: string }[] = [
  { who: "Google (Gemini)", why: "Runs the live tutor that listens and talks, and plans its next move." },
  { who: "Anthropic (Claude)", why: "Draws the pictures the tutor asks for." },
  { who: "OpenAI", why: "Writes the summary after a session." },
  { who: "Neon and Vercel", why: "Store your data and run the app." },
];

export function PrivacyView() {
  const [deleted, setDeleted] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function deleteAll() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/sessions", { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { deleted?: number };
      forgetSessionList();
      setDeleted(body.deleted ?? 0);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell bar>
      <PageBody>
        <PageHeader title="Privacy & data" lede="What Chalk keeps, who handles it, and how to download or delete it." />

        <div className="mt-8 flex flex-col gap-5">
          <Panel title="What Chalk keeps">
            <ul className="m-0 list-none p-0 pt-1.5 pb-2">
              {KEPT.map((item) => (
                <li key={item.what} className={cn("border-t px-5 py-3.5 first:border-t-0 sm:px-6", ROW_LINE)}>
                  <p className="m-0 text-[14.5px] font-medium text-(--lp-ink)">{item.what}</p>
                  <p className="m-0 mt-0.5 max-w-[62ch] text-[13.5px] leading-[1.5] text-(--lp-ink-2)">{item.detail}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="What it doesn't keep">
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0 px-5 pt-3 pb-5 sm:px-6">
              {NOT_KEPT.map((line) => (
                <li key={line} className="flex gap-3 text-[14px] leading-[1.55] text-(--lp-ink-2)">
                  <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-(--lp-ink-3)" />
                  {line}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Who can see it">
            <div className="px-5 pt-3 pb-2 sm:px-6">
              <p className="m-0 max-w-[62ch] text-[14px] leading-[1.6] text-(--lp-ink-2)">
                While Chalk is in beta, the people who build it can open session recordings to find where the tutor went wrong and fix it. Nobody else can. These services handle your data so the app can work:
              </p>
            </div>
            <ul className="m-0 list-none p-0 pt-2 pb-2">
              {HANDLED.map((h) => (
                <li key={h.who} className={cn("flex flex-col gap-0.5 border-t px-5 py-3 sm:flex-row sm:gap-6 sm:px-6", ROW_LINE)}>
                  <span className="w-[180px] shrink-0 text-[14px] font-medium text-(--lp-ink)">{h.who}</span>
                  <span className="text-[14px] text-(--lp-ink-2)">{h.why}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Your data">
            <div className="pt-2">
              <SettingRow label="Download your data" hint="Your profile, your tutor's notes, every session's transcript and summary, and your checked answers, as one file.">
                <a href="/api/account/export" download className={QUIET_BUTTON}>
                  <Icon icon={Download04Icon} size={16} />
                  Download
                </a>
              </SettingRow>
              <SettingRow label="Delete a session" hint="Open Sessions and use the delete button on the one you want gone.">
                <Link href="/sessions" className={QUIET_BUTTON}>
                  Go to Sessions
                </Link>
              </SettingRow>
              <SettingRow label="Forget what your tutor remembers" hint="Read the notes and forget any of them, or all.">
                <Link href="/tutor" className={QUIET_BUTTON}>
                  Go to Your tutor
                </Link>
              </SettingRow>
              <SettingRow
                label="Delete all your sessions"
                hint={
                  deleted !== null
                    ? `Done. ${deleted} ${deleted === 1 ? "session was" : "sessions were"} deleted, and your progress was recounted.`
                    : failed
                      ? "That didn't work. Try again in a moment."
                      : "Every transcript, board and summary, and the progress they count toward. Your profile stays."
                }
              >
                <AlertDialog>
                  <AlertDialogTrigger
                    disabled={busy}
                    className={cn(QUIET_BUTTON, "text-(--danger) hover:bg-(--danger)/6")}
                  >
                    <Icon icon={Delete02Icon} size={16} />
                    {busy ? "Deleting…" : "Delete all"}
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[16px]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete every session?</AlertDialogTitle>
                      <AlertDialogDescription>
                        All your transcripts, boards and summaries will be gone for good, and Progress will start over. Download your data first if you want a copy.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep them</AlertDialogCancel>
                      <AlertDialogAction className="bg-(--danger) text-white hover:bg-[#b8261a]" onClick={() => void deleteAll()}>
                        Delete all
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </SettingRow>
            </div>
          </Panel>

          <p className="m-0 px-1 text-[13px] leading-[1.55] text-(--lp-ink-3)">
            This page describes how Chalk works today, in plain words. It isn&apos;t a legal privacy policy.
          </p>
        </div>
      </PageBody>
    </AppShell>
  );
}
