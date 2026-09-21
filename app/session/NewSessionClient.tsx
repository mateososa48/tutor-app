"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { TopBar } from "@/components/app/TopBar";
import { SessionIntakeDialog } from "@/components/app/SessionIntakeDialog";
import { createSession } from "@/lib/sessions";
import { intakeTitle, storeIntake, type SessionIntake } from "@/lib/session-intake";
import { starterTopics } from "@/lib/starter-topics";
import type { UploadedFile } from "@/lib/file-processor";

// "New session" lands here. It asks what the student needs before the board
// opens (SessionIntakeDialog), then creates the session and hands the answers
// over through lib/session-intake. Someone with no sessions yet is sent to
// /welcome first, the brief before a first session, which comes back with
// ?ready=1. The QA and preview entry points (?debug=1, ?qa=1, ?mock=1) skip
// all of it and start straight away.

type Profile = { gradeLevel: string | null } | null;

/** How long the two lookups get before the intake opens without them. */
const OPEN_ANYWAY_MS = 5000;

export default function NewSessionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startedRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // undefined while the profile and the session list load; null when either fails.
  const [profile, setProfile] = useState<Profile | undefined>(undefined);
  const [firstEver, setFirstEver] = useState<boolean | null>(null);

  const skipIntake =
    searchParams.get("mock") === "1" || searchParams.get("debug") === "1" || searchParams.get("qa") === "1";
  const ready = searchParams.get("ready") === "1";
  // /session?topic=… opens the intake with the text box filled in.
  const initialTopic = (searchParams.get("topic") ?? "").slice(0, 200);

  const go = async (intake: SessionIntake | null, files: UploadedFile[]) => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarting(true);
    const id = await createSession(intake ? intakeTitle(intake) : undefined);
    if (!id) {
      startedRef.current = false;
      setStarting(false);
      setError("Couldn't start a session. Check your connection and try again.");
      return;
    }
    if (intake) storeIntake(id, intake, files);
    const params = new URLSearchParams(window.location.search);
    params.set("new", "1");
    params.delete("ready");
    router.replace(`/session/${id}?${params.toString()}`);
  };

  // QA and preview links skip the questions; the intake path starts on submit.
  useEffect(() => {
    if (!skipIntake) return;
    const id = requestAnimationFrame(() => void go(null, []));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipIntake]);

  // The grade picks the starter topics; an empty session list means the brief
  // comes first. Neither request may leave the student on "Setting up your
  // session…" forever: if one is slow or blocked, the intake opens anyway
  // after OPEN_ANYWAY_MS, and a late answer no longer redirects.
  useEffect(() => {
    if (skipIntake) return;
    let live = true;
    let opened = false;
    const openAnyway = setTimeout(() => {
      if (!live) return;
      opened = true;
      setFirstEver((current) => current ?? false);
    }, OPEN_ANYWAY_MS);

    Promise.all([
      fetch("/api/onboarding").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/sessions").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([p, sessions]: [Profile, unknown]) => {
        if (!live) return;
        setProfile(p);
        const none = Array.isArray(sessions) && sessions.length === 0;
        if (none && !ready && !opened) {
          router.replace("/welcome");
          return;
        }
        setFirstEver(none);
      })
      .catch(() => {
        if (!live) return;
        setProfile(null);
        setFirstEver(false);
      })
      .finally(() => clearTimeout(openAnyway));

    return () => {
      live = false;
      clearTimeout(openAnyway);
    };
  }, [skipIntake, ready, router]);

  const showIntake = !skipIntake && firstEver !== null;

  return (
    <AppShell defaultOpen={false}>
      <TopBar>
        <span className="text-(--lp-ink-3)">{skipIntake ? "Starting a session…" : "New session"}</span>
      </TopBar>
      <div className="flex flex-1 items-center justify-center text-[14px] text-(--lp-ink-3)">
        {skipIntake ? "Setting up your board…" : "Setting up your session…"}
      </div>
      {showIntake && (
        <SessionIntakeDialog
          initialTopic={initialTopic}
          starters={starterTopics(profile?.gradeLevel)}
          starting={starting}
          error={error}
          onStart={(intake, files) => void go(intake, files)}
          onCancel={() => router.push("/")}
        />
      )}
    </AppShell>
  );
}
