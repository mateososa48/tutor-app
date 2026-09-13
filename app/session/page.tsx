"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { TopBar } from "@/components/app/TopBar";
import { createSession } from "@/lib/sessions";

export default function NewSessionRedirect() {
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    createSession().then((id) => {
      if (id) {
        const params = new URLSearchParams(window.location.search);
        params.set("new", "1");
        router.replace(`/session/${id}?${params.toString()}`);
      } else router.replace("/");
    });
  }, [router]);

  return (
    <AppShell defaultOpen={false}>
      <TopBar>
        <span className="text-(--lp-ink-3)">Starting a session…</span>
      </TopBar>
      <div className="flex flex-1 items-center justify-center text-[14px] text-(--lp-ink-3)">Setting up your board…</div>
    </AppShell>
  );
}
