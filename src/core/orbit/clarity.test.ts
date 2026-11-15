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

  it('reports an empty ground pass separately from a later eclipse power failure', () => {
    const { input } = createDemoOrbit();
    const state = toggle(orbitPhase.init({ ...input,
      spec: { ...input.spec, panelPowerW: 0, batteryWh: 30 } }, 42), 'camera');
    const { systems, view } = orbitClarity(freeze(state));
    expect(view.forecast.powerFailure).toBe(true);
    expect(view.forecast.cost.elapsedS).toBeGreaterThan(view.sunlightS);
    expect(systems.transmitter).toMatchObject({ reason: 'noData', effectiveOn: false, operationS: 0 });
    expect(view.forecast.nextState).toEqual(tick(state));
  });

  it('reports power failure if the empty transmitter cannot reach its ground pass', () => {
    const { input } = createDemoOrbit();
    const state = toggle(orbitPhase.init({ ...input,
      spec: { ...input.spec, panelPowerW: 0, batteryWh: 1 } }, 42), 'camera');
    const { systems, view } = orbitClarity(state);
    expect(view.forecast.powerFailure).toBe(true);
    expect(view.forecast.cost.elapsedS).toBeLessThan(view.idleSunS);
    expect(systems.transmitter.reason).toBe('powerFailure');
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
  it('does not blame commands for systems that never operated before power loss', () => {
    const { input } = createDemoOrbit();
    let state = orbitPhase.init({ ...input,
      spec: { ...input.spec, panelPowerW: 0, batteryWh: 1 } }, 42);
    for (const id of ['camera', 'transmitter', 'heater'] as const) state = toggle(toggle(state, id), id);
    const decisions = state.log.filter(entry => entry.kind === 'decision').map(entry => entry.id);
    const end = tick(state);
    expect(end.status).toBe('failed');
    const failure = end.log.find(entry => entry.messageKey === 'orbit.proto.powerFailure');
    expect(failure).toBeDefined();
    for (const id of decisions) expect(failure!.causedBy).not.toContain(id);
    expect(danglingCauses([...end.input.log, ...end.log])).toEqual([]);
  });

  it('does not blame earlier SAFE commands for a heater disabled by damage', () => {
    const { input } = createDemoOrbit();
    let state = orbitPhase.init({ ...input, flight: { ...input.flight,
      damage: [{ system: 'thermal', severity: 1 }] } }, 42);
    state = toggle(toggle(state, 'safeMode'), 'safeMode');
    const decisions = state.log.filter(entry => entry.kind === 'decision').map(entry => entry.id);
    const end = finish(state);
    const shadows = end.log.filter(entry => entry.messageKey === 'orbit.clarity.unheatedShadow');
    expect(shadows.length).toBeGreaterThan(0);
    for (const shadow of shadows) {
      expect(shadow.causedBy).toContain('orbit:arrival');
      for (const id of decisions) expect(shadow.causedBy).not.toContain(id);
    }
    const cold = orbitDebrief(end).find(problem => problem.failure.messageKey === 'orbit.proto.cameraCold');
    expect(cold).toBeDefined();
    expect(cold!.paths.flat().some(entry => decisions.includes(entry.id))).toBe(false);
    expect(danglingCauses([...end.input.log, ...end.log])).toEqual([]);
  });

  it('links a missed cold-locked image to cold rather than an earlier camera-on command', () => {
    const { input } = createDemoOrbit();
    let state = orbitPhase.init({ ...input,
      mission: { ...input.mission, requiredDataMb: 24_000 } }, 42);
    state = toggle(toggle(state, 'camera'), 'camera');
    const cameraOn = state.log.at(-1)!;
    state = tick(tick(toggle(state, 'heater')));
    const cold = state.log.find(entry => entry.messageKey === 'orbit.proto.cameraCold')!;
    const end = finish(state);
    const missed = end.log.filter(entry => entry.messageKey === 'orbit.clarity.missedImaging');
    expect(missed.length).toBeGreaterThan(0);
    for (const entry of missed) {
      expect(entry.causedBy).toContain(cold.id);
      expect(entry.causedBy).not.toContain(cameraOn.id);
    }
    const shortfall = orbitDebrief(end).find(problem => problem.failure.messageKey === 'orbit.proto.insufficientData');
    expect(shortfall).toBeDefined();
    expect(shortfall!.paths.flat().map(entry => entry.id)).not.toContain(cameraOn.id);
    expect(danglingCauses([...end.input.log, ...end.log])).toEqual([]);
  });

  it.each([['science', 'camera', 'orbit.clarity.missedImaging'],
    ['comms', 'transmitter', 'orbit.clarity.missedDownlink']] as const)(
    'does not blame an ON command for %s damage', (system, id, messageKey) => {
      const { input } = createDemoOrbit();
      let state = orbitPhase.init({ ...input, flight: { ...input.flight,
        damage: [{ system, severity: 1 }] } }, 42);
      state = toggle(toggle(state, id), id);
      const commandOn = state.log.at(-1)!;
      const end = finish(state);
      const missed = end.log.filter(entry => entry.messageKey === messageKey);
      expect(missed.length).toBeGreaterThan(0);
      for (const entry of missed) {
        expect(entry.causedBy).toContain('orbit:arrival');
        expect(entry.causedBy).not.toContain(commandOn.id);
      }
      expect(danglingCauses([...end.input.log, ...end.log])).toEqual([]);
    });

  it('keeps the active SAFE command as the cause of a blocked imaging window', () => {
    const safe = toggle(createDemoOrbit(), 'safeMode');
    const command = safe.log.at(-1)!;
    const missed = tick(safe).log.find(entry => entry.messageKey === 'orbit.clarity.missedImaging');
    expect(missed?.causedBy).toContain(command.id);
  });

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
