import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type AgentStatus = "running" | "stale" | "completed" | "failed" | "interrupted";
export type Activity = "tool" | "thinking" | "waiting" | "done";

export type Agent = {
  id: string;
  run: string;
  task: number;
  status: AgentStatus;
  activity: Activity;
  model: string;
  startedAt: string | null;
  endedAt: string | null;
  heartbeatAt: string | null;
  toolCalls: number;
  lastTool: string | null;
};

export type Snapshot = {
  available: boolean;
  generatedAt: string;
  agents: Agent[];
  totals: Record<AgentStatus, number>;
  gateway: { state: string; activeAgents: number; updatedAt: string } | null;
};

type Options = { dir: string; gatewayFile: string; now?: number };

// A running task whose transcript has been silent this long is shown as stale, not busy.
const STALE_MS = 15 * 60_000;
const DESKS = 10;
const LOG_BYTES = 256 * 1024;
const TOOL = /^\d{2}:\d{2}:\d{2} tool +\| -> ([A-Za-z0-9_]+)\(/;
const EVENT = /^\d{2}:\d{2}:\d{2} ([a-z]+) +\|/;
const SAFE = /^[A-Za-z0-9_.:/-]{1,80}$/;

// Hermes writes manifest times as UTC "YYYY-MM-DD HH:MM:SS".
function isoTime(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(value)) return null;
  const t = Date.parse(value.replace(" ", "T") + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? "" : "Z"));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function safe(value: unknown): string {
  return typeof value === "string" && SAFE.test(value) ? value : "unknown";
}

async function readTail(file: string) {
  const info = await stat(file);
  const text = await readFile(file, "utf8");
  return { text: text.length > LOG_BYTES ? text.slice(-LOG_BYTES) : text, modified: info.mtimeMs };
}

function parseLog(text: string) {
  let toolCalls = 0;
  let lastTool: string | null = null;
  let lastEvent: string | null = null;
  for (const line of text.split("\n")) {
    const tool = TOOL.exec(line);
    if (tool) {
      toolCalls++;
      lastTool = tool[1];
    }
    const event = EVENT.exec(line);
    if (event) lastEvent = event[1];
  }
  return { toolCalls, lastTool, lastEvent };
}

function activityOf(status: AgentStatus, lastEvent: string | null): Activity {
  if (status !== "running") return status === "stale" ? "waiting" : "done";
  if (lastEvent === "think" || lastEvent === "assistant") return "thinking";
  if (lastEvent === "tool") return "tool";
  return "waiting";
}

async function readGateway(file: string): Promise<Snapshot["gateway"]> {
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    const updatedAt = isoTime(data.updated_at);
    if (!updatedAt) return null;
    return { state: safe(data.gateway_state), activeAgents: Number.isInteger(data.active_agents) ? data.active_agents : 0, updatedAt };
  } catch {
    return null;
  }
}

export async function readSnapshot({ dir, gatewayFile, now = Date.now() }: Options): Promise<Snapshot> {
  const totals: Record<AgentStatus, number> = { running: 0, stale: 0, completed: 0, failed: 0, interrupted: 0 };
  const generatedAt = new Date(now).toISOString();
  const gateway = await readGateway(gatewayFile);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { available: false, generatedAt, agents: [], totals, gateway };
  }

  const agents: Agent[] = [];
  for (const entry of entries) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(dir, entry, "manifest.json"), "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(manifest.tasks)) continue;
    const run = safe(manifest.delegation_id);
    for (const task of manifest.tasks) {
      const index = Number.isInteger(task.index) ? task.index : 0;
      // Only read the transcript Hermes wrote for this task inside the delegation folder.
      let log = { text: "", modified: 0 };
      try {
        log = await readTail(join(dir, entry, `task-${index}.log`));
      } catch {}
      const parsed = parseLog(log.text);
      const raw = typeof task.status === "string" ? task.status : "failed";
      let status: AgentStatus =
        raw === "running" ? "running" : raw === "completed" ? "completed" : raw === "interrupted" ? "interrupted" : "failed";
      if (status === "running" && now - log.modified > STALE_MS) status = "stale";
      totals[status]++;
      agents.push({
        id: `${run}-${index}`,
        run,
        task: index,
        status,
        activity: activityOf(status, parsed.lastEvent),
        model: safe(manifest.model),
        startedAt: isoTime(manifest.started),
        endedAt: isoTime(manifest.completed),
        heartbeatAt: log.modified ? new Date(log.modified).toISOString() : null,
        toolCalls: parsed.toolCalls,
        lastTool: parsed.lastTool,
      });
    }
  }

  const rank = (a: Agent) => (a.status === "running" ? 0 : a.status === "stale" ? 2 : 1);
  agents.sort((a, b) => rank(a) - rank(b) || (b.startedAt ?? "").localeCompare(a.startedAt ?? "") || a.task - b.task);
  return { available: true, generatedAt, agents: agents.slice(0, DESKS), totals, gateway };
}
