"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { CanvasTexture, MathUtils, SRGBColorSpace, type MeshStandardMaterial } from "three";
import type { Agent } from "@/lib/agents";
import { STATUS } from "./status";

const WOOD = "#b98b5e";
const METAL = "#2b2f36";

// Monitor content is drawn into a canvas texture: no remote font or image requests.
function useScreen(agent: Agent) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    const color = STATUS[agent.status].screen;
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 6);
    ctx.font = "600 22px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(STATUS[agent.status].label.toUpperCase(), 16, 44);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "16px ui-monospace, monospace";
    ctx.fillText(agent.run.replace("deleg_", "#"), 16, 76);
    ctx.fillText(`${agent.toolCalls} tool calls`, 16, 102);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText((agent.lastTool ?? "—").slice(0, 22), 16, 128);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [agent.status, agent.run, agent.toolCalls, agent.lastTool]);
}

export function Desk({ agent, reducedMotion }: { agent: Agent | null; reducedMotion: boolean }) {
  return (
    <group>
      {/* Desk top and legs */}
      <RoundedBox args={[1.6, 0.06, 0.8]} radius={0.02} position={[0, 0.74, -0.35]} castShadow receiveShadow>
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </RoundedBox>
      {[-0.74, 0.74].map((x) => (
        <mesh key={x} position={[x, 0.37, -0.35]} castShadow>
          <boxGeometry args={[0.05, 0.74, 0.7]} />
          <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* Chair */}
      <group position={[0, 0, 0.32]}>
        <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.06, 0.48]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.78, 0.23]} castShadow>
          <boxGeometry args={[0.48, 0.6, 0.05]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.44]} />
          <meshStandardMaterial color={METAL} metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.02, 0]} receiveShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.03, 20]} />
          <meshStandardMaterial color={METAL} metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
      {/* Keyboard and mug */}
      <mesh position={[0, 0.785, -0.2]} castShadow>
        <boxGeometry args={[0.46, 0.02, 0.15]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.5} />
      </mesh>
      <mesh position={[0.5, 0.82, -0.3]} castShadow>
        <cylinderGeometry args={[0.045, 0.04, 0.1, 16]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.4} />
      </mesh>
      {agent ? <Monitor agent={agent} reducedMotion={reducedMotion} /> : <DarkMonitor />}
    </group>
  );
}

function MonitorFrame({ children }: { children: React.ReactNode }) {
  return (
    <group position={[0, 0.78, -0.62]}>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[0.05, 0.32, 0.05]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[0.28, 0.03, 0.18]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.35} />
      </mesh>
      <group position={[0, 0.5, 0.03]}>
        <RoundedBox args={[0.92, 0.6, 0.04]} radius={0.015} castShadow>
          <meshStandardMaterial color="#111827" roughness={0.4} />
        </RoundedBox>
        {children}
      </group>
    </group>
  );
}

function DarkMonitor() {
  return (
    <MonitorFrame>
      <mesh position={[0, 0, 0.021]}>
        <planeGeometry args={[0.86, 0.54]} />
        <meshStandardMaterial color="#05070b" roughness={0.2} />
      </mesh>
    </MonitorFrame>
  );
}

function Monitor({ agent, reducedMotion }: { agent: Agent; reducedMotion: boolean }) {
  const texture = useScreen(agent);
  const material = useRef<MeshStandardMaterial>(null);
  const running = agent.status === "running";
  // Glow pulses only for genuinely running work; idle desks stay still.
  useFrame(({ clock }) => {
    if (!material.current) return;
    const target = running && !reducedMotion ? 0.85 + Math.sin(clock.elapsedTime * 2) * 0.15 : 0.7;
    material.current.emissiveIntensity = MathUtils.lerp(material.current.emissiveIntensity, target, 0.1);
  });
  return (
    <MonitorFrame>
      <mesh position={[0, 0, 0.021]}>
        <planeGeometry args={[0.86, 0.54]} />
        <meshStandardMaterial ref={material} map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.7} toneMapped={false} />
      </mesh>
    </MonitorFrame>
  );
}
