import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
test('dashboard navigation has native modal drawer and explicit active page', () => {
 const shell = read('./dashboard-shell.tsx');
 assert.match(shell, /<aside/);
 assert.match(shell, /<dialog/);
 assert.match(shell, /showModal\(\)/);
 assert.match(shell, /aria-current/);
 assert.match(shell, /aria-label="Close navigation"/);
});
test('login requires labelled email and password and posts both', () => {
 const ui = read('./operations-panel.tsx');
 assert.match(ui, /type="email"/);
 assert.match(ui, /autoComplete="username"/);
 assert.match(ui, /request\('login', \{ email, password \}\)/);
 assert.match(ui, /DashboardShell/);
 assert.match(ui, /type="search"/);
 assert.doesNotMatch(ui, /system-title|ops-connectors/);
});
