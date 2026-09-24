import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}

// A laptop-sized screen: the session's voice dock gets a column of its own
// (TldrawCore keeps the board out of it) from this width.
const WIDE_BREAKPOINT = 1024

function subscribeWide(onChange: () => void) {
  const mql = window.matchMedia(`(min-width: ${WIDE_BREAKPOINT}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsWide() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.innerWidth >= WIDE_BREAKPOINT,
    () => true,
  )
}
