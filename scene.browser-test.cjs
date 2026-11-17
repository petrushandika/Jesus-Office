/* eslint-disable @typescript-eslint/no-require-imports -- Standalone WebGL acceptance. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.OFFICE_PLAYWRIGHT || '@playwright/test');
const url = process.env.OFFICE_TEST_URL || 'http://127.0.0.1:18145';
const out = process.env.OFFICE_TEST_OUTPUT || './test-results/scene';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url + '/?inspectScene=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas[data-map-camera]');
    const camera = () => page.locator('canvas').getAttribute('data-map-camera').then(JSON.parse);
    const region = page.getByRole('region', { name: 'Peta kota 3D' });
    for (const [width, height] of [[1440, 900], [1280, 800], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(700);
      const c = await camera();
      assert.equal(c.cameraType, 'PerspectiveCamera', 'real perspective projection');
      assert.ok(Math.abs(c.zoom - 1) < 0.01, 'resize preserves logical zoom');
      assert.ok(c.position.every(Number.isFinite));
      const bounds = await page.locator('canvas').boundingBox();
      assert.ok(Math.abs(bounds.width - width) < 2 && Math.abs(bounds.height - height) < 2);
      await page.screenshot({ path: `${out}/wide-${width}.png` });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(700);
    const materials = JSON.parse(await page.locator('canvas').getAttribute('data-map-materials') || '{}');
    assert.equal(materials.proceduralTextures, 1, 'one shared original stone relief texture');
    assert.equal(materials.rooms, 7, 'seven open-roof work rooms');
    assert.ok(materials.wallHeight >= 1.8, 'walls have readable architectural height');
    const initial = await camera();
    await page.mouse.move(640, 400);
    await page.mouse.down(); await page.mouse.move(740, 430, { steps: 8 }); await page.mouse.up();
    assert.notDeepEqual((await camera()).target, initial.target, 'left drag pans');
    await region.focus(); await page.keyboard.press('0'); await page.waitForTimeout(300);
    const reset = await camera();
    await page.mouse.move(640, 400); await page.mouse.down({ button: 'right' });
    await page.mouse.move(850, 440, { steps: 8 }); await page.mouse.up({ button: 'right' });
    const orbited = await camera();
    assert.notDeepEqual(orbited.position, reset.position, 'right drag orbits');
    assert.ok(Math.abs(orbited.target[0] - reset.target[0]) < 0.01, 'orbit keeps target');
    await page.mouse.wheel(0, -250); await page.waitForTimeout(300);
    assert.ok((await camera()).zoom > orbited.zoom, 'wheel dollies closer');
    await region.focus();
    for (let i = 0; i < 7; i++) await page.keyboard.press('+');
    await page.waitForTimeout(300);
    assert.ok((await camera()).zoom > 3, 'keyboard supports room close-up');
    await page.screenshot({ path: `${out}/close-up.png` });
    const close = await camera(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
    assert.notDeepEqual((await camera()).target, close.target, 'keyboard pans');
    await page.keyboard.press('0'); await page.waitForTimeout(300);
    const final = await camera();
    assert.ok(Math.abs(final.zoom - 1) < 0.01);
    assert.deepEqual(final.target, [0, 0, 0]);
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/result.json`, JSON.stringify({ result: 'PASS', initial, orbited, close, final, errors }, null, 2));
    console.log('PASS perspective, responsive zoom, left pan, right orbit, wheel/keyboard close-up, pan/reset; no page errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
