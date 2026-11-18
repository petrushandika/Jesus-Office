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
  assert.match(ui, /read-only/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML|localStorage|OFFICE_OPERATOR_PASSWORD|OFFICE_OPS_TOKEN|OFFICE_SESSION_SECRET/);
});
test('decisions are visible outside technical details with an explicit read-only scope', () => {
  const ui = source('./operations-panel.tsx');
  assert.match(ui, /<\/details>}[\s\S]*decide\(task, 'approve'\)/);
  assert.match(ui, />Accept<\/button>/);
  assert.match(ui, /Accept runs a read-only investigation/);
  assert.match(ui, /ops-priority/);
  assert.match(ui, /Source:/);
  assert.doesNotMatch(ui, /Review and approve|Execution boundary|Reloading never approves|ops-list/);
  const server = readFileSync(new URL('../../../operations/server.py', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /Intake otomatis|MENUNGGU|Belum aktif/, 'capabilities are written in the UI language');
});

test('operations omits System details while keeping intake and approval controls', () => {
  const ui = source('./operations-panel.tsx');
  assert.doesNotMatch(ui, /system-title|ops-connectors|ops-capabilities|What the agents can do|Where reports come from/);
  assert.match(ui, /Pause intake/);
  assert.match(ui, />Accept<\/button>/);
});

test('automatic intake has no manual task form', () => {
  const ui = source('./operations-panel.tsx');
  assert.doesNotMatch(ui, /addTask|task-description|Queue for analysis|Ask for an investigation/);
});
