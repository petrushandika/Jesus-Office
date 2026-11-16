"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, RoundedBox } from "@react-three/drei";
import { Shape } from "three";
import type { Agent } from "@/lib/agents";
import { PERSONAS } from "@/lib/personas";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Disciple } from "./disciple";

type Props = { agents: Agent[]; selected: string | null; onSelect: (id: string | null) => void };

function ResponsiveCamera() {
  const size = useThree((state) => state.size);
  // Fit the entire architectural stage, not just the selected character.
  return <OrthographicCamera makeDefault position={[0, 12, 19]} near={0.1} far={80}
    zoom={Math.min(size.width / 16.8, size.height / 12.2)} />;
}

function Olive({ x, z }: { x: number; z: number }) {
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.27, 0]} castShadow>
      <cylinderGeometry args={[0.33, 0.23, 0.54, 16]} />
      <meshStandardMaterial color="#b37856" roughness={1} />
    </mesh>
    <mesh position={[0, 1.05, 0]} rotation={[0, 0, -0.12]} castShadow>
      <cylinderGeometry args={[0.035, 0.065, 1.6, 7]} />
      <meshStandardMaterial color="#756144" roughness={1} />
    </mesh>
    {[-1, 1].map((side) => <group key={side} position={[side * 0.19, 1.5, 0]} rotation={[0.2, side, side * -0.4]}>
      <mesh scale={[0.42, 0.62, 0.33]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={side === 1 ? "#788467" : "#929d7a"} roughness={1} flatShading /></mesh>
      <mesh position={[side * 0.23, 0.35, 0]} scale={[0.3, 0.42, 0.26]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#8d9673" roughness={1} flatShading /></mesh>
    </group>)}
  </group>;
}

function StudioTable({ x }: { x: number }) {
  return <group position={[x, 0, 0.35]}>
    <RoundedBox args={[2.5, 0.12, 1.15]} radius={0.1} smoothness={3} position={[0, 0.86, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#b7885b" roughness={0.74} />
    </RoundedBox>
    {[-0.85, 0.85].map((offset) => <mesh key={offset} position={[offset, 0.41, 0]} castShadow>
      <boxGeometry args={[0.12, 0.82, 0.73]} /><meshStandardMaterial color="#7f715b" roughness={0.85} />
    </mesh>)}
    {/* Unlit notebooks and a laptop are scenery, never fabricated task telemetry. */}
    <group position={[-0.52, 0.94, 0]} rotation={[0, 0.15, 0]}>
      <mesh><boxGeometry args={[0.65, 0.035, 0.42]} /><meshStandardMaterial color="#616b68" roughness={0.65} /></mesh>
      <mesh position={[0, 0.23, -0.18]} rotation={[-0.15, 0, 0]}><boxGeometry args={[0.65, 0.44, 0.035]} /><meshStandardMaterial color="#4a5958" roughness={0.7} /></mesh>
      <mesh position={[0, 0.23, -0.154]} rotation={[-0.15, 0, 0]}><planeGeometry args={[0.57, 0.35]} /><meshStandardMaterial color="#b9cbc4" roughness={0.8} /></mesh>
    </group>
    <mesh position={[0.5, 0.95, 0.08]} rotation={[0, -0.2, 0]}><boxGeometry args={[0.43, 0.055, 0.32]} /><meshStandardMaterial color="#e3d8b9" roughness={1} /></mesh>
    <mesh position={[0.75, 1.01, -0.25]}><cylinderGeometry args={[0.065, 0.055, 0.16, 12]} /><meshStandardMaterial color="#f5efdf" roughness={0.6} /></mesh>
  </group>;
}

function Room() {
  const arch = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-1.75, 0);
    shape.lineTo(-1.75, 2.35);
    shape.absarc(0, 2.35, 1.75, Math.PI, 0, true);
    shape.lineTo(1.75, 0);
    shape.lineTo(1.5, 0);
    shape.lineTo(1.5, 2.35);
    shape.absarc(0, 2.35, 1.5, 0, Math.PI, false);
    shape.lineTo(-1.5, 0);
    shape.closePath();
    return shape;
  }, []);
  return <group name="mediterranean-studio">
    <RoundedBox args={[14.7, 0.24, 10.8]} radius={0.12} smoothness={3} position={[0, -0.14, 0]} receiveShadow>
      <meshStandardMaterial color="#e4d9c3" roughness={0.95} />
    </RoundedBox>
    {/* Inlaid floor lines and a woven island keep the central circulation legible. */}
    {[-5, -2.5, 0, 2.5, 5].map((x) => <mesh key={x} position={[x, -0.012, 0]}><boxGeometry args={[0.014, 0.012, 10.4]} /><meshStandardMaterial color="#c7bca6" roughness={1} /></mesh>)}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0.1]}><circleGeometry args={[1.55, 64]} /><meshStandardMaterial color="#c9b891" roughness={1} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0.1]}><ringGeometry args={[1.39, 1.43, 64]} /><meshStandardMaterial color="#ede2c9" roughness={1} /></mesh>
    <mesh position={[0, 0.4, -5.05]} castShadow receiveShadow><boxGeometry args={[14.5, 0.8, 0.3]} /><meshStandardMaterial color="#dbcfb8" roughness={1} /></mesh>
    {[-4.6, 0, 4.6].map((x) => <group key={x} position={[x, 0.8, -5.05]}>
      <mesh castShadow><extrudeGeometry args={[arch, { depth: 0.24, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, steps: 1, curveSegments: 20 }]} /><meshStandardMaterial color="#e9dfcb" roughness={0.95} /></mesh>
      <mesh position={[0, 1.7, -0.13]}><planeGeometry args={[3.3, 3.8]} /><meshBasicMaterial color="#cbdcd7" /></mesh>
      <mesh position={[0, 1.1, 0.1]}><boxGeometry args={[0.055, 2.2, 0.05]} /><meshStandardMaterial color="#b3ab92" roughness={0.8} /></mesh>
      <mesh position={[0, 0.7, 0.11]}><boxGeometry args={[3.1, 0.045, 0.04]} /><meshStandardMaterial color="#b3ab92" roughness={0.8} /></mesh>
    </group>)}
    <StudioTable x={-3.8} /><StudioTable x={3.8} />
    <Olive x={-6.4} z={-3.75} /><Olive x={6.4} z={-3.75} />
    {[-6.35, 6.35].map((x) => <RoundedBox key={x} position={[x, 0.3, 2.8]} args={[0.5, 0.6, 2.7]} radius={0.08} smoothness={2} castShadow><meshStandardMaterial color="#c8b99d" roughness={0.9} /></RoundedBox>)}
  </group>;
}

// Artistic personas are independent of the real worker feed. Ambient life is not task progress.
export default function OfficeScene({ selected, onSelect }: Props) {
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return <Canvas orthographic shadows dpr={[1, 1.5]} frameloop={!visible || reducedMotion ? "demand" : "always"}
    camera={{ position: [0, 12, 19], zoom: 45, near: 0.1, far: 80 }}
    gl={{ antialias: true, powerPreference: "low-power" }} onPointerMissed={() => onSelect(null)}
    aria-label="Yesus dan dua belas murid — kantor 3D">
    <color attach="background" args={["#eee8da"]} />
    <hemisphereLight args={["#fff7e7", "#b7bba1", 2]} />
    <directionalLight position={[-4, 10, 7]} intensity={2.5} castShadow shadow-mapSize={[1024, 1024]}
      shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-8}
      shadow-normalBias={0.035} shadow-bias={-0.0002} />
    <Room />
    {PERSONAS.map((persona, index) => {
      const focal = persona.id === "yesus";
      const discipleIndex = index - 1;
      const columns = [-5.1, -3.1, -1.1, 1.1, 3.1, 5.1];
      const position: [number, number, number] = focal ? [0, 0, 0.2] : [columns[discipleIndex % 6], 0, discipleIndex < 6 ? -2.8 : 3.0];
      return <Disciple key={persona.id} persona={persona} position={position} rotation={focal ? 0 : -position[0] * 0.035}
        selected={selected === persona.id} reducedMotion={reducedMotion} onSelect={onSelect} />;
    })}
    <ResponsiveCamera />
    <OrbitControls makeDefault target={[0, 1.1, -0.2]} enablePan={false} enableZoom={false}
      minAzimuthAngle={-0.3} maxAzimuthAngle={0.3} minPolarAngle={0.7} maxPolarAngle={1.05} enableDamping={!reducedMotion} />
  </Canvas>;
}
