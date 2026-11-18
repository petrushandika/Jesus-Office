import type { Agent, AgentStatus, Activity, Snapshot } from './agents.ts';
const identifier = /^[A-Za-z0-9_.-]{1,100}$/;
const states = new Set<AgentStatus>(['running','completed','failed','stale','interrupted']);
const activities = new Set<Activity>(['tool','thinking','waiting','done']);
const timestamp = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(x) && Number.isFinite(Date.parse(x));
export function sanitizeOperationsAgents(input: unknown, now=Date.now()): Agent[] {
 if (!input || typeof input !== 'object' || !('agents' in input) || !Array.isArray(input.agents)) return [];
 return input.agents.slice(0,10).flatMap((a):Agent[]=>{
  if (!a || typeof a !== 'object' || !identifier.test(a.id??'') || !identifier.test(a.run??'') ||
      !states.has(a.status) || !activities.has(a.activity) || !Number.isSafeInteger(a.task) || a.task<0 ||
      !Number.isSafeInteger(a.toolCalls) || a.toolCalls<0 ||
      (a.lastTool!==null && (typeof a.lastTool!=='string' || !identifier.test(a.lastTool))) ||
      ![a.startedAt,a.endedAt,a.heartbeatAt,a.lastToolAt].every(x=>x===null || timestamp(x))) return [];
  const age = a.heartbeatAt ? now-Date.parse(a.heartbeatAt) : Infinity;
  const stale = a.status==='running' && (age<0 || age>120_000);
  return [{id:a.id,run:a.run,task:a.task,status:stale?'stale':a.status,activity:stale?'waiting':a.activity,
   model:'astronacci-9router',startedAt:a.startedAt,endedAt:a.endedAt,heartbeatAt:a.heartbeatAt,
   toolCalls:a.toolCalls,lastTool:a.lastTool,lastToolAt:a.lastToolAt}];
 });
}
export function mergeOperationsSnapshot(base: Snapshot, input: unknown, now=Date.now()): Snapshot {
 const ops=sanitizeOperationsAgents(input,now);
 if(!ops.length) return base;
 const agents=[...ops,...base.agents].sort((a,b)=>Number(b.status==='running')-Number(a.status==='running') || (b.startedAt??'').localeCompare(a.startedAt??''));
 const totals={...base.totals};for(const a of ops)totals[a.status]++;
 return {...base,available:true,agents:agents.slice(0,10),totals};
}
export async function readOperationsSnapshot(): Promise<unknown> {
 const token=process.env.OFFICE_OPS_TOKEN;
 if(!token) return null;
 try {
  const response=await fetch('http://127.0.0.1:18160/snapshot',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(1500)});
  if(!response.ok)return null;
  const text=await response.text(); if(text.length>32_768)return null;
  return JSON.parse(text);
 } catch {return null;}
}
