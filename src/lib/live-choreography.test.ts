import { test } from 'node:test';
import assert from 'node:assert/strict';
import { livePoseAt, createLiveController, createLiveState, updateLiveState, physicalRoomAt, targetRoomForTool, isLiveAgent } from './live-choreography.ts';
import { ROOMS, routeBetween, sampleRoute, WALK_SPEED } from './room-choreography.ts';
import type { Agent } from './agents.ts';

import { readFileSync } from 'node:fs';

test('scene binds actual stable workers; meshes contain no decorative speech or pixel text', () => {
  const scene = readFileSync(new URL('../components/office/scene.tsx', import.meta.url), 'utf8');
  const disciple = readFileSync(new URL('../components/office/disciple.tsx', import.meta.url), 'utf8');
  assert.match(scene, /reconcileBindings\(/);
  assert.match(scene, /agent=\{boundAgent\}/);
  assert.match(scene, /rotation=\{0\}/);
  assert.doesNotMatch(scene, /DemoLabel|const DEMO/);
  assert.doesNotMatch(disciple, /ref=\{speech\}|ref=\{dots\}/);
  assert.match(disciple, /portable-laptop/);
  assert.match(disciple, /reducedMotion \|\| resume\.current \? 0/);
});

const now = Date.parse('2026-11-17T12:00:00Z');
const agent = (patch: Partial<Agent> = {}): Agent => ({ id: 'real-run-0', run: 'real-run', task: 0,
  status: 'running', activity: 'tool', model: 'model', startedAt: null, endedAt: null,
  heartbeatAt: new Date(now).toISOString(), toolCalls: 1, lastTool: 'terminal', ...patch });

test('freshness requires a real running heartbeat within 120 seconds', () => {
  assert.equal(isLiveAgent(agent(), now), true);
  for (const patch of [{status: 'completed'}, {status: 'stale'}, {status: 'failed'}, {status: 'interrupted'},
    {activity: 'done'}, {heartbeatAt: null}, {heartbeatAt: 'invalid'},
    {heartbeatAt: new Date(now - 120001).toISOString()}, {heartbeatAt: new Date(now + 1).toISOString()}] as Partial<Agent>[]) {
    assert.equal(isLiveAgent(agent(patch), now), false);
    const c = createLiveController('yesus');
    assert.deepEqual(c.update(30, agent(patch), now).position, ROOMS[0].home);
  }
});

const categories = ['delegate_task', 'architecture_diagram', 'terminal', 'test_runner', 'web_search', 'todo_list', 'write_file'];
test('each source reaches every different target via the existing physical door/lane path', () => {
  const covered = new Set<string>();
  for (const source of ROOMS) for (const tool of categories) {
    const target = targetRoomForTool(tool, source.id);
    assert.notEqual(target, source.id);
    covered.add(`${source.id}->${target}`);
    const c = createLiveController(source.id), a = agent({lastTool: tool});
    const route = routeBetween(source.id, target);
    const length = sampleRoute(route, Infinity).length;
    let distance = 0;
    while (distance < length) {
      const delta = Math.min(0.1, (length - distance) / WALK_SPEED);
      distance += delta * WALK_SPEED;
      const pose = c.update(delta, a, now);
      const expected = sampleRoute(route, distance).position;
      pose.position.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-7));
      assert.equal(pose.room, physicalRoomAt(pose.position));
      assert.equal(pose.agentId, a.id);
      assert.equal(pose.run, a.run);
      assert.equal(pose.heartbeatAt, a.heartbeatAt);
      if (length - distance < 1e-8) break;
    }
    const arrived = c.update(1, a, now);
    assert.equal(arrived.room, target);
    assert.equal(arrived.traveling, false);
    assert.equal(arrived.phase, tool === 'write_file' ? 'coding' : tool === 'web_search' ? 'reading' : 'working');
    if (tool !== 'write_file') assert.equal(arrived.leftHand, 0);
    assert.deepEqual(c.update(1000, a, now).position, arrived.position);
  }
  assert.equal(covered.size, ROOMS.length * (ROOMS.length - 1));
});

test('tool events during travel never reset, jitter or queue another trip', () => {
  const c = createLiveController('yesus');
  const first = c.update(1, agent(), now);
  const changed = agent({lastTool: 'web_search', toolCalls: 2});
  assert.deepEqual(c.update(0, changed, now).position, first.position);
  const arrival = c.update(100, changed, now);
  assert.equal(arrival.room, 'yohanes');
  assert.deepEqual(c.update(100, changed, now).position, arrival.position);
  const next = c.update(0.1, agent({lastTool: 'write_file', toolCalls: 3}), now);
  assert.equal(next.traveling, true);
  assert.ok(Math.hypot(next.position[0] - arrival.position[0], next.position[2] - arrival.position[2]) <= WALK_SPEED * 0.1 + 1e-9);
});

test('stop, completion, offline and expiry freeze the exact current world position', () => {
  for (const stopped of [undefined, agent({status: 'completed'}), agent({status: 'failed'}), agent({status: 'interrupted'}),
    agent({status: 'stale'}), agent({activity: 'done'}), agent({heartbeatAt: null})]) {
    const c = createLiveController('andreas');
    const moving = c.update(2, agent(), now);
    const frozen = c.update(50, stopped, now);
    assert.deepEqual(frozen.position, moving.position);
    assert.equal(frozen.traveling, false);
    assert.equal(frozen.leftHand, 0);
    assert.equal(frozen.leftStride, 0);
    assert.deepEqual(c.update(100, stopped, now).position, frozen.position);
  }
  const c = createLiveController('matius');
  const moving = c.update(1, agent(), now);
  assert.deepEqual(c.update(5, agent(), now + 120001).position, moving.position);
  assert.deepEqual(c.update(0, agent({id: 'other', run: 'other'}), now).position, moving.position);
});

test('physical identity remains the source room until crossing its actual door', () => {
  const c = createLiveController('yesus');
  const pose = c.update(1, agent(), now);
  assert.equal(pose.traveling, true);
  assert.equal(pose.room, 'yesus');
  assert.equal(physicalRoomAt([0, 0, 0]), 'central-lane');
});

test('thinking and waiting override previous writes without invented travel or typing', () => {
  for (const activity of ['thinking', 'waiting'] as const) {
    const c = createLiveController('yesus');
    const pose = c.update(1, agent({ activity, lastTool: 'write_file' }), now);
    assert.equal(pose.phase, activity);
    assert.deepEqual(pose.position, ROOMS[0].home);
    assert.equal(pose.leftHand, 0);
    assert.equal(pose.rightHand, 0);
    assert.equal(pose.gesture, 0);
    const next = c.update(1, agent({ activity, lastTool: 'write_file' }), now);
    assert.notEqual(next.headTurn, pose.headTurn);
  }
});

test('only explicit edit/write tools type; terminal and generic execution never pretend to code', () => {
  for (const tool of ['write_file', 'patch', 'edit_file', 'apply_patch', 'functions.patch']) {
    const c = createLiveController('yesus');
    const pose = c.update(100, agent({ lastTool: tool }), now);
    assert.equal(pose.phase, 'coding');
    assert.ok(Math.abs(pose.leftHand) + Math.abs(pose.rightHand) > 0);
  }
  for (const tool of ['terminal', 'execute_code', 'browser_exec', 'delegate_task', 'send_message', null]) {
    const c = createLiveController('yesus');
    const pose = c.update(100, agent({ lastTool: tool }), now);
    assert.notEqual(pose.phase, 'coding');
    assert.equal(pose.leftHand, 0);
    assert.equal(pose.rightHand, 0);
    assert.equal(pose.gesture, 0);
  }
});

test('no tool observation means no invented outbound work', () => {
  const c = createLiveController('yesus');
  assert.deepEqual(c.update(50, agent({lastTool: null}), now).position, ROOMS[0].home);
});

test('immutable updates sanitize deltas and pause/resume without mutating inputs', () => {
  const initial = createLiveState('yesus');
  const saved = structuredClone(initial);
  const started = updateLiveState(initial, 1, agent(), now);
  assert.deepEqual(initial, saved);
  for (const delta of [NaN, Infinity, -1]) {
    assert.deepEqual(updateLiveState(started.state, delta, agent(), now).pose.position, started.pose.position);
  }
  const stopped = updateLiveState(started.state, 30, undefined, now);
  const resumed = updateLiveState(stopped.state, 0.1, agent(), now);
  assert.ok(Math.hypot(resumed.pose.position[0] - started.pose.position[0], resumed.pose.position[2] - started.pose.position[2]) <= WALK_SPEED * 0.1 + 1e-9);
});

test('absent agent stays motionless at home regardless of elapsed time', () => {
  for (const room of ROOMS) {
    const a = livePoseAt(0, room.id), b = livePoseAt(99999, room.id);
    assert.deepEqual(a.position, room.home);
    assert.deepEqual(a, b);
    assert.equal(a.active, false);
    assert.equal(a.traveling, false);
    assert.equal(a.leftHand, 0);
  }
});
