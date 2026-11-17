import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const scene = () => readFileSync(new URL('../components/office/scene.tsx', import.meta.url), 'utf8');
test('camera has no old ground-target or zoom-out clamp', () => {
  const source = scene();
  assert.doesNotMatch(source, /Math\.max\(-22|Math\.max\(-16|Math\.min\(44|maxDistance=\{44\}/);
  assert.match(source, /maxDistance=\{Infinity\}/);
});
test('distant terrain fades before its finite edge instead of showing a slab horizon', () => {
  assert.ok(scene().includes('scene.fog = new Fog'), 'adaptive horizon fog missing');
});
