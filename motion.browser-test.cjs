/* eslint-disable @typescript-eslint/no-require-imports -- Standalone acceptance runner. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.OFFICE_PLAYWRIGHT||'/home/hermes/apps/runflow/current/apps/web/node_modules/@playwright/test');
const base=process.env.OFFICE_TEST_URL||'http://127.0.0.1:18133';
const out=process.env.OFFICE_TEST_OUTPUT||'/home/hermes/.hermes/workspace/agent-office-deploy/ancient-motion';
fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const report={errors:[],url:base};
try{const context=await browser.newContext({viewport:{width:1000,height:720},recordVideo:{dir:out,size:{width:1000,height:720}}});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'/?inspectScene=1',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('canvas[data-motion-yesus]',{timeout:45000});
const sample=()=>page.evaluate(()=>Object.fromEntries(Array.from(document.querySelector('canvas').attributes).filter(a=>a.name.startsWith('data-motion-')).map(a=>[a.name.slice(12),JSON.parse(a.value)])));
const frames=[];for(let i=0;i<24;i++){frames.push(await sample());await page.waitForTimeout(500)}
report.personas=Object.keys(frames[0]);assert.equal(report.personas.length,13);
report.movingHands=report.personas.filter(id=>new Set(frames.filter(f=>f[id].phase==='coding').map(f=>JSON.stringify([f[id].leftHand,f[id].rightHand]))).size>2);
report.walking=report.personas.filter(id=>new Set(frames.map(f=>f[id].z)).size>2);
assert.ok(report.movingHands.length>=5,'multiple coding hand transforms must change');assert.ok(report.walking.length>=1,'actual root translation must change');
await page.screenshot({path:out+'/desktop.png',timeout:60000});
await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(1000);const stillA=await sample();await page.waitForTimeout(1500);const stillB=await sample();assert.deepEqual(stillA,stillB,'reduced motion must freeze actual transforms');report.reducedMotionFrozen=true;
assert.deepEqual(report.errors,[]);report.result='PASS';fs.writeFileSync(out+'/samples.json',JSON.stringify(frames));fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));const video=page.video();await context.close();await video.saveAs(out+'/motion.webm');console.log(JSON.stringify(report,null,2));}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
