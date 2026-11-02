"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteSession, loadSessions, type SavedSession } from "@/lib/sessions";
import { useClientReady } from "@/lib/client-ready";

// One list of the student's sessions for the pages that read it (Sessions,
// Progress, search): fetched once, kept for half a minute, so moving between
// pages does not refetch every transcript.

const TTL_MS = 30_000;
let cache: { at: number; limit: number; promise: Promise<SavedSession[]> } | null = null;

export function fetchSessionList(limit = 200, fresh = false): Promise<SavedSession[]> {
  const now = Date.now();
  if (!fresh && cache && cache.limit >= limit && now - cache.at < TTL_MS) return cache.promise;
  const promise = loadSessions(limit);
  cache = { at: now, limit, promise };
  return promise;
}

export function forgetSessionList() {
  cache = null;
}

export function useSessionList(limit = 200) {
  const mounted = useClientReady();
  const [sessions, setSessions] = useState<SavedSession[] | null>(null);

  useEffect(() => {
    if (!mounted) return;
    let live = true;
    void fetchSessionList(limit).then((list) => {
      if (live) setSessions(list);
    });
    return () => {
      live = false;
    };
  }, [mounted, limit]);

  const remove = useCallback(async (id: string) => {
    setSessions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    forgetSessionList();
    return deleteSession(id);
  }, []);

  return { sessions, setSessions, remove };
}
