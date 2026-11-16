/* eslint-disable @typescript-eslint/no-require-imports -- Standalone acceptance. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.OFFICE_PLAYWRIGHT||'@playwright/test');
const url=process.env.OFFICE_TEST_URL||'http://127.0.0.1:18140';
const out=process.env.OFFICE_TEST_OUTPUT||'./test-results/map';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const report={url,errors:[],sizes:[]};try{
const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
await page.goto(url+'/?inspectScene=1',{waitUntil:'domcontentloaded'});await page.waitForSelector('canvas[data-map-camera]');
assert.equal(await page.locator('button:visible,aside:visible,nav:visible').count(),0,'no arrow controls or dashboard panels');
assert.doesNotMatch(await page.locator('body').innerText(),/Penghuni|Telemetri|Yesus|Petrus|Yohanes/);
for(const [width,height] of [[1440,900],[1280,800],[390,844]]){await page.setViewportSize({width,height});await page.waitForTimeout(1200);const b=await page.locator('canvas').boundingBox();assert.ok(Math.abs(b.x)<1&&Math.abs(b.y)<1&&Math.abs(b.width-width)<2&&Math.abs(b.height-height)<2);report.sizes.push({width,height,canvas:b});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${out}/map-${width}.png`,timeout:60000});}
await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(1200);
const camera=async()=>JSON.parse(await page.locator('canvas').getAttribute('data-map-camera'));
const before=await camera();await page.mouse.move(640,400);await page.mouse.wheel(0,-160);await page.waitForTimeout(1000);assert.ok((await camera()).zoom>before.zoom);
const dragStart=await camera();await page.mouse.down();await page.mouse.move(780,420,{steps:10});await page.mouse.up();await page.waitForTimeout(1000);assert.notDeepEqual((await camera()).target,dragStart.target);
await page.getByRole('region',{name:'Peta kota 3D'}).focus();await page.keyboard.press('0');await page.waitForTimeout(1000);assert.ok(Math.abs((await camera()).zoom-before.zoom)<0.1);
await page.keyboard.press('Enter');await page.waitForTimeout(200);assert.equal(await page.getByRole('status').innerText(),'Leader');await page.keyboard.press('Escape');assert.equal(await page.getByRole('status').count(),0);
assert.deepEqual(report.errors,[]);report.result='PASS';fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
