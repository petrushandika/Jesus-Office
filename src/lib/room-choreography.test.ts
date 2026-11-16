import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, routeBetween, sampleRoute, roomPoseAt, visitorSlot, WALK_SPEED } from './room-choreography.ts';

test('connected room routes have exact endpoints and continuous world translation', () => {
  for (const from of ROOMS) for (const to of ROOMS) {
    if (from.id === to.id) continue;
    const route = routeBetween(from.id, to.id);
    assert.deepEqual(route[0], from.home);
    assert.deepEqual(route.at(-1), visitorSlot(from.id, to.id));
    assert.ok(route.length >= 6);
    const start = sampleRoute(route, 0);
    const end = sampleRoute(route, Infinity);
    assert.deepEqual(start.position, from.home);
    assert.deepEqual(end.position, visitorSlot(from.id, to.id));
    let previous = start.position;
    for (let distance = 0.05; distance <= end.length; distance += 0.05) {
      const next = sampleRoute(route, distance).position;
      assert.ok(Math.hypot(next[0] - previous[0], next[2] - previous[2]) <= 0.050001);
      previous = next;
      // Furniture is behind each home position, never on the front-side paths.
      for (const room of ROOMS) {
        const dx = next[0] - room.table[0], dz = next[2] - room.table[2];
        assert.ok(Math.abs(dx) > 0.65 || Math.abs(dz) > 0.36, 'route avoids table footprint');
        const x = Math.abs(next[0] - room.center[0]);
        const z = next[2] - room.center[2], side = Math.sign(room.center[2]);
        assert.ok(!(Math.abs(x - 2.8) < 0.4 && Math.abs(z) < 2.7), 'body clears side walls');
        assert.ok(!(x < 3 && Math.abs(z - side * 2.5) < 0.4), 'body clears rear wall');
        assert.ok(!(x > 0.55 && x < 3 && Math.abs(z + side * 2.5) < 0.4), 'body uses doorway gap');
      }
    }
  }
});

test('engineering visitors have distinct slots and every doorway has body clearance', () => {
  const slots = ['yesus', 'petrus', 'yakobus-zebedeus'].map(id => visitorSlot(id, 'yohanes'));
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    assert.ok(Math.hypot(slots[i][0]-slots[j][0], slots[i][2]-slots[j][2]) >= 0.89);
  }
  for (const from of ROOMS) for (const to of ROOMS) {
    const route = routeBetween(from.id, to.id);
    assert.equal(route[1][0], from.center[0]);
    assert.equal(route[4][0], to.center[0]);
    assert.ok(Math.abs(visitorSlot(from.id, to.id)[0]-to.center[0]) < 2.3);
  }
});

test('all seven travel between real rooms at bounded walking speed without cycle jumps', () => {
  for (const room of ROOMS) {
    const visited = new Set<string>();
    let previous = roomPoseAt(0, room.id);
    for (let t = 0.05; t < 240; t += 0.05) {
      const pose = roomPoseAt(t, room.id);
      assert.ok([...pose.position, pose.heading, pose.sit, pose.leftFoot, pose.rightFoot].every(Number.isFinite));
      assert.ok(Math.hypot(pose.position[0]-previous.position[0], pose.position[2]-previous.position[2]) <= WALK_SPEED * 0.050001);
      if (pose.phase === 'visit') visited.add(pose.room);
      previous = pose;
    }
    assert.ok(visited.size >= 1);
    assert.ok(!visited.has(room.id));
    for (const invalid of [NaN, Infinity, -Infinity]) assert.ok(roomPoseAt(invalid, room.id).position.every(Number.isFinite));
  }
});
