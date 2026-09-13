"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import LeftNav from "@/components/LeftNav";
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
      }
      else router.replace("/");
    });
  }, [router]);

  return (
    <div
      className="h-screen w-screen flex overflow-hidden"
      style={{ background: "#e2e2e2", padding: 10, gap: 10 }}
    >
      <LeftNav />
      <main
        className="flex-1 min-w-0 flex items-center justify-center"
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 18px rgba(0,0,0,0.06)",
        }}
      >
        <span style={{ color: "#909090", fontSize: 14 }}>Starting new session…</span>
      </main>
    </div>
  );
}
