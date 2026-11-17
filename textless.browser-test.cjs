/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser acceptance. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.OFFICE_PLAYWRIGHT||'@playwright/test');
const url=process.env.OFFICE_TEST_URL||'http://127.0.0.1:18145',out=process.env.OFFICE_TEST_OUTPUT||'./test-results/textless';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const report={url,errors:[],screens:[]};try{
for(const [width,height] of [[1440,900],[1280,800],[390,844]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce',hasTouch:width===390,isMobile:width===390});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(url+'/?inspectScene=1');await page.waitForSelector('canvas[data-motion-yesus]');
 assert.equal((await page.locator('main').innerText()).trim(),'','no visible text');
 const region=page.getByRole('region',{name:'Peta kota 3D'});await region.focus();await page.keyboard.press('Enter');await page.waitForTimeout(300);
 assert.equal((await page.locator('main').innerText()).trim(),'','no selected role label');assert.equal(await page.locator('h1,p,nav,button,aside').count(),0);
 const box=await page.locator('canvas').boundingBox();assert.equal(Math.round(box.width),width);assert.equal(Math.round(box.height),height);
 await page.screenshot({path:`${out}/textless-${width}.png`});report.screens.push({width,height,visibleText:'',fullViewport:true});await page.close();
}
assert.deepEqual(report.errors,[]);report.result='PASS';fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
