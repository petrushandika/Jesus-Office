type Point = [number, number, number];
export type CitizenActivity = 'bathing' | 'shopping' | 'crafting' | 'resting' | 'reading';
export type CityNpc = {
 key: string; destination: string; activity: CitizenActivity; route: readonly Point[];
 offset: number; height: number; width: number; robe: string; scarf: string; skin: string;
 accessory: 'basket' | 'staff' | 'satchel';
};
const robes=['#a86e4a','#7a8866','#b79665','#687b88','#b08076'];
const scarves=['#dfcda7','#bc9b73','#e7dac0','#b8b29a','#d1b89b'];
const skins=['#b77c55','#965d3f','#cd9569','#aa704e','#805039'];
// Authored doorstep-to-interior paths. These citizens never claim agent identities.
const routines: {destination:string;activity:CitizenActivity;route:Point[]}[]=[
 {destination:'bathhouse',activity:'bathing',route:[[0,0,-22],[0,.4,-25],[0,.4,-27]]},
 {destination:'market',activity:'shopping',route:[[27,0,5],[27,.3,3],[27,.3,1]]},
 {destination:'pottery-workshop',activity:'crafting',route:[[-25.4,0,23],[-25.4,.4,21],[-25.4,.4,19]]},
 {destination:'terraced-garden',activity:'resting',route:[[-31.8,0,5],[-31.8,0,3],[-31.8,0,1]]},
 {destination:'civic-hall',activity:'reading',route:[[-23,0,-13],[-23,.3,-14.5],[-23,.6,-15.5]]},
];
export const CITY_NPCS:readonly CityNpc[]=Array.from({length:10},(_,index)=>{
 const lane=index%5, second=index>=5, r=routines[lane];
 // Parallel narrow lanes, not overlapping copies; each pair follows its own schedule.
 return {key:`citizen-${index+1}`,destination:r.destination,activity:r.activity,
  route:r.route.map(([x,y,z])=>[x+(second?.48:-.48),y,z] as Point),
  offset:index*5.3,height:[.86,1,.93,1.08,.96][lane],width:[1.1,.9,1.16,.92,1][lane],
  robe:robes[lane],scarf:scarves[(lane+(second?2:0))%5],skin:skins[lane],accessory:lane===0?'satchel':(['basket','staff','satchel'] as const)[index%3]};
});
export function createCityNpcClock(){let elapsed=0,held=false;return {advance(delta:number,paused:boolean){if(!paused&&!held&&Number.isFinite(delta))elapsed+=Math.max(0,delta);held=paused;return elapsed;}};}
const ease=(v:number)=>v*v*(3-2*v);
export function sampleCityNpc(npc:CityNpc,elapsed:number){
 const time=((elapsed+npc.offset)%56+56)%56;
 const entering=time<14, indoors=time>=14&&time<36, leaving=time>=36&&time<50;
 const walking=entering||leaving;
 const progress=entering?time/14:leaving?1-(time-36)/14:indoors?1:0;
 const segment=Math.min(npc.route.length-2,Math.floor(progress*(npc.route.length-1)));
 const t=ease(progress*(npc.route.length-1)-segment),a=npc.route[segment],b=npc.route[segment+1];
 const position=a.map((v,i)=>v+(b[i]-v)*t) as Point;
 const stride=walking?Math.sin(time*6)*Math.sin(Math.PI*((entering?time:time-36)%7)/7):0;
 const activity=walking?'walking':indoors?npc.activity:'idle';
 const gesture=indoors?Math.sin((time-14)*2.2)*.2*Math.min(1,(time-14)/2,(36-time)/2):0;
 const heading=Math.atan2(b[0]-a[0],b[2]-a[2])+(leaving?Math.PI:0);
 return {position,heading,walking,indoors,activity,destination:npc.destination,
  leftLeg:stride*.35,rightLeg:-stride*.35,
  leftArm:indoors?(npc.activity==='bathing'?-1.1+gesture:npc.activity==='crafting'?-.8+gesture:npc.activity==='reading'?-.8:0):-stride*.24,
  rightArm:indoors?(npc.activity==='bathing'?-1.1-gesture:npc.activity==='crafting'?-.8-gesture:npc.activity==='reading'?-.8:0):stride*.24};
}
