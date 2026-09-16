"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { TopBar } from "@/components/app/TopBar";
import type { AdminSessionRow } from "@/lib/admin-data";
import { cn } from "@/lib/utils";

function when(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function length(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor(sec / 60) % 60;
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function Chip({ tone, children }: { tone: "error" | "warn" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-[12px] font-medium whitespace-nowrap",
        tone === "error" && "bg-[#fdeceb] text-[#b42318]",
        tone === "warn" && "bg-[#fff4e0] text-[#8f5400]",
        tone === "muted" && "bg-(--lp-gray) text-(--lp-ink-2)",
      )}
    >
      {children}
    </span>
  );
}

export function AdminSessionsView({ sessions }: { sessions: AdminSessionRow[] }) {
  const router = useRouter();
  const students = new Set(sessions.map((s) => s.userEmail ?? s.userName ?? s.id)).size;

  return (
    <AppShell defaultOpen>
      <TopBar>
        <span className="font-medium text-(--lp-ink)">Sessions</span>
        <span className="text-(--lp-ink-2)">Admin</span>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1240px] px-5 pt-8 pb-16">
          <div className="mb-6">
            <h1 className="lp-display text-[26px] leading-tight tracking-[-0.02em] text-(--lp-ink)">Every session, recorded</h1>
            <p className="mt-1.5 max-w-[70ch] text-[14px] leading-relaxed text-(--lp-ink-2)">
              {plural(sessions.length, "session")} from {plural(students, "student")}, newest first. Open one to replay it: the board as it was, what each side said, and every move the tutor made.
            </p>
          </div>

          {sessions.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-(--lp-line-strong) px-6 py-12 text-center text-[14px] text-(--lp-ink-2)">
              No sessions yet. They show up here as soon as someone starts one.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[14px] border border-(--lp-line)">
              <table className="w-full min-w-[900px] border-collapse text-left text-[13.5px]">
                <thead>
                  <tr className="bg-(--lp-gray)/70 text-[12px] text-(--lp-ink-2)">
                    <th scope="col" className="px-4 py-2.5 font-medium">Student</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Started</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Length</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Talk</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Tool calls</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Issues</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Board pictures</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const href = `/admin/sessions/${s.id}`;
                    const chips: ReactNode[] = [];
                    if (s.toolErrors) chips.push(<Chip key="t" tone="error">{plural(s.toolErrors, "failed tool")}</Chip>);
                    if (s.errors) chips.push(<Chip key="e" tone="error">{plural(s.errors, "error")}</Chip>);
                    if (s.interruptions) chips.push(<Chip key="i" tone="warn">{plural(s.interruptions, "interruption")}</Chip>);
                    if (s.reconnects) chips.push(<Chip key="r" tone="warn">{plural(s.reconnects, "reconnect")}</Chip>);
                    if (!s.recorded) chips.push(<Chip key="o" tone="muted">Transcript only</Chip>);
                    else if (chips.length === 0) chips.push(<Chip key="n" tone="muted">None found</Chip>);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => router.push(href)}
                        className="cursor-pointer border-t border-(--lp-line) transition-colors duration-150 hover:bg-(--lp-sky-tint)"
                      >
                        <td className="px-4 py-3 align-top">
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-sm font-medium text-(--lp-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--lp-sky)"
                          >
                            {s.userName ?? s.userEmail ?? "Unknown student"}
                          </Link>
                          <span className="mt-0.5 block max-w-[280px] truncate text-[12.5px] text-(--lp-ink-2)">{s.title}</span>
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap text-(--lp-ink)">
                          <time suppressHydrationWarning dateTime={new Date(s.startedAt).toISOString()}>
                            {when(s.startedAt)}
                          </time>
                          <span className="mt-0.5 block text-[12.5px] text-(--lp-ink-2) capitalize">{s.status}</span>
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap tabular-nums">{length(s.durationSec)}</td>
                        <td className="px-4 py-3 align-top whitespace-nowrap tabular-nums text-(--lp-ink-2)">
                          <span className="text-(--lp-ink)">{s.studentLines}</span> student · <span className="text-(--lp-ink)">{s.tutorLines}</span> tutor
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap tabular-nums">{s.recorded ? s.toolCalls : <span className="text-(--lp-ink-2)">not recorded</span>}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1">{chips}</div>
                        </td>
                        <td className="px-4 py-3 text-right align-top tabular-nums">{s.frames}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
