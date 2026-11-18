import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordMatches, createSession, verifySession, sameOrigin, sessionCookie, LoginLimiter, readJson } from './operations-auth.ts';

test('password comparison rejects incorrect and missing secrets', () => {
  assert.equal(passwordMatches('operator', 'operator'), true);
  assert.equal(passwordMatches('operator-long', 'operator'), false);
  assert.equal(passwordMatches('', ''), false);
});

test('HMAC sessions reject tampering, expiry, future issuance and missing secrets', () => {
  const secret = 'test-session-secret-that-is-at-least-32';
  const token = createSession(secret, 'operator', 1000);
  assert.equal(verifySession(token, secret, 'operator', 1000), true);
  assert.equal(verifySession(token, secret, 'operator', 1000 + 8 * 3600), false);
  assert.equal(verifySession(token, secret, 'operator', 999), false);
  assert.equal(verifySession(token + 'x', secret, 'operator', 1000), false);
  assert.equal(verifySession(token, secret, 'rotated', 1000), false);
  assert.equal(verifySession(token, '', 'operator', 1000), false);
  assert.throws(() => createSession('', 'operator'));
});

test('origin must be present and exactly match request URL origin', () => {
  const request = (origin?: string) => new Request('https://office.test/api/operations/login', { headers: origin ? { origin } : {} });
  assert.equal(sameOrigin(request('https://office.test'), 'https://office.test'), true);
  for (const origin of [undefined, 'null', 'https://evil.test', 'https://office.test/']) assert.equal(sameOrigin(request(origin)), false);
});

test('configured public origin overrides internal proxy URL without trusting forwarded headers', () => {
  const request = new Request('http://localhost:18130/api/operations/login', { headers: { origin: 'https://office.test', 'x-forwarded-host': 'evil.test' } });
  assert.equal(sameOrigin(request, 'https://office.test'), true);
  assert.equal(sameOrigin(request, 'https://office.test/'), false);
  assert.equal(sameOrigin(request, 'not-a-url'), false);
});

test('session cookies are secure and logout clears the exact cookie', () => {
  assert.match(sessionCookie('signed'), /HttpOnly; Secure; SameSite=Strict; Path=\//);
  assert.match(sessionCookie(''), /Max-Age=0/);
});

test('failed-login limiter has a fixed bounded bucket and expires', () => {
  const limiter = new LoginLimiter();
  for (let i = 0; i < 10; i++) { assert.equal(limiter.allowed(100), true); limiter.fail(100); }
  assert.equal(limiter.allowed(101), false);
  assert.equal(limiter.allowed(100 + 900_000), true);
});

test('JSON reader bounds actual bytes even without content-length', async () => {
  assert.deepEqual(await readJson(new Request('https://office.test', { method: 'POST', body: '{"title":"x"}', headers: { 'content-type': 'application/json' } })), { title: 'x' });
  await assert.rejects(readJson(new Request('https://office.test', { method: 'POST', body: ' '.repeat(17000), headers: { 'content-type': 'application/json' } })));
  await assert.rejects(readJson(new Request('https://office.test', { method: 'POST', body: '[]', headers: { 'content-type': 'application/json' } })));
});
