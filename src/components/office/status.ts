import type { AgentStatus } from "@/lib/agents";

// One palette for 3D body tint, screen glow and the 2D panel badge.
export const STATUS: Record<AgentStatus, { label: string; body: string; screen: string; badge: string }> = {
  running: { label: "Running", body: "#3b82f6", screen: "#38bdf8", badge: "bg-blue-500/15 text-blue-200 ring-blue-400/40" },
  stale: { label: "Stale", body: "#a8a29e", screen: "#f59e0b", badge: "bg-amber-500/15 text-amber-200 ring-amber-400/40" },
  completed: { label: "Completed", body: "#22c55e", screen: "#4ade80", badge: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40" },
  failed: { label: "Failed", body: "#ef4444", screen: "#f87171", badge: "bg-red-500/15 text-red-200 ring-red-400/40" },
  interrupted: { label: "Interrupted", body: "#a855f7", screen: "#c084fc", badge: "bg-purple-500/15 text-purple-200 ring-purple-400/40" },
};
