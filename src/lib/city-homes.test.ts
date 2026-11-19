import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

type Box={min:number[];max:number[]};
const bounds=(p:{at:number[];size:number[]}):Box=>({min:p.at.map((v,i)=>v-p.size[i]/2),max:p.at.map((v,i)=>v+p.size[i]/2)});
const overlaps=(a:Box,b:Box,eps=.015)=>[0,1,2].every(i=>a.min[i]<b.max[i]-eps&&b.min[i]<a.max[i]-eps);

test('districts use many distinct building programs, never the same kind next door',async()=>{
 const {HOME_KINDS,assignHomeKinds,buildHome}=await import('./city-homes.ts');
 const {createSurroundingHomes}=await import('./city-fill.ts');
 assert.ok(HOME_KINDS.length>=12);
 const homes=assignHomeKinds(createSurroundingHomes());
 assert.deepEqual(new Set(homes.map(h=>h.kind)).size,HOME_KINDS.length);
 for(const a of homes)for(const b of homes)if(a!==b){
  const d=Math.hypot(a.x-b.x,a.z-b.z);
  if(d<13)assert.notEqual(a.kind,b.kind,'neighbouring buildings must differ');
  if(d<9.5)assert.notEqual(a.tone,b.tone,'adjacent wall finishes must differ');
 }
 const signatures=new Set(HOME_KINDS.map(kind=>{
  const parts=buildHome({x:0,z:0,width:5.6,depth:5.4,height:3,kind,turn:0,tone:0});
  const interior=parts.filter(p=>p.role==='interior');
  return JSON.stringify(interior.map(p=>p.shape+p.color).sort());
 }));
 assert.equal(signatures.size,HOME_KINDS.length,'each program has its own furnishings');
 const silhouettes=new Set(HOME_KINDS.map(kind=>JSON.stringify(buildHome({x:0,z:0,width:5.6,depth:5.4,height:3,kind,turn:0,tone:0}).filter(p=>p.role!=='interior').map(p=>[p.shape,p.at.map(v=>Math.round(v*4)),p.size.map(v=>Math.round(v*4))]).sort())));
 assert.equal(silhouettes.size,HOME_KINDS.length,'each program has its own exterior silhouette');
 const roofForms=new Set(HOME_KINDS.map(kind=>buildHome({x:0,z:0,width:5.6,depth:5.4,height:3,kind,turn:0,tone:0}).filter(p=>p.role!=='interior'&&p.shape!=='box').map(p=>p.shape.replace(/-[xz]$/,'')).sort().join()));
 assert.ok(roofForms.size>=4,'gable, vault, dome and arcade roof forms');
 const turns=new Set(homes.map(h=>h.turn)),tones=new Set(homes.map(h=>h.tone));
 assert.ok(turns.size===4&&tones.size>=5,'orientation and wall finish vary');
});

test('every building exposes an unroofed, collision-free interior within its lot',async()=>{
 const {HOME_KINDS,buildHome}=await import('./city-homes.ts');
 for(const kind of HOME_KINDS)for(const [width,depth,height] of [[3.4,3,1.8],[4.8,4.3,4.2],[6,5.8,3.9]])for(const turn of [0,1,2,3]){
  const lot={x:9,z:-18,width,depth,height,kind,turn,tone:2};
  const parts=buildHome(lot),interior=parts.filter(p=>p.role==='interior'),solid=parts.filter(p=>p.role==='shell'||p.role==='roof');
  assert.ok(interior.length>=4,`${kind} has visible contents`);
  for(const p of parts){
   const b=bounds(p);
   assert.ok(p.size.every(v=>v>0&&Number.isFinite(v)),`${kind} degenerate`);
   assert.ok(b.min[1]>=-.06,`${kind} below ground`);
   assert.ok(Math.abs(b.min[0]-9)<=width/2+.36&&Math.abs(b.max[0]-9)<=width/2+.36,`${kind} leaves lot x`);
   assert.ok(Math.abs(b.min[2]+18)<=depth/2+.36&&Math.abs(b.max[2]+18)<=depth/2+.36,`${kind} leaves lot z`);
  }
  const visible=interior.filter(p=>{const b=bounds(p);return !parts.some(r=>r.role==='roof'&&bounds(r).min[1]>=b.max[1]-.01&&bounds(r).min[0]<=p.at[0]&&bounds(r).max[0]>=p.at[0]&&bounds(r).min[2]<=p.at[2]&&bounds(r).max[2]>=p.at[2]);});
  assert.ok(visible.length>=3,`${kind} contents are hidden under roofs`);
  for(const p of interior)for(const s of solid)assert.ok(!overlaps(bounds(p),bounds(s)),`${kind} prop intersects wall/roof turn ${turn}`);
 }
});

test('each lot has a ground-level street entrance and supported flat roofs',async()=>{
 const {HOME_KINDS,buildHome}=await import('./city-homes.ts');
 for(const kind of HOME_KINDS)for(const [width,depth,height] of [[4.1,4,1.9],[5.2,5,3],[6,6,4.2]]){
  const parts=buildHome({x:0,z:0,width,depth,height,kind,turn:0,tone:1});
  const blocks=parts.filter(p=>p.role!=='interior'&&p.at[1]-p.size[1]/2<1.2&&p.size[1]>.08);
  const front=blocks.filter(p=>p.at[2]+p.size[2]/2>=depth/2-.3);
  const open=[];for(let x=-width/2+.3;x<=width/2-.3;x+=.05)open.push(!front.some(p=>Math.abs(x-p.at[0])<p.size[0]/2+.02));
  let run=0,best=0;for(const o of open){run=o?run+1:0;best=Math.max(best,run);}
  assert.ok(best*.05>=.6,`${kind} needs a walk-in street opening`);
  const shells=parts.filter(p=>p.role==='shell');
  for(const roof of parts.filter(p=>p.role==='roof'&&p.shape==='box')){
   const bottom=roof.at[1]-roof.size[1]/2;
   for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=roof.at[0]+sx*(roof.size[0]/2-.15),z=roof.at[2]+sz*(roof.size[2]/2-.15);
    assert.ok(shells.some(s=>Math.abs(x-s.at[0])<=s.size[0]/2+.01&&Math.abs(z-s.at[2])<=s.size[2]/2+.01&&s.at[1]+s.size[1]/2>=bottom-.05),`${kind} roof corner unsupported`);
   }
  }
 }
});

test('market stalls and worker rooms are individually finished',async()=>{
 const {MARKET_STALLS,ROOM_FINISHES}=await import('./city-homes.ts');
 assert.equal(MARKET_STALLS.length,8);
 assert.equal(new Set(MARKET_STALLS.map(s=>s.goods)).size,8);
 assert.equal(new Set(MARKET_STALLS.map(s=>s.awning[1])).size,8);
 assert.equal(ROOM_FINISHES.length,7);
 assert.equal(new Set(ROOM_FINISHES.map(p=>p[0])).size,7);
 const scene=readFileSync(new URL('../components/office/scene.tsx',import.meta.url),'utf8');
 assert.match(scene,/MARKET_STALLS\.map/);
 assert.match(scene,/ROOM_FINISHES\[index\]/);
});

test('scene renders building programs as shared instanced batches',()=>{
 const scene=readFileSync(new URL('../components/office/scene.tsx',import.meta.url),'utf8');
 assert.match(scene,/assignHomeKinds/);
 assert.match(scene,/buildHome/);
 assert.match(scene,/name="instanced-city-homes"/);
 assert.doesNotMatch(scene,/index % 3 === 0/,'old three-variant repetition removed');
});
