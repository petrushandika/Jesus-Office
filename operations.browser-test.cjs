/* eslint-disable @typescript-eslint/no-require-imports -- Candidate acceptance against the REAL operations service. */
const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require(process.env.OFFICE_PLAYWRIGHT || '@playwright/test');
const url = process.env.OFFICE_TEST_URL, password = process.env.OFFICE_OPERATOR_PASSWORD, out = process.env.OFFICE_TEST_OUTPUT;
fs.mkdirSync(out, { recursive: true });
(async () => {
  const report = { url, source: 'real ops service + real connectors; no fixtures' };
  // 1. Private API is closed without a session, and CSRF is enforced.
  assert.equal((await fetch(url + '/api/operations/tasks')).status, 401);
  assert.equal((await fetch(url + '/api/operations/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ password }) })).status, 403);
  assert.equal((await fetch(url + '/api/operations/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify({ password: 'wrong-password' }) })).status, 401);
  const publicSnapshot = await (await fetch(url + '/api/agents')).text();
  report.publicSnapshotBytes = publicSnapshot.length;
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url + '/operations');
    assert.equal(await page.locator('text=Tasks').count(), 0, 'no private data before login');
    // Secure cookie needs HTTPS; on the HTTP candidate, log in via API and inject the cookie for the same host.
    const login = await fetch(url + '/api/operations/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
    // __Host- cookies cannot be injected for plain-HTTP 127.0.0.1; send the real session cookie as a header instead.
    await ctx.setExtraHTTPHeaders({ Cookie: cookie.split(';')[0] });
    await page.goto(url + '/operations');
    await page.waitForSelector('#task-list-title', { timeout: 20000 });
    await page.waitForFunction(() => /Tasks \(\d+\)/.test(document.querySelector('#task-list-title')?.textContent || ''), null, { timeout: 20000 });
    report.taskHeading = await page.locator('#task-list-title').innerText();
    report.style = await page.evaluate(() => { const m = getComputedStyle(document.querySelector('main')); const b = getComputedStyle(document.querySelector('button')); return { background: m.backgroundColor, color: m.color, overflowY: m.overflowY, button: b.backgroundColor }; });
    assert.equal(report.style.background, 'rgb(11, 18, 32)', 'dashboard stylesheet applied');
    assert.equal(report.style.overflowY, 'auto', 'dashboard scrolls despite fullscreen city body');
    report.connectors = await page.locator('section:has(h2:text("Connectors")) .ops-list li').allInnerTexts();
    await page.screenshot({ path: out + '/operations.png', fullPage: false });
    assert.deepEqual(errors, []);
    report.result = 'PASS';
  } finally { await browser.close(); }
  for (const secret of [password]) assert.ok(!publicSnapshot.includes(secret));
  fs.writeFileSync(out + '/result.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
