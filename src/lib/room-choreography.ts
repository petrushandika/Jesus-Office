export type Point = [number, number, number];
export type Room = {
  id: string; title: string; center: Point; home: Point; visitor: Point;
  door: Point; lane: Point; table: Point; facing: number; tint: string;
};
const definitions: [string, string, number, number, string][] = [
  ['yesus', 'Council room', -9, 4.5, '#cdb68c'],
  ['petrus', 'Architecture workshop', -3, 4.5, '#b6bfa7'],
  ['yohanes', 'Engineering workshop', 3, 4.5, '#aebfc1'],
  ['yakobus-zebedeus', 'Review chamber', 9, 4.5, '#bfae9d'],
  ['andreas', 'Research study', -6, -4.5, '#bdc2a0'],
  ['filipus', 'Planning room', 0, -4.5, '#cfb28c'],
  ['matius', 'Scriptorium', 6, -4.5, '#c6bfa6'],
];
export const ROOMS: Room[] = definitions.map(([id, title, x, z, tint]) => {
  const side = Math.sign(z);
  return { id, title, center: [x, 0, z], home: [x, 0, z], visitor: [x + 1.35, 0, z],
    door: [x, 0, z - side * 2.5], lane: [x, 0, 0],
    table: [x, 0, z + side * 0.65], facing: side > 0 ? 0 : Math.PI, tint };
});
export const WALK_SPEED = 1.45;
export function roomFor(id: string) { return ROOMS.find(room => room.id === id) ?? ROOMS[0]; }
export function visitorSlot(fromId: string, toId: string): Point {
  const to = roomFor(toId);
  const slot = toId === 'yohanes' ? ['yesus', 'petrus', 'yakobus-zebedeus'].indexOf(fromId) : toId === 'filipus' ? ['andreas', 'unused', 'matius'].indexOf(fromId) : -1;
  return [to.visitor[0], 0, to.visitor[2] + (slot < 0 ? 0 : (slot - 1) * 0.9)];
}
/** Front-side clearance keeps feet away from fixed tables and wall corners. */
export function routeBetween(fromId: string, toId: string): Point[] {
  const from = roomFor(fromId), to = roomFor(toId);
  const side = Math.sign(to.center[2]);
  const visitor = visitorSlot(fromId, toId);
  // Separate circulation tracks reduce opposing travelers sharing one centerline.
  const laneZ = (ROOMS.indexOf(from) - 3) * 0.48;
  return [from.home, from.door, [from.lane[0], 0, laneZ], [to.lane[0], 0, laneZ], to.door,
    [to.home[0], 0, to.home[2] - side * 1.1],
    [visitor[0], 0, to.home[2] - side * 1.1], visitor];
}
export function sampleRoute(route: Point[], distance: number) {
  const lengths = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[2] - route[i][2]));
  const length = lengths.reduce((a, b) => a + b, 0);
  if (distance >= length) return { position: [...route.at(-1)!] as Point, heading: 0, length };
  let remaining = Math.max(0, Math.min(length, Number.isNaN(distance) ? 0 : distance));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i] > 0) {
      const a = route[i], b = route[i + 1], t = remaining / lengths[i];
      return { position: a.map((value, axis) => value + (b[axis] - value) * t) as Point,
        heading: Math.atan2(b[0] - a[0], b[2] - a[2]), length };
    }
    remaining -= lengths[i];
  }
  return { position: [...route.at(-1)!] as Point, heading: 0, length };
}
const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t*t*(3-2*t); };
/** Decorative visits follow role relationships, never real task dispatch. */
export function roomPoseAt(seconds: number, id: string) {
  const home = roomFor(id), index = ROOMS.indexOf(home);
  // Leader checks engineering; architect collaborates with engineering; review/research/planning/writing exchange visits.
  const target = ROOMS[[2, 2, 1, 2, 5, 0, 5][index]];
  const route = routeBetween(home.id, target.id);
  const duration = sampleRoute(route, Infinity).length / WALK_SPEED;
  const dwell = 5 + index * 1.1, visit = 6;
  const cycle = dwell + duration * 2 + visit;
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const t = time % cycle;
  const outward = t >= dwell && t < dwell + duration;
  const returning = t >= dwell + duration + visit;
  const traveling = outward || returning;
  const visiting = t >= dwell + duration && !returning;
  const distance = outward ? (t-dwell)*WALK_SPEED : returning ? (cycle-t)*WALK_SPEED : visiting ? Infinity : 0;
  const sampled = sampleRoute(route, distance);
  const ramp = traveling ? Math.min(1, (outward ? t-dwell : t-dwell-duration-visit)*4, (outward ? dwell+duration-t : cycle-t)*4) : 0;
  const gait = Math.sin(time * 10) * ramp;
  const sit = !traveling && !visiting ? smooth(t) * smooth(dwell-t) : 0;
  const typing = sit * Math.min(1, t, dwell-t);
  return {
    position: sampled.position, heading: traveling ? sampled.heading + (returning ? Math.PI : 0) : home.facing,
    room: visiting ? target.id : traveling ? 'central-lane' : home.id,
    fromRoom: returning ? target.id : home.id, toRoom: returning ? home.id : target.id,
    phase: traveling ? (returning ? 'return' : 'travel') : visiting ? 'visit' : 'coding', traveling,
    sit, leftFoot: Math.max(0, gait)*0.22, rightFoot: Math.max(0, -gait)*0.22,
    leftStride: gait*0.28, rightStride: -gait*0.28,
    leftArm: -gait*0.4, rightArm: gait*0.4,
    leftHand: Math.sin(time*22)*0.065*typing, rightHand: Math.cos(time*22)*0.065*typing,
    bob: Math.abs(gait)*0.035, gesture: visiting ? Math.sin(time*3)*0.3 : 0,
  };
}
