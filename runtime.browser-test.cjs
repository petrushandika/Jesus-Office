/* eslint-disable @typescript-eslint/no-require-imports -- Browser verification with real runtime only. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.OFFICE_PLAYWRIGHT||'@playwright/test');
const url=process.env.OFFICE_TEST_URL||'http://127.0.0.1:18145',out=process.env.OFFICE_TEST_OUTPUT||'./test-results/runtime';fs.mkdirSync(out,{recursive:true});
const rooms=[['yesus',-9,4.5],['petrus',-3,4.5],['yohanes',3,4.5],['yakobus-zebedeus',9,4.5],['andreas',-6,-4.5],['filipus',0,-4.5],['matius',6,-4.5]];
const roomAt=p=>rooms.find(([,x,z])=>Math.abs(p[0]-x)<2.85&&Math.abs(p[2]-z)<=2.5)?.[0]||'central-lane';
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const report={url,errors:[],source:'actual /api/agents; no fixtures or route fulfillment'};try{
const ctx=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:out,size:{width:1280,height:800}}});const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));const observedIds=new Set(),snapshots=[];
page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/agents'&&response.ok()){const s=await response.json();snapshots.push(s);for(const a of s.agents)observedIds.add(a.id);}});
await page.goto(url+'/?inspectScene=1');await page.waitForSelector('canvas[data-motion-yesus]');
const sample=()=>page.evaluate(()=>Object.fromEntries([...document.querySelector('canvas').attributes].filter(a=>a.name.startsWith('data-motion-')).map(a=>[a.name.slice(12),JSON.parse(a.value)])));
const frames=[];for(let i=0;i<110;i++){frames.push(await sample());await page.waitForTimeout(500);}
fs.writeFileSync(out+'/frames.json',JSON.stringify(frames));fs.writeFileSync(out+'/snapshots.json',JSON.stringify(snapshots));assert.ok(snapshots.length>1,'polling actual runtime');
for(const frame of frames)for(const p of Object.values(frame)){assert.equal(p.room,roomAt(p.world),'actual transform matches physical room');if(p.active){assert.ok(p.agentId&&observedIds.has(p.agentId),'active character bound to real observed agent');}}
const movement=Object.fromEntries(Object.keys(frames[0]).map(id=>{const f=frames.map(x=>x[id]);return[id,{agentIds:[...new Set(f.map(x=>x.agentId).filter(Boolean))],rooms:[...new Set(f.map(x=>roomAt(x.world)))],distance:Math.max(...f.map(x=>Math.hypot(x.world[0]-f[0].world[0],x.world[2]-f[0].world[2]))),phases:[...new Set(f.map(x=>x.phase))]}]}));
report.movement=movement;assert.ok(Object.values(movement).some(m=>m.distance>4&&m.rooms.filter(r=>r!=='central-lane').length>=2),'real worker crosses source room, lane and different room');
assert.equal((await page.locator('main').innerText()).trim(),'');await page.screenshot({path:out+'/desktop.png'});
// Simulate source outage by aborting requests, never invent successful data.
await page.route('**/api/agents',route=>route.abort());await page.waitForTimeout(5000);const stopped=await sample();await page.waitForTimeout(1800);const still=await sample();for(const id in still){assert.equal(still[id].active,false);assert.deepEqual(still[id].world,stopped[id].world);}
report.disconnectionStopsMotion=true;assert.deepEqual(report.errors,[]);report.result='PASS';const video=page.video();await ctx.close();await video.saveAs(out+'/runtime.webm');fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
