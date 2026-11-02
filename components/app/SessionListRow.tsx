"use client";

import { useState } from "react";
import Link from "next/link";
import { Delete02Icon } from "@hugeicons/core-free-icons";
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
import { sessionHeadline, shortDay } from "@/lib/home-stats";
import type { SavedSession } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { ChalkMark } from "./ChalkMark";
import { Icon } from "./Icon";

// A session in a list (Paper "Lists"): the newest board as a thumbnail, the
// title and a one-line recap, when and how long. A finished session opens on
// its summary; one that stopped part-way opens where it left off.

const DOTS = {
  backgroundImage: "radial-gradient(rgba(18,18,21,0.12) 1px, transparent 1.2px)",
  backgroundSize: "7px 7px",
  backgroundPosition: "3px 3px",
} as const;

export function SessionThumb({ id, picture, className }: { id: string; picture: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const missing = !picture || failed;
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[46px] w-[64px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white shadow-[0_0_0_1px_rgba(18,18,21,0.08)]",
        className,
      )}
      style={missing ? DOTS : undefined}
    >
      {missing ? (
        <ChalkMark size={18} color="rgba(18,18,21,0.28)" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/sessions/${encodeURIComponent(id)}/frames`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover object-left-top"
        />
      )}
    </span>
  );
}

export function sessionHref(s: Pick<SavedSession, "id" | "status">) {
  return s.status === "ended" ? `/session/${s.id}/summary` : `/session/${s.id}`;
}

function minutes(sec: number) {
  return sec >= 30 ? `${Math.max(1, Math.round(sec / 60))} min` : "";
}

export function SessionListRow({ session, onDelete }: { session: SavedSession; onDelete?: () => void }) {
  const { title, recap } = sessionHeadline(session);
  const [now] = useState(() => Date.now());
  // Only a session left off lately is worth picking up; old half-sessions are just history.
  const unfinished = session.status !== "ended" && session.durationSec >= 30 && now - (session.lastActiveAt || session.startedAt) < 3 * 86_400_000;
  const length = minutes(session.durationSec);

  return (
    <li className="group/session relative">
      <Link
        href={sessionHref(session)}
        className="flex items-center gap-4 rounded-[12px] px-2.5 py-2.5 outline-none transition-colors duration-150 hover:bg-(--lp-gray)/70 focus-visible:shadow-[inset_0_0_0_2px_var(--lp-sky)] sm:pr-12"
      >
        <SessionThumb id={session.id} picture={Boolean(session.hasPicture)} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-medium text-(--lp-ink)">{title}</span>
            {unfinished && (
              <span className="shrink-0 rounded-full bg-(--lp-sky-soft) px-2 py-0.5 text-[11.5px] font-medium text-(--lp-sky-deep)">
                Pick up
              </span>
            )}
          </span>
          {recap && <span className="mt-0.5 truncate text-[13.5px] text-(--lp-ink-2)">{recap}</span>}
        </span>
        <span className="hidden shrink-0 text-[13px] text-(--lp-ink-3) tabular-nums sm:block">
          {shortDay(session.startedAt)}
          {length && ` · ${length}`}
        </span>
      </Link>

      {onDelete && (
        <AlertDialog>
          <AlertDialogTrigger
            aria-label={`Delete ${title}`}
            className="absolute top-1/2 right-2 hidden size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[8px] text-(--lp-ink-3) opacity-0 outline-none transition-[opacity,color] duration-150 group-hover/session:opacity-100 hover:text-(--danger) focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) data-[popup-open]:opacity-100 sm:flex"
          >
            <Icon icon={Delete02Icon} size={16} />
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-[16px]">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this session?</AlertDialogTitle>
              <AlertDialogDescription>
                The boards, transcript and summary for &ldquo;{title}&rdquo; will be gone for good.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction className="bg-(--danger) text-white hover:bg-[#b8261a]" onClick={onDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
}
