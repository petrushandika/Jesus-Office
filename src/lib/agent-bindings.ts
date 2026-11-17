import type { Agent } from './agents.ts';

// Visual slots are representations of real run identities, not named configured agents.
export function reconcileBindings(previous: Record<string,string>, agents: Agent[], slots: string[]) {
 const result:Record<string,string>={};
 const ids=new Set(agents.map(agent=>agent.id));
 for(const slot of slots) if(previous[slot] && ids.has(previous[slot])) result[slot]=previous[slot];
 const running=agents.filter(agent=>agent.status==='running');
 for(const agent of running) {
  if(Object.values(result).includes(agent.id)) continue;
  const slot=slots.find(slot=>!result[slot])??slots.find(slot=>!running.some(active=>active.id===result[slot]));
  if(slot) result[slot]=agent.id;
 }
 return result;
}
