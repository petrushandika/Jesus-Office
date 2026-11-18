/* eslint-disable @typescript-eslint/no-require-imports -- Proves a REAL ops worker run moves a 3D character. */
const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require(process.env.OFFICE_PLAYWRIGHT || '@playwright/test');
const url = process.env.OFFICE_TEST_URL, password = process.env.OFFICE_OPERATOR_PASSWORD, out = process.env.OFFICE_TEST_OUTPUT;
fs.mkdirSync(out, { recursive: true });
(async () => {
  const report = { url, source: 'real manual task through real ops worker and 9Router; no fixtures, no route fulfillment' };
  const login = await fetch(url + '/api/operations/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify({ password }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: out, size: { width: 1280, height: 800 } } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const opsIds = new Set();
    page.on('response', async r => { if (new URL(r.url()).pathname === '/api/agents' && r.ok()) for (const a of (await r.json()).agents) if (a.id.startsWith('ops-') && a.status === 'running') opsIds.add(a.id); });
    await page.goto(url + '/?inspectScene=1'); await page.waitForSelector('canvas[data-motion-yesus]');
    const sample = () => page.evaluate(() => Object.fromEntries([...document.querySelector('canvas').attributes].filter(a => a.name.startsWith('data-motion-')).map(a => [a.name.slice(12), JSON.parse(a.value)])));
    const before = await sample();
    report.activeBefore = Object.values(before).filter(p => p.active).length;
    // Queue one real read-only audit through the private API (same path the dashboard uses).
    const created = await fetch(url + '/api/operations/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url, Cookie: cookie },
      body: JSON.stringify({ source: 'manual', title: 'Audit CI astronacci-intl/compro-nextjs', description: 'Cek kenapa run terbaru astronacci-intl/compro-nextjs gagal. Read-only, cukup laporan.' }) });
    assert.equal(created.status, 200); report.taskId = (await created.json()).id;
    const frames = [];
    for (let i = 0; i < 150; i++) { frames.push(await sample()); await page.waitForTimeout(500); }
    fs.writeFileSync(out + '/frames.json', JSON.stringify(frames));
    const movement = Object.fromEntries(Object.keys(frames[0]).map(id => { const f = frames.map(x => x[id]);
      return [id, { agentIds: [...new Set(f.map(x => x.agentId).filter(Boolean))], active: f.some(x => x.active), phases: [...new Set(f.map(x => x.phase))],
        distance: Math.max(...f.map(x => Math.hypot(x.world[0] - f[0].world[0], x.world[2] - f[0].world[2]))) }]; }));
    report.movement = movement; report.observedOpsRuns = [...opsIds];
    const moved = Object.values(movement).filter(m => m.active && m.agentIds.some(id => id.startsWith('ops-')) && m.distance > 1);
    assert.ok(opsIds.size > 0, 'real ops worker run observed in public snapshot');
    assert.ok(moved.length > 0, 'a character bound to a real ops run physically moved');
    for (const f of frames) for (const p of Object.values(f)) if (p.active) assert.ok(p.agentId && (opsIds.has(p.agentId) || !p.agentId.startsWith('ops-')), 'active character bound to an observed run');
    assert.equal((await page.locator('main').innerText()).trim(), '', 'city stays textless');
    await page.screenshot({ path: out + '/city.png' });
    assert.deepEqual(errors, []);
    report.result = 'PASS';
    const video = page.video(); await ctx.close(); await video.saveAs(out + '/ops-motion.webm');
  } finally { await browser.close(); }
  fs.writeFileSync(out + '/result.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, movement: Object.fromEntries(Object.entries(report.movement).filter(([, m]) => m.active)) }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
