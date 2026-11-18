import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOperationsSnapshot, sanitizeOperationsAgents } from './operations-snapshot.ts';
import type { Snapshot } from './agents.ts';
const now = Date.parse('2026-11-17T10:00:00Z');
const agent = { id:'ops-123',run:'ops-123',task:0,status:'running',activity:'tool',model:'router',startedAt:new Date(now).toISOString(),endedAt:null,heartbeatAt:new Date(now).toISOString(),toolCalls:1,lastTool:'audit',lastToolAt:new Date(now).toISOString(),secret:'never exposed',title:'private project'};
test('operations snapshots only expose validated activity allowlist',()=>{
 const result=sanitizeOperationsAgents({agents:[agent]},now);
 assert.equal(result.length,1);assert.equal(result[0].id,'ops-123');
 assert.ok(!JSON.stringify(result).includes('private project')); assert.ok(!JSON.stringify(result).includes('never exposed'));
 assert.equal(sanitizeOperationsAgents({agents:[{...agent,id:'https://secret.example'}]},now).length,0);
});
test('stale and future heartbeats cannot animate a worker',()=>{
 for(const stamp of [now-121_000,now+60_000]){
  const result=sanitizeOperationsAgents({agents:[{...agent,heartbeatAt:new Date(stamp).toISOString()}]},now);
  assert.equal(result[0].status,'stale');assert.equal(result[0].activity,'waiting');
 }
});
test('malformed states, tools and timestamps fail closed',()=>{
 assert.deepEqual(sanitizeOperationsAgents({agents:[null,{...agent,status:'approved'},{...agent,lastTool:'token=secret'},{...agent,startedAt:'bad'}]},now),[]);
});
test('operations are combined with existing delegation without inventing workers',()=>{
 const base:Snapshot={available:false,generatedAt:new Date(now).toISOString(),agents:[],totals:{running:0,stale:0,completed:0,failed:0,interrupted:0},gateway:null};
 const result=mergeOperationsSnapshot(base,{agents:[agent]},now);
 assert.equal(result.available,true);assert.equal(result.totals.running,1);
 assert.deepEqual(mergeOperationsSnapshot(base,null,now),base);
});
