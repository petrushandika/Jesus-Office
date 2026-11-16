import test from 'node:test';
import assert from 'node:assert/strict';
import { PERSONAS } from './personas.ts';

test('seven visual personas have the documented roles, not inferred live assignments', () => {
  assert.deepEqual(PERSONAS.map(({ id, role }) => [id, role]), [
    ['yesus', 'Leader'], ['petrus', 'Software Architect'], ['yohanes', 'Senior Engineer'],
    ['yakobus-zebedeus', 'QA & Security'], ['andreas', 'Research Engineer'],
    ['filipus', 'Product Planner'], ['matius', 'Technical Writer'],
  ]);
  assert.equal(new Set(PERSONAS.map(p => p.id)).size, 7);
});
