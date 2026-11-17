import type { Agent } from './agents.ts';
import { ROOMS, roomFor, routeBetween, sampleRoute, WALK_SPEED, type Point, type roomPoseAt } from './room-choreography.ts';

export const LIVE_HEARTBEAT_MS = 120_000;
export type LivePose = Omit<ReturnType<typeof roomPoseAt>, 'phase'> & {
  phase: 'travel' | 'coding' | 'reading' | 'thinking' | 'waiting' | 'working' | 'idle';
  headTilt: number; headTurn: number; armRest: number;
  agentId: string | null; run: string | null; heartbeatAt: string | null; active: boolean;
};
export type LiveState = {
  id: string; position: Point; heading: number; route: Point[] | null; distance: number;
  fromRoom: string; toRoom: string; event: string; clock: number;
  worker?: string; lastPose?: LivePose;
};

/** World-space footprint, independent of animation phase or persona identity. */
export function physicalRoomAt(position: Point): string {
  return ROOMS.find(r => Math.abs(position[0] - r.center[0]) < 2.85 && Math.abs(position[2] - r.center[2]) <= 2.5)?.id ?? 'central-lane';
}
export function isLiveAgent(agent: Agent | undefined, nowMs: number): boolean {
  if (!agent || agent.status !== 'running' || agent.activity === 'done' || !agent.heartbeatAt) return false;
  const age = nowMs - Date.parse(agent.heartbeatAt);
  return Number.isFinite(age) && age >= 0 && age <= LIVE_HEARTBEAT_MS;
}
function category(tool: string | null): number {
  const name = (tool ?? '').toLowerCase();
  if (/delegat|agent|spawn/.test(name)) return 0;
  if (/architect|diagram|design/.test(name)) return 1;
  if (/test|review|lint|audit/.test(name)) return 3;
  if (/search|browse|web|extract|read/.test(name)) return 4;
  if (/todo|plan|calendar/.test(name)) return 5;
  if (/write|document|note|patch/.test(name)) return 6;
  return 2;
}
/** Visual interpretation of an observed tool, NOT actual collaboration or dispatch. */
export function targetRoomForTool(tool: string | null, fromId: string): string {
  const index = category(tool);
  return ROOMS[index].id === fromId ? ROOMS[(index + 1) % ROOMS.length].id : ROOMS[index].id;
}
export function createLiveState(id: string): LiveState {
  const room = roomFor(id);
  return { id: room.id, position: [...room.home], heading: room.facing, route: null,
    distance: 0, fromRoom: room.id, toRoom: room.id, event: '', clock: 0 };
}
function poseOf(state: LiveState, agent: Agent | undefined, active: boolean): LivePose {
  const traveling = active && state.route !== null;
  const working = active && !traveling;
  const tool = (agent?.lastTool ?? '').split('.').at(-1)!.toLowerCase();
  const phase: LivePose['phase'] = traveling ? 'travel' : !working ? 'idle'
    : agent?.activity === 'thinking' ? 'thinking' : agent?.activity === 'waiting' ? 'waiting'
    : /^(patch|write_file|edit_file|apply_patch|replace_in_file|str_replace_editor)$/.test(tool) ? 'coding'
    : /read|search|browse|extract|inspect|view/.test(tool) ? 'reading' : 'working';
  const typing = phase === 'coding';
  const gait = traveling ? Math.sin(state.clock * 10) : 0;
  return { position: [...state.position], heading: state.heading, room: physicalRoomAt(state.position),
    fromRoom: state.fromRoom, toRoom: state.toRoom, phase,
    headTilt: phase === 'reading' ? 0.18 + Math.sin(state.clock * 0.8) * 0.035 : phase === 'thinking' ? -0.08 : 0,
    headTurn: phase === 'thinking' ? Math.sin(state.clock * 0.55) * 0.15 : phase === 'waiting' ? Math.sin(state.clock * 0.3) * 0.045 : 0,
    armRest: phase === 'thinking' ? 0.4 : phase === 'waiting' ? 0.08 : 0,
    traveling, sit: working ? 1 : 0, leftFoot: Math.max(0, gait) * 0.22, rightFoot: Math.max(0, -gait) * 0.22,
    leftStride: gait * 0.28, rightStride: -gait * 0.28, leftArm: -gait * 0.4, rightArm: gait * 0.4,
    leftHand: typing ? Math.sin(state.clock * 22) * 0.065 : 0,
    rightHand: typing ? Math.cos(state.clock * 22) * 0.065 : 0, bob: Math.abs(gait) * 0.035, gesture: 0,
    agentId: agent?.id ?? null, run: agent?.run ?? null, heartbeatAt: agent?.heartbeatAt ?? null, active };
}
/** Immutable core: only a fresh live event can initiate motion; no timed wandering. */
export function updateLiveState(previous: LiveState, deltaSeconds: number, agent: Agent | undefined, nowMs: number): { state: LiveState; pose: LivePose } {
  const state: LiveState = { ...previous, position: [...previous.position] };
  const active = isLiveAgent(agent, nowMs);
  if (!active) return { state, pose: state.lastPose ? {...state.lastPose, active:false, traveling:false, phase:'idle', agentId:agent?.id??null, run:agent?.run??null, heartbeatAt:agent?.heartbeatAt??null} : poseOf(state, agent, false) };
  const worker = JSON.stringify([agent!.id,agent!.run]);
  if (state.worker !== worker) {
    state.worker=worker; state.route=null; state.distance=0; state.event='';
  }
  const event = JSON.stringify([worker, agent!.lastTool, agent!.lastToolAt??null, agent!.toolCalls]);
  if (agent!.activity === 'tool' && event !== state.event) {
    state.event = event; // Consume in-flight observations, never queue invisible future trips.
    if (!state.route && agent!.lastTool) {
      const source = physicalRoomAt(state.position);
      const from = roomFor(source === 'central-lane' ? state.toRoom : source);
      const target = targetRoomForTool(agent!.lastTool, from.id);
      const route = routeBetween(from.id, target);
      // After a visit, exit past the front of the table before reaching the home/door axis.
      const atHome = Math.hypot(state.position[0] - from.home[0], state.position[2] - from.home[2]) < 1e-8;
      state.route = source === 'central-lane' ? [state.position, [state.position[0],0,0], [roomFor(target).center[0],0,0], ...route.slice(4)] : atHome ? route : [state.position,
        [state.position[0], 0, from.home[2] - Math.sign(from.home[2]) * 1.1],
        [from.home[0], 0, from.home[2] - Math.sign(from.home[2]) * 1.1], ...route.slice(1)];
      state.distance = 0;
      state.fromRoom = from.id;
      state.toRoom = target;
    }
  }
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  state.clock += delta;
  if (state.route) {
    state.distance += delta * WALK_SPEED;
    const sample = sampleRoute(state.route, state.distance);
    state.position = sample.position;
    state.heading = sample.heading;
    if (state.distance >= sample.length - 1e-9) {
      state.position = [...state.route.at(-1)!];
      state.route = null;
      state.heading = roomFor(state.toRoom).facing;
    }
  }
  const pose = poseOf(state, agent, true);
  state.lastPose=pose;
  return { state, pose };
}
/** Retain one controller per stable visual slot, not per incoming snapshot. */
export function createLiveController(id: string) {
  let state = createLiveState(id);
  return { update(deltaSeconds: number, agent?: Agent, nowMs = Date.now()): LivePose {
    const result = updateLiveState(state, deltaSeconds, agent, nowMs);
    state = result.state;
    return result.pose;
  } };
}
/** Pure one-shot compatibility helper. Use a retained controller for live snapshots. */
export function livePoseAt(seconds: number, id: string, agent?: Agent): LivePose {
  return updateLiveState(createLiveState(id), seconds, agent, Date.now()).pose;
}
