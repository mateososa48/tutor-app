"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, NotebookPen, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { TopBar } from "@/components/app/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { deleteSession, formatDuration, formatRelativeDate, loadSessions, type SavedSession, type SessionStatus } from "@/lib/sessions";
import { useClientReady } from "@/lib/client-ready";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function today(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

const STATUS_LABEL: Record<SessionStatus, string> = { active: "In progress", paused: "Paused", ended: "Ended" };

export default function HomePage() {
  const mounted = useClientReady();
  const router = useRouter();
  const { data: auth } = useSession();
  const [sessions, setSessions] = useState<SavedSession[] | null>(null);

  useEffect(() => {
    if (!mounted) return;
    loadSessions(20).then(setSessions);
  }, [mounted]);

  async function remove(id: string) {
    setSessions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    await deleteSession(id);
  }

  const firstName = auth?.user?.name?.split(" ")[0];

  return (
    <AppShell defaultOpen>
      <TopBar actions={<span className="text-[13px] text-(--lp-ink-3)">{mounted ? today() : ""}</span>}>
        <span className="font-medium text-(--lp-ink)">Home</span>
      </TopBar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] px-6 pt-14 pb-24 sm:px-8">
          <section className="mb-14">
            <h1 className="lp-display m-0 text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.1] text-(--lp-ink)">
              {mounted ? `${greeting()}${firstName ? `, ${firstName}` : ""}.` : " "}
            </h1>
            <p className="m-0 mt-2 text-[16px] text-(--lp-ink-2)">What are you working on today?</p>
            <button type="button" onClick={() => router.push("/session")} className="lp-btn mt-7">
              <Plus className="size-4" strokeWidth={2.4} />
              Start a session
            </button>
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="lp-display m-0 text-[18px] text-(--lp-ink)">Recent sessions</h2>
              {sessions && sessions.length > 0 && (
                <span className="text-[12.5px] text-(--lp-ink-3) tabular-nums">
                  {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
                </span>
              )}
            </div>

            {sessions === null ? (
              <div className="flex flex-col gap-2 pt-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-[12px]" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <p className="pt-3 text-[14px] text-(--lp-ink-3)">No sessions yet. Start one above and it will show up here.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                <AnimatePresence initial={false}>
                  {sessions.map((s) => (
                    <SessionRow key={s.id} session={s} onOpen={() => router.push(`/session/${s.id}`)} onDelete={() => remove(s.id)} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function SessionRow({ session, onOpen, onDelete }: { session: SavedSession; onOpen: () => void; onDelete: () => void }) {
  return (
    <motion.li
      layout
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      className="group -mx-3 border-b border-(--lp-line) last:border-b-0"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="flex cursor-pointer items-center gap-4 rounded-[12px] px-3 py-3 outline-none transition-colors hover:bg-(--lp-gray) focus-visible:ring-2 focus-visible:ring-(--lp-sky)"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-(--lp-sky-soft) text-(--lp-sky-deep)">
          <NotebookPen className="size-4" strokeWidth={1.9} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14.5px] font-medium text-(--lp-ink)">{session.title}</span>
          <span className="text-[12.5px] text-(--lp-ink-3)">
            {formatRelativeDate(session.startedAt)}
            {session.durationSec > 0 ? `, ${formatDuration(session.durationSec)}` : ""}
          </span>
        </span>
        <Badge
          variant="outline"
          className={
            session.status === "active"
              ? "rounded-full border-(--lp-live)/40 bg-[#eefaf3] text-[#1d7a4c]"
              : "rounded-full border-(--lp-line-strong) text-(--lp-ink-2)"
          }
        >
          {STATUS_LABEL[session.status]}
        </Badge>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${session.title}`}
                onClick={(e) => e.stopPropagation()}
                className="text-(--lp-ink-3) opacity-0 transition-opacity group-hover:opacity-100 hover:text-(--danger) focus-visible:opacity-100 data-open:opacity-100"
              />
            }
          >
            <Trash2 className="size-4" />
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-[16px]">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this session?</AlertDialogTitle>
              <AlertDialogDescription>
                The board and transcript for &ldquo;{session.title}&rdquo; will be gone for good.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="bg-(--danger) text-white hover:bg-[#b8261a]"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <ArrowRight className="size-4 shrink-0 text-(--lp-ink-3) opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </motion.li>
  );
}
