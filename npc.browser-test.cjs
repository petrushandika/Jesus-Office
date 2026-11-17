/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.OFFICE_PLAYWRIGHT || '@playwright/test');
const url=process.env.OFFICE_TEST_URL || 'http://127.0.0.1:18150';
const out=process.env.OFFICE_TEST_OUTPUT || './test-results/npc';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const errors=[];
 try {
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce',recordVideo:{dir:out,size:{width:1280,height:800}}});
  const page=await context.newPage(); page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/?inspectScene=1',{waitUntil:'domcontentloaded'});
  assert.equal(await page.title(),'Jesus Office');
  await page.waitForSelector('canvas[data-city-npcs]');
  const read=async name=>JSON.parse(await page.locator('canvas').getAttribute(name));
  const camera=()=>read('data-map-camera');
  const views=[];let swept=0;
  const initial=await camera(); let previous=Math.atan2(initial.position[0]-initial.target[0],initial.position[2]-initial.target[2]);
  for(let i=0;i<8;i++){
   await page.mouse.move(500,400);await page.mouse.down({button:'left'});
   await page.mouse.move(600,400,{steps:5});await page.mouse.up({button:'left'});
   const current=await camera(); const angle=Math.atan2(current.position[0]-current.target[0],current.position[2]-current.target[2]);
   swept+=Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous)); previous=angle;views.push(current);
   assert.ok(Math.hypot(...current.target.map((v,j)=>v-initial.target[j]))<0.01,'orbit preserves target');
   if(i%2===1) await page.screenshot({path:`${out}/orbit-${i+1}.png`,timeout:60000});
  }
  assert.ok(Math.abs(Math.abs(swept)-Math.PI*2)<0.03,'actual input completes full 360-degree orbit');
  const end=await camera();assert.ok(Math.hypot(...end.position.map((v,j)=>v-initial.position[j]))<0.1,'returns to same view');
  const frozen=await read('data-city-npcs');
  assert.equal(frozen.decorative,true);assert.equal(frozen.citizens.length,10);
  assert.ok(frozen.citizens.every(n=>n.decorative===true&&!('agentId' in n)));
  await page.waitForTimeout(1100);
  assert.deepEqual(await read('data-city-npcs'),frozen,'reduced-motion NPCs freeze completely');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityNpcs).paused===false);
  const activeBefore=await read('data-city-npcs');
  await page.waitForFunction(before=>JSON.parse(document.querySelector('canvas').dataset.cityNpcs).elapsed>before+2,activeBefore.elapsed);
  const activeAfter=await read('data-city-npcs');
  assert.ok(activeAfter.citizens.some((npc,i)=>Math.hypot(...npc.world.map((v,j)=>v-activeBefore.citizens[i].world[j]))>0.03),'actual NPC world positions change, not only clock');
  assert.notDeepEqual(activeAfter.citizens.map(n=>n.limbs),activeBefore.citizens.map(n=>n.limbs),'physical limb transforms animate');
  // Document visibility event exercises the real pause handler deterministically in headless Chromium.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityNpcs).paused===true);const hidden=await read('data-city-npcs');await page.waitForTimeout(900);assert.deepEqual(await read('data-city-npcs'),hidden,'hidden document freezes NPCs');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.cityNpcs).paused===true);
  const stopped=await read('data-city-npcs');await page.waitForTimeout(900);assert.deepEqual(await read('data-city-npcs'),stopped);
  await page.getByRole('region',{name:'Peta kota 3D'}).focus();await page.keyboard.press('0');
  await page.keyboard.press('+');await page.keyboard.press('+');
  // Inspect the near-side citizens instead of cropping them out at the town center.
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
  await page.screenshot({path:`${out}/npc-close.png`,timeout:60000});
  const screens=[];
  for(const [width,height] of [[1920,1080],[1280,800],[390,844],[844,390]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(({width,height})=>{const r=document.querySelector('canvas').getBoundingClientRect();return r.width===width&&r.height===height;},{width,height});
   const rect=await page.locator('canvas').boundingBox();
   assert.equal(rect.x,0);assert.equal(rect.y,0);assert.equal(rect.width,width);assert.equal(rect.height,height);
   assert.equal((await page.locator('body').innerText()).trim(),'');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight));
   screens.push({width,height,fullViewport:true});
  }
  assert.deepEqual(errors,[]);
  const result={result:'PASS',url,title:await page.title(),sweptDegrees:Math.abs(swept)*180/Math.PI,views,screens,frozen,activeBefore,activeAfter,errors};
  fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({result:'PASS',sweptDegrees:result.sweptDegrees,screens,errors}));
  const video=page.video();await context.close();if(video) await video.saveAs(`${out}/orbit-npcs.webm`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
