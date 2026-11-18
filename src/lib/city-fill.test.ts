import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Ray,Plane} from 'three';

test('home view stays close and surrounding districts cover all viewport rays',async()=>{
 const {fitCityDistance,CITY_VIEW}=await import('./camera-fit.ts');
 const {CITY_EXTENT,createSurroundingHomes}=await import('./city-fill.ts');
 for(const aspect of [390/844,844/390,1440/900,1920/1080]){
  const distance=fitCityDistance(aspect);
  assert.ok(distance<=72,'portrait must not zoom out to a tiny town');
  const camera=new PerspectiveCamera(48,aspect,0.1,10000);
  camera.position.copy(new Vector3(...CITY_VIEW).normalize().multiplyScalar(distance));
  camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const x of [-1,0,1])for(const y of [-1,0,1]){
   const direction=new Vector3(x,y,.5).unproject(camera).sub(camera.position).normalize();
   const hit=new Ray(camera.position,direction).intersectPlane(new Plane(new Vector3(0,1,0),0),new Vector3());
   assert.ok(hit&&Math.abs(hit.x)<CITY_EXTENT-8&&Math.abs(hit.z)<CITY_EXTENT-8,'no bare ground beyond neighborhood at screen edges');
  }
 }
 const homes=createSurroundingHomes();
 assert.ok(homes.length>200&&homes.length<900);
 assert.equal(new Set(homes.map(h=>`${h.x}:${h.z}`)).size,homes.length);
 for(const h of homes){
  assert.ok(Math.abs(h.x)>42||Math.abs(h.z)>39,'preserve all existing landmarks, trees, NPC routes and rooms');
  assert.ok(h.width<=6&&h.depth<=6);
 }
});
