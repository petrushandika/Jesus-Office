import assert from "node:assert/strict";
import test from "node:test";
import { CITY_NPCS, createCityNpcClock, sampleCityNpc } from "./city-npcs.ts";

test("ten decorative citizens stay in separated exterior corridor routes", () => {
  assert.equal(CITY_NPCS.length, 10);
  const lanes = new Set<string>();
  for (const npc of CITY_NPCS) {
    assert.ok(npc.from >= -10 && npc.to <= 10 && npc.from < npc.to);
    assert.ok(npc.z < 0 ? Math.abs(npc.z + 11) <= 0.351 : Math.abs(npc.z - 9.2) <= 0.351);
    lanes.add(String(npc.z));
    for (let time = 0; time <= 80; time += 0.05) {
      const pose = sampleCityNpc(npc, time);
      assert.ok(pose.position[0] >= npc.from && pose.position[0] <= npc.to);
      assert.equal(pose.position[2], npc.z);
      const next = sampleCityNpc(npc, time + 0.001);
      assert.ok(Math.abs(next.position[0] - pose.position[0]) < 0.002);
      assert.ok(Math.abs(next.heading - pose.heading) < 0.01);
    }
  }
  assert.equal(lanes.size, 10);
});

test("pause freezes elapsed time and every pose channel without resume catch-up", () => {
  const clock = createCityNpcClock();
  clock.advance(0.5, false);
  const before = CITY_NPCS.map(npc => sampleCityNpc(npc, clock.advance(0, false)));
  for (let frame = 0; frame < 50; frame++) clock.advance(10, true);
  const after = CITY_NPCS.map(npc => sampleCityNpc(npc, clock.advance(0, true)));
  assert.deepEqual(after, before);
  assert.equal(clock.advance(100, false), 0.5);
  assert.equal(clock.advance(0.1, false), 0.6);
});

test("destination pauses hold feet and gait still while turning continuously", () => {
  const npc = { ...CITY_NPCS[0], offset: 0 };
  for (const time of [8, 8.5, 9, 9.5]) {
    const pose = sampleCityNpc(npc, time);
    assert.equal(pose.position[0], npc.to);
    assert.equal(pose.walking, false);
    assert.equal(pose.leftLeg, 0);
    assert.equal(pose.position[1], 0);
  }
});

test("all routes clear the well, core rooms and each other", () => {
  for (let time = 0; time < 40; time += 0.1) {
    const poses = CITY_NPCS.map(npc => sampleCityNpc(npc, time));
    for (const pose of poses) {
      assert.ok(Math.hypot(pose.position[0] + 7, pose.position[2] - 11.2) > 1.9);
      assert.ok(Math.abs(pose.position[2]) > 8);
    }
    for (let a = 0; a < poses.length; a++) for (let b = a + 1; b < poses.length; b++) {
      assert.ok(Math.hypot(poses[a].position[0] - poses[b].position[0], poses[a].position[2] - poses[b].position[2]) > 0.9);
    }
  }
});
