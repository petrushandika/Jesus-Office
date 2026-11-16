"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/agents";

const POLL_MS = 5_000;

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const response = await fetch("/api/agents", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as Snapshot;
        if (!cancelled) {
          setSnapshot(next);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
      // Hidden tabs do not poll; resume immediately when visible.
      if (!cancelled && document.visibilityState === "visible") timer = setTimeout(load, POLL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        load();
      }
    };
    load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { snapshot, error };
}
