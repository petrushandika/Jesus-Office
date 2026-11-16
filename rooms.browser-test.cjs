/* eslint-disable @typescript-eslint/no-require-imports -- Standalone acceptance. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.OFFICE_PLAYWRIGHT||'@playwright/test');
const url=process.env.OFFICE_TEST_URL||'http://127.0.0.1:18140',out=process.env.OFFICE_TEST_OUTPUT||'./test-results/rooms';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const report={url,errors:[]};try{
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:out,size:{width:1280,height:800}}});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(url+'/?inspectScene=1');await page.waitForSelector('canvas[data-motion-yesus]');
const sample=()=>page.evaluate(()=>Object.fromEntries([...document.querySelector('canvas').attributes].filter(a=>a.name.startsWith('data-motion-')).map(a=>[a.name.slice(12),JSON.parse(a.value)])));
assert.equal(Object.keys(await sample()).length,7,'seven role-based characters, no filler roster');
const frames=[];for(let i=0;i<90;i++){frames.push(await sample());await page.waitForTimeout(500);}
fs.writeFileSync(out+'/samples.json',JSON.stringify(frames));const ids=Object.keys(frames[0]);assert.equal(ids.length,7);
report.movement=Object.fromEntries(ids.map(id=>{const positions=frames.map(f=>f[id].world);assert.ok(positions.every(p=>p?.length===3),'actual world positions required');return[id,{distance:Math.max(...positions.map(p=>Math.hypot(p[0]-positions[0][0],p[2]-positions[0][2]))),rooms:[...new Set(frames.map(f=>f[id].room))],travel:frames.some(f=>f[id].traveling)}]}));
assert.ok(Object.values(report.movement).every(m=>m.distance>4 && m.travel),'every character must actually travel between rooms');
assert.ok(Object.values(report.movement).some(m=>m.rooms.length>1),'room transitions observed');
await page.screenshot({path:out+'/desktop.png',timeout:60000});await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(2500);const a=await sample();await page.waitForTimeout(1500);assert.deepEqual(await sample(),a);report.reducedMotionFrozen=true;
assert.deepEqual(report.errors,[]);report.result='PASS';const video=page.video();await context.close();await video.saveAs(out+'/rooms.webm');fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
