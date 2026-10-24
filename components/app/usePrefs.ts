"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PREFS, readPrefs, subscribePrefs, writePrefs, type AppPrefs } from "@/lib/app-prefs";

/** This device's preferences, live: a change on one page shows on every other. */
export function usePrefs(): [AppPrefs, (patch: Partial<AppPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribePrefs, readPrefs, () => DEFAULT_PREFS);
  return [prefs, writePrefs];
}
