/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser acceptance runner. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.OFFICE_PLAYWRIGHT || '@playwright/test');
const url=process.env.OFFICE_TEST_URL || 'http://127.0.0.1:18131';
const out=process.env.OFFICE_TEST_OUTPUT || './test-results/ui';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const report={url,errors:[],failed:[]};
 try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('requestfailed',r=>report.failed.push(r.url()));
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});assert.equal(response.status(),200);
 await page.waitForSelector('[data-persona-id]');
 assert.equal(await page.title(),'Jesus-Office');
 assert.equal(await page.locator('h1').innerText(),'Jesus-Office');
 const roster=page.locator('button[data-persona-id]');
 assert.equal(await roster.count(),13);
 report.names=await roster.allTextContents();
 assert.equal(await page.locator('[data-persona-id="yesus"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[aria-label="Project catalog"],#project-search').count(),0);
 assert.doesNotMatch(await page.locator('body').innerText(),/Search projects|Project catalog/);
 await page.waitForSelector('canvas');await page.waitForTimeout(2500);
 report.canvas=await page.evaluate(()=>{const c=document.querySelector('canvas');return{width:c.width,height:c.height,webgl:!!(c.getContext('webgl2')||c.getContext('webgl'))}});
 assert.ok(report.canvas.webgl);
 await page.locator('[data-persona-id="matias"]').click();
 assert.equal(await page.locator('[data-persona-id="matias"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-persona-id="yesus"]').click();
 await page.screenshot({path:out+'/desktop.png',timeout:60000});
 report.api=await page.evaluate(async()=>{const r=await fetch('/api/agents');const j=await r.json();return{status:r.status,available:j.available,agents:j.agents.length}});
 assert.equal(report.api.status,200);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1200);
 report.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(report.mobileOverflow,false);
 await page.screenshot({path:out+'/mobile.png',timeout:60000});
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(1000);
 report.reducedMotion=await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);assert.ok(report.reducedMotion);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);
 report.result='PASS';fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
