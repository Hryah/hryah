import type { CauseEntry, DebugAction, Phase } from '../../contracts';
import { computeSolarPowerEfficiency } from '../minigames/SolarGame';
import { ROOM_BLUEPRINT } from './blueprint';
import type { RoomAction, RoomFacing, RoomInput, RoomResult, RoomState } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function efficiency(panelAngleDeg: number, targetAngleDeg: number): number {
  return computeSolarPowerEfficiency(targetAngleDeg, 0, panelAngleDeg, 0);
}

function isFacing(value: unknown): value is RoomFacing {
  return value === 'front' || value === 'back' || value === 'left' || value === 'right';
}

function appendLog(
  state: RoomState,
  kind: CauseEntry['kind'],
  suffix: string,
  params: Record<string, number | string> = {},
  causedBy: string[] = [],
): RoomState {
  let sequence = state.nextLogSeq;
  const previous = [...state.input.log, ...state.log];
  while (previous.some((entry) => entry.id === `flight:room:${sequence}`)) sequence += 1;
  const entry: CauseEntry = {
    id: `flight:room:${sequence}`,
    phase: 'flight',
    tS: state.tS,
    kind,
    system: 'power',
    messageKey: `flight.room.log.${suffix}`,
    params,
    causedBy,
  };
  return { ...state, nextLogSeq: sequence + 1, log: [...state.log, entry] };
}

/** The player is a circle; equipment footprints are axis-aligned rectangles. */
export function canOccupyRoomPoint(xM: number, zM: number): boolean {
  if (!Number.isFinite(xM) || !Number.isFinite(zM)) return false;
  const { bounds, player, obstacles } = ROOM_BLUEPRINT;
  if (xM < bounds.minXM + player.radiusM || xM > bounds.maxXM - player.radiusM ||
      zM < bounds.minZM + player.radiusM || zM > bounds.maxZM - player.radiusM) return false;
  return obstacles.every((obstacle) => {
    const closestX = clamp(xM, obstacle.xM - obstacle.widthM / 2, obstacle.xM + obstacle.widthM / 2);
    const closestZ = clamp(zM, obstacle.zM - obstacle.depthM / 2, obstacle.zM + obstacle.depthM / 2);
    return Math.hypot(xM - closestX, zM - closestZ) >= player.radiusM - 1e-9;
  });
}

export function canInteractWithConsole(state: RoomState): boolean {
  const target = ROOM_BLUEPRINT.console.interaction;
  return !state.console.completed && !state.console.open &&
    Math.hypot(state.player.xM - target.xM, state.player.zM - target.zM) <= target.radiusM;
}

function move(state: RoomState, action: Extract<RoomAction, { type: 'move' }>): RoomState {
  if (state.console.open || !Number.isFinite(action.x) || !Number.isFinite(action.z) ||
      !Number.isFinite(action.dtS) || action.dtS <= 0) return state;
  const dtS = Math.min(action.dtS, ROOM_BLUEPRINT.player.maxMoveDtS);
  // Scale first so even finite axes near the numeric limit can be normalized safely.
  const scale = Math.max(1, Math.abs(action.x), Math.abs(action.z));
  const scaledX = action.x / scale;
  const scaledZ = action.z / scale;
  const magnitude = Math.hypot(scaledX, scaledZ);
  const x = magnitude > 1 / scale ? scaledX / magnitude : action.x;
  const z = magnitude > 1 / scale ? scaledZ / magnitude : action.z;
  const distanceM = ROOM_BLUEPRINT.player.speedMs * dtS;
  const count = Math.max(1, Math.ceil(distanceM / ROOM_BLUEPRINT.player.maxStepDistanceM));
  const deltaX = x * distanceM / count;
  const deltaZ = z * distanceM / count;
  const { bounds, player } = ROOM_BLUEPRINT;
  let { xM, zM } = state.player;
  for (let index = 0; index < count; index += 1) {
    const nextX = clamp(xM + deltaX, bounds.minXM + player.radiusM, bounds.maxXM - player.radiusM);
    if (canOccupyRoomPoint(nextX, zM)) xM = nextX;
    const nextZ = clamp(zM + deltaZ, bounds.minZM + player.radiusM, bounds.maxZM - player.radiusM);
    if (canOccupyRoomPoint(xM, nextZ)) zM = nextZ;
  }
  let facing = state.player.facing;
  if (x !== 0 || z !== 0) {
    facing = isFacing(action.facing) ? action.facing : Math.abs(x) > Math.abs(z)
      ? (x > 0 ? 'right' : 'left') : (z > 0 ? 'front' : 'back');
  }
  return {
    ...state,
    tS: state.tS + dtS,
    player: { xM, zM, facing, moving: xM !== state.player.xM || zM !== state.player.zM },
  };
}

export const roomPhase: Phase<RoomInput, RoomState, RoomAction, RoomResult> = {
  init(input, seed) {
    const { initialAngleDeg, targetAngleDeg } = ROOM_BLUEPRINT.console;
    const state: RoomState = {
      input: { log: [...input.log] },
      rngState: Number.isFinite(seed) ? seed >>> 0 : 0,
      tS: 0,
      nextLogSeq: 0,
      player: { ...ROOM_BLUEPRINT.player.spawn, facing: 'front', moving: false },
      console: {
        open: false,
        completed: false,
        panelAngleDeg: initialAngleDeg,
        targetAngleDeg,
        efficiencyPct: efficiency(initialAngleDeg, targetAngleDeg),
        feedback: 'none',
      },
      log: [],
    };
    return appendLog(state, 'event', 'arrival');
  },

  step(state, action) {
    if (state.console.completed) return state;
    switch (action.type) {
      case 'move': return move(state, action);
      case 'stop':
        return state.player.moving ? { ...state, player: { ...state.player, moving: false } } : state;
      case 'interact':
        if (!canInteractWithConsole(state)) return state;
        return appendLog({
          ...state,
          player: { ...state.player, moving: false },
          console: { ...state.console, open: true, feedback: 'none' },
        }, 'event', 'consoleOpened');
      case 'close_console':
        if (!state.console.open) return state;
        return appendLog({ ...state, console: { ...state.console, open: false, feedback: 'none' } },
          'event', 'consoleClosed');
      case 'set_panel_angle': {
        if (!state.console.open || !Number.isFinite(action.angleDeg)) return state;
        const angleDeg = clamp(action.angleDeg, ROOM_BLUEPRINT.console.minAngleDeg, ROOM_BLUEPRINT.console.maxAngleDeg);
        return {
          ...state,
          console: {
            ...state.console,
            panelAngleDeg: angleDeg,
            efficiencyPct: efficiency(angleDeg, state.console.targetAngleDeg),
            feedback: 'none',
          },
        };
      }
      case 'apply_panel_angle': {
        if (!state.console.open) return state;
        const { panelAngleDeg: angleDeg, targetAngleDeg, efficiencyPct } = state.console;
        const commanded = appendLog(state, 'decision', 'angleCommand', { angleDeg, targetAngleDeg, efficiencyPct });
        const command = commanded.log[commanded.log.length - 1];
        if (!command) return state;
        if (Math.abs(angleDeg - targetAngleDeg) > ROOM_BLUEPRINT.console.toleranceDeg) {
          return appendLog({ ...commanded, console: { ...state.console, feedback: 'rejected' } },
            'failure', 'angleRejected', {
              angleDeg, targetAngleDeg, efficiencyPct, toleranceDeg: ROOM_BLUEPRINT.console.toleranceDeg,
            }, [command.id]);
        }
        return appendLog({
          ...commanded,
          player: { ...state.player, moving: false },
          console: { ...state.console, open: false, completed: true, feedback: 'completed' },
        }, 'event', 'panelAligned', { angleDeg, efficiencyPct }, [command.id]);
      }
    }
  },

  isDone: (state) => state.console.completed,
  finish: (state) => ({
    result: { completed: state.console.completed, solarEfficiencyPct: state.console.efficiencyPct },
    log: [...state.log],
  }),
  debugActions(state): DebugAction<RoomAction>[] {
    if (state.console.completed) return [];
    if (state.console.open) return [
      { group: 'flight.room.console', label: 'flight.room.debug.align', action: { type: 'set_panel_angle', angleDeg: state.console.targetAngleDeg } },
      { group: 'flight.room.console', label: 'flight.room.debug.apply', action: { type: 'apply_panel_angle' } },
      { group: 'flight.room.console', label: 'flight.room.debug.close', action: { type: 'close_console' } },
    ];
    return [
      { group: 'flight.room.move', label: 'flight.room.debug.left', action: { type: 'move', x: -1, z: 0, dtS: 0.2 } },
      { group: 'flight.room.move', label: 'flight.room.debug.right', action: { type: 'move', x: 1, z: 0, dtS: 0.2 } },
      { group: 'flight.room.move', label: 'flight.room.debug.back', action: { type: 'move', x: 0, z: -1, dtS: 0.2 } },
      { group: 'flight.room.move', label: 'flight.room.debug.front', action: { type: 'move', x: 0, z: 1, dtS: 0.2 } },
      ...(canInteractWithConsole(state) ? [
        { group: 'flight.room.console', label: 'flight.room.debug.interact', action: { type: 'interact' as const } },
      ] : []),
    ];
  },
};
