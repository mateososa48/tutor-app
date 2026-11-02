"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "@/components/app/AppShell";
import { Icon } from "@/components/app/Icon";
import { EmptyNote, PageBody, PageHeader, Panel, PRIMARY_BUTTON, Segmented } from "@/components/app/page-kit";
import { SessionListRow } from "@/components/app/SessionListRow";
import { useSessionList } from "@/components/app/useSessionList";
import { Skeleton } from "@/components/ui/skeleton";
import { groupByTime, practiceTotals } from "@/lib/app-stats";
import { formatWeekTotal, sessionHeadline } from "@/lib/home-stats";

// Every session the student has had, newest first, grouped by when. Search
// reads the titles and recaps the summaries wrote; the filter separates
// finished sessions (which open on their summary) from ones that stopped
// part-way (which open where they left off).

type Filter = "all" | "finished" | "unfinished";

export function SessionsView() {
  const { sessions, remove } = useSessionList(200);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    if (!sessions) return null;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return sessions.filter((s) => {
      if (filter === "finished" && s.status !== "ended") return false;
      if (filter === "unfinished" && s.status === "ended") return false;
      if (!words.length) return true;
      const { title, recap } = sessionHeadline(s);
      const text = `${title} ${recap}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [sessions, query, filter]);

  const totals = sessions ? practiceTotals(sessions) : null;
  const groups = shown ? groupByTime(shown) : null;

  return (
    <AppShell bar>
      <PageBody>
        <PageHeader
          title="Sessions"
          lede={
            totals && totals.sessions > 0
              ? `${totals.sessions} ${totals.sessions === 1 ? "session" : "sessions"}, ${formatWeekTotal(totals.seconds)} at the board in all.`
              : "Every session you have, with its boards and what happened in it."
          }
          actions={
            <Link href="/session" className={PRIMARY_BUTTON}>
              <Icon icon={Add01Icon} size={16} />
              New session
            </Link>
          }
        />

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex h-10 w-full items-center gap-2.5 rounded-[12px] border border-(--lp-gray-2) bg-white px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-(--lp-sky) focus-within:shadow-[0_0_0_3px_var(--lp-sky-glow)] sm:max-w-[340px]">
            <Icon icon={Search01Icon} size={16} className="text-(--lp-ink-2)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a session, like “fractions”"
              aria-label="Find a session"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-(--lp-ink) outline-none placeholder:text-(--lp-ink-3)"
            />
          </label>
          <Segmented<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "finished", label: "Finished" },
              { value: "unfinished", label: "Not finished" },
            ]}
          />
        </div>

        <div className="mt-6 flex flex-col gap-5">
          {groups === null ? (
            <Panel>
              <div className="flex flex-col gap-3 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-2">
                    <Skeleton className="h-[46px] w-[64px] rounded-[8px]" />
                    <div className="flex flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-2/5 rounded-md" />
                      <Skeleton className="h-3.5 w-3/5 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : sessions && sessions.length === 0 ? (
            <Panel title="No sessions yet">
              <EmptyNote
                action={
                  <Link href="/session" className={PRIMARY_BUTTON}>
                    Start your first session
                  </Link>
                }
              >
                Bring a problem you&apos;re stuck on, or a photo of your homework. Each session lands here with its boards and a short summary.
              </EmptyNote>
            </Panel>
          ) : groups.length === 0 ? (
            <Panel>
              <EmptyNote className="pt-6">
                Nothing matches{query.trim() ? <> &ldquo;{query.trim()}&rdquo;</> : null}
                {filter !== "all" ? ` in ${filter === "finished" ? "finished" : "unfinished"} sessions` : ""}. Try another word.
              </EmptyNote>
            </Panel>
          ) : (
            groups.map((group) => (
              <Panel key={group.label} title={group.label} action={<span className="text-[13px] text-(--lp-ink-3) tabular-nums">{group.items.length}</span>}>
                <ul className="m-0 flex list-none flex-col p-0 px-2.5 pt-2 pb-2.5 sm:px-3.5">
                  {group.items.map((s) => (
                    <SessionListRow key={s.id} session={s} onDelete={() => void remove(s.id)} />
                  ))}
                </ul>
              </Panel>
            ))
          )}
        </div>
      </PageBody>
    </AppShell>
  );
}
