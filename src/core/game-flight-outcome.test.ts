import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CauseEntry } from './contracts';
import { availableActions, newGame, step, type GameState } from './game';
import { flightPhase, orbitPhase } from './phases';
import { SAMPLE_CATALOG, SAMPLE_MISSION } from './stubs';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function launch(seed = 23): Extract<GameState, { phase: 'flight' }> {
  const state = step(newGame(SAMPLE_MISSION, SAMPLE_CATALOG, seed), {
    phase: 'design', action: { type: 'confirm' },
  });
  if (state.phase !== 'flight') throw new Error('Real design did not launch');
  return state;
}

function waitForResourceLoss(initial: GameState): Extract<GameState, { phase: 'debrief' }> {
  let state = initial;
  for (let tick = 0; tick < 4000 && state.phase === 'flight'; tick += 1) {
    state = step(state, { phase: 'flight', action: { type: 'tick', dtS: 0.25 } });
  }
  if (state.phase !== 'debrief') throw new Error(`Natural flight loss ended in ${state.phase}`);
  return state;
}

function expectCompleteJournal(log: CauseEntry[]): void {
  const ids = new Set(log.map((entry) => entry.id));
  expect(ids.size).toBe(log.length);
  for (const entry of log) {
    if (entry.kind === 'failure') expect(entry.causedBy?.length).toBeGreaterThan(0);
    for (const cause of entry.causedBy ?? []) expect(ids.has(cause), `${entry.id} refers to ${cause}`).toBe(true);
  }
}

afterEach(() => vi.restoreAllMocks());

describe('game runner flight deployment outcome', () => {
  it('routes real resource loss straight to a zeroed failed debrief without initializing orbit', () => {
    const initial = deepFreeze(launch());
    const snapshot = JSON.stringify(initial);
    const orbitInit = vi.spyOn(orbitPhase, 'init');
    const finish = vi.spyOn(flightPhase, 'finish');
    const end = waitForResourceLoss(initial);
    expect(orbitInit).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledTimes(1);
    const finishCall = finish.mock.results[0];
    if (finishCall?.type !== 'return') throw new Error('Flight did not return a result');
    const finished = finishCall.value;
    expect(finished.result.deploymentStatus).toBe('lost');
    expect(end.record.outcome).toEqual({ success: false, deliveredMb: 0, survivedOrbits: 0, score: 0 });
    expect(end.seed).toBe(initial.seed);
    expect(end.mission).toBe(initial.mission);
    expect(end.record.seed).toBe(initial.seed);
    expect(end.record.missionId).toBe(initial.mission.id);
    expect(end.record.spec).toBe(initial.spec);
    expect(end.record.flight).toBe(finished.result);
    expect(end.record.log).toEqual([...initial.log, ...finished.log]);
    expect(end.record.flight.damage.length).toBeGreaterThan(0);
    expect(end.record.flight.fuelLeftKg).toBe(finished.result.fuelLeftKg);
    expectCompleteJournal(end.record.log);
    for (const slot of ['engine', 'solar', 'battery', 'antenna', 'instrument']) {
      expect(end.record.log.filter((entry) => entry.id === `design:${slot}`)).toHaveLength(1);
    }
    expect(end.record.log.some((entry) => entry.phase === 'orbit')).toBe(false);
    expect(JSON.parse(JSON.stringify(end))).toEqual(end);
    expect(JSON.stringify(initial)).toBe(snapshot);
    expect(availableActions(end)).toEqual([]);
    expect(step(end, { phase: 'flight', action: { type: 'complete_phase' } })).toBe(end);
    expect(step(end, { phase: 'orbit', action: { type: 'toggle', id: 'camera' } })).toBe(end);
  });

  it('preserves the deployed route, passing the exact specification, new flight result and accumulated log to orbit', () => {
    const initial = deepFreeze(launch());
    const orbitInit = vi.spyOn(orbitPhase, 'init');
    const deployed = step(initial, { phase: 'flight', action: { type: 'complete_phase' } });
    expect(deployed.phase).toBe('orbit');
    if (deployed.phase !== 'orbit') throw new Error('Deployed satellite did not enter orbit');
    expect(deployed.flightResult.deploymentStatus).toBe('deployed');
    expect(orbitInit).toHaveBeenCalledExactlyOnceWith({
      mission: initial.mission, spec: initial.spec, flight: deployed.flightResult, log: deployed.log,
    }, initial.seed + 2);
    expect(deployed.spec).toBe(initial.spec);
    expect(deployed.flightResult.damage).toEqual(initial.flight.damage);
    expect(deployed.flightResult.fuelLeftKg).toBe(initial.flight.fuelLeftKg);
    expectCompleteJournal(deployed.log);
    expect(JSON.parse(JSON.stringify(deployed))).toEqual(deployed);
  });

  it('keeps the previous orbit route for legacy producers that omit deploymentStatus', () => {
    const initial = deepFreeze(launch());
    const realFinish = flightPhase.finish;
    vi.spyOn(flightPhase, 'finish').mockImplementation((state) => {
      const out = realFinish(state);
      const { orbit, fuelLeftKg, damage } = out.result;
      return { result: { orbit, fuelLeftKg, damage }, log: out.log };
    });
    const orbitInit = vi.spyOn(orbitPhase, 'init');
    const end = step(initial, { phase: 'flight', action: { type: 'complete_phase' } });
    expect(end.phase).toBe('orbit');
    if (end.phase !== 'orbit') throw new Error('Legacy producer did not enter orbit');
    expect(Object.hasOwn(end.flightResult, 'deploymentStatus')).toBe(false);
    expect(orbitInit).toHaveBeenCalledExactlyOnceWith({
      mission: initial.mission, spec: initial.spec, flight: end.flightResult, log: end.log,
    }, initial.seed + 2);
    expect(JSON.parse(JSON.stringify(end))).toEqual(end);
    expectCompleteJournal(end.log);
  });

  it('reproduces natural loss from the same seed and actions without mutating the frozen flight input', () => {
    const initial = deepFreeze(launch(91));
    const snapshot = JSON.stringify(initial);
    const first = waitForResourceLoss(initial);
    const second = waitForResourceLoss(initial);
    expect(first).toEqual(second);
    expect(JSON.stringify(initial)).toBe(snapshot);
    expect(JSON.parse(JSON.stringify(initial))).toEqual(initial);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expectCompleteJournal(first.record.log);
  });
});
