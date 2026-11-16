import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('office has exactly Jesus plus twelve named disciples', async () => {
  assert.ok(existsSync(new URL('./personas.ts', import.meta.url)), 'persona roster must exist');
  const { PERSONAS } = await import('./personas.ts');
  assert.equal(PERSONAS.length, 13);
  assert.equal(new Set(PERSONAS.map((p: { id: string }) => p.id)).size, 13);
  assert.deepEqual(PERSONAS.map((p: { id: string }) => p.id), ['yesus','petrus','andreas','yakobus-zebedeus','yohanes','filipus','bartolomeus','tomas','matius','yakobus-alfeus','tadeus','simon','matias']);
});

test('office UI excludes project catalog and renders the persona roster', () => {
  const ui = readFileSync(new URL('../components/office/office.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /import.*Projects|<Projects|Project catalog|Search projects/);
  assert.match(ui, /Penghuni office/);
  assert.match(ui, /data-persona-id/);
});

test('scene renders personas rather than robots', () => {
  const scene = readFileSync(new URL('../components/office/scene.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(scene, /import.*Robot|<Robot/);
  assert.match(scene, /PERSONAS/);
});
