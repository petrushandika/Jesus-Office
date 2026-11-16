import test from 'node:test';
import assert from 'node:assert/strict';
import { socialPoseAt } from './social-choreography.ts';

test('neighbors converse together and face one another; center stays neutral',()=>{
 const a=socialPoseAt(3,1),b=socialPoseAt(3,2);
 assert.ok(a.amount>0 && b.amount>0);assert.equal(a.amount,b.amount);
 assert.equal(a.turn,-b.turn);assert.equal(socialPoseAt(3,0).amount,0);
 assert.notEqual(socialPoseAt(3.2,1).gesture,a.gesture);
});
test('conversation fades continuously and only happens while both neighbors are seated',()=>{
 for(let i=1;i<13;i++)for(let t=0;t<48;t+=0.01){
  const p=socialPoseAt(t,i),n=socialPoseAt(t+0.001,i);
  assert.ok(Number.isFinite(p.turn));assert.ok(Math.abs(n.amount-p.amount)<0.02);
  if(p.amount>0){const j=i%2?i+1:i-1;for(const k of [i,j]){const local=(t+k*1.7+5)%24;assert.ok(local>4 && local<18);}}
 }
});
