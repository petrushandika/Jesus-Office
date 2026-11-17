import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveController} from './live-choreography.ts';
import type {Agent} from './agents.ts';
import {ROOMS} from './room-choreography.ts';
const now=Date.parse('2026-11-17T12:00:00Z');
const agent=(patch:Partial<Agent>={}):Agent=>({id:'a',run:'a',task:0,status:'running',activity:'tool',model:'m',startedAt:null,endedAt:null,heartbeatAt:new Date(now).toISOString(),lastTool:'patch',toolCalls:1,lastToolAt:new Date(now).toISOString(),...patch});
test('same category new event initiates a trip, identical polling does not',()=>{
 const c=createLiveController('yesus'), a=agent();const arrived=c.update(100,a,now);
 assert.equal(arrived.traveling,false);assert.deepEqual(c.update(5,a,now).position,arrived.position);
 assert.equal(c.update(.1,agent({toolCalls:2,lastToolAt:new Date(now+1000).toISOString()}),now+1000).traveling,true);
});
test('replacement worker never inherits previous route or teleports',()=>{
 const c=createLiveController('yesus');const old=c.update(3,agent(),now);
 const next=c.update(1,agent({id:'b',run:'b',activity:'waiting'}),now);
 assert.equal(next.traveling,false);assert.deepEqual(next.position,old.position);
 const moving=c.update(.1,agent({id:'b',run:'b',lastTool:'web_search'}),now);
 assert.equal(moving.toRoom,'andreas');assert.ok(Math.hypot(moving.position[0]-old.position[0],moving.position[2]-old.position[2])<=.145001);
 for(let i=0;i<500;i++){const p=c.update(.1,agent({id:'b',run:'b',lastTool:'web_search'}),now);if(!p.traveling){assert.equal(p.room,'andreas');return;}}
 assert.fail('new worker must reach its own destination');
});
test('replacement paths clear walls and tables from sampled in-flight positions',()=>{
 for(const home of ROOMS)for(const elapsed of [0.5,1.6,2.2,3,5,8,11]){
  const c=createLiveController(home.id);c.update(elapsed,agent(),now);
  const b=agent({id:'b',run:'b',lastTool:'web_search'});
  for(let i=0;i<600;i++){
   const p=c.update(.05,b,now);
   for(const r of ROOMS){
    const x=Math.abs(p.position[0]-r.center[0]),z=p.position[2]-r.center[2],side=Math.sign(r.center[2]);
    assert.ok(!(Math.abs(x-2.8)<.35&&Math.abs(z)<2.7),`side wall ${home.id}/${elapsed}/${r.id}`);
    assert.ok(!(x>.55&&x<3&&Math.abs(z+side*2.5)<.35),`door wall ${home.id}/${elapsed}/${r.id}`);
    assert.ok(Math.abs(p.position[0]-r.table[0])>.65||Math.abs(p.position[2]-r.table[2])>.36,'table');
   }
   if(!p.traveling)break;
  }
 }
});
test('inactive retains every physical pose component without settling',()=>{
 for(const delta of [1,100]){
 const c=createLiveController('yesus'),p=c.update(delta,agent(),now),f=c.update(10,undefined,now);
 for(const key of ['position','heading','sit','headTilt','headTurn','armRest','leftFoot','rightFoot','leftStride','rightStride','leftArm','rightArm','leftHand','rightHand','bob','gesture'] as const)assert.deepEqual(f[key],p[key],key);
 assert.equal(f.active,false);assert.equal(f.traveling,false);
 }
});
