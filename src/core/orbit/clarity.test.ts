import { describe, expect, it } from 'vitest';
import { danglingCauses } from '../debrief';
import { createDemoOrbit } from './demo';
import { forecastOrbit, orbitPhase, type OrbitState, type ToggleId } from './phase';
import { orbitClarity, orbitDebrief } from './clarity';

const tick = (state: OrbitState) => orbitPhase.step(state, { type: 'tick', dtS: state.input.flight.orbit.periodS });
const toggle = (state: OrbitState, id: ToggleId) => orbitPhase.step(state, { type: 'toggle', id });
const finish = (initial: OrbitState) => {
  let state = initial;
  while (!orbitPhase.isDone(state)) state = tick(state);
  return state;
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

describe('orbit planning clarity', () => {
  it('reports gross energy cost, available solar energy and memory before downlink', () => {
    const state = createDemoOrbit();
    const { view } = orbitClarity(state);
    const f = view.forecast;
    const spec = state.input.spec;
    expect(f.cost.consumedWh).toBeCloseTo((spec.baseLoadW * state.input.flight.orbit.periodS
      + spec.instrumentW * 300 + spec.transmitterW * 240 + spec.heaterW * view.shadowS) / 3600);
    expect(f.cost.generatedWh).toBeCloseTo(spec.panelPowerW * view.sunlightS / 3600);
    expect(f.cost.peakBufferMb).toBe(2400);
    expect(f.bufferMb).toBe(0);
    expect(f.chargeDeltaWh).toBeCloseTo(f.chargeWh - state.chargeWh);
    expect(f.cost.elapsedS).toBeCloseTo(state.input.flight.orbit.periodS);
    expect(f.cost.transmitterS).toBe(240);
  });

  it('keeps command ON distinct from SAFE blocking and forced heating', () => {
    const safe = toggle(toggle(createDemoOrbit(), 'heater'), 'safeMode');
    const { systems, view } = orbitClarity(safe);
    expect(systems.camera).toMatchObject({ commandOn: true, effectiveOn: false, reason: 'safeMode', operationS: 0 });
    expect(systems.transmitter.reason).toBe('safeMode');
    expect(systems.heater).toMatchObject({ commandOn: false, effectiveOn: true, forcedBySafe: true });
    expect(view.forecast.cost.consumedWh).toBeCloseTo((safe.input.spec.baseLoadW * safe.input.flight.orbit.periodS
      + safe.input.spec.heaterW * view.shadowS) / 3600);
    const preferences = toggle(safe, 'camera');
    expect(orbitClarity(toggle(preferences, 'safeMode')).systems.camera.reason).toBe('commandOff');
  });

  it('explains cold, damage, absent windows, empty buffer and ended missions', () => {
    const base = createDemoOrbit();
    const cold = tick(tick(toggle(base, 'heater')));
    expect(orbitClarity(cold).systems.camera.reason).toBe('cold');
    const damaged = orbitPhase.init({ ...base.input, flight: { ...base.input.flight,
      damage: [{ system: 'science', severity: 1 }, { system: 'thermal', severity: 1 }, { system: 'comms', severity: 1 }] } }, 42);
    for (const id of ['camera', 'transmitter', 'heater'] as const) expect(orbitClarity(damaged).systems[id].reason).toBe('damage');
    const noWindows = orbitPhase.init({ ...base.input,
      mission: { ...base.input.mission, imagingSPerOrbit: 0, passSPerOrbit: 0 },
      flight: { ...base.input.flight, orbit: { ...base.input.flight.orbit, eclipseFraction: 0 } } }, 42);
    for (const id of ['camera', 'transmitter', 'heater'] as const) expect(orbitClarity(noWindows).systems[id].reason).toBe('noWindow');
    expect(orbitClarity(toggle(base, 'camera')).systems.transmitter.reason).toBe('noData');
    for (const system of Object.values(orbitClarity(finish(base)).systems)) expect(system.reason).toBe('ended');
  });

  it('warns about overflow, cold and power loss before advancing', () => {
    const overflow = tick(tick(createDemoOrbit('comms')));
    expect(orbitClarity(overflow).risks).toContain('clarity.risk.overflow');
    expect(orbitClarity(tick(toggle(createDemoOrbit(), 'heater'))).risks).toContain('clarity.risk.cold');
    const base = createDemoOrbit();
    const failing = orbitPhase.init({ ...base.input, spec: { ...base.input.spec, panelPowerW: 0, batteryWh: 1 } }, 42);
    const f = forecastOrbit(failing);
    expect(orbitClarity(failing).risks).toContain('clarity.risk.power');
    expect(orbitClarity(failing).systems.camera.reason).toBe('powerFailure');
    expect(f.cost.elapsedS).toBeCloseTo(180);
    expect(f.cost.consumedWh).toBeCloseTo(1);
    expect(f.cost.generatedWh).toBe(0);
    expect(f.cost.minimumChargeWh).toBe(0);
    expect(f.cost.cameraS).toBe(0);
  });

  it('is pure, deterministic and JSON-safe; forecast matches ticks including damage and failure', () => {
    for (const preset of ['balanced', 'comms', 'power'] as const) {
      let state = createDemoOrbit(preset, 71);
      while (!orbitPhase.isDone(state)) {
        state = freeze(state);
        const before = JSON.stringify(state);
        const clarity = orbitClarity(state);
        const cloned: OrbitState = JSON.parse(before);
        expect(orbitClarity(cloned)).toEqual(clarity);
        expect(JSON.parse(JSON.stringify(clarity))).toEqual(clarity);
        const next = tick(state);
        expect(clarity.view.forecast.nextState).toEqual(next);
        expect(clarity.view.forecast.bufferDeltaMb).toBeCloseTo(next.bufferMb - state.bufferMb);
        expect(JSON.stringify(state)).toBe(before);
        state = next;
      }
      expect(forecastOrbit(state).cost.elapsedS).toBe(0);
    }
  });
});

describe('orbit debrief causal paths', () => {
  it('preserves the command that missed a window even after it was restored', () => {
    const off = toggle(createDemoOrbit(), 'camera');
    const offDecision = off.log.at(-1)!;
    const restored = toggle(tick(off), 'camera');
    const end = finish({ ...restored, input: { ...restored.input,
      mission: { ...restored.input.mission, requiredDataMb: 24000 } } });
    const problems = orbitDebrief(freeze(end));
    const shortfall = problems.find(problem => problem.failure.messageKey === 'orbit.proto.insufficientData');
    expect(shortfall?.paths).toContainEqual(expect.arrayContaining([
      expect.objectContaining({ messageKey: 'orbit.clarity.missedImaging' }), offDecision,
    ]));
    expect(danglingCauses([...end.input.log, ...end.log])).toEqual([]);
    for (const problem of problems) {
      expect(new Set(problem.paths.map(path => path.at(-1)?.id)).size).toBe(problem.paths.length);
      for (const path of problem.paths) {
        expect(path[0]).toBe(problem.failure);
        for (let i = 1; i < path.length; i++) expect(path[i - 1]?.causedBy).toContain(path[i]?.id);
      }
    }
    expect(JSON.parse(JSON.stringify(problems))).toEqual(problems);
  });

  it('links a cold lock to the earlier heater-off command and module choices to failures', () => {
    const off = toggle(createDemoOrbit(), 'heater');
    const decision = off.log.at(-1)!;
    const end = finish(toggle(tick(tick(off)), 'heater'));
    const cold = orbitDebrief(end).find(problem => problem.failure.messageKey === 'orbit.proto.cameraCold');
    expect(cold?.paths.some(path => path.at(-1)?.id === decision.id)).toBe(true);
    const comms = orbitDebrief(finish(createDemoOrbit('comms')));
    expect(comms.some(problem => problem.paths.some(path => path.at(-1)?.id === 'design:antenna'))).toBe(true);
  });
});
