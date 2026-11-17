export type CityNpc = {
  key: string;
  from: number;
  to: number;
  z: number;
  offset: number;
  height: number;
  width: number;
  robe: string;
  scarf: string;
  skin: string;
  accessory: "basket" | "staff" | "satchel";
};

const robes = ["#a86e4a", "#7a8866", "#b79665", "#687b88", "#b08076"];
const scarves = ["#dfcda7", "#bc9b73", "#e7dac0", "#b8b29a", "#d1b89b"];
const skins = ["#b77c55", "#965d3f", "#cd9569", "#aa704e", "#805039"];

// Separate short market strolls keep citizens apart, even at their turnarounds.
// These are ambient scenery, deliberately unrelated to live-worker identities.
export const CITY_NPCS: readonly CityNpc[] = Array.from({ length: 10 }, (_, index) => {
  const lane = index % 5;
  return {
    key: `citizen-${index + 1}`,
    from: -9.6 + lane * 4,
    to: -6.6 + lane * 4,
    z: (index < 5 ? -11 : 9.2) + (lane - 2) * 0.15,
    offset: index * 1.73,
    height: [0.86, 1, 0.93, 1.08, 0.96][lane],
    width: [1.1, 0.9, 1.16, 0.92, 1][lane],
    robe: robes[lane],
    scarf: scarves[(lane + (index < 5 ? 0 : 2)) % 5],
    skin: skins[lane],
    accessory: (["basket", "staff", "satchel"] as const)[index % 3],
  };
});

export function createCityNpcClock() {
  let elapsed = 0;
  let held = false;
  return {
    advance(delta: number, paused: boolean) {
      if (!paused && !held && Number.isFinite(delta)) elapsed += Math.max(0, delta);
      held = paused;
      return elapsed;
    },
  };
}

const ease = (value: number) => value * value * (3 - 2 * value);

export function sampleCityNpc(npc: CityNpc, elapsed: number) {
  const time = ((elapsed + npc.offset) % 20 + 20) % 20;
  const returning = time >= 10;
  const legTime = time % 10;
  const walking = legTime < 8;
  const progress = ease(Math.min(1, legTime / 8));
  const distance = npc.to - npc.from;
  const x = returning ? npc.to - distance * progress : npc.from + distance * progress;
  const turn = ease(Math.max(0, (legTime - 8) / 2));
  const heading = returning ? -Math.PI / 2 + Math.PI * turn : Math.PI / 2 - Math.PI * turn;
  const envelope = walking ? Math.sin(Math.PI * legTime / 8) : 0;
  const stride = walking ? Math.sin(legTime * Math.PI * 2) * envelope : 0;
  return {
    position: [x, Math.abs(stride) * 0.025, npc.z] as [number, number, number],
    heading,
    walking,
    leftLeg: stride * 0.35,
    rightLeg: -stride * 0.35,
    leftArm: -stride * 0.24,
    rightArm: npc.accessory === "basket" ? -0.65 : stride * 0.24,
  };
}
