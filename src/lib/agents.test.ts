import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSnapshot } from "./agents.ts";

const NOW = Date.parse("2026-11-13T07:00:00Z");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "office-"));
  const add = async (id: string, started: string, tasks: { status: string; log: string; ageMin: number }[], completed?: string) => {
    const dir = join(root, id);
    await mkdir(dir);
    const manifest = {
      delegation_id: id,
      started,
      completed,
      task_count: tasks.length,
      model: "cx/gpt-6.1-sol",
      provider: "custom:9router",
      tasks: tasks.map((t, index) => ({ index, goal: "SECRET GOAL token=abc", log: join(dir, `task-${index}.log`), status: t.status, exit_reason: null })),
    };
    await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));
    for (const [index, t] of tasks.entries()) {
      const file = join(dir, `task-${index}.log`);
      await writeFile(file, t.log);
      const at = new Date(NOW - t.ageMin * 60_000);
      await utimes(file, at, at);
    }
  };
  const log = (lines: string[]) => ["=== Hermes subagent live transcript ===", "goal: SECRET GOAL token=abc", ...lines].join("\n");
  await add("deleg_live", "2026-11-13 06:50:00", [
    { status: "running", ageMin: 1, log: log(["06:51:00 tool     | -> read_file(/home/x/.env)", "06:51:01 result   | read_file ok", "06:52:00 tool     | -> terminal(rm -rf /tmp/x)", "06:52:30 think    | planning"]) },
  ]);
  await add("deleg_old", "2026-11-12 08:00:00", [{ status: "running", ageMin: 600, log: log(["08:01:00 tool     | -> terminal(ls)"]) }]);
  await add("deleg_done", "2026-11-13 05:00:00", [
    { status: "completed", ageMin: 90, log: log(["05:01:00 tool     | -> skill_view(x)", "05:02:00 final    | end status=completed"]) },
    { status: "failed", ageMin: 80, log: log(["05:03:00 tool     | -> mcp__jira__jira_search(...)"]) },
  ], "2026-11-13 05:20:00");
  await mkdir(join(root, "broken"));
  await writeFile(join(root, "broken", "manifest.json"), "{not json");
  await writeFile(join(root, "gateway_state.json"), JSON.stringify({ gateway_state: "running", active_agents: 1, updated_at: "2026-11-13T06:59:00Z", argv: "secret" }));
  return root;
}

test("maps real delegation runs to sanitized agent states", async () => {
  const root = await fixture();
  const snap = await readSnapshot({ dir: root, gatewayFile: join(root, "gateway_state.json"), now: NOW });
  assert.equal(snap.available, true);
  assert.deepEqual(snap.agents.map((a) => [a.id, a.status]), [
    ["deleg_live-0", "running"],
    ["deleg_done-0", "completed"],
    ["deleg_done-1", "failed"],
    ["deleg_old-0", "stale"],
  ]);
  const live = snap.agents[0];
  assert.equal(live.toolCalls, 2);
  assert.equal(live.lastTool, "terminal");
  assert.equal(live.activity, "thinking");
  assert.equal(live.startedAt, "2026-11-13T06:50:00.000Z");
  assert.equal(snap.agents[1].endedAt, "2026-11-13T05:20:00.000Z");
  assert.equal(snap.agents[2].lastTool, "mcp__jira__jira_search");
  assert.deepEqual(snap.gateway, { state: "running", activeAgents: 1, updatedAt: "2026-11-13T06:59:00.000Z" });
  assert.deepEqual(snap.totals, { running: 1, stale: 1, completed: 1, failed: 1, interrupted: 0 });
});

test("never exposes goals, tool arguments or unknown manifest fields", async () => {
  const root = await fixture();
  const raw = JSON.stringify(await readSnapshot({ dir: root, gatewayFile: join(root, "gateway_state.json"), now: NOW }));
  for (const leak of ["SECRET", "token=abc", ".env", "rm -rf", "argv", root]) assert.equal(raw.includes(leak), false, leak);
});

test("limits desks to the ten most recent tasks", async () => {
  const root = await mkdtemp(join(tmpdir(), "office-many-"));
  for (let i = 0; i < 13; i++) {
    const dir = join(root, `d${i}`);
    await mkdir(dir);
    await writeFile(join(dir, "task-0.log"), "");
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ delegation_id: `d${i}`, started: `2026-11-13 06:${String(10 + i).padStart(2, "0")}:00`, model: "m", provider: "p", tasks: [{ index: 0, goal: "x", log: join(dir, "task-0.log"), status: "completed" }] }));
  }
  const snap = await readSnapshot({ dir: root, gatewayFile: join(root, "missing.json"), now: NOW });
  assert.equal(snap.agents.length, 10);
  assert.equal(snap.agents[0].id, "d12-0");
  assert.equal(snap.gateway, null);
});

test("reports an unavailable source instead of fabricating agents", async () => {
  const snap = await readSnapshot({ dir: "/nonexistent/agent-office", gatewayFile: "/nonexistent/g.json", now: NOW });
  assert.equal(snap.available, false);
  assert.deepEqual(snap.agents, []);
});
