import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
test('private server page gates the dashboard and never fetches private data for login', () => {
  const page = source('./page.tsx');
  assert.match(page, /await cookies\(\)/);
  assert.match(page, /verifySession/);
  assert.match(page, /authenticated=\{authenticated\}/);
  assert.doesNotMatch(page, /fetch\(/);
});
test('session check runs at request time, not during prerender (Date.now in verifySession)', () => {
  const page = source('./page.tsx');
  assert.match(page, /await connection\(\)[\s\S]*verifySession/);
  assert.match(page, /<Suspense/);
});
test('client has explicit confirmation, exact report hash, plain-text reports and bounded polling', () => {
  const ui = source('./operations-panel.tsx');
  assert.match(ui, /window\.confirm/);
  assert.match(ui, /report_hash: task.report_hash/);
  assert.match(ui, /10_000/);
  assert.match(ui, /Read-only investigation/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML|localStorage|OFFICE_OPERATOR_PASSWORD|OFFICE_OPS_TOKEN|OFFICE_SESSION_SECRET/);
});
