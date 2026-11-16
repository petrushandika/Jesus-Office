"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Color, DoubleSide, MOUSE, Object3D, Shape, type Group, type InstancedMesh } from "three";
import type { Agent } from "@/lib/agents";
import { PERSONAS, type Persona } from "@/lib/personas";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Disciple } from "./disciple";
import { poseAt } from "@/lib/choreography";

export type CameraAction = { kind: "zoom-in" | "zoom-out" | "reset" | "north" | "south" | "east" | "west"; serial: number };
export type Props = {
  agents: Agent[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  cameraAction?: CameraAction;
  inspectScene?: boolean;
};
const MAP_WORLD = { minX: -45, maxX: 45, minZ: -35, maxZ: 35 };
type Point = [number, number, number];
const STONE = ["#cbb994", "#deceb0", "#d4c19f", "#e3d4b5", "#c6b18d"];
// 4 / 5 / 4, with Jesus at the exact center. Origins are seated positions.
const STATIONS: Point[] = [[0, 0, 0], [-3.75, 0, 3.8], [-1.25, 0, 3.8], [1.25, 0, 3.8], [3.75, 0, 3.8], [-5, 0, 0], [-2.5, 0, 0], [2.5, 0, 0], [5, 0, 0], [-3.75, 0, -3.8], [-1.25, 0, -3.8], [1.25, 0, -3.8], [3.75, 0, -3.8]];

function Block({ at, size, color = "#a47b4d", rotation = 0 }: { at: Point; size: Point; color?: string; rotation?: number }) {
  return <mesh position={at} rotation={[0, rotation, 0]} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={1} /></mesh>;
}

// All repeated stonework shares one draw call per section; no downloaded assets.
function Stones({ blocks, palette = STONE }: { blocks: { at: Point; size: Point; tint?: number }[]; palette?: string[] }) {
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const dummy = new Object3D();
    blocks.forEach(({ at, size, tint }, i) => {
      dummy.position.set(...at); dummy.scale.set(...size); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      ref.current!.setColorAt(i, new Color(palette[tint ?? i % palette.length]));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [blocks, palette]);
  return <instancedMesh ref={ref} args={[undefined, undefined, blocks.length]} castShadow receiveShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={1} /></instancedMesh>;
}

// Three's camera/renderer are imperative objects, not immutable React state.
/* eslint-disable react-hooks/immutability */
function MapCamera({ action, inspectScene, paused }: { action?: CameraAction; inspectScene: boolean; paused: boolean }) {
  const { camera, size, gl, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const consumed = useRef<number | null>(null);
  // Fill portrait as well as wide viewports instead of fitting a boxed stage.
  const baseZoom = Math.max(size.width / 34, size.height / 34);
  const previousZoom = useRef<number | null>(null);
  const publish = useCallback(() => {
    if (!inspectScene || !controls.current) return;
    gl.domElement.dataset.mapCamera = JSON.stringify({ zoom: camera.zoom, target: controls.current.target.toArray(), position: camera.position.toArray() });
  }, [inspectScene, gl, camera]);
  useEffect(() => {
    camera.zoom = previousZoom.current === null ? baseZoom : camera.zoom * baseZoom / previousZoom.current;
    previousZoom.current = baseZoom;
    camera.updateProjectionMatrix();
    publish(); invalidate();
  }, [baseZoom, camera, invalidate, publish]);
  useEffect(() => {
    if (!inspectScene) return;
    gl.domElement.dataset.mapWorld = JSON.stringify(MAP_WORLD);
    publish();
    return () => {
      delete gl.domElement.dataset.mapCamera;
      delete gl.domElement.dataset.mapWorld;
    };
  }, [inspectScene, gl, publish]);
  useEffect(() => {
    const orbit = controls.current;
    if (!action || !orbit || consumed.current === action.serial) return;
    consumed.current = action.serial;
    if (action.kind === "reset") {
      orbit.target.set(0, 0, 0);
      camera.position.set(0, 26, -32);
      camera.zoom = baseZoom;
    } else if (action.kind === "zoom-in" || action.kind === "zoom-out") {
      camera.zoom = Math.max(baseZoom * 0.85, Math.min(baseZoom * 3.5, camera.zoom * (action.kind === "zoom-in" ? 1.25 : 0.8)));
    } else {
      const step = Math.min(6, size.height / camera.zoom * 0.18);
      const dx = action.kind === "east" ? -step : action.kind === "west" ? step : 0;
      const dz = action.kind === "north" ? step : action.kind === "south" ? -step : 0;
      orbit.target.x += dx; orbit.target.z += dz;
      camera.position.x += dx; camera.position.z += dz;
    }
    camera.updateProjectionMatrix(); orbit.update(); publish(); invalidate();
  }, [action, baseZoom, camera, invalidate, size.height, publish]);
  return <OrbitControls ref={controls} makeDefault target={[0, 0, 0]} enablePan enableZoom
    enableRotate={false} mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }} screenSpacePanning={false} minZoom={baseZoom * 0.85} maxZoom={baseZoom * 3.5}
    enableDamping={!paused} dampingFactor={0.12} onChange={() => {
      const orbit = controls.current;
      if (orbit) {
        // Keep the navigable map inside the continuous terrain, not the old courtyard box.
        const limitX = Math.max(0, Math.min(22, MAP_WORLD.maxX - size.width / camera.zoom / 2 - 1));
        const groundPitch = 26 / Math.hypot(26, 32);
        const limitZ = Math.max(0, Math.min(16, MAP_WORLD.maxZ - size.height / camera.zoom / groundPitch / 2 - 1));
        const x = Math.max(-limitX, Math.min(limitX, orbit.target.x));
        const z = Math.max(-limitZ, Math.min(limitZ, orbit.target.z));
        camera.position.x += x - orbit.target.x; camera.position.z += z - orbit.target.z;
        orbit.target.x = x; orbit.target.z = z;
      }
      publish();
    }} />;
}

/* eslint-enable react-hooks/immutability */

function Amphora({ at, scale = 1 }: { at: Point; scale?: number }) {
  return <group position={at} scale={scale}>
    <mesh position={[0, 0.33, 0]} castShadow><sphereGeometry args={[0.28, 9, 7]} /><meshStandardMaterial color="#ac6748" flatShading roughness={1} /></mesh>
    <mesh position={[0, 0.58, 0]} castShadow><cylinderGeometry args={[0.11, 0.16, 0.25, 9]} /><meshStandardMaterial color="#b97753" roughness={1} /></mesh>
    <mesh position={[0, 0.715, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.105, 0.025, 5, 9]} /><meshStandardMaterial color="#d09168" roughness={1} /></mesh>
    <mesh position={[0, 0.713, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.082, 9]} /><meshStandardMaterial color="#49372b" roughness={1} /></mesh>
    {[-1, 1].map((s) => <mesh key={s} position={[s * 0.23, 0.51, 0]}><torusGeometry args={[0.12, 0.035, 5, 8]} /><meshStandardMaterial color="#a65f40" roughness={1} /></mesh>)}
  </group>;
}

function Breeze({ animated, phase = 0, water = false, children }: { animated: boolean; phase?: number; water?: boolean; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  const elapsed = useRef(phase);
  useFrame((_, delta) => {
    if (!animated || document.hidden || !ref.current) return;
    elapsed.current += Math.min(delta, 0.1);
    if (water) {
      const scale = 1 + Math.sin(elapsed.current * 0.9) * 0.06;
      ref.current.scale.set(scale, 1, scale);
    } else {
      ref.current.rotation.z = Math.sin(elapsed.current * 0.8) * 0.012;
      ref.current.rotation.x = Math.sin(elapsed.current * 0.55) * 0.008;
    }
  });
  return <group ref={ref} name={water ? "environment-water" : "environment-breeze"}>{children}</group>;
}

function Olive({ at, animated }: { at: Point; animated: boolean }) {
  return <group position={at}><Breeze animated={animated} phase={at[0] + at[2]}>
    <mesh position={[0, 1, 0]} rotation={[0, 0, 0.13]} castShadow><cylinderGeometry args={[0.075, 0.14, 2, 7]} /><meshStandardMaterial color="#77654c" roughness={1} /></mesh>
    {[-1, 1].map((s) => <group key={s} position={[s * 0.35, 1.65, 0]} rotation={[0, s, s * -0.5]}>
      <mesh castShadow><cylinderGeometry args={[0.035, 0.07, 1.1, 6]} /><meshStandardMaterial color="#77654c" roughness={1} /></mesh>
      <mesh position={[0, 0.5, 0]} scale={[0.65, 0.7, 0.5]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={s === 1 ? "#7c8860" : "#96a078"} roughness={1} flatShading /></mesh>
    </group>)}
  </Breeze></group>;
}

function House({ x, z, width, height, depth }: { x: number; z: number; width: number; height: number; depth: number }) {
  const blocks = useMemo(() => {
    const result: { at: Point; size: Point }[] = [];
    const rows = Math.ceil(height / 0.38), cols = Math.ceil(width / 0.7);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      result.push({ at: [-width / 2 + (c + 0.5) * width / cols, (r + 0.5) * height / rows, 0], size: [width / cols - 0.025, height / rows - 0.025, depth] });
    }
    return result;
  }, [width, height, depth]);
  return <group position={[x, 0, z]}>
    <Stones blocks={blocks} />
    <Block at={[0, height + 0.07, 0]} size={[width + 0.18, 0.17, depth + 0.18]} color="#a68d65" />
    {/* Roof beams project from the earthen flat roof; openings have timber, not glass. */}
    {[-0.35, 0.35].map((s) => <Block key={s} at={[s * width, height - 0.07, -depth / 2 - 0.12]} size={[0.13, 0.13, 0.45]} color="#69543a" />)}
    <Block at={[-width * 0.18, 0.89, -depth / 2 - 0.035]} size={[0.82, 1.78, 0.085]} color="#453a2b" />
    {Array.from({ length: 5 }, (_, i) => <Block key={i} at={[-width * 0.18 - 0.32 + i * 0.16, 0.88, -depth / 2 - 0.09]} size={[0.145, 1.71, 0.055]} color={i % 2 ? "#796041" : "#866a47"} />)}
    {[0.39, 1.35].map((y) => <Block key={y} at={[-width * 0.18, y, -depth / 2 - 0.13]} size={[0.78, 0.08, 0.05]} color="#56442f" />)}
    {height > 2.2 && <group position={[width * 0.24, height * 0.64, -depth / 2 - 0.065]}>
      <Block at={[0, 0, 0]} size={[0.82, 0.83, 0.1]} color="#514431" />
      {[-0.22, 0.22].map((s) => <group key={s} rotation={[0, s * 0.7, 0]} position={[s, 0, -0.12]}>
        <Block at={[0, 0, 0]} size={[0.36, 0.8, 0.075]} color="#8a714c" />
        {[-0.23, 0.23].map((y) => <Block key={y} at={[0, y, -0.05]} size={[0.35, 0.055, 0.04]} color="#5d4a34" />)}
      </group>)}
      <Block at={[0, -0.46, -0.05]} size={[1, 0.12, 0.3]} color="#c2ac84" />
    </group>}
  </group>;
}

function Gateway() {
  const arch = useMemo(() => {
    const s = new Shape();
    s.moveTo(-1.65, 0); s.lineTo(-1.65, 1.85); s.absarc(0, 1.85, 1.65, Math.PI, 0, true);
    s.lineTo(1.65, 0); s.lineTo(1.22, 0); s.lineTo(1.22, 1.85);
    s.absarc(0, 1.85, 1.22, 0, Math.PI, false); s.lineTo(-1.22, 0); s.closePath();
    return s;
  }, []);
  return <group position={[0, 0, 7]} name="rounded-stone-gateway">
    <mesh castShadow receiveShadow><extrudeGeometry args={[arch, { depth: 0.7, bevelEnabled: false, curveSegments: 14 }]} /><meshStandardMaterial color="#d5c3a0" roughness={1} /></mesh>
    {Array.from({ length: 11 }, (_, i) => {
      const a = (i + 0.5) * Math.PI / 11;
      return <group key={i} position={[Math.cos(a) * 1.45, 1.85 + Math.sin(a) * 1.45, -0.025]} rotation={[0, 0, a - Math.PI / 2]}>
        <Block at={[0, 0, 0]} size={[0.35, 0.42, 0.78]} color={STONE[i % 5]} />
      </group>;
    })}
    {[-1, 1].map((s) => <group key={s}>{Array.from({ length: 5 }, (_, i) => <Block key={i} at={[s * 1.44, 0.18 + i * 0.37, -0.025]} size={[0.43, 0.34, 0.78]} color={STONE[i % 5]} />)}</group>)}
    {/* Actual empty passage, with a recessed earthen lane behind it. */}
    <Block at={[0, -0.01, 1]} size={[2.42, 0.04, 2]} color="#baa480" />
  </group>;
}

function Awning({ x, animated }: { x: number; animated: boolean }) {
  return <group position={[x, 0, 5.9]}>
    {[-1, 1].map((s) => <Block key={s} at={[s * 1.35, 1.16, -0.5]} size={[0.075, 2.32, 0.075]} color="#73583b" />)}
    <Block at={[0, 2.33, -0.5]} size={[2.85, 0.09, 0.09]} color="#73583b" />
    <Breeze animated={animated} phase={x}>{Array.from({ length: 14 }, (_, i) => <mesh key={i} position={[-1.3 + i * 0.2, 2.49 + Math.sin(i * 0.9) * 0.018, 0.02]} rotation={[-0.22, 0, 0]} castShadow>
      <boxGeometry args={[0.205, 0.035, 1.25]} /><meshStandardMaterial color={i % 4 === 0 ? "#967b58" : "#c8b38a"} roughness={1} side={DoubleSide} />
    </mesh>)}</Breeze>
  </group>;
}

function Well({ animated }: { animated: boolean }) {
  const blocks = useMemo(() => Array.from({ length: 36 }, (_, i) => {
    const a = (i % 12) * Math.PI / 6 + Math.floor(i / 12) * 0.13;
    return { at: [Math.cos(a) * 0.56, 0.14 + Math.floor(i / 12) * 0.25, Math.sin(a) * 0.56] as Point, size: [0.29, 0.23, 0.28] as Point };
  }), []);
  return <group position={[-7, 0, -0.8]} name="courtyard-well">
    <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.55, 16]} /><meshStandardMaterial color="#393d31" roughness={1} /></mesh>
    <Breeze animated={animated} water>
      {[0.22, 0.4].map((radius) => <mesh key={radius} position={[0, 0.125, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[radius, radius + 0.018, 24]} /><meshStandardMaterial color="#8eaaa0" transparent opacity={0.55} roughness={0.3} /></mesh>)}
    </Breeze>
    <Stones blocks={blocks} />
    {[-0.8, 0.8].map((x) => <Block key={x} at={[x, 1.1, 0]} size={[0.12, 2.2, 0.12]} color="#756044" />)}
    <Block at={[0, 2.15, 0]} size={[1.85, 0.15, 0.15]} color="#655037" />
    <mesh position={[0, 1.43, 0]}><cylinderGeometry args={[0.017, 0.017, 1.35, 5]} /><meshStandardMaterial color="#a38959" roughness={1} /></mesh>
    <Amphora at={[0.92, 0, 0.3]} scale={0.7} />
  </group>;
}

const TIMBER = ["#69543a", "#453a2b", "#866a47"];
function OuterHomes({ homes }: { homes: { x: number; z: number; width: number; height: number; depth: number }[] }) {
  const { masonry, timber } = useMemo(() => {
    const masonry: { at: Point; size: Point; tint?: number }[] = [];
    const timber: { at: Point; size: Point; tint?: number }[] = [];
    homes.forEach(({ x, z, width, height, depth }, index) => {
      const rows = Math.ceil(height / 0.45);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < 5; col++) masonry.push({
          at: [x - width / 2 + (col + 0.5) * width / 5, (row + 0.5) * height / rows, z],
          size: [width / 5 - 0.025, height / rows - 0.025, depth], tint: (index + row + col) % 5,
        });
      }
      masonry.push({ at: [x, height + 0.08, z], size: [width + 0.2, 0.16, depth + 0.2], tint: 0 });
      for (const face of [-1, 1]) {
        timber.push({ at: [x - width * 0.2, 0.85, z + face * (depth / 2 + 0.035)], size: [0.8, 1.7, 0.07], tint: 1 });
        timber.push({ at: [x + width * 0.25, height * 0.67, z + face * (depth / 2 + 0.04)], size: [0.65, 0.65, 0.08], tint: 1 });
        for (const offset of [-0.3, 0.3]) timber.push({ at: [x + width * offset, height - 0.1, z + face * (depth / 2 + 0.1)], size: [0.13, 0.13, 0.4], tint: 0 });
      }
    });
    return { masonry, timber };
  }, [homes]);
  return <group name="instanced-city-homes"><Stones blocks={masonry} /><Stones blocks={timber} palette={TIMBER} /></group>;
}

function EnvironmentProbe({ paused }: { paused: boolean }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    if (!paused && !document.hidden) elapsed.current += Math.min(delta, 0.1);
    gl.domElement.setAttribute("data-map-environment", JSON.stringify({ elapsed: elapsed.current, paused,
      treeSway: scene.getObjectByName("environment-breeze")?.rotation.z ?? 0,
      waterScale: scene.getObjectByName("environment-water")?.scale.x ?? 1 }));
  });
  useEffect(() => () => gl.domElement.removeAttribute("data-map-environment"), [gl]);
  return null;
}

function CityDistricts({ animated }: { animated: boolean }) {
  const streets = useMemo(() => {
    const blocks: { at: Point; size: Point; tint: number }[] = [];
    // Continuous lanes extend beyond the central paving in all four directions.
    for (const x of [-21, -11, 0, 11, 21]) {
      for (let z = -32; z <= 32; z += 1.4) {
        if (Math.abs(x) < 9 && Math.abs(z) < 8.5) continue;
        blocks.push({ at: [x, -0.025, z], size: [2.8, 0.035, 1.32], tint: 1 });
      }
    }
    for (const z of [-22, -11, 11, 22]) {
      for (let x = -39; x <= 39; x += 1.4) {
        if ([-21, -11, 0, 11, 21].some((lane) => Math.abs(x - lane) < 2)) continue;
        blocks.push({ at: [x, -0.024, z], size: [1.32, 0.035, 2.6], tint: 2 });
      }
    }
    return blocks;
  }, []);
  const homes = useMemo(() => {
    const result: { x: number; z: number; width: number; depth: number; height: number }[] = [];
    for (const z of [-27, -17, -6, 5, 16, 27]) {
      for (const x of [-28, -16, -5, 5, 16, 28]) {
        if (Math.abs(z) < 12 && Math.abs(x) < 12) continue;
        // The near-side homes stay low so the character courtyard remains readable.
        result.push({ x: x + Math.sin(z + x) * 0.6, z, width: 3.4 + Math.abs(Math.sin(x)) * 1.4,
          depth: 3 + Math.abs(Math.cos(z)) * 1.3, height: z < 0 ? 1.8 + Math.abs(Math.sin(x + z)) * 0.8 : 2.5 + Math.abs(Math.sin(x + z)) * 1.8 });
      }
    }
    return result;
  }, []);
  return <group name="ancient-city-neighborhoods">
    <Stones blocks={streets} />
    <OuterHomes homes={homes} />
    {/* Olive orchards follow the outer lanes; the central workspace stays open. */}
    {[-1, 1].flatMap((side) => Array.from({ length: 12 }, (_, i) => <Olive key={`${side}:${i}`}
      at={[side * (33 + (i % 2) * 4), 0, -25 + Math.floor(i / 2) * 9]} animated={animated} />))}
    {[-1, 1].flatMap((side) => [-8, 0, 8, 16].map((z) => <group key={`${side}:${z}`} position={[side * 11, 0, z - 5.9]}>
      <Awning x={0} animated={animated} />
      <Block at={[0, 0.62, 5.9]} size={[2.5, 1.24, 0.75]} color="#9b7750" />
      {[-0.8, 0, 0.8].map((x) => <Amphora key={x} at={[x, 1.24, 5.9]} scale={0.48} />)}
    </group>))}
    {/* Low garden beds give the city a cultivated edge without sealing it in walls. */}
    {[-1, 1].map((side) => <group key={side}>
      <Block at={[side * 27, -0.015, 0]} size={[4.5, 0.06, 7]} color="#9e9e71" />
      {[-2, 0, 2].map((z) => <Block key={z} at={[side * 27, 0.035, z]} size={[3.8, 0.08, 0.4]} color="#7d875b" />)}
    </group>)}
  </group>;
}

function Courtyard({ animated }: { animated: boolean }) {
  const paving = useMemo(() => Array.from({ length: 25 * 24 }, (_, i) => {
    const r = Math.floor(i / 25), c = i % 25;
    return { at: [-8.65 + c * 0.71 + (r % 2) * 0.12, -0.035 + Math.sin(i * 17) * 0.008, -7.6 + r * 0.69] as Point,
      size: [0.65 + Math.sin(i) * 0.025, 0.065, 0.62 + Math.cos(i) * 0.025] as Point, tint: i % 5 };
  }), []);
  return <group name="ancient-judean-courtyard">
    <Block at={[0, -0.18, 0]} size={[90, 0.28, 70]} color="#c4ac83" />
    <Stones blocks={paving} />
    <House x={-4.65} z={7.3} width={5.8} height={3.15} depth={2.4} />
    <House x={4.65} z={7.3} width={5.8} height={3.65} depth={2.4} />
    <Gateway />
    {/* Low peripheral houses leave the central 12 m completely unobstructed. */}
    <House x={-8.1} z={3.55} width={1.65} height={1.65} depth={4.8} />
    <House x={8.1} z={3.55} width={1.65} height={1.85} depth={4.8} />
    <Awning x={-4.7} animated={animated} /><Awning x={4.7} animated={animated} />
    {Array.from({ length: 6 }, (_, i) => <Block key={i} at={[6.9, (i + 1) * 0.15, 5.25 + i * 0.25]} size={[0.75, (i + 1) * 0.3, 0.3]} color={STONE[i % 5]} />)}
    <Olive at={[-7.1, 0, -5.8]} animated={animated} /><Olive at={[7.1, 0, -5.7]} animated={animated} />
    <Amphora at={[6.4, 0, 5.8]} /><Amphora at={[-6.3, 0, 5.7]} scale={0.85} /><Amphora at={[7.2, 0, 0.4]} scale={1.1} />
    <Well animated={animated} />
    {/* A subtle stone rosette centers the composition, not a supernatural effect. */}
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[1.12, 12]} /><meshStandardMaterial color="#e0c99a" roughness={1} /></mesh>
  </group>;
}

// A tiny in-mesh bitmap label, not a font/texture request. It says DEMO, never a worker status.
const DEMO = ["110011101010111", "101010001110101", "101011001110101", "101010001010101", "110011101010111"];
function DemoLabel() {
  return <group position={[0.34, 0.215, -0.021]} rotation={[0, Math.PI, 0]}>{DEMO.flatMap((row, y) => [...row].map((v, x) => v === "1" ? <mesh key={`${x}:${y}`} position={[x * 0.012, -y * 0.012, 0]}><planeGeometry args={[0.009, 0.009]} /><meshBasicMaterial color="#efcf87" side={DoubleSide} /></mesh> : null))}</group>;
}

function CodeScreen({ animated, phase }: { animated: boolean; phase: number }) {
  const lines = useRef<InstancedMesh>(null);
  const cursor = useRef<Group>(null);
  const elapsed = useRef(phase);
  const lastTick = useRef(-1);
  const draw = (tick: number) => {
    if (!lines.current) return;
    const dummy = new Object3D();
    for (let i = 0; i < 27; i++) {
      const row = Math.floor(i / 3), token = i % 3;
      const width = 0.045 + ((row * 7 + token * 3 + tick) % 8) * 0.011;
      dummy.position.set(-0.25 + token * 0.17 + (row % 3) * 0.012, 0.12 - row * 0.035, -0.024);
      dummy.scale.set(width, 0.012, 0.002); dummy.updateMatrix();
      lines.current.setMatrixAt(i, dummy.matrix);
      lines.current.setColorAt(i, new Color(["#b8d9aa", "#e7bd7d", "#8fc7d3"][token]));
    }
    lines.current.instanceMatrix.needsUpdate = true;
    if (lines.current.instanceColor) lines.current.instanceColor.needsUpdate = true;
  };
  useEffect(() => { draw(0); }, []);
  useFrame((_, delta) => {
    if (!animated) return;
    elapsed.current += Math.min(delta, 0.1);
    const tick = Math.floor(elapsed.current * 2);
    if (tick !== lastTick.current) { draw(tick); lastTick.current = tick; }
    if (cursor.current) cursor.current.visible = Math.floor(elapsed.current * 2) % 2 === 0;
  });
  return <group>
    <mesh><boxGeometry args={[0.89, 0.59, 0.035]} /><meshStandardMaterial color="#4c514a" roughness={0.8} /></mesh>
    <mesh position={[0, 0, -0.019]} rotation={[0, Math.PI, 0]}><planeGeometry args={[0.81, 0.51]} /><meshBasicMaterial color="#233832" /></mesh>
    <DemoLabel />
    <instancedMesh ref={lines} args={[undefined, undefined, 27]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial /></instancedMesh>
    <group ref={cursor} position={[-0.24, -0.205, -0.025]}><mesh><boxGeometry args={[0.012, 0.025, 0.002]} /><meshBasicMaterial color="#f3dba1" /></mesh></group>
  </group>;
}

function CodingStation({ persona, position, animated, index }: { persona: Persona; position: Point; animated: boolean; index: number }) {
  const h = persona.height;
  const bench = useRef<Group>(null);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    if (document.hidden) return;
    if (animated) elapsed.current += Math.min(delta, 0.1);
    const pose = animated ? poseAt(elapsed.current, index * 1.7 + 5) : poseAt(4);
    // Pull the stool from the side only after arrival: keep the walking lane clear.
    if (bench.current) bench.current.position.x = 0.96 * (1 - pose.sit);
  });
  return <group name={`coding-station:${persona.id}`} position={position}>
    <group ref={bench}>
      <Block at={[0, 0.52, -0.035]} size={[0.82, 0.1, 0.34]} color="#947044" />
      {[-0.29, 0.29].map((x) => <Block key={x} at={[x, 0.25, -0.035]} size={[0.1, 0.5, 0.25]} color="#745337" />)}
    </group>
    {[0, 1, 2].map((i) => <Block key={i} at={[0, h - 0.055, 0.45 + i * 0.2]} size={[1.15, 0.11, 0.192]} color={i === 1 ? "#a37d4d" : "#ad8755"} />)}
    {[-0.49, 0.49].flatMap((x) => [0.43, 0.87].map((z) => <Block key={`${x}:${z}`} at={[x, (h - 0.11) / 2, z]} size={[0.075, h - 0.11, 0.075]} color="#795838" />))}
    <Block at={[0, 1.025 * h, 0.63]} size={[0.88, 0.045, 0.43]} color="#62695e" />
    {/* Small key rows remain discernible, but carry no fabricated task output. */}
    {[0, 1, 2, 3].map((r) => <Block key={r} at={[0, 1.05 * h, 0.5 + r * 0.065]} size={[0.68, 0.008, 0.025]} color="#a9ae96" />)}
    <group position={[0, h + 0.32, 0.9]} rotation={[0.18, 0, 0]}><CodeScreen animated={animated} phase={index * 1.7} /></group>
  </group>;
}

// Artistic coding is explicitly DEMO scenery, independent of the real agents prop.
export default function OfficeScene({ selected, onSelect, cameraAction, inspectScene: inspectOverride }: Props) {
  const [inspectScene] = useState(() => inspectOverride ?? new URLSearchParams(window.location.search).get('inspectScene') === '1');
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const paused = reducedMotion || !visible;
  return <Canvas orthographic shadows dpr={[1, 1.5]} frameloop={paused ? "demand" : "always"}
    camera={{ position: [0, 26, -32], zoom: 35, near: 0.1, far: 180 }}
    gl={{ antialias: true, powerPreference: "low-power" }} onPointerMissed={() => onSelect(null)}
    aria-label="Ancient Judean city courtyard inspired by Nazareth and Jerusalem, with 13 characters: Jesus and twelve disciples. Laptop coding is an animated demo, not live agent work.">
    <color attach="background" args={["#eee0c6"]} />
    <hemisphereLight args={["#fff2d6", "#a7a27d", 2.1]} />
    <directionalLight position={[-7, 14, -8]} color="#ffe2ac" intensity={2.5} castShadow shadow-mapSize={[1024, 1024]}
      shadow-camera-left={-13} shadow-camera-right={13} shadow-camera-top={14} shadow-camera-bottom={-12}
      shadow-camera-near={0.1} shadow-camera-far={50} shadow-normalBias={0.04} shadow-bias={-0.0002} />
    <Courtyard animated={!paused} />
    <CityDistricts animated={!paused} />
    {PERSONAS.map((persona, index) => <group key={persona.id}>
      <CodingStation persona={persona} position={STATIONS[index]} animated={!paused} index={index} />
      <Disciple persona={persona} position={STATIONS[index]} rotation={0} phaseOffset={index * 1.7 + 5}
        selected={selected === persona.id} reducedMotion={paused} onSelect={onSelect} />
    </group>)}
    <MapCamera action={cameraAction} inspectScene={inspectScene} paused={paused} />
    {inspectScene && <EnvironmentProbe paused={paused} />}
  </Canvas>;
}
