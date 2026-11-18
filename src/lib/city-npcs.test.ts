import assert from 'node:assert/strict';
import test from 'node:test';
import { CITY_NPCS, createCityNpcClock, sampleCityNpc } from './city-npcs.ts';
test('ten citizens have routines distributed across five destinations, never agent identities', () => {
 assert.equal(CITY_NPCS.length,10);
 assert.ok(new Set(CITY_NPCS.map(n=>n.destination)).size>=5);
 assert.ok(CITY_NPCS.some(n=>n.activity==='bathing'));
 assert.ok(CITY_NPCS.some(n=>n.activity==='crafting'));
 for(const npc of CITY_NPCS) {
  const actions=new Set();let entered=false;
  for(let t=0;t<70;t+=.1){
   const p=sampleCityNpc(npc,t),next=sampleCityNpc(npc,t+.001);actions.add(p.activity);entered ||= p.indoors;
   assert.ok(Math.hypot(...p.position.map((v,i)=>v-next.position[i]))<.01,'no teleport');
   assert.ok(p.position.every(Number.isFinite));
   assert.ok(Math.abs(p.position[0])>12||Math.abs(p.position[2])>20,'away from worker rooms');
  }
  assert.ok(actions.has(npc.activity));assert.ok(actions.has('walking'));assert.ok(entered);
 }
});
test('pause freezes elapsed time and pose channels without resume catch-up',()=>{
 const c=createCityNpcClock();c.advance(.5,false);const before=CITY_NPCS.map(n=>sampleCityNpc(n,c.advance(0,false)));
 for(let i=0;i<50;i++)c.advance(10,true);
 assert.deepEqual(CITY_NPCS.map(n=>sampleCityNpc(n,c.advance(0,true))),before);assert.equal(c.advance(100,false),.5);assert.equal(c.advance(.1,false),.6);
});
test('bathing and crafting animate arms without walking',()=>{
 for(const base of CITY_NPCS.filter(n=>['bathing','crafting'].includes(n.activity))){
 const n={...base,offset:0};const a=sampleCityNpc(n,17),b=sampleCityNpc(n,18);
 assert.equal(a.walking,false);assert.equal(a.activity,n.activity);assert.notEqual(a.leftArm,b.leftArm);assert.deepEqual(a.position,b.position);
 }
});
