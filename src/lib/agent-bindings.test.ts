import test from 'node:test';
import assert from 'node:assert/strict';
import * as bindings from './agent-bindings.ts';
import type { Agent } from './agents.ts';
const worker=(id:string,status:Agent['status']='running'):Agent=>({id,run:id,task:0,status,activity:'tool',model:'test',startedAt:null,endedAt:null,heartbeatAt:new Date().toISOString(),toolCalls:1,lastTool:'read_file'});
test('stable visual slots survive snapshot reorder and never duplicate workers',()=>{
 assert.equal(typeof bindings.reconcileBindings,'function');
 const first=bindings.reconcileBindings({},[worker('a'),worker('b')],['yesus','petrus']);
 const second=bindings.reconcileBindings(first,[worker('b'),worker('a')],['yesus','petrus']);
 assert.deepEqual(second,first);assert.equal(new Set(Object.values(second)).size,2);
});
test('new running worker replaces finished slot but not existing active worker',()=>{
 const next=bindings.reconcileBindings({yesus:'a',petrus:'b'},[worker('a'),worker('b','completed'),worker('c')],['yesus','petrus']);
 assert.deepEqual(next,{yesus:'a',petrus:'c'});
});
test('missing source frees slots and completed history never creates fake workers',()=>{
 assert.deepEqual(bindings.reconcileBindings({yesus:'a'},[],['yesus']),{});
 assert.deepEqual(bindings.reconcileBindings({},[worker('old','completed')],['yesus']),{});
});
