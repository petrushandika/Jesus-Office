/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser acceptance. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.OFFICE_PLAYWRIGHT||'@playwright/test');
const url=process.env.OFFICE_TEST_URL||'http://127.0.0.1:18137';
const out=process.env.OFFICE_TEST_OUTPUT||'./test-results/social';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const report={url,errors:[]};
 try {
  const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:out,size:{width:1280,height:800}}});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(url+'/?inspectScene=1',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('canvas[data-motion-yesus]');
  const sample=()=>page.evaluate(()=>({motion:Object.fromEntries([...document.querySelector('canvas').attributes].filter(a=>a.name.startsWith('data-motion-')).map(a=>[a.name.slice(12),JSON.parse(a.value)])),environment:document.querySelector('canvas').dataset.mapEnvironment}));
  const frames=[];
  for(let i=0;i<64;i++){frames.push(await sample());await page.waitForTimeout(500);}
  fs.writeFileSync(out+'/samples.json',JSON.stringify(frames));
  report.environmentMoving=new Set(frames.map(f=>f.environment)).size>2;
  assert.ok(report.environmentMoving,'rendered environmental transforms must move');
  report.socialSamples=frames.flatMap(f=>Object.entries(f.motion).filter(([,m])=>m.conversing || m.social?.active || m.speechVisible).map(([id,m])=>({id,...m})));
  assert.ok(report.socialSamples.length>0,'actual conversational transform/indicator must be observed');
  await page.screenshot({path:out+'/desktop.png',timeout:60000});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.mapEnvironment||'{}').paused===true);
  await page.waitForTimeout(1200);
  const first=await sample();await page.waitForTimeout(1200);assert.deepEqual(await sample(),first,'all probe transforms freeze with reduced motion');
  report.reducedMotionFrozen=true;assert.deepEqual(report.errors,[]);report.result='PASS';
  const video=page.video();await context.close();await video.saveAs(out+'/social.webm');
  fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,socialSamples:report.socialSamples.length},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
