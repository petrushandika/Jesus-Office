const smooth = (x:number) => { const t=Math.max(0,Math.min(1,x)); return t*t*(3-2*t); };
/** Paired decorative conversation; never an agent message or task status. */
export function socialPoseAt(seconds:number,index:number) {
  if (!Number.isFinite(seconds) || index<1 || index>12) return {amount:0,turn:0,gesture:0};
  const left=index%2===1?index:index-1;
  // The later neighbor is between 6 and 12 seconds of its coding cycle;
  // its partner is 1.7 seconds earlier and is also safely seated.
  const phase=((seconds+(left+1)*1.7+5)%24+24)%24;
  const amount=smooth(phase-6)*smooth(12-phase);
  const side=index===left?1:-1;
  return {amount,turn:side*amount*0.95,gesture:amount*(0.55+Math.sin(phase*4+side)*0.22)};
}
