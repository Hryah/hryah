import { describe, expect, it } from 'vitest';
import { danglingCauses } from '../debrief';
import { createDemoOrbit } from './demo';
import { orbitPhase, orbitView, forecastOrbit, type OrbitAction, type OrbitState } from './phase';

const tick = (state: OrbitState) => orbitPhase.step(state, { type: 'tick', dtS: state.input.flight.orbit.periodS });
const toggle = (state: OrbitState, id: 'camera' | 'transmitter' | 'heater' | 'safeMode') =>
  orbitPhase.step(state, { type: 'toggle', id });
function play(state: OrbitState): OrbitState {
  for (let i = 0; i < 20 && !orbitPhase.isDone(state); i++) state = tick(state);
  return state;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

describe('orbit prototype integration', () => {
  it('completes the balanced ten-orbit mission using the Phase contract', () => {
    const end = play(createDemoOrbit());
    expect(end.completedOrbits).toBe(10);
    expect(orbitPhase.isDone(end)).toBe(true);
    expect(orbitPhase.finish(end).result).toMatchObject({ success: true, survivedOrbits: 10, deliveredMb: 24000 });
    expect(end.history).toHaveLength(10);
    expect(end.history.filter((h) => h.storm)).toHaveLength(1);
  });

  it('matches the documented first-orbit numbers without phantom transmitter load', () => {
    const state = tick(createDemoOrbit());
    expect(state.deliveredMb).toBe(2400);
    expect(state.bufferMb).toBe(0);
    expect(state.chargeWh).toBeCloseTo(38.9735288, 6);
    expect(state.coldStress).toBe(0);
    expect(orbitView(state).resolutionM).toBeCloseTo(1.342, 4);
  });

  it('matches the weak-link overflow and lets the player clear storage', () => {
    const one = tick(createDemoOrbit('comms'));
    const two = tick(one);
    const three = tick(two);
    expect([one.bufferMb, two.bufferMb, three.bufferMb]).toEqual([1440, 2880, 3040]);
    expect(three.lostMb).toBe(1280);
    const alternative = tick(toggle(two, 'camera'));
    expect(alternative.bufferMb).toBe(1920);
    expect(alternative.lostMb).toBe(0);
    expect(play(createDemoOrbit('comms')).deliveredMb).toBeLessThan(10000);
  });

  it('does not end early when data target is reached', () => {
    let state = createDemoOrbit();
    for (let i = 0; i < 5; i++) state = tick(state);
    expect(state.deliveredMb).toBeGreaterThanOrEqual(10000);
    expect(orbitPhase.isDone(state)).toBe(false);
  });

  it('keeps a correctly completed but underperforming mission unsuccessful', () => {
    const end = play(toggle(createDemoOrbit(), 'camera'));
    expect(end.status).toBe('complete');
    expect(end.completedOrbits).toBe(10);
    expect(orbitPhase.finish(end).result.success).toBe(false);
    expect(end.log.some((e) => e.messageKey === 'orbit.proto.insufficientData')).toBe(true);
  });

  it('requires image quality and the actual orbit as well as data', () => {
    const original = createDemoOrbit();
    const quality = orbitPhase.init({ ...original.input, spec: { ...original.input.spec, resolutionM: 9 } }, 42);
    expect(orbitPhase.finish(play(quality)).result.success).toBe(false);
    const offOrbit = orbitPhase.init({ ...original.input, flight: { ...original.input.flight,
      orbit: { ...original.input.flight.orbit, altKm: 300 } } }, 42);
    expect(orbitPhase.finish(play(offOrbit)).result.success).toBe(false);
  });
});

describe('orbital system control', () => {
  it('safe mode preserves switch preferences and disables imaging and downlink', () => {
    const initial = createDemoOrbit();
    const safe = toggle(initial, 'safeMode');
    const next = tick(safe);
    expect(next.deliveredMb).toBe(0);
    expect(next.bufferMb).toBe(0);
    expect(next.toggles.camera).toBe(true);
    expect(next.toggles.transmitter).toBe(true);
    expect(orbitView(next).activeSystems.camera).toBe(false);
    expect(orbitView(toggle(next, 'safeMode')).activeSystems.camera).toBe(true);
  });

  it('camera locks after two unheated shadows and recovers after heating', () => {
    const cold = tick(tick(toggle(createDemoOrbit(), 'heater')));
    expect(cold.coldStress).toBe(2);
    expect(orbitView(cold).activeSystems.camera).toBe(false);
    const warming = tick(toggle(cold, 'heater'));
    expect(warming.deliveredMb).toBe(cold.deliveredMb);
    expect(warming.coldStress).toBe(1);
    expect(orbitView(warming).activeSystems.camera).toBe(true);
    expect(tick(warming).deliveredMb).toBeGreaterThan(warming.deliveredMb);
  });

  it('chooses exactly one predictable storm and warns before it', () => {
    const initial = createDemoOrbit('balanced', 72);
    expect(initial.stormOrbit).toBeGreaterThanOrEqual(4);
    expect(initial.stormOrbit).toBeLessThanOrEqual(7);
    let state = initial;
    for (let i = 1; i < initial.stormOrbit!; i++) state = tick(state);
    expect(orbitView(state).stormNext).toBe(true);
    expect(state.log.at(-1)?.messageKey).toBe('orbit.proto.stormWarning');
    const duringStorm = tick(state);
    expect(duringStorm.log.some((e) => e.messageKey === 'orbit.proto.storm')).toBe(true);
    expect(orbitView(duringStorm).stormNext).toBe(false);
  });

  it('storm halves downlink capacity rather than awarding impossible data', () => {
    const initial = createDemoOrbit('comms');
    const state = { ...initial, stormOrbit: 1, bufferMb: 2000 };
    const next = tick(state);
    expect(next.deliveredMb).toBe(480);
    expect(next.lostMb).toBe(400);
  });

  it('the power preset rewards reacting to the storm warning with safe mode', () => {
    const initial = createDemoOrbit('power');
    expect(play(initial).status).toBe('failed');
    let rescued = initial;
    while (rescued.status === 'active') {
      const nextIsStorm = rescued.stormOrbit === rescued.completedOrbits + 1;
      if (rescued.toggles.safeMode !== nextIsStorm) rescued = toggle(rescued, 'safeMode');
      rescued = tick(rescued);
    }
    expect(orbitPhase.finish(rescued).result.success).toBe(true);
  });

  it('clips long task intervals to the available sunlight', () => {
    const original = createDemoOrbit();
    const state = orbitPhase.init({ ...original.input, mission: { ...original.input.mission,
      imagingSPerOrbit: 100000, passSPerOrbit: 100000 } }, 42);
    const view = orbitView(state);
    expect(view.imagingS).toBe(view.sunlightS);
    expect(view.passS).toBe(0);
    const next = tick(state);
    expect(next.tS).toBeCloseTo(state.input.flight.orbit.periodS, 6);
    expect(next.deliveredMb).toBe(0);
  });

  it('does not create cooling stress when an orbit has no eclipse', () => {
    const original = createDemoOrbit();
    const state = orbitPhase.init({ ...original.input, flight: { ...original.input.flight,
      orbit: { ...original.input.flight.orbit, eclipseFraction: 0 } } }, 42);
    expect(tick(toggle(state, 'heater')).coldStress).toBe(0);
  });
});

describe('damage and exact power loss', () => {
  it('combines repeated damage by worst severity and applies system limits', () => {
    const original = createDemoOrbit();
    const state = orbitPhase.init({ ...original.input, flight: { ...original.input.flight,
      damage: [{ system: 'power', severity: 0.1 }, { system: 'power', severity: 0.5 },
        { system: 'science', severity: 1 }, { system: 'comms', severity: 1 }, { system: 'thermal', severity: 1 }] } }, 42);
    const view = orbitView(state);
    expect(view.capacityWh).toBe(30);
    expect(view.panelPowerW).toBe(80);
    expect(view.activeSystems).toMatchObject({ camera: false, transmitter: false, heater: false });
    expect(tick(state).deliveredMb).toBe(0);
  });

  it('fails immediately for a destroyed structure', () => {
    const original = createDemoOrbit();
    const state = orbitPhase.init({ ...original.input, flight: { ...original.input.flight,
      damage: [{ system: 'structure', severity: 1 }] } }, 42);
    expect(state.status).toBe('failed');
    expect(state.tS).toBe(0);
    expect(orbitPhase.finish(state).result.success).toBe(false);
    expect(state.log.find((entry) => entry.messageKey === 'orbit.proto.arrivalFailure')?.system).toBe('structure');
    expect(Object.values(orbitView(state).activeSystems).every((on) => !on)).toBe(true);
  });

  it('attributes complete power damage to the power system and switches effective systems off', () => {
    const original = createDemoOrbit();
    const state = orbitPhase.init({ ...original.input, flight: { ...original.input.flight,
      damage: [{ system: 'power', severity: 1 }] } }, 42);
    expect(state.log.find((entry) => entry.messageKey === 'orbit.proto.arrivalFailure')?.system).toBe('power');
    expect(state.toggles.camera).toBe(true);
    expect(Object.values(orbitView(state).activeSystems).every((on) => !on)).toBe(true);
    expect(Object.values(orbitView(play(original)).activeSystems).every((on) => !on)).toBe(true);
  });

  it('stops data and time at exact depletion without counting an incomplete orbit', () => {
    const original = createDemoOrbit();
    const input = { ...original.input, spec: { ...original.input.spec, panelPowerW: 0, batteryWh: 1 } };
    const state = tick(orbitPhase.init(input, 42));
    expect(state.status).toBe('failed');
    expect(state.chargeWh).toBe(0);
    expect(state.tS).toBeCloseTo(180, 6);
    expect(state.completedOrbits).toBe(0);
    expect(state.deliveredMb).toBe(0);
    expect(state.bufferMb).toBe(0);
  });

  it('can power direct from solar with an empty battery', () => {
    const original = createDemoOrbit();
    const input = { ...original.input, flight: { ...original.input.flight,
      orbit: { ...original.input.flight.orbit, eclipseFraction: 0 } } };
    const state = tick({ ...orbitPhase.init(input, 42), chargeWh: 0 });
    expect(state.status).toBe('active');
    expect(state.completedOrbits).toBe(1);
  });

  it('counts only camera data produced before power depletion inside the imaging interval', () => {
    const original = createDemoOrbit();
    const periodS = 100;
    const input = { ...original.input,
      mission: { ...original.input.mission, imagingSPerOrbit: 100, passSPerOrbit: 0 },
      flight: { ...original.input.flight, orbit: { ...original.input.flight.orbit, periodS, eclipseFraction: 0 } },
      spec: { ...original.input.spec, panelPowerW: 0, batteryWh: 0.5 } };
    const state = tick(orbitPhase.init(input, 42));
    expect(state.tS).toBeCloseTo(36);
    expect(state.bufferMb).toBeCloseTo(288);
    expect(state.deliveredMb).toBe(0);
    expect(state.completedOrbits).toBe(0);
  });

  it('stops transmitter power consumption immediately after buffer becomes empty', () => {
    const original = createDemoOrbit();
    const input = { ...original.input,
      mission: { ...original.input.mission, imagingSPerOrbit: 0, passSPerOrbit: 100 },
      flight: { ...original.input.flight, orbit: { ...original.input.flight.orbit, periodS: 100, eclipseFraction: 0 } },
      spec: { ...original.input.spec, panelPowerW: 0, batteryWh: 1 } };
    const state = tick({ ...orbitPhase.init(input, 42), bufferMb: 100 });
    expect(state.completedOrbits).toBe(1);
    expect(state.deliveredMb).toBe(100);
    expect(state.chargeWh).toBeCloseTo(1 - (50 * 10 + 20 * 90) / 3600);
  });
});

describe('purity, reproducibility and event links', () => {
  it('links the actual storm event to the resulting power failure', () => {
    const failed = play(createDemoOrbit('power'));
    const storm = failed.log.find((entry) => entry.messageKey === 'orbit.proto.storm');
    const failure = failed.log.find((entry) => entry.messageKey === 'orbit.proto.powerFailure');
    expect(storm).toBeDefined();
    expect(failure?.causedBy).toContain(storm!.id);
    expect(danglingCauses([...failed.input.log, ...failed.log])).toEqual([]);
  });

  it('retains storm, memory-loss, and cold-camera links in the final data shortfall', () => {
    let state = toggle(createDemoOrbit('comms'), 'heater');
    for (let i = 0; i < 10; i++) {
      // An injected second storm exercises deduplication and historical references too.
      if (i === 7) state = { ...state, stormOrbit: 8 };
      if (i === 2) state = toggle(state, 'heater');
      state = tick(state);
    }
    const events = state.log.filter((entry) => ['orbit.proto.storm', 'orbit.proto.overflow', 'orbit.proto.cameraCold'].includes(entry.messageKey));
    expect(events.filter((entry) => entry.messageKey === 'orbit.proto.storm')).toHaveLength(2);
    expect(events.some((entry) => entry.messageKey === 'orbit.proto.cameraCold')).toBe(true);
    expect(events.some((entry) => entry.messageKey === 'orbit.proto.overflow')).toBe(true);
    const failure = state.log.find((entry) => entry.messageKey === 'orbit.proto.insufficientData');
    for (const event of events) expect(failure?.causedBy).toContain(event.id);
    expect(new Set(failure?.causedBy).size).toBe(failure?.causedBy?.length);
    expect(danglingCauses([...state.input.log, ...state.log])).toEqual([]);
  });

  it('preview matches a real tick and does not alter frozen input', () => {
    const state = freeze(createDemoOrbit('comms'));
    const prediction = forecastOrbit(state);
    expect(prediction.nextState).toEqual(tick(state));
    expect(state.completedOrbits).toBe(0);
    expect(state.history).toHaveLength(0);
    expect(() => toggle(state, 'heater')).not.toThrow();
    expect(() => orbitPhase.finish(state)).not.toThrow();
  });

  it('survives a JSON round-trip at every step and is deterministic', () => {
    const run = () => {
      let state = createDemoOrbit('balanced', 145);
      for (let i = 0; i < 10; i++) {
        if (i === 2 || i === 3) state = toggle(state, 'safeMode');
        state = tick(state);
        expect(JSON.parse(JSON.stringify(state))).toEqual(state);
      }
      return state;
    };
    expect(run()).toEqual(run());
  });

  it('all failure causes exist and IDs remain unique in varied runs', () => {
    for (const preset of ['balanced', 'comms', 'power'] as const) {
      let state = createDemoOrbit(preset);
      state = toggle(state, 'heater');
      state = play(state);
      const combined = [...state.input.log, ...state.log];
      expect(danglingCauses(combined)).toEqual([]);
      expect(new Set(combined.map((e) => e.id)).size).toBe(combined.length);
      for (const failure of state.log.filter((e) => e.kind === 'failure')) {
        expect(failure.causedBy?.length).toBeGreaterThan(0);
      }
      expect(orbitPhase.finish(state).log).toBe(state.log);
    }
  });

  it('ignores invalid ticks and post-completion actions', () => {
    const state = createDemoOrbit();
    for (const dtS of [NaN, Infinity, -1, 0, 1]) expect(orbitPhase.step(state, { type: 'tick', dtS })).toBe(state);
    const end = play(state);
    expect(tick(end)).toBe(end);
    expect(toggle(end, 'camera')).toBe(end);
  });

  it('has a playable next-orbit action last for a debug bot', () => {
    const state = createDemoOrbit();
    const actions = orbitPhase.debugActions?.(state) ?? [];
    expect(actions.at(-1)?.action).toEqual({ type: 'tick', dtS: state.input.flight.orbit.periodS });
    for (const entry of actions) expect(() => orbitPhase.step(state, entry.action as OrbitAction)).not.toThrow();
  });
});
