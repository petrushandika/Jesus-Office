"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BoxGeometry, CylinderGeometry, Group, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { CITY_NPCS, createCityNpcClock } from "@/lib/city-npcs";
import { sampleCityNpc } from "@/lib/city-npcs";

const LIMBS = ["leftLeg", "rightLeg", "leftArm", "rightArm"] as const;

export function CityNpcs({ paused, inspectScene = false }: { paused: boolean; inspectScene?: boolean }) {
  const { gl } = useThree();
  const roots = useRef<(Group | null)[]>([]);
  const appliedPoses = useRef<ReturnType<typeof sampleCityNpc>[]>([]);
  const clock = useMemo(() => createCityNpcClock(), []);
  useEffect(() => {
    // A hidden canvas may render no frames at all until it resumes.
    if (paused) clock.advance(0, true);
  }, [clock, paused]);
  const initialized = useRef(false);
  const lastProbe = useRef(-Infinity);
  const worldPoint = useMemo(() => new Vector3(), []);
  const resources = useMemo(() => {
    const geometries = {
      robe: new CylinderGeometry(0.23, 0.36, 1.02, 10),
      sphere: new SphereGeometry(1, 10, 8),
      cylinder: new CylinderGeometry(1, 1, 1, 8),
      box: new BoxGeometry(1, 1, 1),
      basket: new CylinderGeometry(0.23, 0.16, 0.3, 10),
      handle: new TorusGeometry(0.2, 0.025, 5, 12, Math.PI),
    };
    const colors = new Set(CITY_NPCS.flatMap(npc => [npc.robe, npc.scarf, npc.skin]));
    colors.add("#69503a");
    colors.add("#bc915a");
    const materials = new Map([...colors].map(color => [color, new MeshStandardMaterial({ color, roughness: 0.95 })]));
    return { geometries, materials };
  }, []);

  useEffect(() => () => {
    Object.values(resources.geometries).forEach(geometry => geometry.dispose());
    resources.materials.forEach(material => material.dispose());
  }, [resources]);
  useEffect(() => {
    if (!inspectScene) gl.domElement.removeAttribute("data-city-npcs");
    return () => gl.domElement.removeAttribute("data-city-npcs");
  }, [gl, inspectScene]);

  useFrame((_, delta) => {
    const elapsed = clock.advance(delta, paused);
    if (!paused || !initialized.current) {
      CITY_NPCS.forEach((npc, index) => {
        const root = roots.current[index];
        if (!root) return;
        const pose = sampleCityNpc(npc, elapsed);
        appliedPoses.current[index] = pose;
        root.position.set(...pose.position);
        root.rotation.y = pose.heading;
        root.userData.activity = pose.activity;
        root.userData.destination = pose.destination;
        root.userData.indoors = pose.indoors;
        root.traverse(child => { if (child.name === 'citizen-accessory') child.visible = pose.activity !== 'bathing'; });
        for (const limb of LIMBS) {
          const joint = root.getObjectByName(limb);
          if (joint) joint.rotation.x = pose[limb];
        }
      });
      initialized.current = true;
    }
    const now = performance.now();
    if (inspectScene && (paused || now - lastProbe.current >= 200)) {
      lastProbe.current = now;
      // Read the physical scene graph, not intended/sample transforms.
      const citizens = roots.current.flatMap((root, index) => {
        if (!root) return [];
        root.updateWorldMatrix(true, true);
        return [{
          key: CITY_NPCS[index].key,
          decorative: true,
          activity: appliedPoses.current[index]?.activity,
          destination: CITY_NPCS[index].destination,
          indoors: appliedPoses.current[index]?.indoors,
          world: root.getWorldPosition(worldPoint).toArray(),
          quaternion: root.quaternion.toArray(),
          limbs: Object.fromEntries(LIMBS.map(name => {
            const joint = root.getObjectByName(name)!;
            return [name, { position: joint.position.toArray(), quaternion: joint.quaternion.toArray(), scale: joint.scale.toArray(), world: joint.getWorldPosition(worldPoint).toArray() }];
          })),
        }];
      });
      gl.domElement.setAttribute("data-city-npcs", JSON.stringify({ decorative: true, paused, elapsed, citizens }));
    }
  });

  const g = resources.geometries;
  const material = (color: string) => resources.materials.get(color)!;
  return (
    <group name="decorative-city-citizens" userData={{ decorative: true }} dispose={null}>
      {CITY_NPCS.map((npc, index) => (
        <group key={npc.key} ref={root => { roots.current[index] = root; }} name={npc.key} userData={{ decorative: true }} scale={[npc.width, npc.height, npc.width]}>
          <mesh geometry={g.robe} material={material(npc.robe)} position={[0, 0.95, 0]} />
          <mesh geometry={g.cylinder} material={material(npc.scarf)} position={[0, 1.22, 0]} scale={[0.26, 0.12, 0.26]} />
          <mesh geometry={g.sphere} material={material(npc.skin)} position={[0, 1.69, 0.035]} scale={[0.2, 0.25, 0.19]} />
          <mesh geometry={g.sphere} material={material(npc.scarf)} position={[0, 1.85, -0.025]} scale={[0.235, 0.16, 0.235]} />
          <mesh geometry={g.box} material={material(npc.scarf)} position={[-0.15, 1.53, -0.14]} rotation={[0, 0, -0.15]} scale={[0.18, 0.52, 0.13]} />
          {([-1, 1] as const).map(side => (
            <group key={`leg-${side}`} name={side < 0 ? "leftLeg" : "rightLeg"} position={[side * 0.14, 0.48, 0]}>
              <mesh geometry={g.cylinder} material={material(npc.robe)} position={[0, -0.16, 0]} scale={[0.085, 0.36, 0.085]} />
              <mesh geometry={g.box} material={material("#69503a")} position={[0, -0.4, 0.06]} scale={[0.16, 0.1, 0.29]} />
            </group>
          ))}
          {([-1, 1] as const).map(side => (
            <group key={`arm-${side}`} name={side < 0 ? "leftArm" : "rightArm"} position={[side * 0.3, 1.39, 0]} rotation={[0, 0, side * 0.1]}>
              <mesh geometry={g.cylinder} material={material(npc.robe)} position={[0, -0.21, 0]} scale={[0.11, 0.43, 0.11]} />
              <mesh geometry={g.sphere} material={material(npc.skin)} position={[0, -0.47, 0]} scale={[0.075, 0.1, 0.075]} />
              {side === 1 && npc.accessory === "basket" && <group name="citizen-accessory" position={[0.1, -0.63, 0.12]}>
                <mesh geometry={g.basket} material={material("#bc915a")} />
                <mesh geometry={g.handle} material={material("#69503a")} position={[0, 0.14, 0]} />
              </group>}
              {side === 1 && npc.accessory === "staff" && <mesh name="citizen-accessory" geometry={g.cylinder} material={material("#69503a")} position={[0.07, -0.33, 0.14]} scale={[0.028, 1.48, 0.028]} rotation={[0.1, 0, -0.05]} />}
            </group>
          ))}
          {npc.accessory === "satchel" && <group name="citizen-accessory">
            <mesh geometry={g.box} material={material("#69503a")} position={[0.06, 1.08, 0.23]} scale={[0.055, 0.77, 0.045]} rotation={[0, 0, -0.55]} />
            <mesh geometry={g.box} material={material("#bc915a")} position={[-0.27, 0.76, 0.14]} scale={[0.25, 0.31, 0.18]} />
          </group>}
        </group>
      ))}
    </group>
  );
}
