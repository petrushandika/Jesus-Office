import test from "node:test";
import assert from "node:assert/strict";
import { poseAt } from "./choreography.ts";

test("24-second cycle changes phase at the exact station boundaries", () => {
  for (const [time, phase] of [[0, "approach"], [3, "sit"], [4, "coding"], [18, "stand"], [19, "return"], [22, "idle"], [24, "approach"]] as const) {
    assert.equal(poseAt(time).phase, phase);
  }
  assert.equal(poseAt(0).travel, -1.4);
  assert.equal(poseAt(3).travel, 0);
  assert.equal(poseAt(4).sit, 1);
  assert.equal(poseAt(19).sit, 0);
  assert.equal(poseAt(22).travel, -1.4);
});

test("gait alternates lifted feet and swings arms while typing articulates both hands", () => {
  const walking = Array.from({ length: 120 }, (_, i) => poseAt(i / 40));
  assert.ok(Math.max(...walking.map(p => p.leftFoot)) > 0.09);
  assert.ok(Math.max(...walking.map(p => p.rightFoot)) > 0.09);
  assert.ok(walking.every(p => p.leftFoot === 0 || p.rightFoot === 0));
  assert.ok(walking.some(p => Math.abs(p.leftArm) > 0.15));
  const typing = Array.from({ length: 120 }, (_, i) => poseAt(7 + i / 60));
  for (const hand of ["leftHand", "rightHand"] as const) {
    assert.ok(Math.max(...typing.map(p => p[hand])) - Math.min(...typing.map(p => p[hand])) > 0.06);
  }
});

test("numeric transforms are finite, periodic, offsettable and continuous through every join", () => {
  for (let i = -240; i < 480; i++) {
    const a = poseAt(i / 10, 5);
    const b = poseAt(i / 10 + 24, 5);
    assert.equal(a.phase, b.phase);
    for (const key of Object.keys(a).filter(k => k !== "phase") as Exclude<keyof typeof a, "phase">[]) {
      assert.ok(Number.isFinite(a[key]));
      assert.ok(Math.abs(a[key] - b[key]) < 1e-10);
      assert.ok(Math.abs(a[key] - poseAt(i / 10 + 5)[key]) < 1e-10);
    }
  }
  for (const boundary of [0, 3, 4, 18, 19, 22, 24]) {
    const a = poseAt(boundary - 0.00001), b = poseAt(boundary + 0.00001);
    for (const key of Object.keys(a).filter(k => k !== "phase") as Exclude<keyof typeof a, "phase">[]) {
      assert.ok(Math.abs(a[key] - b[key]) < 0.001, `${boundary}: ${key}`);
    }
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.ok(Object.values(poseAt(value, value)).every(v => typeof v === "string" || Number.isFinite(v)));
  }
});
