import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PerspectiveCamera,Vector3} from 'three';
test('responsive overview projects every city bound inside portrait and landscape',async()=>{
 assert.ok(existsSync(new URL('./camera-fit.ts',import.meta.url)),'responsive framing missing');
 const {fitCityOverviewDistance,CITY_CORNERS,CITY_VIEW}=await import('./camera-fit.ts');
 for(const aspect of [390/844,844/390,1440/900,1920/1080]){
  const camera=new PerspectiveCamera(48,aspect,0.1,10000);
  camera.position.copy(new Vector3(...CITY_VIEW).normalize().multiplyScalar(fitCityOverviewDistance(aspect)));
  camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const corner of CITY_CORNERS){const p=new Vector3(...corner).project(camera);assert.ok(Math.abs(p.x)<=0.94&&Math.abs(p.y)<=0.94&&p.z<1&&p.z>-1,JSON.stringify({aspect,p}));}
 }
});
test('primary mouse and touch gestures orbit rather than translate',()=>{
 const s=readFileSync(new URL('../components/office/scene.tsx',import.meta.url),'utf8');
 assert.ok(s.includes('LEFT: MOUSE.ROTATE'));
 assert.ok(s.includes('ONE: TOUCH.ROTATE'));
 assert.ok(s.includes('TWO: TOUCH.DOLLY_PAN'));
});
