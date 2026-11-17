"use client";

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { CanvasTexture, Color, DoubleSide, MOUSE, TOUCH, Object3D, RepeatWrapping, Shape, Box3, Fog, Vector3, type Group, type InstancedMesh } from "three";
import type { Agent } from "@/lib/agents";
import { reconcileBindings } from "@/lib/agent-bindings";
import { PERSONAS, type Persona } from "@/lib/personas";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Disciple } from "./disciple";
import { CityLandmarks, LANDMARK_PLACEMENTS } from "./city-landmarks";
import { CityNpcs } from "./city-npcs";
import { ROOMS, roomFor, type Room } from "@/lib/room-choreography";

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


const StoneRelief = createContext<CanvasTexture | null>(null);
function StoneSurface({ children }: { children: React.ReactNode }) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    // Original seamless limestone micro-relief: one 128px linear-data texture,
    // shared across instanced masonry; no fetch, per-frame upload or extra draw call.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixels = context.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const grain = Math.sin(x * 2.7 + y * 7.1) * Math.sin(x * 5.3 - y * 1.9);
      const strata = Math.sin(y * Math.PI / 8 + Math.sin(x * Math.PI / 32));
      const value = Math.round(215 + grain * 22 + strata * 10);
      const offset = (y * 128 + x) * 4;
      pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = value;
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const relief = new CanvasTexture(canvas);
    relief.wrapS = relief.wrapT = RepeatWrapping;
    relief.anisotropy = 2;
    // Publish the GPU resource only after mount; the same effect owns disposal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTexture(relief);
    return () => relief.dispose();
  }, []);
  return <StoneRelief.Provider value={texture}>{children}</StoneRelief.Provider>;
}


function Block({ at, size, color = "#a47b4d", rotation = 0 }: { at: Point; size: Point; color?: string; rotation?: number }) {
  return <mesh position={at} rotation={[0, rotation, 0]} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={1} /></mesh>;
}

// All repeated stonework shares one draw call per section; no downloaded assets.
function Stones({ blocks, palette = STONE }: { blocks: { at: Point; size: Point; tint?: number }[]; palette?: string[] }) {
  const ref = useRef<InstancedMesh>(null);
  const relief = useContext(StoneRelief);
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
  return <instancedMesh ref={ref} args={[undefined, undefined, blocks.length]} castShadow receiveShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={0.94} bumpMap={relief} bumpScale={0.035} roughnessMap={relief} /></instancedMesh>;
}

// Three's camera/renderer are imperative objects, not immutable React state.
/* eslint-disable react-hooks/immutability */
function MapCamera({ action, inspectScene, paused }: { action?: CameraAction; inspectScene: boolean; paused: boolean }) {
  const { camera, gl, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const consumed = useRef<number | null>(null);
  // Logical zoom is dolly distance relative to this home view, never camera.zoom.
  const baseDistance = 58;
  const publish = useCallback(() => {
    if (!inspectScene || !controls.current) return;
    gl.domElement.dataset.mapCamera = JSON.stringify({ cameraType: camera.type,
      zoom: baseDistance / camera.position.distanceTo(controls.current.target),
      target: controls.current.target.toArray(), position: camera.position.toArray() });
  }, [inspectScene, gl, camera]);
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
      camera.position.set(16.64525283848835, 43.5, -34.56422367047748);
    } else if (action.kind === "zoom-in" || action.kind === "zoom-out") {
      const offset = camera.position.clone().sub(orbit.target);
      const distance = Math.max(2, offset.length() * (action.kind === "zoom-in" ? 0.8 : 1.25));
      camera.position.copy(orbit.target).add(offset.setLength(distance));
    } else {
      const step = Math.min(6, camera.position.distanceTo(orbit.target) * 0.12);
      const dx = action.kind === "east" ? -step : action.kind === "west" ? step : 0;
      const dz = action.kind === "north" ? step : action.kind === "south" ? -step : 0;
      orbit.target.x += dx; orbit.target.z += dz;
      camera.position.x += dx; camera.position.z += dz;
    }
    camera.updateProjectionMatrix(); orbit.update(); publish(); invalidate();
  }, [action, camera, invalidate, publish]);
  return <OrbitControls ref={controls} makeDefault target={[0, 0, 0]} enablePan enableZoom enableRotate
    mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
    touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE }}
    screenSpacePanning={false} minDistance={2} maxDistance={Infinity}
    minPolarAngle={0.05} maxPolarAngle={Math.PI / 2 - 0.06}
    enableDamping={!paused} dampingFactor={0.12} onChange={() => {
      const orbit = controls.current;
      if (orbit) {
        // No artificial map-edge or zoom-out clamp. Keep the ground and far plane
        // around the current view so navigating beyond town never exposes a slab edge.
        camera.far = Math.max(300, camera.position.distanceTo(orbit.target) * 12);
        camera.updateProjectionMatrix();
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
      if (index % 3 === 0) {
        // Set-back upper volume and roof terrace, rather than recolored boxes.
        masonry.push({ at: [x + width * 0.18, height + 0.8, z + depth * 0.14], size: [width * 0.55, 1.4, depth * 0.6], tint: 3 });
        masonry.push({ at: [x + width * 0.18, height + 1.55, z + depth * 0.14], size: [width * 0.6, 0.18, depth * 0.65], tint: 1 });
      } else if (index % 3 === 1) {
        for (const sign of [-1, 1]) masonry.push({ at: [x + sign * width * 0.46, height + 0.27, z], size: [0.18, 0.45, depth], tint: 2 });
        for (let step = 0; step < 7; step++) masonry.push({ at: [x + width / 2 + 0.5, (step + 1) * height / 14, z - depth / 2 + step * depth / 7], size: [0.85, (step + 1) * height / 7, depth / 7 + 0.02], tint: 3 });
      } else {
        for (const side of [-1, 1]) timber.push({ at: [x + side * width * 0.3, height + 0.55, z], size: [0.12, 1, depth * 0.7], tint: 0 });
        for (let beam = 0; beam < 5; beam++) timber.push({ at: [x, height + 1.1, z + (beam - 2) * depth * 0.17], size: [width * 0.8, 0.12, 0.13], tint: 2 });
      }
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
      drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles,
      treeSway: scene.getObjectByName("environment-breeze")?.rotation.z ?? 0,
      waterScale: scene.getObjectByName("environment-water")?.scale.x ?? 1 }));
  });
  useEffect(() => {
    const textures = new Set();
    const landmarks: { kind: string; size: number[]; meshes: number; volumetric: number; flat: number }[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse(object => {
      if (!object.name.startsWith("landmark:")) return;
      let meshes = 0, volumetric = 0, flat = 0;
      object.traverse(child => {
        if (!("geometry" in child)) return;
        const geometry = (child as import("three").Mesh).geometry;
        geometry.computeBoundingBox();
        const size = geometry.boundingBox?.getSize(new Vector3());
        meshes++;
        if (size && Math.min(size.x, size.y, size.z) > 0.001) volumetric++; else flat++;
      });
      landmarks.push({ kind: object.userData.buildingKind, size: new Box3().setFromObject(object).getSize(new Vector3()).toArray(), meshes, volumetric, flat });
    });
    gl.domElement.setAttribute("data-map-architecture", JSON.stringify(landmarks));
    let rooms = 0, wallHeight = 0;
    scene.traverse(object => {
      if (object.name.startsWith("work-room:")) { rooms++; wallHeight = Math.max(wallHeight, object.userData.wallHeight ?? 0); }
      if ("material" in object) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material.bumpMap) textures.add(material.bumpMap.uuid);
      }
    });
    gl.domElement.setAttribute("data-map-materials", JSON.stringify({ proceduralTextures: textures.size, rooms, wallHeight }));
    return () => { gl.domElement.removeAttribute("data-map-materials"); gl.domElement.removeAttribute("data-map-architecture"); };
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
        if (LANDMARK_PLACEMENTS.some(({ position, radius }) => Math.hypot(x - position[0], z - position[2]) < radius + 4)) continue;
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
    {[-1, 1].flatMap((side) => [-8, 0, 8, 16].map((z) => <group key={`${side}:${z}`} position={[side * 14, 0, z - 5.9]}>
      <Awning x={0} animated={animated} />
      <Block at={[0, 0.62, 5.9]} size={[2.5, 1.24, 0.75]} color="#9b7750" />
      {[-0.8, 0, 0.8].map((x) => <Amphora key={x} at={[x, 1.24, 5.9]} scale={0.48} />)}
    </group>))}

  </group>;
}

/* eslint-disable react-hooks/immutability -- Three scene is imperative GPU state. */
function ContinuousGround() {
  const ground = useRef<Group>(null);
  const { camera, controls, scene } = useThree();
  useEffect(() => {
    const previous = scene.fog;
    scene.fog = new Fog("#eee0c6", 200, 500);
    return () => { scene.fog = previous; };
  }, [scene]);
  useFrame(() => {
    if (!ground.current) return;
    const orbit = controls as ComponentRef<typeof OrbitControls> | null;
    const target = orbit?.target ?? new Vector3();
    const distance = camera.position.distanceTo(target);
    const span = Math.max(1000, distance * 20);
    // Blend into the background well before either the slab or far-plane edge.
    if (scene.fog instanceof Fog) {
      scene.fog.near = Math.max(100, distance * 3);
      scene.fog.far = Math.max(300, distance * 7);
    }
    ground.current.position.set(target.x, -0.08, target.z);
    ground.current.scale.set(span, 0.08, span);
  });
  return <group ref={ground} name="continuous-ground"><mesh receiveShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#c4ac83" roughness={1} /></mesh></group>;
}

/* eslint-enable react-hooks/immutability */

function Courtyard({ animated }: { animated: boolean }) {
  const paving = useMemo(() => Array.from({ length: 25 * 24 }, (_, i) => {
    const r = Math.floor(i / 25), c = i % 25;
    return { at: [-8.65 + c * 0.71 + (r % 2) * 0.12, -0.035 + Math.sin(i * 17) * 0.008, -7.6 + r * 0.69] as Point,
      size: [0.65 + Math.sin(i) * 0.025, 0.065, 0.62 + Math.cos(i) * 0.025] as Point, tint: i % 5 };
  }), []);
  return <group name="ancient-judean-courtyard">
    <ContinuousGround />
    <Stones blocks={paving} />
    <group position={[0, 0, 12]}>
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
    </group>
    {/* A subtle stone rosette centers the composition, not a supernatural effect. */}
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[1.12, 12]} /><meshStandardMaterial color="#e0c99a" roughness={1} /></mesh>
  </group>;
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
    <instancedMesh ref={lines} args={[undefined, undefined, 27]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial /></instancedMesh>
    <group ref={cursor} position={[-0.24, -0.205, -0.025]}><mesh><boxGeometry args={[0.012, 0.025, 0.002]} /><meshBasicMaterial color="#f3dba1" /></mesh></group>
  </group>;
}

function CodingStation({ persona, position, animated, index }: { persona: Persona; position: Point; animated: boolean; index: number }) {
  const h = persona.height;
  return <group name={`coding-station:${persona.id}`} position={position} rotation={[0, roomFor(persona.id).facing, 0]}>
    <group position={[-1, 0, 1.4]}>
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

function WorkRoom({ room, index }: { room: Room; index: number }) {
  const side = Math.sign(room.center[2]);
  const walls = useMemo(() => {
    const blocks: { at: Point; size: Point; tint: number }[] = [];
    const course = (x: number, z: number, width: number, depth: number, rows: number) => {
      const alongX = width > depth;
      const count = Math.ceil(Math.max(width, depth) / 0.7);
      for (let row = 0; row < rows; row++) for (let col = 0; col < count; col++) {
        const offset = ((col + 0.5) / count - 0.5) * (alongX ? width : depth);
        blocks.push({ at: [x + (alongX ? offset : 0), 0.19 + row * 0.38, z + (alongX ? 0 : offset)],
          size: [alongX ? width / count - 0.018 : width, 0.36, alongX ? depth : depth / count - 0.018],
          tint: (row * 3 + col + index) % STONE.length });
      }
    };
    course(0, side * 2.5, 5.7, 0.28, 5);
    for (const direction of [-1, 1]) {
      course(direction * 2.8, 0, 0.26, 5, 4);
      course(direction * 1.85, -side * 2.5, 1.9, 0.28, 3);
    }
    return blocks;
  }, [side, index]);
  return <group position={room.center} name={`work-room:${room.id}`} userData={{ title: room.title, wallHeight: 1.9 }}>
    <Block at={[0, 0.005, 0]} size={[5.6, 0.07, 5]} color={room.tint} />
    {/* Open roofs and stepped-height walls keep rooms readable from both orbit sides.
        Masonry stops at the original 1.8m doorway: circulation is unchanged. */}
    <Stones blocks={walls} />
    <Block at={[0, 1.94, side * 2.5]} size={[5.82, 0.1, 0.36]} color="#bca783" />
    {[-1, 1].map(s => <group key={s}>
      <Block at={[s * 2.8, 1.56, 0]} size={[0.34, 0.1, 5]} color="#c4b08c" />
      <Block at={[s * 0.99, 0.8, -side * 2.5]} size={[0.18, 1.6, 0.38]} color="#bca27b" />
    </group>)}
    <Block at={[0, 0.04, -side * 2.5]} size={[1.8, 0.06, 0.5]} color="#e6d6b5" />
    {/* Role-specific fixed work objects: council map, plans, code, review tiles, specimens, planning board, scrolls. */}
    <group position={[-1.9, 0, side * 1.25]}>
      <Block at={[0, 0.62, 0]} size={[1.05, 0.12, 0.8]} color="#94734b" />
      {[-0.4, 0.4].map(x => <Block key={x} at={[x, 0.3, 0]} size={[0.1, 0.6, 0.65]} color="#785a3d" />)}
      {index === 4 ? <Amphora at={[0, 0.68, 0]} scale={0.7} /> : index === 6 ?
        [-0.3, 0, 0.3].map(x => <mesh key={x} position={[x, 0.77, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.1, 0.1, 0.55, 8]} /><meshStandardMaterial color="#ead6ab" roughness={1} /></mesh>) :
        <><Block at={[0, 0.7, 0]} size={[0.9, 0.025, 0.66]} color="#eadbb9" />
        {Array.from({ length: index === 3 ? 6 : 3 }, (_, i) => <Block key={i} at={[-0.3+(i%3)*0.28, 0.76, -0.2+Math.floor(i/3)*0.28]} size={[0.17, index === 1 ? 0.2 : 0.06, 0.16]} color={index === 3 ? '#8b6550' : '#8c9c8e'} />)}</>}
    </group>
    <Amphora at={[2.25, 0, side * 1.75]} scale={0.65} />
  </group>;
}

// Stable slots represent observed runtime workers; room routing is a visual interpretation.
export default function OfficeScene({ agents, selected, onSelect, cameraAction, inspectScene: inspectOverride }: Props) {
  const [bindingState, setBindingState] = useState(() => ({ agents, bindings: reconcileBindings({}, agents, PERSONAS.map(p => p.id)) }));
  let bindings = bindingState.bindings;
  if (bindingState.agents !== agents) {
    bindings = reconcileBindings(bindings, agents, PERSONAS.map(p => p.id));
    setBindingState({ agents, bindings });
  }
  const [inspectScene] = useState(() => inspectOverride ?? new URLSearchParams(window.location.search).get('inspectScene') === '1');
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const paused = reducedMotion || !visible;
  return <Canvas shadows dpr={[1, 1.5]} frameloop={paused ? "demand" : "always"}
    camera={{ position: [16.64525283848835, 43.5, -34.56422367047748], fov: 48, near: 0.1, far: 700 }}
    gl={{ antialias: true, powerPreference: "low-power" }} onPointerMissed={() => onSelect(null)}
    aria-label="Jesus Office: decorative NPC citizens are separate from seven visual slots for observed live workers. NPC movement is not AI task activity.">
    <color attach="background" args={["#eee0c6"]} />
    <hemisphereLight args={["#e8f0ef", "#97836a", 1.35]} />
    <directionalLight position={[12, 9, 10]} color="#dce8f3" intensity={0.65} />
    <directionalLight position={[-9, 18, -12]} color="#ffe3b8" intensity={2.7} castShadow shadow-mapSize={[1024, 1024]}
      shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={17} shadow-camera-bottom={-17}
      shadow-camera-near={0.1} shadow-camera-far={50} shadow-normalBias={0.04} shadow-bias={-0.0002} />
    <StoneSurface>
    <Courtyard animated={!paused} />
    <CityDistricts animated={!paused} />
    <CityLandmarks />
    <CityNpcs paused={paused} inspectScene={inspectScene} />
    <Block at={[0, -0.005, 0]} size={[25, 0.04, 2.5]} color="#ddc8a3" />
    {ROOMS.map((room, index) => <WorkRoom key={room.id} room={room} index={index} />)}
    {PERSONAS.map((persona, index) => {
      const boundAgent = agents.find(agent => agent.id === bindings[persona.id]);
      return <group key={persona.id}>
      <CodingStation persona={persona} position={roomFor(persona.id).home} animated={false} index={index} />
      <Disciple persona={persona} agent={boundAgent} position={roomFor(persona.id).home} rotation={0}
        selected={selected === persona.id} reducedMotion={paused} onSelect={onSelect} />
    </group>; })}
    </StoneSurface>
    <MapCamera action={cameraAction} inspectScene={inspectScene} paused={paused} />
    {inspectScene && <EnvironmentProbe paused={paused} />}
  </Canvas>;
}
