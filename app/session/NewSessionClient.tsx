"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { TopBar } from "@/components/app/TopBar";
import { SessionIntakeDialog } from "@/components/app/SessionIntakeDialog";
import { createSession } from "@/lib/sessions";
import { intakeTitle, storeIntake, type SessionIntake } from "@/lib/session-intake";
import type { UploadedFile } from "@/lib/file-processor";

// "New session" lands here. It asks what the student needs before the board
// opens (SessionIntakeDialog), then creates the session and hands the answers
// over through lib/session-intake. The QA and preview entry points
// (?debug=1, ?qa=1, ?mock=1) skip the questions and start straight away.

export default function NewSessionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startedRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skipIntake =
    searchParams.get("mock") === "1" || searchParams.get("debug") === "1" || searchParams.get("qa") === "1";
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
    router.replace(`/session/${id}?${params.toString()}`);
  };

  // QA and preview links skip the questions; the intake path starts on submit.
  useEffect(() => {
    if (!skipIntake) return;
    const id = requestAnimationFrame(() => void go(null, []));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipIntake]);

  return (
    <AppShell defaultOpen={false}>
      <TopBar>
        <span className="text-(--lp-ink-3)">{skipIntake ? "Starting a session…" : "New session"}</span>
      </TopBar>
      <div className="flex flex-1 items-center justify-center text-[14px] text-(--lp-ink-3)">
        {skipIntake ? "Setting up your board…" : "Setting up your session…"}
      </div>
      {!skipIntake && (
        <SessionIntakeDialog
          initialTopic={initialTopic}
          starting={starting}
          error={error}
          onStart={(intake, files) => void go(intake, files)}
          onCancel={() => router.push("/")}
        />
      )}
    </AppShell>
  );
}
