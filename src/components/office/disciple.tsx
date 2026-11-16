"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import { Color, DoubleSide, Float32BufferAttribute, LatheGeometry, Shape, ShapeGeometry, Vector2, Vector3, type Group } from "three";
import type { Persona } from "@/lib/personas";
import { poseAt } from "@/lib/choreography";

type Props = {
  persona: Persona;
  position: [number, number, number];
  rotation?: number;
  phaseOffset?: number;
  selected: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
};

// Original sculpted profiles: a gathered hem, narrow waist and rounded shoulders.
const ROBE_PROFILE = [[0, 0.13], [0.34, 0.13], [0.39, 0.18], [0.35, 0.48], [0.3, 0.85], [0.24, 1.12], [0.31, 1.46], [0.24, 1.58], [0, 1.59]];
const HEAD_PROFILE = [[0, 0], [0.1, 0.025], [0.19, 0.14], [0.23, 0.32], [0.22, 0.46], [0.15, 0.56], [0, 0.59]];
const BEARD_PROFILE = [[0, 0], [0.08, 0.045], [0.18, 0.17], [0.205, 0.3], [0.17, 0.35], [0, 0.35]];

function lathe(profile: number[][]) {
  return new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), 20);
}

function Arm({ side, robe, skin, arm, forearm, hand }: { side: number; robe: string; skin: string; arm: RefObject<Group | null>; forearm: RefObject<Group | null>; hand: RefObject<Group | null> }) {
  return (
    <group ref={arm} name={side < 0 ? "left-arm" : "right-arm"} position={[side * 0.27, 1.43, 0]}>
      <mesh position={[0, -0.17, 0]} castShadow>
        <capsuleGeometry args={[0.135, 0.24, 4, 10]} />
        <meshStandardMaterial color={robe} roughness={0.94} />
      </mesh>
      <group ref={forearm} name={side < 0 ? "left-elbow" : "right-elbow"} position={[0, -0.35, 0]}>
        <mesh position={[0, -0.105, 0]} castShadow>
          <capsuleGeometry args={[0.105, 0.18, 4, 10]} />
          <meshStandardMaterial color={robe} roughness={0.94} />
        </mesh>
        <group ref={hand} name={side < 0 ? "left-wrist" : "right-wrist"} position={[0, -0.29, 0.015]}>
        <mesh scale={[0.075, 0.115, 0.065]} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color={skin} roughness={0.8} />
        </mesh>
        <mesh position={[-side * 0.065, 0.025, 0.03]} rotation={[0.3, 0, side * 0.5]}>
          <capsuleGeometry args={[0.026, 0.065, 3, 6]} />
          <meshStandardMaterial color={skin} roughness={0.8} />
        </mesh>
        </group>
      </group>
    </group>
  );
}

export function Disciple({ persona, position, rotation = 0, phaseOffset = 6, selected, reducedMotion, onSelect }: Props) {
  const body = useRef<Group>(null);
  const traveler = useRef<Group>(null);
  const leftFoot = useRef<Group>(null);
  const rightFoot = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftForearm = useRef<Group>(null);
  const rightForearm = useRef<Group>(null);
  const leftHand = useRef<Group>(null);
  const rightHand = useRef<Group>(null);
  const folds = useRef<Group>(null);
  const { gl } = useThree();
  const probe = useRef(false);
  const lastProbe = useRef(-1);
  const initialized = useRef(false);
  const lastSit = useRef(-1);
  const point = useMemo(() => new Vector3(), []);
  const head = useRef<Group>(null);
  const elapsed = useRef(0);
  useEffect(() => {
    probe.current = new URLSearchParams(window.location.search).get("inspectScene") === "1";
    const attribute = `data-motion-${persona.id}`;
    return () => gl.domElement.removeAttribute(attribute);
  }, [gl, persona.id]);
  const sculpt = useMemo(() => {
    const mantle = new Shape();
    mantle.moveTo(-0.31, 1.49);
    mantle.bezierCurveTo(-0.49, 1.1, -0.4, 0.55, -0.32, 0.23);
    mantle.quadraticCurveTo(-0.09, 0.16, 0.1, 0.3);
    mantle.bezierCurveTo(-0.08, 0.7, -0.02, 1.09, 0.23, 1.49);
    mantle.quadraticCurveTo(-0.01, 1.66, -0.31, 1.49);
    const robe = lathe(ROBE_PROFILE);
    const mantleGeometry = new ShapeGeometry(mantle, 10);
    return { robe, head: lathe(HEAD_PROFILE), beard: lathe(BEARD_PROFILE), mantle: mantleGeometry,
      robeRest: robe.getAttribute("position").array.slice(), mantleRest: mantleGeometry.getAttribute("position").array.slice() };
  }, []);
  useEffect(() => () => {
    sculpt.robe.dispose();
    sculpt.head.dispose();
    sculpt.beard.dispose();
    sculpt.mantle.dispose();
  }, [sculpt]);
  useFrame((state, delta) => {
    if (document.hidden) return;
    if (!reducedMotion) elapsed.current += Math.min(delta, 0.1);
    const pose = reducedMotion ? poseAt(4) : poseAt(elapsed.current, phaseOffset);
    if (!reducedMotion || !initialized.current) {
      initialized.current = true;
      if (traveler.current) traveler.current.position.z = pose.travel;
      if (body.current) body.current.position.y = -0.30 * pose.sit + pose.bob;
      if (head.current) head.current.rotation.x = pose.sit * 0.12;
      for (const [foot, lift, stride] of [[leftFoot, pose.leftFoot, pose.leftStride], [rightFoot, pose.rightFoot, pose.rightStride]] as const) {
        if (!foot.current) continue;
        foot.current.position.y = 0.065 + lift;
        foot.current.position.z = 0.05 + stride + pose.sit * 0.2;
        foot.current.rotation.x = -stride * 0.8;
      }
      for (const [arm, forearm, hand, swing, tap] of [[leftArm, leftForearm, leftHand, pose.leftArm, pose.leftHand], [rightArm, rightForearm, rightHand, pose.rightArm, pose.rightHand]] as const) {
        if (arm.current) arm.current.rotation.x = -0.95 * pose.sit + swing;
        if (forearm.current) forearm.current.rotation.x = -0.28 - 0.72 * pose.sit + tap * 0.45;
        if (hand.current) hand.current.rotation.x = 0.38 * pose.sit + tap;
      }
      // Lift the hem while the torso lowers, draping linen over seated knees.
      if (lastSit.current !== pose.sit) {
        lastSit.current = pose.sit;
        for (const [geometry, rest] of [[sculpt.robe, sculpt.robeRest], [sculpt.mantle, sculpt.mantleRest]] as const) {
          const vertices = geometry.getAttribute("position") as Float32BufferAttribute;
          for (let i = 0; i < vertices.count; i++) {
            const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
            const lower = Math.max(0, 1 - y / 1.05);
            vertices.setXYZ(i, x, y + 0.30 * pose.sit * lower, z + pose.sit * Math.sin(Math.min(1, y / 1.05) * Math.PI) * 0.27);
          }
          vertices.needsUpdate = true;
          geometry.computeVertexNormals();
        }
        if (folds.current) {
          folds.current.position.y = pose.sit * 0.13;
          folds.current.position.z = pose.sit * 0.22;
          folds.current.scale.y = 1 - pose.sit * 0.2;
        }
      }
    }
    if (!reducedMotion) initialized.current = false;
    if (probe.current && state.clock.elapsedTime - lastProbe.current >= 0.2 && traveler.current && body.current) {
      lastProbe.current = state.clock.elapsedTime;
      traveler.current.updateWorldMatrix(true, true);
      const worldPosition = (ref: RefObject<Group | null>) => ref.current ? ref.current.getWorldPosition(point).toArray() : null;
      gl.domElement.setAttribute(`data-motion-${persona.id}`, JSON.stringify({
        phase: pose.phase, z: traveler.current.position.z,
        sit: Math.max(0, Math.min(1, -body.current.position.y / 0.30)),
        leftHand: worldPosition(leftHand), rightHand: worldPosition(rightHand),
        leftFoot: worldPosition(leftFoot), rightFoot: worldPosition(rightFoot),
      }));
    }
  });
  const fold = new Color(persona.robe).multiplyScalar(0.84).getStyle();
  return (
    <group name={`persona:${persona.id}`} userData={{ personaId: persona.id }} position={position} rotation={[0, rotation, 0]}
      onClick={(event) => { event.stopPropagation(); onSelect(persona.id); }}
      onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}>
      <group ref={traveler} name="station-travel">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.55, selected ? 0.6 : 0.565, 40]} />
        <meshBasicMaterial color={selected ? "#b77b3d" : "#c7bca5"} transparent opacity={selected ? 0.9 : 0.32} />
      </mesh>
      <group scale={[persona.build, persona.height, persona.build]}>
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? leftFoot : rightFoot} name={side < 0 ? "left-foot" : "right-foot"} position={[side * 0.16, 0.065, 0.05]}>
            <mesh scale={[0.11, 0.045, 0.205]} castShadow>
              <sphereGeometry args={[1, 12, 8]} />
              <meshStandardMaterial color="#664936" roughness={0.95} />
            </mesh>
            <mesh position={[0, 0.035, 0.04]} scale={[0.09, 0.04, 0.13]}>
              <sphereGeometry args={[1, 10, 8]} />
              <meshStandardMaterial color={persona.skin} roughness={0.84} />
            </mesh>
            <mesh position={[0, 0.07, 0.075]} rotation={[-0.1, 0, side * 0.2]}>
              <boxGeometry args={[0.19, 0.025, 0.045]} />
              <meshStandardMaterial color="#80563d" roughness={0.9} />
            </mesh>
          </group>
        ))}
        <group ref={body}>
          <mesh geometry={sculpt.robe} scale={[1, 1, 0.72]} castShadow receiveShadow>
            <meshStandardMaterial color={persona.robe} roughness={0.97} />
          </mesh>
          {/* Raised, tapered seams catch sunlight like hand-worked linen. */}
          <group ref={folds} name="seated-linen-folds">
          {[-0.22, -0.08, 0.08, 0.22].map((x) => (
            <mesh key={x} position={[x, 0.61, 0.21 - Math.abs(x) * 0.13]} rotation={[0, 0, -x * 0.22]} scale={[0.018, 0.43, 0.025]}>
              <sphereGeometry args={[1, 6, 8]} />
              <meshStandardMaterial color={fold} roughness={1} />
            </mesh>
          ))}
          </group>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 1.02, 0]} scale={[1, 0.73, 1]}>
            <torusGeometry args={[0.252, 0.026, 5, 24]} />
            <meshStandardMaterial color="#a58b63" roughness={1} />
          </mesh>
          <mesh geometry={sculpt.mantle} position={[0, 0, 0.245]} castShadow>
            <meshStandardMaterial color={persona.mantle} roughness={0.95} side={DoubleSide} />
          </mesh>
          <group name="articulated-shoulders">
            <Arm side={-1} robe={persona.robe} skin={persona.skin} arm={leftArm} forearm={leftForearm} hand={leftHand} />
            <Arm side={1} robe={persona.robe} skin={persona.skin} arm={rightArm} forearm={rightForearm} hand={rightHand} />
          </group>
          <mesh position={[0, 1.62, 0]}>
            <capsuleGeometry args={[0.105, 0.15, 4, 10]} />
            <meshStandardMaterial color={persona.skin} roughness={0.85} />
          </mesh>
          <group ref={head} position={[0, 1.65, 0]}>
            <mesh geometry={sculpt.head} scale={[1, 1, 0.87]} castShadow>
              <meshStandardMaterial color={persona.skin} roughness={0.82} />
            </mesh>
            {[-1, 1].map((side) => (
              <group key={side}>
                <mesh position={[side * 0.219, 0.29, 0]} scale={[0.045, 0.075, 0.045]}>
                  <sphereGeometry args={[1, 8, 6]} />
                  <meshStandardMaterial color={persona.skin} roughness={0.85} />
                </mesh>
                <mesh position={[side * 0.084, 0.34, 0.184]} scale={[0.032, 0.022, 0.014]}>
                  <sphereGeometry args={[1, 8, 6]} />
                  <meshStandardMaterial color="#302a26" roughness={0.7} />
                </mesh>
                <mesh position={[side * 0.085, 0.386, 0.178]} rotation={[0, 0, Math.PI / 2 + side * -0.1]}>
                  <capsuleGeometry args={[0.012, 0.055, 3, 6]} />
                  <meshStandardMaterial color={persona.hair} roughness={1} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, 0.285, 0.206]} scale={[0.038, 0.063, 0.062]} castShadow>
              <sphereGeometry args={[1, 10, 8]} />
              <meshStandardMaterial color={persona.skin} roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.192, 0.171]} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.009, 0.06, 3, 6]} />
              <meshStandardMaterial color="#8d5949" roughness={0.9} />
            </mesh>
            {persona.beard && <mesh geometry={sculpt.beard} position={[0, -0.035, 0.025]} scale={[1, 0.82, 0.93]} castShadow>
              <meshStandardMaterial color={persona.hair} roughness={1} />
            </mesh>}
            {/* Open-front scalp cap leaves the face unobscured; side locks frame it. */}
            <mesh position={[0, 0.35, -0.025]} rotation={[0, Math.PI, 0]} scale={[1.04, 1.06, 0.96]} castShadow>
              <sphereGeometry args={[0.235, 16, 10, 0, Math.PI * 2, 0, persona.hairStyle === "bald" ? 0.4 : 1.35]} />
              <meshStandardMaterial color={persona.hairStyle === "bald" ? persona.skin : persona.hair} roughness={1} />
            </mesh>
            {persona.hairStyle !== "bald" && [-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.194, persona.hairStyle === "long" ? 0.23 : 0.365, -0.025]} rotation={[0.1, 0, side * -0.13]} scale={[0.085, persona.hairStyle === "long" ? 0.31 : 0.13, 0.16]} castShadow>
                <sphereGeometry args={[1, 10, 8]} />
                <meshStandardMaterial color={persona.hair} roughness={1} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
      </group>
      {/* Accessible selected name lives in the DOM sidebar; ring marks the 3D figure. */}
    </group>
  );
}

