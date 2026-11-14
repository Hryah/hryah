import { describe, expect, it } from 'vitest';
import type { CauseEntry } from '../../contracts';
import { computeSolarPowerEfficiency } from '../minigames/SolarGame';
import {
  ROOM_BLUEPRINT, canInteractWithConsole, canOccupyRoomPoint, roomPhase,
  type RoomAction, type RoomFacing, type RoomState,
} from './index';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function start(): RoomState {
  return roomPhase.init({ log: [] }, 42);
}

function placed(xM: number, zM: number): RoomState {
  const state = start();
  expect(canOccupyRoomPoint(xM, zM)).toBe(true);
  return { ...state, player: { ...state.player, xM, zM } };
}

function walkToConsole(): RoomState {
  let state = start();
  const actions: RoomAction[] = [
    { type: 'move', x: 1, z: 0, dtS: 1 },
    { type: 'move', x: 1, z: 0, dtS: 0.2 / ROOM_BLUEPRINT.player.speedMs },
    { type: 'move', x: 0, z: -1, dtS: 1 },
    { type: 'move', x: 0, z: -1, dtS: 1.25 / ROOM_BLUEPRINT.player.speedMs },
  ];
  for (const action of actions) {
    state = roomPhase.step(state, action);
    expect(canOccupyRoomPoint(state.player.xM, state.player.zM)).toBe(true);
  }
  expect(canInteractWithConsole(state)).toBe(true);
  return state;
}

describe('roomPhase — isolated 3D-room training rules', () => {
  it('uses a 10 by 8 metre blueprint and reuses the existing solar calculation', () => {
    const state = start();
    const bounds = ROOM_BLUEPRINT.bounds;
    expect(bounds.maxXM - bounds.minXM).toBe(10);
    expect(bounds.maxZM - bounds.minZM).toBe(8);
    expect(ROOM_BLUEPRINT.player.radiusM).toBe(0.25);
    expect(canOccupyRoomPoint(state.player.xM, state.player.zM)).toBe(true);
    expect(state.console.efficiencyPct).toBe(computeSolarPowerEfficiency(
      state.console.targetAngleDeg, 0, state.console.panelAngleDeg, 0,
    ));
  });

  it('does not mutate frozen inputs and reproduces the same JSON state from the same actions', () => {
    const previous: CauseEntry = {
      id: 'flight:room:0', phase: 'flight', tS: 0, kind: 'decision', system: 'power',
      messageKey: 'test.previous', params: { value: 1 },
    };
    const input = deepFreeze({ log: [previous] });
    const first = deepFreeze(roomPhase.init(input, 42));
    const action: RoomAction = { type: 'move', x: 1, z: -1, dtS: 0.2, facing: 'back' };
    const next = roomPhase.step(first, action);
    expect(next).toEqual(roomPhase.step(roomPhase.init(input, 42), action));
    expect(first.player).toEqual({ ...ROOM_BLUEPRINT.player.spawn, facing: 'front', moving: false });
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
    expect(next.log[0]?.id).toBe('flight:room:1');
    expect(roomPhase.finish(next).log).not.toContainEqual(previous);
  });

  it('limits diagonal speed and accepts analog movement without a diagonal boost', () => {
    const state = placed(0, 1);
    const straight = roomPhase.step(state, { type: 'move', x: 0, z: 1, dtS: 0.2 });
    const diagonal = roomPhase.step(state, { type: 'move', x: 1, z: 1, dtS: 0.2 });
    const analog = roomPhase.step(state, { type: 'move', x: 0.5, z: 0, dtS: 0.2 });
    const distance = (s: RoomState) => Math.hypot(s.player.xM, s.player.zM - 1);
    expect(distance(diagonal)).toBeCloseTo(distance(straight), 10);
    expect(distance(straight)).toBeCloseTo(ROOM_BLUEPRINT.player.speedMs * 0.2);
    expect(distance(analog)).toBeCloseTo(distance(straight) / 2);
  });

  it('keeps the complete player circle inside every wall', () => {
    let state = placed(4.5, 3.5);
    state = roomPhase.step(state, { type: 'move', x: 1, z: 1, dtS: 1 });
    expect(state.player.xM).toBeCloseTo(4.75);
    expect(state.player.zM).toBeCloseTo(3.75);
    const stopped = roomPhase.step(state, { type: 'move', x: 1, z: 1, dtS: 1 });
    expect(stopped.player.moving).toBe(false);
    state = placed(-4.5, -3.5);
    state = roomPhase.step(state, { type: 'move', x: -1, z: -1, dtS: 1 });
    expect(state.player.xM).toBeCloseTo(-4.75);
    expect(state.player.zM).toBeCloseTo(-3.75);
  });

  it('substeps large movement without tunnelling through either cargo or the console', () => {
    const left = roomPhase.step(placed(-4, 0), { type: 'move', x: 1, z: 0, dtS: 100 });
    expect(left.player.xM).toBeLessThanOrEqual(-3.45 + 1e-8);
    expect(left.player.xM).toBeGreaterThan(-4);
    expect(left.tS).toBe(ROOM_BLUEPRINT.player.maxMoveDtS);
    const right = roomPhase.step(placed(4.5, 0.9), { type: 'move', x: -1, z: 0, dtS: 1 });
    expect(right.player.xM).toBeGreaterThanOrEqual(3.45 - 1e-8);
    const console = roomPhase.step(placed(0, 0), { type: 'move', x: 0, z: -1, dtS: 1 });
    expect(console.player.zM).toBeGreaterThanOrEqual(-2.05 - 1e-8);
    for (const state of [left, right, console]) {
      expect(canOccupyRoomPoint(state.player.xM, state.player.zM)).toBe(true);
    }
  });

  it('ignores invalid movement times and axes, and safely normalizes huge finite axes', () => {
    const state = start();
    for (const dtS of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(roomPhase.step(state, { type: 'move', x: 1, z: 0, dtS })).toBe(state);
    }
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(roomPhase.step(state, { type: 'move', x: value, z: 0, dtS: 1 })).toBe(state);
      expect(roomPhase.step(state, { type: 'move', x: 0, z: value, dtS: 1 })).toBe(state);
    }
    const next = roomPhase.step(state, {
      type: 'move', x: Number.MAX_VALUE, z: Number.MAX_VALUE, dtS: 0.1,
    });
    expect(Number.isFinite(next.player.xM)).toBe(true);
    expect(Number.isFinite(next.player.zM)).toBe(true);
    expect(Math.hypot(next.player.xM - state.player.xM, next.player.zM - state.player.zM)).toBeCloseTo(0.26);
  });

  it('validates optional presentation-facing and preserves the last facing when standing still', () => {
    const state = start();
    const moving = roomPhase.step(state, { type: 'move', x: 1, z: 0, dtS: 0.1, facing: 'back' });
    expect(moving.player.facing).toBe('back');
    const standing = roomPhase.step(moving, { type: 'move', x: 0, z: 0, dtS: 0.1, facing: 'left' });
    expect(standing.player.moving).toBe(false);
    expect(standing.player.facing).toBe('back');
    const invalid = roomPhase.step(state, {
      type: 'move', x: 1, z: 0, dtS: 0.1, facing: 'invalid' as RoomFacing,
    });
    expect(invalid.player.facing).toBe('right');
  });

  it('stops presentation movement without advancing time or changing the position, facing or log', () => {
    const moving = deepFreeze(roomPhase.step(start(), {
      type: 'move', x: 1, z: 0, dtS: 0.1, facing: 'back',
    }));
    const stopped = roomPhase.step(moving, { type: 'stop' });
    expect(moving.player.moving).toBe(true);
    expect(stopped).toEqual({ ...moving, player: { ...moving.player, moving: false } });
    expect(JSON.parse(JSON.stringify(stopped))).toEqual(stopped);
    expect(roomPhase.step(stopped, { type: 'stop' })).toBe(stopped);
    expect(roomPhase.step(start(), { type: 'stop' }).tS).toBe(0);
  });

  it('opens only near the console and blocks movement and task commands while closed', () => {
    const state = start();
    expect(canInteractWithConsole(state)).toBe(false);
    expect(roomPhase.step(state, { type: 'interact' })).toBe(state);
    expect(roomPhase.step(state, { type: 'set_panel_angle', angleDeg: 35 })).toBe(state);
    expect(roomPhase.step(state, { type: 'apply_panel_angle' })).toBe(state);
    const near = walkToConsole();
    const open = roomPhase.step(near, { type: 'interact' });
    expect(open.console.open).toBe(true);
    expect(open.player.moving).toBe(false);
    expect(roomPhase.step(open, { type: 'move', x: 1, z: 0, dtS: 1 })).toBe(open);
  });

  it('rejects an incorrect command visibly and links the failure to its actual command', () => {
    const open = deepFreeze(roomPhase.step(walkToConsole(), { type: 'interact' }));
    const failed = roomPhase.step(open, { type: 'apply_panel_angle' });
    expect(failed.console.feedback).toBe('rejected');
    expect(failed.console.open).toBe(true);
    expect(roomPhase.isDone(failed)).toBe(false);
    expect(open.console.feedback).toBe('none');
    const failure = failed.log.at(-1)!;
    const command = failed.log.at(-2)!;
    expect(failure.kind).toBe('failure');
    expect(command.kind).toBe('decision');
    expect(failure.causedBy).toEqual([command.id]);
    expect(failure.messageKey).toBe('flight.room.log.angleRejected');
  });

  it('retains the chosen angle when cancelling and resumes without completing or advancing time', () => {
    const open = roomPhase.step(walkToConsole(), { type: 'interact' });
    const selected = roomPhase.step(open, { type: 'set_panel_angle', angleDeg: 35 });
    const cancelled = roomPhase.step(selected, { type: 'close_console' });
    expect(cancelled.console.open).toBe(false);
    expect(cancelled.console.panelAngleDeg).toBe(35);
    expect(cancelled.console.completed).toBe(false);
    expect(cancelled.player).toEqual(selected.player);
    expect(cancelled.tS).toBe(open.tS);
    expect(roomPhase.finish(cancelled).result.completed).toBe(false);
    const resumed = roomPhase.step(cancelled, { type: 'interact' });
    expect(resumed.console.open).toBe(true);
    expect(resumed.console.panelAngleDeg).toBe(35);
    expect(resumed.tS).toBe(open.tS);
  });

  it('rejects nonfinite slider values and clamps finite angles to the permitted range', () => {
    const open = roomPhase.step(walkToConsole(), { type: 'interact' });
    for (const angleDeg of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(roomPhase.step(open, { type: 'set_panel_angle', angleDeg })).toBe(open);
    }
    expect(roomPhase.step(open, { type: 'set_panel_angle', angleDeg: 999 }).console.panelAngleDeg).toBe(90);
    expect(roomPhase.step(open, { type: 'set_panel_angle', angleDeg: -999 }).console.panelAngleDeg).toBe(-90);
  });

  it('passes init through finish on an actual walk and freezes every action after completion', () => {
    let state = roomPhase.step(walkToConsole(), { type: 'interact' });
    state = roomPhase.step(state, { type: 'set_panel_angle', angleDeg: state.console.targetAngleDeg });
    state = roomPhase.step(deepFreeze(state), { type: 'apply_panel_angle' });
    expect(roomPhase.isDone(state)).toBe(true);
    expect(state.console.feedback).toBe('completed');
    expect(state.console.open).toBe(false);
    expect(state.player.moving).toBe(false);
    expect(roomPhase.finish(state).result).toEqual({ completed: true, solarEfficiencyPct: 100 });
    expect(JSON.parse(JSON.stringify(roomPhase.finish(state)))).toEqual(roomPhase.finish(state));
    const ids = new Set(state.log.map((entry) => entry.id));
    expect(ids.size).toBe(state.log.length);
    for (const entry of state.log) {
      for (const id of entry.causedBy ?? []) expect(ids.has(id)).toBe(true);
    }
    const actions: RoomAction[] = [
      { type: 'move', x: 1, z: 1, dtS: 1 }, { type: 'stop' }, { type: 'interact' },
      { type: 'set_panel_angle', angleDeg: -30 }, { type: 'apply_panel_angle' }, { type: 'close_console' },
    ];
    for (const action of actions) expect(roomPhase.step(state, action)).toBe(state);
    expect(roomPhase.debugActions?.(state)).toEqual([]);
  });

  it('accepts the tolerance boundary but rejects a value immediately outside it', () => {
    const open = roomPhase.step(walkToConsole(), { type: 'interact' });
    const boundary = open.console.targetAngleDeg + ROOM_BLUEPRINT.console.toleranceDeg;
    const selected = roomPhase.step(open, { type: 'set_panel_angle', angleDeg: boundary });
    expect(roomPhase.isDone(roomPhase.step(selected, { type: 'apply_panel_angle' }))).toBe(true);
    const outside = roomPhase.step(open, { type: 'set_panel_angle', angleDeg: boundary + 0.01 });
    expect(roomPhase.step(outside, { type: 'apply_panel_angle' }).console.feedback).toBe('rejected');
  });
});
