import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as login } from './login/route.ts';
import { POST as logout } from './logout/route.ts';
import { GET, POST as add } from './tasks/route.ts';
import { POST as pause } from './pause/route.ts';
import { POST as decide } from './tasks/[id]/decision/route.ts';
import { createSession, SESSION_COOKIE } from '../../../lib/operations-auth.ts';

const origin = 'https://office.test';
const request = (path: string, body?: unknown, auth = false, withOrigin = true) => new Request(origin + '/api/operations/' + path, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'content-type': 'application/json', ...(withOrigin ? { origin } : {}), ...(auth ? { cookie: `${SESSION_COOKIE}=${createSession(process.env.OFFICE_SESSION_SECRET!, process.env.OFFICE_OPERATOR_PASSWORD!)}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test('routes fail closed, require exact origin, protect reads and issue secure cookie', async () => {
  process.env.OFFICE_PUBLIC_ORIGIN = origin;
  process.env.OFFICE_SESSION_SECRET = 'test-session-secret-at-least-32-characters';
  process.env.OFFICE_OPERATOR_PASSWORD = 'test-operator';
  process.env.OFFICE_OPS_TOKEN = 'test-worker';
  assert.equal((await GET(request('tasks'))).status, 401);
  assert.equal((await login(request('login', { password: 'test-operator' }, false, false))).status, 403);
  assert.equal((await login(request('login', { password: 'wrong' }))).status, 401);
  const response = await login(request('login', { password: 'test-operator' }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=Strict/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await logout(request('logout', {}, true, false))).status, 403);
  assert.match((await logout(request('logout', {}, true))).headers.get('set-cookie')!, /Max-Age=0/);
  assert.equal((await add(request('tasks', { title: 'x', source: 'remote', description: 'y' }, true))).status, 405);
  assert.equal((await add(request('tasks', { title: 'x', source: 'manual', description: 'y', source_url: 'javascript:alert(1)' }, true))).status, 405);
  assert.equal((await pause(request('pause', { paused: 'yes' }, true))).status, 400);
  assert.equal((await decide(request('tasks/x/decision', { decision: 'approve', report_hash: 'bad' }, true), { params: Promise.resolve({ id: 'x' }) })).status, 400);
  delete process.env.OFFICE_OPERATOR_PASSWORD;
  assert.equal((await GET(request('tasks'))).status, 503);
});
