/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser acceptance. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.OFFICE_PLAYWRIGHT || '@playwright/test');
const url = process.env.OFFICE_TEST_URL || 'http://127.0.0.1:18137';
const out = process.env.OFFICE_TEST_OUTPUT || './test-results/map';
fs.mkdirSync(out, {recursive:true});
(async () => {
 const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const report = {url,errors:[],sizes:[]};
 try {
  const page = await browser.newPage({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1280,height:800}}});
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(url+'/?inspectScene=1',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('canvas');
  const bounds = async () => page.locator('canvas').boundingBox();
  for (const [width,height] of [[1440,900],[1280,800],[390,844]]) {
   await page.setViewportSize({width,height}); await page.waitForTimeout(1200);
   const b = await bounds(); report.sizes.push({width,height,canvas:b});
   assert.ok(Math.abs(b.x)<1 && Math.abs(b.y)<1 && Math.abs(b.width-width)<2 && Math.abs(b.height-height)<2,'canvas must fill entire viewport');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`${out}/map-${width}.png`,timeout:60000});
  }
  await page.setViewportSize({width:1440,height:900}); await page.waitForTimeout(1200);
  const camera = async () => JSON.parse(await page.locator('canvas').getAttribute('data-map-camera'));
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.mapCamera);
  const before = await camera();
  await page.getByRole('button',{name:'Perbesar peta',exact:true}).click(); await page.waitForTimeout(900);
  const zoomed = await camera(); assert.ok(zoomed.zoom>before.zoom,'zoom control changes real camera');
  await page.getByRole('button',{name:'Geser timur',exact:true}).click(); await page.waitForTimeout(900);
  const moved = await camera(); assert.notDeepEqual(moved.target,zoomed.target,'pan control changes real target');
  await page.getByRole('button',{name:'Reset peta',exact:true}).click(); await page.waitForTimeout(900);
  const reset = await camera(); assert.ok(Math.abs(reset.zoom-before.zoom)<0.1,'reset restores camera zoom');
  await page.mouse.move(650,460); await page.mouse.wheel(0,-160); await page.waitForTimeout(800);
  assert.ok((await camera()).zoom>reset.zoom,'mouse wheel zooms map');
  const dragStart=await camera();
  await page.mouse.move(650,460);await page.mouse.down();await page.mouse.move(800,490,{steps:10});await page.mouse.up();await page.waitForTimeout(800);
  assert.notDeepEqual((await camera()).target,dragStart.target,'left drag pans map');
  await page.getByRole('button',{name:'Reset peta',exact:true}).click();await page.waitForTimeout(800);
  await page.getByRole('button',{name:'Penghuni',exact:true}).click();
  assert.ok(await page.getByRole('complementary',{name:'Panel penghuni'}).isVisible());
  const opened = await bounds(); assert.ok(Math.abs(opened.width-1440)<2,'panel overlays rather than shrinks map');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('complementary',{name:'Panel penghuni'}).count(),0);
  await page.getByRole('button',{name:'Telemetri',exact:true}).click();
  assert.ok(await page.getByRole('complementary',{name:'Panel telemetri'}).isVisible());
  await page.getByRole('button',{name:'Tutup panel',exact:true}).click();
  report.camera={before,zoomed,moved,reset};
  await page.screenshot({path:out+'/desktop.png',timeout:60000});
  assert.deepEqual(report.errors,[]);
  report.result='PASS';fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  await page.close();
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
