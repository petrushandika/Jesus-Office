"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(change: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
