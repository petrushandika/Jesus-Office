type Point = [number, number, number];
export type Shape = 'box' | 'cylinder' | 'sphere' | 'gable-x' | 'gable-z' | 'vault-x' | 'vault-z';
export const SHAPES: readonly Shape[] = ['box', 'cylinder', 'sphere', 'gable-x', 'gable-z', 'vault-x', 'vault-z'];
export type HomePart = { at: Point; size: Point; color: string; shape: Shape; role: 'shell' | 'roof' | 'interior' | 'trim' };
export type Lot = { x: number; z: number; width: number; depth: number; height: number };
export const HOME_KINDS = ['family-house', 'bakery', 'weaver', 'smithy', 'dyer', 'scribe-school', 'olive-press',
  'carpenter', 'storehouse', 'fisher', 'stable', 'tannery', 'herbalist', 'inn'] as const;
export type HomeKind = typeof HOME_KINDS[number];
export type HomeLot = Lot & { kind: HomeKind; turn: number; tone: number };

const C = { timber: '#7a5b3b', dark: '#4f3e2b', clay: '#a95f42', terra: '#c27650', pale: '#ecdcb9', straw: '#cfae62',
  iron: '#4b4a46', ember: '#d9733a', teal: '#4f8a83', indigo: '#3f5a7d', madder: '#a3453a', saffron: '#d7a23b',
  leaf: '#6f8456', linen: '#efe6d2', hide: '#b48a5e', hideDark: '#8f6440', murky: '#6d6248', water: '#5f9a95',
  net: '#d9cfb4', bread: '#c58b4f', oil: '#8a8d3e', stone: '#bfae8f', wine: '#6e3a3e', copper: '#b06d3e',
  wool: '#e3d8c3', reed: '#a99a62', fish: '#9fb0ae' };
// Limestone, whitewash, ochre plaster, rose clay, mud brick, basalt, chalk.
const WALLS = ['#d8c39c', '#ebe0c9', '#cfa877', '#d6b39b', '#b79c78', '#a7a092', '#e2d7bd'];
const ROOFS = ['#8b7150', '#a26a48', '#6f5a40', '#9b8a68', '#7c6146'];

type Feature = 'terrace' | 'chimney' | 'upper' | 'pergola' | 'arcade' | 'dome' | 'tower' | 'awning' | 'windcatcher' | 'gable' | 'vault';
// wing: a roofed side room making an L-shaped plan; stair: external stair to the roof.
// [u, v, bottom, sx, sy, sz, color, shape]: u/v are fractions of the open interior.
type Prop = [number, number, number, number, number, number, string, Shape?];
const PROGRAMS: Record<HomeKind, { feature: Feature; lift: number; wing?: boolean; stair?: boolean; props: Prop[] }> = {
  'family-house': { feature: 'terrace', lift: 1, stair: true, props: [
    [-.65, -.6, 0, .7, .3, .5, C.stone], [-.65, -.6, .3, .3, .18, .3, C.ember, 'sphere'],
    [.55, .1, 0, .9, .06, .5, C.wool], [.55, .7, 0, .9, .06, .5, C.madder],
    [-.2, .45, 0, .8, .32, .55, C.timber], [-.3, .45, .32, .18, .1, .18, C.terra, 'sphere'], [-.05, .45, .32, .18, .1, .18, C.terra, 'sphere'],
    [-.8, .75, 0, .3, .6, .3, C.clay, 'cylinder']] },
  bakery: { feature: 'vault', lift: 1.05, props: [
    [-.55, -.45, 0, 1, .35, 1, C.stone, 'cylinder'], [-.55, -.45, .2, .9, .8, .9, C.clay, 'sphere'],
    [.65, -.4, 0, .35, .5, .35, C.linen, 'cylinder'], [.65, .05, 0, .35, .45, .35, C.linen, 'cylinder'],
    [.1, .5, 0, 1.3, .75, .5, C.timber], [-.25, .5, .75, .22, .13, .16, C.bread, 'sphere'],
    [.1, .5, .75, .22, .13, .16, C.bread, 'sphere'], [.45, .5, .75, .22, .13, .16, C.bread, 'sphere']] },
  weaver: { feature: 'upper', lift: 1.15, stair: true, props: [
    [-.5, -.15, 0, .1, 1.2, .1, C.dark], [.5, -.15, 0, .1, 1.2, .1, C.dark], [0, -.15, 1.1, 1.1, .1, .1, C.dark],
    [0, -.15, .3, .9, .75, .03, C.indigo], [0, .25, 0, .9, .35, .3, C.timber],
    [.75, .65, 0, .18, .3, .18, C.saffron, 'cylinder'], [.45, .65, 0, .18, .3, .18, C.teal, 'cylinder'],
    [-.7, .6, 0, .45, .35, .45, C.wool, 'sphere']] },
  smithy: { feature: 'chimney', lift: .9, wing: true, props: [
    [-.55, -.5, 0, .9, .6, .7, C.stone], [-.55, -.5, .6, .6, .06, .45, C.ember],
    [.4, .1, 0, .3, .45, .3, C.dark, 'cylinder'], [.4, .1, .45, .55, .18, .22, C.iron],
    [.35, .65, 0, .8, .35, .35, C.iron], [.35, .65, .35, .66, .03, .24, C.water],
    [-.75, .45, 0, .12, .9, .6, C.iron]] },
  dyer: { feature: 'pergola', lift: .95, props: [
    [-.6, -.45, 0, .55, .55, .55, C.stone, 'cylinder'], [-.6, -.45, .55, .45, .04, .45, C.indigo, 'cylinder'],
    [0, -.45, 0, .55, .55, .55, C.stone, 'cylinder'], [0, -.45, .55, .45, .04, .45, C.madder, 'cylinder'],
    [.6, -.45, 0, .55, .55, .55, C.stone, 'cylinder'], [.6, -.45, .55, .45, .04, .45, C.saffron, 'cylinder'],
    [-.75, .5, 0, .08, 1.2, .08, C.timber], [.75, .5, 0, .08, 1.2, .08, C.timber], [0, .5, 1.12, 1.6, .06, .06, C.timber],
    [-.4, .5, .5, .45, .6, .03, C.indigo], [.1, .5, .5, .4, .6, .03, C.madder], [.5, .5, .5, .35, .6, .03, C.saffron]] },
  'scribe-school': { feature: 'arcade', lift: 1.1, wing: true, props: [
    [0, -.75, 0, 1.6, .9, .3, C.dark], [-.5, -.75, .9, .12, .3, .12, C.linen, 'cylinder'], [-.2, -.75, .9, .12, .3, .12, C.linen, 'cylinder'],
    [.15, -.75, .9, .12, .3, .12, C.linen, 'cylinder'], [-.4, .05, 0, .8, .35, .4, C.timber], [.4, .05, 0, .8, .35, .4, C.timber],
    [-.4, .5, 0, .6, .12, .3, C.teal], [.4, .5, 0, .6, .12, .3, C.teal], [.8, .75, 0, .08, .9, .08, C.copper, 'cylinder']] },
  'olive-press': { feature: 'dome', lift: 1, props: [
    [0, -.1, 0, 1.4, .45, 1.4, C.stone, 'cylinder'], [0, -.1, .45, .45, .6, .45, C.pale, 'cylinder'],
    [0, -.1, 1.05, 1.5, .12, .14, C.dark], [.75, .65, 0, .3, .55, .3, C.oil, 'cylinder'],
    [.4, .7, 0, .3, .5, .3, C.oil, 'cylinder'], [-.65, .6, 0, .4, .3, .4, C.leaf, 'sphere']] },
  carpenter: { feature: 'gable', lift: .95, wing: true, props: [
    [0, -.5, 0, 1.4, .75, .5, C.timber], [-.6, .45, 0, .4, .12, 1, C.timber], [-.6, .45, .12, .4, .12, 1, C.dark],
    [-.6, .45, .24, .4, .12, 1, C.reed], [.5, .35, 0, .9, .5, .12, C.dark], [.5, .35, .5, .7, .28, .28, C.straw, 'cylinder'],
    [.8, -.55, .75, .3, .2, .25, C.copper]] },
  storehouse: { feature: 'vault', lift: 1.2, wing: true, props: [
    ...[-.6, 0, .6].flatMap(u => [-.4, .35].map(v => [u, v, 0, .42, .55, .42, C.terra, 'sphere'] as Prop)),
    [-.75, .8, 0, .35, .35, .35, C.reed, 'cylinder'], [0, .8, 0, .9, .25, .25, C.wine]] },
  fisher: { feature: 'awning', lift: .85, stair: true, props: [
    [-.7, -.6, 0, .08, 1.1, .08, C.dark], [.7, -.6, 0, .08, 1.1, .08, C.dark], [0, -.6, .25, 1.3, .8, .04, C.net],
    [-.6, .4, 0, .4, .35, .4, C.reed, 'cylinder'], [-.6, .8, 0, .35, .3, .35, C.reed, 'cylinder'],
    [.45, .45, 0, .8, .6, .45, C.timber], [.3, .45, .6, .3, .06, .1, C.fish], [.55, .45, .6, .3, .06, .1, C.fish]] },
  stable: { feature: 'gable', lift: 1.05, props: [
    [-.4, -.6, 0, 1.2, .4, .35, C.stone], [.55, .4, 0, .6, .45, .45, C.straw], [.55, .4, .45, .6, .45, .45, C.straw],
    [-.6, .45, 0, .7, .4, .6, C.straw, 'sphere'], [0, .05, 0, .12, 1.1, .12, C.dark, 'cylinder'],
    [.7, -.55, 0, .25, .25, .25, C.water, 'cylinder']] },
  tannery: { feature: 'windcatcher', lift: .9, wing: true, props: [
    [-.5, -.45, 0, .7, .15, .7, C.murky], [.35, -.45, 0, .7, .15, .7, C.murky],
    [-.25, .5, 0, .08, 1.1, .08, C.timber], [.3, .5, 0, .08, 1.1, .08, C.timber], [.03, .5, .25, .5, .75, .03, C.hide],
    [.6, .55, .1, .35, .7, .03, C.hideDark], [-.7, .55, 0, .5, .4, .25, C.timber]] },
  herbalist: { feature: 'dome', lift: 1, stair: true, props: [
    [0, -.7, 0, 1.6, 1, .3, C.dark], [-.5, -.7, 1, .14, .2, .14, C.teal, 'cylinder'], [-.15, -.7, 1, .14, .2, .14, C.saffron, 'cylinder'],
    [.2, -.7, 1, .14, .2, .14, C.madder, 'cylinder'], [.2, .35, 0, .9, .7, .5, C.timber], [.2, .35, .7, .22, .18, .22, C.stone, 'cylinder'],
    [-.6, .4, 0, .35, .35, .35, C.leaf, 'sphere'], [-.6, .8, 0, .3, .3, .3, C.leaf, 'sphere']] },
  inn: { feature: 'tower', lift: 1.15, stair: true, props: [
    [0, .1, 0, 1.6, .7, .5, C.timber], ...[-.5, .5].flatMap(u => [-.35, .55].map(v => [u, v, 0, .25, .4, .25, C.dark, 'cylinder'] as Prop)),
    [.3, .1, .7, .1, .12, .1, C.copper, 'cylinder'], [-.3, .1, .7, .1, .12, .1, C.copper, 'cylinder'],
    [.75, -.65, 0, .45, .55, .45, C.wine, 'sphere']] },
};

function local(kind: HomeKind, w: number, d: number, height: number, tone: number): HomePart[] {
  const program = PROGRAMS[kind];
  const h = Math.max(1.8, height * program.lift), t = .22;
  const side = Math.max(1.2, h * .72), front = Math.min(.95, h * .4), back = d * .3;
  const wd = program.wing ? Math.min(w * .3, 1.6) : 0, wh = Math.max(front + .5, side * .8);
  const steps = program.stair ? Math.max(0, Math.min(5, Math.floor((d - back - t - .35) / .38))) : 0;
  const courtL = -w / 2 + t + (wd ? wd + t : 0), courtR = w / 2 - t - (steps ? .5 : 0);
  const door = Math.max(.7, Math.min(1.1, courtR - courtL - .5)), gx = (courtL + courtR) / 2;
  const wall = WALLS[tone % WALLS.length], roof = ROOFS[(tone + HOME_KINDS.indexOf(kind)) % ROOFS.length];
  const parts: HomePart[] = [];
  const add = (role: HomePart['role'], at: Point, size: Point, color: string, shape: Shape = 'box') => parts.push({ role, at, size, color, shape });
  add('trim', [0, .03, 0], [w, .06, d], wall === WALLS[5] ? '#9c9483' : '#cdb994');
  add('shell', [0, h / 2, -d / 2 + t / 2], [w, h, t], wall);
  for (const s of [-1, 1]) add('shell', [s * (w / 2 - t / 2), side / 2, 0], [t, side, d], wall);
  // Low court wall with a real street opening at gx.
  for (const [a, b] of [[-w / 2, gx - door / 2], [gx + door / 2, w / 2]]) if (b - a > .02) add('shell', [(a + b) / 2, front / 2, d / 2 - t / 2], [b - a, front, t], wall);
  add('trim', [0, h + .06, -d / 2 + t / 2], [w + .12, .12, t + .12], roof);
  add('roof', [0, side + .08, -d / 2 + back / 2], [w, .16, back], roof);
  const top = side + .16;
  // Gateway frame on the street side and small dark window openings on each outer wall.
  const frame = HOME_KINDS.indexOf(kind) % 2 ? C.timber : C.dark;
  // Gate posts flank the ground-level opening, a little taller than the court wall, with a stone threshold.
  const post = front + .35;
  for (const s of [-1, 1]) add('shell', [gx + s * (door / 2 + .1), post / 2, d / 2 - t / 2], [.2, post, t + .06], wall);
  for (const s of [-1, 1]) add('trim', [gx + s * (door / 2 + .1), post + .05, d / 2 - t / 2], [.28, .1, t + .12], frame);
  add('trim', [gx, .075, d / 2 - t / 2], [door, .03, t + .1], '#bfae8f');
  const count = 1 + (HOME_KINDS.indexOf(kind) + tone) % 3, windowY = Math.min(1.3, h * .5);
  for (let i = 0; i < count; i++) {
    const u = (i + 1) / (count + 1) - .5;
    add('trim', [u * (w - .8), windowY, -d / 2 - .02], [.38, .48, .06], '#3d342a'); // mid-wall, clear of the eave
  }
  for (const s of [-1, 1]) if (side > 1.25) add('trim', [s * (w / 2 + .02), Math.min(1.2, side * .6), -d / 2 + back + (d - back) * .45], [.06, .44, .36], '#3d342a');
  if (program.feature === 'terrace') for (const s of [-1, 1]) add('trim', [s * (w / 2 - .08), top + .2, -d / 2 + back / 2], [.12, .4, back], wall);
  if (program.feature === 'chimney') add('shell', [w * .28, h + .55, -d / 2 + t / 2], [.42, 1.1, t + .1], wall);
  if (program.feature === 'upper') add('shell', [-w * .2, top + .55, -d / 2 + back / 2], [w * .45, 1.1, back], wall);
  if (program.feature === 'tower') {
    add('shell', [w * .3, top + 1.3, -d / 2 + back / 2], [w * .3, 2.6, back], wall);
    add('roof', [w * .3, top + 2.68, -d / 2 + back / 2], [w * .3 + .14, .16, back + .14], roof);
  }
  if (program.feature === 'dome') {
    add('roof', [0, top + .25, -d / 2 + back / 2], [back * .85, .5, back * .85], wall, 'cylinder');
    add('roof', [0, top + .5 + back * .3, -d / 2 + back / 2], [back * .85, back * .6, back * .85], [C.teal, C.terra, C.pale, '#7f9a8c'][tone % 4], 'sphere');
  }
  if (program.feature === 'gable') add('roof', [0, top + .45, -d / 2 + back / 2], [w + .2, .9, back + .1], [C.terra, C.clay, '#8d6a4a'][tone % 3], 'gable-x');
  if (program.feature === 'vault') add('roof', [0, top + .3, -d / 2 + back / 2], [w, .6, back], wall, 'vault-x');
  if (wd) {
    // Enclosed side room: full-depth inner wall, raised street wall, own lower roof (L-shaped plan).
    const depth = d - back;
    add('shell', [-w / 2 + wd + t / 2, wh / 2, -d / 2 + back + depth / 2], [t, wh, depth], wall);
    add('shell', [-w / 2 + (wd + t) / 2, wh / 2, d / 2 - t / 2], [wd + t, wh, t], wall);
    add('roof', [-w / 2 + (wd + t) / 2, wh + .08, -d / 2 + back + depth / 2], [wd + t, .16, depth], roof);
  }
  // Stair stays inside the court, against the side wall, rising toward the back roof.
  for (let i = 0; i < steps; i++) {
    const sh = (steps - i) * side / steps;
    add('trim', [w / 2 - t - .22, sh / 2, -d / 2 + back + .25 + i * .38], [.44, sh, .38], wall);
  }
  if (program.feature === 'windcatcher') add('shell', [-w * .3, top + .45, -d / 2 + back / 2], [.5, .9, .5], roof);
  if (program.feature === 'pergola') {
    for (const s of [-1, 1]) add('trim', [s * (w / 2 - t / 2), (side + front) / 2, d / 2 - t / 2], [t, side - front, t], C.timber);
    for (let i = 0; i < 5; i++) add('trim', [0, side + .05, -d / 2 + back + (i + .5) * (d - back) / 5], [w, .1, .1], C.timber);
  }
  if (program.feature === 'arcade') {
    for (const u of [-.5, .5]) add('shell', [u * (w - t), (front + side) / 2, d / 2 - t / 2], [.22, side - front, .22], C.pale, 'cylinder');
    add('shell', [0, side + .07, d / 2 - t / 2], [w, .14, t], C.pale);
  }
  if (program.feature === 'awning') {
    for (const s of [-1, 1]) add('trim', [s * door / 2, (front + 1.9) / 2, d / 2 - t / 2], [.08, 1.9 - front, .08], C.dark);
    add('trim', [0, 1.95, d / 2 + .1], [door + .4, .05, .4], C.teal);
  }
  // Furnishings are scaled to the open court and clamped clear of every wall.
  const left = courtL + .1, right = courtR - .1;
  const iw = (right - left) / 2, cx = (right + left) / 2, id = d / 2 - t - .1, k = Math.min(1.2, Math.max(.6, Math.min(iw, id) / 1.5));
  const ky = Math.min(1, (side - .2) / 1.4);
  for (const [u, v, bottom, sx0, sy, sz0, color, shape = 'box'] of program.props) {
    const sx = Math.min(sx0 * k, iw * 2), sz = Math.min(sz0 * k, id * 2);
    const x = cx + Math.max(-iw + sx / 2, Math.min(iw - sx / 2, u * iw)), z = Math.max(-id + sz / 2, Math.min(id - sz / 2, v * id));
    add('interior', [x, .06 + (bottom + sy / 2) * ky, z], [sx, sy * ky, sz], color, shape);
  }
  return parts;
}

export function buildHome(lot: HomeLot): HomePart[] {
  const odd = lot.turn % 2 === 1, angle = lot.turn * Math.PI / 2, c = Math.round(Math.cos(angle)), s = Math.round(Math.sin(angle));
  return local(lot.kind, odd ? lot.depth : lot.width, odd ? lot.width : lot.depth, lot.height, lot.tone).map(p => ({ ...p,
    at: [lot.x + p.at[0] * c + p.at[2] * s, p.at[1], lot.z - p.at[0] * s + p.at[2] * c] as Point,
    size: (odd ? [p.size[2], p.size[1], p.size[0]] : p.size) as Point,
    shape: odd ? p.shape.replace(/-([xz])$/, (_, a) => a === 'x' ? '-z' : '-x') as Shape : p.shape }));
}

const hash = (x: number, z: number, salt: number) => {
  let n = Math.imul(Math.round(x * 10) + 7919, 73856093) ^ Math.imul(Math.round(z * 10) - 104729, 19349663) ^ Math.imul(salt, 83492791);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

/** Deterministic, varied assignment where adjacent lots never share a building program. */
export function assignHomeKinds(lots: Lot[]): HomeLot[] {
  const assigned: HomeLot[] = [];
  for (const lot of [...lots].sort((a, b) => a.z - b.z || a.x - b.x)) {
    const taken = new Set(assigned.filter(o => Math.hypot(o.x - lot.x, o.z - lot.z) < 13).map(o => o.kind));
    const options = HOME_KINDS.filter(k => !taken.has(k));
    const near = assigned.filter(o => Math.hypot(o.x - lot.x, o.z - lot.z) < 9.5).map(o => o.tone);
    const tones = WALLS.map((_, i) => i).filter(i => !near.includes(i));
    assigned.push({ ...lot, kind: options[hash(lot.x, lot.z, 1) % options.length], turn: hash(lot.x, lot.z, 2) % 4, tone: tones[hash(lot.x, lot.z, 3) % tones.length] });
  }
  return assigned;
}

// Eight market stalls, each with its own awning cloth and goods.
export const MARKET_STALLS = [
  { awning: ['#c8b38a', '#967b58'], goods: 'amphorae' }, { awning: ['#d6c6a6', '#3f5a7d'], goods: 'cloth' },
  { awning: ['#e3d5b4', '#a3453a'], goods: 'produce' }, { awning: ['#cfc19c', '#4f8a83'], goods: 'fish' },
  { awning: ['#e6d9bc', '#d7a23b'], goods: 'bread' }, { awning: ['#d3c4a1', '#6f8456'], goods: 'herbs' },
  { awning: ['#ddd0b1', '#6e3a3e'], goods: 'baskets' }, { awning: ['#c9bb98', '#b06d3e'], goods: 'lamps' },
] as const;
// Distinct masonry per worker room; geometry, doors and circulation are unchanged.
export const ROOM_FINISHES = [
  ['#cbb994', '#deceb0', '#d4c19f', '#e3d4b5', '#c6b18d'], ['#d9cdb5', '#e8dfcb', '#cfc2a6', '#ece4d2', '#c9bb9c'],
  ['#c9a982', '#d8bb95', '#bf9d76', '#dfc6a2', '#b9966f'], ['#b9b0a0', '#cbc3b4', '#aea595', '#d3ccbe', '#a69c8a'],
  ['#d7b8a2', '#e4cab6', '#cdab94', '#ead5c4', '#c49f88'], ['#c7b07c', '#d8c393', '#bda570', '#e0cd9f', '#b49a64'],
  ['#e2dccb', '#efe9da', '#d8d1be', '#f3eee2', '#cfc7b2'],
];
