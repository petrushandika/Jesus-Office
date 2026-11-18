'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, InstancedMesh, MeshStandardMaterial, Object3D, Shape, SphereGeometry } from 'three';

type Point = [number, number, number];
type Block = { at: Point; size: Point; turn?: number };
const stone = '#d7bd91';
const pale = '#ecd9b5';
const clay = '#ac5d40';
const teal = '#50877f';
const earth = '#8b7150';
const leaf = '#70835a';
const box = new BoxGeometry(1, 1, 1);
const cylinder = new CylinderGeometry(1, 1, 1, 24);
const dome = new SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
const foliage = new SphereGeometry(1, 12, 8);
const materials = Object.fromEntries([stone, pale, clay, teal, earth, leaf].map(color => [color, new MeshStandardMaterial({ color, roughness: 0.9 })]));

// A solid half-annular vault: empty space below the intrados, not a painted doorway.
const archShape = new Shape();
archShape.absarc(0, 0, 1.35, 0, Math.PI, false);
archShape.lineTo(-1, 0);
archShape.absarc(0, 0, 1, Math.PI, 0, true);
archShape.closePath();
const arch = new ExtrudeGeometry(archShape, { depth: 0.85, bevelEnabled: false, curveSegments: 18 });
arch.translate(0, 0, -0.425);

function Blocks({ blocks, color = stone }: { blocks: Block[]; color?: string }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new Object3D();
    blocks.forEach(({ at, size, turn = 0 }, i) => {
      dummy.position.set(...at);
      dummy.scale.set(...size);
      dummy.rotation.set(0, turn, 0);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [blocks]);
  return <instancedMesh ref={ref} args={[box, materials[color], blocks.length]} castShadow receiveShadow />;
}

function BlockMesh({ at, size, color = stone }: { at: Point; size: Point; color?: string }) {
  return <mesh geometry={box} material={materials[color]} position={at} scale={size} castShadow receiveShadow />;
}

function Drum({ at, radius, height, color = stone }: { at: Point; radius: number; height: number; color?: string }) {
  return <mesh geometry={cylinder} material={materials[color]} position={at} scale={[radius, height, radius]} castShadow receiveShadow />;
}

function Vault({ at }: { at: Point }) {
  return <mesh geometry={arch} material={materials[pale]} position={at} castShadow receiveShadow />;
}

function Cap({ at, radius, color = teal }: { at: Point; radius: number; color?: string }) {
  return <mesh geometry={dome} material={materials[color]} position={at} scale={[radius, radius * 0.8, radius]} castShadow receiveShadow />;
}

function CivicHall() {
  const stairs = Array.from({ length: 5 }, (_, i) => ({ at: [0, 0.15 + i * 0.23, 3.7 - i * 0.4] as Point, size: [5.6, 0.3 + i * 0.46, 0.5] as Point }));
  const columns = [-2.2, -0.75, 0.75, 2.2].flatMap(x => [-1.7, 1.7].map(z => ({ at: [x, 2.5, z] as Point, size: [0.34, 2.6, 0.34] as Point })));
  return <>
    <BlockMesh at={[0, 0.3, 0]} size={[7.6, 0.6, 6.5]} />
    <BlockMesh at={[0, 0.8, 0]} size={[6.8, 0.4, 5.6]} color={pale} />
    <BlockMesh at={[0, 1.1, 0]} size={[6, 0.25, 4.8]} />
    <Blocks blocks={stairs} color={pale} />
    <Blocks blocks={columns} color={pale} />
    <BlockMesh at={[0, 2.4, -0.25]} size={[3.7, 2.5, 1.5]} />
    <BlockMesh at={[0, 3.95, 0]} size={[6.2, 0.4, 4.7]} color={clay} />
    <BlockMesh at={[0, 4.35, -0.4]} size={[4.8, 0.4, 3.3]} />
    <BlockMesh at={[0, 4.75, -0.4]} size={[3.3, 0.4, 2.4]} color={pale} />
    <BlockMesh at={[0, 5.05, -0.4]} size={[1.8, 0.2, 1.5]} color={teal} />
  </>;
}

function Bathhouse() {
  return <group name="bath-pool" userData={{ interiorKind: 'bathing' }}>
    <BlockMesh at={[0, 0.2, 0]} size={[8.4, 0.4, 6.4]} />
    <BlockMesh at={[0, .2, 4]} size={[2.4, .4, 2]} color={pale} />
    <Blocks blocks={[
      {at:[-3.8,1.8,0],size:[.4,2.8,6]}, {at:[3.8,1.8,0],size:[.4,2.8,6]},
      {at:[0,1.8,-2.9],size:[7.6,2.8,.4]},
      {at:[-1.7,.85,0],size:[.25,.9,3.5]}, {at:[1.7,.85,0],size:[.25,.9,3.5]},
      {at:[0,.85,-1.7],size:[3.5,.9,.25]},
      {at:[-1.45,.85,1.7],size:[.5,.9,.25]}, {at:[1.45,.85,1.7],size:[.5,.9,.25]},
    ]} color={pale} />
    <BlockMesh at={[0,1.12,0]} size={[3.1,.06,3.1]} color={teal} />
    <BlockMesh at={[0,3.2,-2.35]} size={[7.8,.25,1.4]} color={clay} />
    <Cap at={[0,3.35,-2.35]} radius={.85} />
    {[-2.9,2.9].map(x=><group key={x}>
      <BlockMesh at={[x,.65,0]} size={[.65,.5,3.8]} color={earth}/>
      <BlockMesh at={[x,.94,-.8]} size={[.5,.08,.8]} color={pale}/>
      <Drum at={[x,.7,2.1]} radius={.32} height={.5} color={clay}/>
    </group>)}
  </group>;
}

function Watchtower() {
  const battlements = [-1.5, -0.5, 0.5, 1.5].flatMap(v => [
    { at: [v, 9.2, -1.7] as Point, size: [0.55, 0.8, 0.45] as Point },
    { at: [v, 9.2, 1.7] as Point, size: [0.55, 0.8, 0.45] as Point },
    { at: [-1.7, 9.2, v] as Point, size: [0.45, 0.8, 0.55] as Point },
    { at: [1.7, 9.2, v] as Point, size: [0.45, 0.8, 0.55] as Point },
  ]);
  return <>
    <BlockMesh at={[0, 0.35, 0]} size={[4.6, 0.7, 4.6]} />
    <BlockMesh at={[0, 3.65, 0]} size={[2.8, 6, 2.8]} />
    <Blocks blocks={[1, 3.5, 6.4].map(y => ({ at: [0, y, 0], size: [3.15, 0.22, 3.15] }))} color={pale} />
    <Blocks blocks={[-1.35, 1.35].flatMap(x => [-1.35, 1.35].map(z => ({ at: [x, 7.6, z] as Point, size: [0.45, 2, 0.45] as Point })))} />
    <BlockMesh at={[0, 8.65, 0]} size={[3.9, 0.4, 3.9]} color={pale} />
    <Blocks blocks={battlements} />
    <BlockMesh at={[0, 6.75, 0]} size={[3.6, 0.25, 3.6]} color={clay} />
  </>;
}

function Market() {
  const posts = [-3.6, -1.2, 1.2, 3.6].flatMap(x => [-2, 2].map(z => ({ at: [x, 1.5, z] as Point, size: [0.3, 2.8, 0.3] as Point })));
  return <>
    <BlockMesh at={[0, 0.15, 0]} size={[8.8, 0.3, 5.2]} />
    <Blocks blocks={posts} color={earth} />
    {[-2.4, 2.4].map(x => <group key={x} position={[x, 0, 0]}>
      <mesh geometry={arch} scale={[0.88, 0.65, 5.5]} position={[0, 2.9, 0]} material={materials[clay]} castShadow receiveShadow />
      <Blocks blocks={[-1.5, 1.5].map(z => ({ at: [0, 0.85, z], size: [1.8, 1.1, 0.6] }))} color={pale} />
    </group>)}
    <group name="market-produce" userData={{ interiorKind: 'shopping' }}>
      <BlockMesh at={[0,.15,3.2]} size={[2.1,.3,1.8]} color={pale}/>
      {[-2.4,2.4].flatMap(x=>[-.5,0,.5].map(dx=><mesh key={`${x}:${dx}`} geometry={foliage} material={materials[leaf]} position={[x+dx,1.53,1.5]} scale={[.2,.18,.23]} />))}
    </group>
    <Blocks blocks={[-2, 2].map(z => ({ at: [0, 2.85, z], size: [8, 0.22, 0.25] }))} color={earth} />
  </>;
}

const seatingTiers = Array.from({ length: 5 }, (_, i) => {
  const inner = 2.5 + i * 0.65;
  const outer = inner + 0.65;
  const start = -Math.PI * 0.2;
  const end = Math.PI * 1.2;
  const shape = new Shape();
  shape.absarc(0, 0, outer, start, end, false);
  shape.lineTo(inner * Math.cos(end), inner * Math.sin(end));
  shape.absarc(0, 0, inner, end, start, true);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.5 + i * 0.6, bevelEnabled: false, curveSegments: 32 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
});

function Amphitheater() {
  return <group rotation={[0, Math.PI, 0]}>
    {seatingTiers.map((geometry, i) => <mesh key={i} geometry={geometry} material={materials[i % 2 ? pale : stone]} castShadow receiveShadow />)}
    <Drum at={[0, 0.25, 0]} radius={2.3} height={0.5} color={clay} />
    <Blocks blocks={[-1.8, 1.8].map(x => ({ at: [x, 0.9, -1.3], size: [0.45, 1.4, 0.45] }))} color={pale} />
  </group>;
}

function Aqueduct() {
  const piers = [-7.8, -5.2, -2.6, 0, 2.6, 5.2, 7.8];
  return <>
    <Blocks blocks={piers.map(x => ({ at: [x, 1.6, 0], size: [0.6, 3.2, 1.15] }))} />
    <Blocks blocks={piers.map(x => ({ at: [x, 0.2, 0], size: [0.95, 0.4, 1.6] }))} color={pale} />
    {[-6.5, -3.9, -1.3, 1.3, 3.9, 6.5].map(x => <Vault key={x} at={[x, 3.2, 0]} />)}
    <BlockMesh at={[0, 4.65, 0]} size={[16.4, 0.35, 1.3]} />
    <Blocks blocks={[-0.55, 0.55].map(z => ({ at: [0, 5.05, z], size: [16.4, 0.5, 0.2] }))} color={pale} />
    <BlockMesh at={[0, 4.85, 0]} size={[16, 0.05, 0.7]} color={teal} />
  </>;
}

function PotteryWorkshop() {
  return <>
    <BlockMesh at={[-1.4, 0.2, 0]} size={[5.3, 0.4, 5.4]} />
    <Blocks blocks={[
      { at: [-1.4, 1.6, -2.3], size: [4.8, 2.8, 0.45] },
      { at: [-3.55, 1.6, 0], size: [0.45, 2.8, 4.7] },
      { at: [0.75, 1.6, -1], size: [0.45, 2.8, 2.5] },
    ]} />
    <BlockMesh at={[-1.4, 3.05, -1.8]} size={[5.1, 0.3, 1.4]} color={clay} />
    <BlockMesh at={[-1.4,.2,3.3]} size={[2.2,.4,1.4]} color={pale}/>
    <group name="pottery-wheel" userData={{ interiorKind: 'crafting' }}>
      <Drum at={[-1.4,.65,-.85]} radius={.4} height={.5} color={earth}/>
      <Drum at={[-1.4,.95,-.85]} radius={.58} height={.1} color={pale}/>
      <Drum at={[-1.4,1.18,-.85]} radius={.2} height={.38} color={clay}/>
    </group>
    <Blocks blocks={[-3.4, 0.6].map(x => ({ at: [x, 1.55, 2], size: [0.23, 2.7, 0.23] }))} color={earth} />
    <Drum at={[2.6, 1, 0]} radius={1.6} height={2} color={clay} />
    <Cap at={[2.6, 2, 0]} radius={1.6} color={clay} />
    <Drum at={[2.6, 3.45, 0]} radius={0.4} height={1.8} color={clay} />
    <Drum at={[2.6, 4.35, 0]} radius={0.52} height={0.2} color={pale} />
    {[-3, .1].map(x => <group key={x}>
      <Drum at={[x, 0.6, 1.3]} radius={0.3} height={0.65} color={clay} />
      <mesh position={[x, 0.95, 1.3]} rotation={[Math.PI / 2, 0, 0]} material={materials[clay]} castShadow>
        <torusGeometry args={[0.21, 0.075, 8, 16]} />
      </mesh>
    </group>)}
  </>;
}

function TerracedGarden() {
  return <>
    {[0, 1, 2].map(i => <group key={i} position={[0, i * 0.65, -i * 1.5]}>
      <BlockMesh at={[0, 0.35, 0]} size={[7.2 - i * 0.7, 0.7, 2.5]} />
      <BlockMesh at={[0, 0.74, 0]} size={[6.7 - i * 0.7, 0.08, 2]} color={earth} />
      {[-2.2, 2.2].map(x => <mesh key={x} position={[x, 1.05, 0]} scale={[0.7, 0.45, 0.8]} geometry={foliage} material={materials[leaf]} castShadow />)}
    </group>)}
    <Blocks blocks={[-2.8, 2.8].flatMap(x => [-3.5, -0.8].map(z => ({ at: [x, 2.9, z] as Point, size: [0.22, 3.6, 0.22] as Point })))} color={earth} />
    <Blocks blocks={[-3.6, -2.9, -2.2, -1.5, -0.8].map(z => ({ at: [0, 4.7, z], size: [6.4, 0.18, 0.2] }))} color={earth} />
    <Blocks blocks={[-2.9, 2.9].map(x => ({ at: [x, 4.5, -2.2], size: [0.22, 0.25, 3.5] }))} color={earth} />
    <Blocks blocks={Array.from({ length: 5 }, (_, i) => ({ at: [0, 0.15 + i * 0.15, 1.8 - i * 0.5], size: [1.4, 0.3 + i * 0.3, 0.55] }))} color={pale} />
  </>;
}

// Centers form an outer ring; footprints leave the seven worker rooms and their lanes clear.
export const LANDMARK_PLACEMENTS = [
  { kind: 'civic-hall', position: [-23, 0, -19], radius: 5.5 },
  { kind: 'bathhouse', position: [0, 0, -27], radius: 5.5 },
  { kind: 'watchtower', position: [25, 0, -18], radius: 3.3 },
  { kind: 'market', position: [27, 0, 1], radius: 5.2 },
  { kind: 'amphitheater', position: [20, 0, 24], radius: 5.8 },
  { kind: 'aqueduct', position: [0, 0, 31], radius: 8.3 },
  { kind: 'pottery-workshop', position: [-24, 0, 19], radius: 5.5 },
  { kind: 'terraced-garden', position: [-27, 0, 0], radius: 5.2 },
] as const;
const buildings: ReactNode[] = [<CivicHall key="hall" />, <Bathhouse key="baths" />, <Watchtower key="tower" />, <Market key="market" />, <Amphitheater key="theater" />, <Aqueduct key="water" />, <PotteryWorkshop key="kiln" />, <TerracedGarden key="garden" />];

export function CityLandmarks() {
  return <group name="city-landmarks" dispose={null}>
    <group name="reading-porch" userData={{ interiorKind: 'reading' }} position={[-23,0,-19]}>
      <BlockMesh at={[0,.3,3.5]} size={[3,.6,1.4]} color={pale}/>
      <BlockMesh at={[0,1.35,2.7]} size={[2.4,.14,.6]} color={earth}/>
      {[-.5,.5].map(x=><mesh key={x} geometry={cylinder} material={materials[pale]} position={[x,1.48,2.7]} rotation={[0,0,Math.PI/2]} scale={[.1,.7,.1]}/>)}
    </group>
    <group name="garden-rest" userData={{ interiorKind: 'resting' }} position={[-31.8,0,1]}>
      <BlockMesh at={[0,.48,-.6]} size={[2,.18,.65]} color={earth}/>
      <Blocks blocks={[-.8,.8].map(x=>({at:[x,.2,-.6],size:[.15,.4,.4]}))} color={earth}/>
      <Blocks blocks={[-1,1].map(x=>({at:[x,1.6,-1.1],size:[.15,3.2,.15]}))} color={earth}/>
      <BlockMesh at={[0,3.2,-.5]} size={[2.4,.12,2]} color={leaf}/>
    </group>
    {LANDMARK_PLACEMENTS.map(({ kind, position }, i) => <group key={kind} name={`landmark:${kind}`} userData={{ buildingKind: kind }} position={[...position]}>
      {buildings[i]}
    </group>)}
  </group>;
}
