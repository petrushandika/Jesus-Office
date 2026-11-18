import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as login } from './login/route.ts';
import { POST as logout } from './logout/route.ts';
import { GET, POST as add } from './tasks/route.ts';
import { POST as pause } from './pause/route.ts';
import { POST as decide } from './tasks/[id]/decision/route.ts';
import { createSession, operatorSessionKey, SESSION_COOKIE } from '../../../lib/operations-auth.ts';
import { guard } from './shared.ts';

const origin = 'https://office.test';
const request = (path: string, body?: unknown, auth = false, withOrigin = true) => new Request(origin + '/api/operations/' + path, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'content-type': 'application/json', ...(withOrigin ? { origin } : {}), ...(auth ? { cookie: `${SESSION_COOKIE}=${createSession(process.env.OFFICE_SESSION_SECRET!, operatorSessionKey(process.env.OFFICE_OPERATOR_EMAIL!, process.env.OFFICE_OPERATOR_PASSWORD!))}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test('routes fail closed, require exact origin, protect reads and issue secure cookie', async () => {
  process.env.OFFICE_PUBLIC_ORIGIN = origin;
  process.env.OFFICE_SESSION_SECRET = 'test-session-secret-at-least-32-characters';
  process.env.OFFICE_OPERATOR_PASSWORD = 'test-operator';
  delete process.env.OFFICE_OPERATOR_EMAIL;
  assert.equal((await login(request('login', { password: 'test-operator' }))).status, 503);
  assert.equal((await GET(request('tasks'))).status, 503);
  process.env.OFFICE_OPERATOR_EMAIL = 'operator@example.test';
  const missingEmail = await login(request('login', { password: 'test-operator' }));
  assert.equal(missingEmail.status, 401);
  const wrongEmail = await login(request('login', { email: 'other@example.test', password: 'test-operator' }));
  assert.equal(wrongEmail.status, 401);
  assert.deepEqual(await missingEmail.json(), await wrongEmail.json());
  assert.equal(wrongEmail.headers.get('set-cookie'), null);
  process.env.OFFICE_OPS_TOKEN = 'test-worker';
  assert.equal((await GET(request('tasks'))).status, 401);
  assert.equal((await login(request('login', { password: 'test-operator' }, false, false))).status, 403);
  assert.equal((await login(request('login', { password: 'wrong' }))).status, 401);
  const response = await login(request('login', { email: 'operator@example.test', password: 'test-operator' }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=Strict/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const signedRequest = () => new Request(origin + '/api/operations/tasks', { headers: { cookie: response.headers.get('set-cookie')!.split(';')[0] } });
  assert.equal(guard(signedRequest()), null);
  process.env.OFFICE_OPERATOR_EMAIL = 'changed@example.test';
  assert.equal(guard(signedRequest())?.status, 401);
  process.env.OFFICE_OPERATOR_EMAIL = 'operator@example.test';
  const legacy = createSession(process.env.OFFICE_SESSION_SECRET!, process.env.OFFICE_OPERATOR_PASSWORD!);
  assert.equal(guard(new Request(origin, { headers: { cookie: `${SESSION_COOKIE}=${legacy}` } }))?.status, 401);
  process.env.OFFICE_OPERATOR_EMAIL = ' OPERATOR@Example.Test ';
  assert.equal((await login(request('login', { email: ' Operator@EXAMPLE.test ', password: 'test-operator' }))).status, 200);
  assert.equal(guard(signedRequest()), null);
  for (const email of ['not-email', 42, 'x'.repeat(5000)]) {
    assert.equal((await login(request('login', { email, password: 'test-operator' }))).status, 401);
  }
  const malformed = (body: string) => new Request(origin + '/api/operations/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body });
  assert.equal((await login(malformed('{'))).status, 400);
  assert.equal((await login(malformed(' '.repeat(17000)))).status, 400);
  assert.equal((await logout(request('logout', {}, true, false))).status, 403);
  assert.match((await logout(request('logout', {}, true))).headers.get('set-cookie')!, /Max-Age=0/);
  assert.equal((await add(request('tasks', { title: 'x', source: 'remote', description: 'y' }, true))).status, 405);
  assert.equal((await add(request('tasks', { title: 'x', source: 'manual', description: 'y', source_url: 'javascript:alert(1)' }, true))).status, 405);
  assert.equal((await pause(request('pause', { paused: 'yes' }, true))).status, 400);
  assert.equal((await decide(request('tasks/x/decision', { decision: 'approve', report_hash: 'bad' }, true), { params: Promise.resolve({ id: 'x' }) })).status, 400);
  process.env.OFFICE_OPERATOR_EMAIL = 'invalid';
  assert.equal((await login(request('login', { email: 'invalid', password: 'test-operator' }))).status, 503);
  assert.equal((await GET(request('tasks'))).status, 503);
  process.env.OFFICE_OPERATOR_EMAIL = 'operator@example.test';
  assert.equal((await login(request('login', { email: 'operator@example.test', password: 'test-operator' }, false, false))).status, 403);
  // Ten failed requests exhaust the shared bucket; successful requests never reset it.
  for (let attempt = 0; attempt < 10; attempt++) {
    const status = (await login(request('login', { email: 'operator@example.test', password: 'wrong' }))).status;
    assert.ok(status === 401 || status === 429);
    if (status === 429) break;
  }
  assert.equal((await login(request('login', { email: 'operator@example.test', password: 'test-operator' }))).status, 429);
  delete process.env.OFFICE_OPERATOR_PASSWORD;
  assert.equal((await GET(request('tasks'))).status, 503);
});
