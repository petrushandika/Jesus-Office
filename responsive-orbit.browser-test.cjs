/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.OFFICE_PLAYWRIGHT||'@playwright/test');
const url=process.env.OFFICE_TEST_URL||'http://127.0.0.1:18152',out=process.env.OFFICE_TEST_OUTPUT||'./test-results/responsive-orbit';
fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const errors=[],screens=[];
try{const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce',hasTouch:true});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/?inspectScene=1');await page.waitForSelector('canvas[data-map-camera]');
const camera=()=>page.locator('canvas').getAttribute('data-map-camera').then(JSON.parse);
const offset=c=>c.position.map((n,i)=>n-c.target[i]);
const initial=await camera();await page.mouse.move(500,400);await page.mouse.down();await page.mouse.move(680,450,{steps:8});await page.mouse.up();const rotated=await camera();
assert.deepEqual(rotated.target,initial.target,'normal LEFT drag must orbit, not pan');assert.notDeepEqual(offset(rotated),offset(initial),'normal LEFT drag changes viewing angle');
await page.mouse.move(500,400);await page.mouse.down({button:'right'});await page.mouse.move(620,420,{steps:6});await page.mouse.up({button:'right'});assert.notDeepEqual((await camera()).target,rotated.target,'right drag remains available for panning');
const region=page.getByRole('region',{name:'Peta kota 3D'});
for(const [width,height] of [[1440,900],[390,844],[844,390],[1920,1080]]){
 await page.setViewportSize({width,height});await page.waitForFunction(({width,height})=>{const r=document.querySelector('canvas').getBoundingClientRect();return r.width===width&&r.height===height;},{width,height});await region.focus();await page.keyboard.press('0');
 await page.waitForFunction(()=>{const p=JSON.parse(document.querySelector('canvas').dataset.mapCamera);return Math.hypot(...p.position.map((n,i)=>n-p.target[i]))<=72 && Math.abs(p.zoom-1)<0.01;});
 const c=await camera(),rect=await page.locator('canvas').boundingBox();assert.equal(rect.width,width);assert.equal(rect.height,height);assert.equal(rect.x,0);assert.equal(rect.y,0);assert.equal((await page.locator('body').innerText()).trim(),'');screens.push({width,height,camera:c});await page.screenshot({path:`${out}/overview-${width}.png`,timeout:60000});
}
await page.setViewportSize({width:390,height:844});await region.focus();await page.keyboard.press('0');await page.waitForTimeout(1000);
const cdp=await page.context().newCDPSession(page),before=await camera();
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:420,id:1}]});
for(let i=1;i<=7;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150+i*17,y:420+i*5,id:1}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
const touched=await camera();assert.deepEqual(touched.target,before.target,'ONE finger orbits around city instead of panning');assert.notDeepEqual(offset(touched),offset(before));
const beforePinch=await camera();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:400,id:1},{x:230,y:440,id:2}]});
for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:130-i*10,y:400-i*3,id:1},{x:230+i*10,y:440+i*3,id:2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok((await camera()).zoom>beforePinch.zoom,'pinch zoom still works');
const beforePan=await camera();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:400,id:1},{x:230,y:440,id:2}]});
for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:130+i*9,y:400,id:1},{x:230+i*9,y:440,id:2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notDeepEqual((await camera()).target,beforePan.target,'two fingers pan');
assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({result:'PASS',url,screens,rotated,touched,errors},null,2));console.log('PASS left-drag + one-finger orbit; right-drag/two-finger pan; pinch; responsive close city framing all four sizes');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
