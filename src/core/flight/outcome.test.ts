import { describe, expect, it } from 'vitest';
import type { CauseEntry, FlightInput, FlightResult } from '../contracts';
import { applyDamage } from '../consortium/damage';
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION, stubDesign, stubFlight } from '../stubs';
import { flightPhase, type FlightAction, type FlightState } from './index';

function input(): FlightInput {
  const design = stubDesign({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, SAMPLE_DESIGN);
  return { mission: SAMPLE_MISSION, spec: design.result, log: design.log };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function loseNaturally(source = input()): FlightState {
  let state = flightPhase.init(source, 7);
  for (let ticks = 0; ticks < 1600 && state.gameMode !== 'GAME_OVER'; ticks += 1) {
    state = flightPhase.step(state, { type: 'tick', dtS: 0.25 });
  }
  expect(state.gameMode).toBe('GAME_OVER');
  expect(state.energyPct === 0 || state.oxygenPct === 0).toBe(true);
  return state;
}

function winNaturally(): FlightState {
  let state = flightPhase.init(input(), 11);
  state = flightPhase.step(state, { type: 'open_terminal', terminalId: 'SOLAR' });
  state = flightPhase.step(state, { type: 'complete_minigame_debug' });
  for (const terminalId of ['DOCKING_1', 'DOCKING_2']) {
    state = flightPhase.step(state, { type: 'open_terminal', terminalId });
    state = flightPhase.step(state, { type: 'complete_minigame_debug' });
    for (let ticks = 0; ticks < 8; ticks += 1) {
      state = flightPhase.step(state, { type: 'tick', dtS: 0.25 });
    }
  }
  state = flightPhase.step(state, { type: 'open_terminal', terminalId: 'DOCKING_3' });
  // Complete the final docking through its normal controls and tick-driven hold.
  for (let ticks = 0; ticks < 200 && state.gameMode === 'MINIGAME_ACTIVE'; ticks += 1) {
    const docking = state.activeMinigame.docking;
    if (!docking) throw new Error('Final docking did not open');
    state = flightPhase.step(state, {
      type: 'docking_input',
      thrustX: docking.offsetXPx > 2 ? -1 : docking.offsetXPx < -2 ? 1 : 0,
      thrustY: docking.offsetYPx > 2 ? -1 : docking.offsetYPx < -2 ? 1 : 0,
    });
    state = flightPhase.step(state, { type: 'tick', dtS: 0.25 });
  }
  expect(state.gameMode).toBe('VICTORY');
  return state;
}

function assertResolvedJournal(log: CauseEntry[]): void {
  const previous = new Set<string>();
  for (const entry of log) {
    expect(previous.has(entry.id), `duplicate id ${entry.id}`).toBe(false);
    if (entry.kind === 'failure') expect(entry.causedBy?.length).toBeGreaterThan(0);
    for (const cause of entry.causedBy ?? []) {
      expect(previous.has(cause), `missing prior cause ${cause} for ${entry.id}`).toBe(true);
    }
    previous.add(entry.id);
  }
}

describe('flight deployment outcome contract', () => {
  it('accepts old results without deploymentStatus and leaves the legacy producer compatible', () => {
    const legacy: FlightResult = stubFlight(input()).result;
    expect(legacy.deploymentStatus).toBeUndefined();
    expect(JSON.parse(JSON.stringify(legacy))).toEqual(legacy);
  });

  it('naturally runs out of resources and finishes as a deterministic causal loss', () => {
    const source = deepFreeze(input());
    const state = deepFreeze(loseNaturally(source));
    expect(state.phaseDone).toBe(false);
    expect(flightPhase.isDone(state)).toBe(true);
    const finished = flightPhase.finish(state);
    expect(finished.result.deploymentStatus).toBe('lost');
    expect(finished).toEqual(flightPhase.finish(state));
    expect(finished).toEqual(flightPhase.finish(loseNaturally(source)));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(JSON.parse(JSON.stringify(finished))).toEqual(finished);
    expect(finished.log.filter((entry) => entry.messageKey === 'flight.failure.satelliteLost')).toHaveLength(1);
    expect(state.log.some((entry) => entry.messageKey === 'flight.failure.satelliteLost')).toBe(false);
    for (const previous of source.log) expect(finished.log.some((entry) => entry.id === previous.id)).toBe(false);
    assertResolvedJournal([...source.log, ...finished.log]);
  });

  it('freezes every terminal action and cannot redeploy a lost satellite with the prototype shortcut', () => {
    const state = deepFreeze(loseNaturally());
    const actions: FlightAction[] = [
      { type: 'complete_phase' }, { type: 'complete_minigame_debug' }, { type: 'tick', dtS: 1 },
      { type: 'open_terminal', terminalId: 'SOLAR' }, { type: 'close_minigame' },
      { type: 'fire_thruster', dirX: 1, dirY: 0 }, { type: 'set_active_grab', held: true },
      { type: 'slingshot_start', screenX: 1, screenY: 1 }, { type: 'slingshot_release' },
      { type: 'slide_along_handle', dirX: 0, dirY: 1, dtS: 1 },
      { type: 'solar_input', deltaAlphaDeg: 20, deltaBetaDeg: 20, dtS: 0.1 },
      { type: 'ls_hold_o2', held: true },
    ];
    for (const action of actions) expect(flightPhase.step(state, action)).toBe(state);
    expect(flightPhase.debugActions?.(state)).toEqual([]);
    expect(flightPhase.finish(flightPhase.step(state, { type: 'complete_phase' })).result.deploymentStatus).toBe('lost');
  });

  it('finishes immediately after natural final-docking victory without complete_phase', () => {
    const state = deepFreeze(winNaturally());
    expect(state.phaseDone).toBe(false);
    expect(flightPhase.isDone(state)).toBe(true);
    expect(flightPhase.finish(state).result.deploymentStatus).toBe('deployed');
    expect(flightPhase.finish(state).log.some((entry) => entry.messageKey === 'flight.failure.satelliteLost')).toBe(false);
    expect(flightPhase.debugActions?.(state)).toEqual([]);
    expect(flightPhase.step(state, { type: 'complete_phase' })).toBe(state);
    expect(flightPhase.step(state, { type: 'fire_thruster', dirX: 1, dirY: 0 })).toBe(state);
  });

  it('keeps explicit prototype completion for a nonterminal flight', () => {
    const state = deepFreeze(flightPhase.init(input(), 3));
    expect(flightPhase.isDone(state)).toBe(false);
    const finishedState = flightPhase.step(state, { type: 'complete_phase' });
    expect(finishedState.gameMode).toBe('VICTORY');
    expect(finishedState.phaseDone).toBe(true);
    expect(flightPhase.isDone(finishedState)).toBe(true);
    expect(flightPhase.finish(finishedState).result.deploymentStatus).toBe('deployed');
    expect(state.phaseDone).toBe(false);
    expect(flightPhase.step(finishedState, { type: 'tick', dtS: 0.25 })).toBe(finishedState);
  });

  it('allocates collision-safe fallback event and loss IDs without duplicating input logs', () => {
    const source = input();
    source.log = ['flight:terminal-state', 'flight:terminal-state:1', 'flight:satellite-lost', 'flight:satellite-lost:1']
      .map((id): CauseEntry => ({
        id, phase: 'flight', tS: 0, kind: 'warning', system: 'structure', messageKey: 'test.reservedId',
      }));
    const own: CauseEntry[] = ['flight:terminal-state:2', 'flight:satellite-lost:2'].map((id) => ({
      id, phase: 'flight', tS: 0, kind: 'warning', system: 'structure', messageKey: 'test.ownReservedId',
    }));
    const state = deepFreeze({ ...flightPhase.init(source, 3), log: own, gameMode: 'GAME_OVER' as const, energyPct: 0 });
    const finished = flightPhase.finish(state);
    expect(finished.log).toHaveLength(4);
    expect(finished.log.slice(0, 2)).toEqual(own);
    expect(finished.log[2]?.id).toBe('flight:terminal-state:3');
    expect(finished.log[2]?.messageKey).toBe('flight.event.terminalState');
    expect(finished.log[3]?.id).toBe('flight:satellite-lost:3');
    expect(finished.log[3]?.causedBy).toEqual(['flight:terminal-state:3']);
    assertResolvedJournal([...source.log, ...finished.log]);
    const restored = { ...state, log: finished.log };
    expect(flightPhase.finish(restored).log).toEqual(finished.log);
    expect(flightPhase.finish(restored).log.filter((entry) => entry.kind === 'failure')).toHaveLength(1);
  });

  it('preserves the already-applied production defect and returns only new flight damage', () => {
    const original = input();
    const damagedSpec = applyDamage(original.spec, [{ system: 'power', severity: 0.5 }]);
    const source = deepFreeze({ ...original, spec: damagedSpec });
    const state = flightPhase.init(source, 3);
    expect(state.damage).toEqual([]);
    const completed = flightPhase.step(deepFreeze(state), { type: 'complete_phase' });
    expect(flightPhase.finish(completed).result.damage).toEqual([]);
    expect(source.spec.panelPowerW).toBe(original.spec.panelPowerW * 0.5);
    const withNewDamage = deepFreeze({
      ...completed, gameMode: 'GAME_OVER' as const, damage: [{ system: 'thermal' as const, severity: 0.35 }],
    });
    expect(flightPhase.finish(withNewDamage).result.damage).toEqual([{ system: 'thermal', severity: 0.35 }]);
    expect(withNewDamage.input).toBe(source);
    expect(source.spec.panelPowerW).toBe(original.spec.panelPowerW * 0.5);
    expect(withNewDamage.damage).toEqual([{ system: 'thermal', severity: 0.35 }]);
  });
});
