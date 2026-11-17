/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.OFFICE_PLAYWRIGHT || '@playwright/test');
const url = process.env.OFFICE_TEST_URL || 'http://127.0.0.1:18148';
const out = process.env.OFFICE_TEST_OUTPUT || './test-results/city';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(60000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url + '/?inspectScene=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas[data-map-camera]');
    const camera = () => page.locator('canvas').getAttribute('data-map-camera').then(JSON.parse);
    const architecture = JSON.parse(await page.locator('canvas').getAttribute('data-map-architecture') || '[]');
    assert.ok(new Set(architecture.map(b => b.kind)).size >= 8, 'at least eight distinct 3D building types');
    for (const building of architecture) {
      assert.ok(building.size.every(n => n > 1), `${building.kind} has world-space volume`);
      assert.ok(building.volumetric >= 3 && building.flat === 0, `${building.kind} uses volumetric meshes, not planes`);
    }
    await page.screenshot({ path: `${out}/city-desktop.png`, timeout: 60000 });
    const region = page.getByRole('region', { name: 'Peta kota 3D' });
    await region.focus();
    for (let i = 0; i < 16; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(30); }
    const beyondX = await camera();
    assert.ok(Math.abs(beyondX.target[0]) > 70, 'navigation crosses old X boundary and town edge');
    for (let i = 0; i < 14; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(30); }
    const beyondZ = await camera();
    assert.ok(Math.abs(beyondZ.target[2]) > 70, 'navigation crosses old Z boundary and town edge');
    await page.keyboard.press('0');
    for (let i = 0; i < 6; i++) { await page.keyboard.press('-'); await page.waitForTimeout(30); }
    const distant = await camera();
    assert.ok(58 / distant.zoom > 200, 'zoom-out no longer capped at 44 units');
    await page.keyboard.press('0');
    await page.mouse.move(720, 450); await page.mouse.down({ button: 'left' });
    await page.mouse.move(1120, 480, { steps: 16 }); await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(400);
    const reverse = await camera();
    assert.ok(reverse.position[2] > 0, 'orbit reaches rear side of actual 3D city');
    await page.screenshot({ path: `${out}/city-reverse.png`, timeout: 60000 });
    await page.keyboard.press('0');
    await page.keyboard.press('+'); await page.keyboard.press('+');
    await page.screenshot({ path: `${out}/city-close.png`, timeout: 60000 });
    const environment = JSON.parse(await page.locator('canvas').getAttribute('data-map-environment'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('0'); await page.waitForTimeout(500);
    assert.equal((await page.locator('body').innerText()).trim(), '');
    const bounds = await page.locator('canvas').boundingBox();
    assert.equal(bounds.width, 390); assert.equal(bounds.height, 844);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth && document.documentElement.scrollHeight === innerHeight));
    await page.screenshot({ path: `${out}/city-mobile.png`, timeout: 60000 });
    // Real touch events, not calling controls directly.
    const cdp = await page.context().newCDPSession(page);
    const beforeTouch = await camera();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 440, id: 1 }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180 + i * 15, y: 440 - i * 10, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual((await camera()).target, beforeTouch.target, 'one finger orbits in place');
    assert.notDeepEqual((await camera()).position, beforeTouch.position, 'one finger changes camera angle');
    const beforePinch = await camera();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 400, id: 1 }, { x: 230, y: 440, id: 2 }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 - i * 10, y: 400 - i * 4, id: 1 }, { x: 230 + i * 10, y: 440 + i * 4, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await camera()).zoom > beforePinch.zoom, 'two finger pinch zooms');
    assert.deepEqual(errors, []);
    const result = { result: 'PASS', url, architecture, beyondX, beyondZ, distant, reverse, environment, errors, touch: 'orbit + pinch PASS' };
    fs.writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
