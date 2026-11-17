"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/agents";

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const load = async () => {
      if (cancelled || busy || document.hidden) return;
      busy = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch("/api/agents", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as Snapshot;
        if (!Array.isArray(next.agents) || typeof next.available !== 'boolean' || !Number.isFinite(Date.parse(next.generatedAt))) throw new Error('Invalid snapshot');
        if (!cancelled) { setSnapshot(next); setError(false); }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        clearTimeout(timeout); busy = false;
        if (!cancelled && !document.hidden) timer = setTimeout(load, 3000);
      }
    };
    const onVisible = () => { clearTimeout(timer); if (!document.hidden) void load(); };
    void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; controller?.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return { snapshot, error };
}
