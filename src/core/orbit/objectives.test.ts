import { describe, expect, it } from 'vitest';
import type { Design, Mission, OrbitInput } from '../contracts';
import { CAMPAIGN_CATALOG, SCENARIOS } from '../consortium/scenarios';
import { customInstrument } from '../consortium/develop';
import { replayOrbit } from '../consortium/campaign';
import { danglingCauses } from '../debrief';
import { buildSpec, orbitEnergyNeedWh, orbitInfo, orbitProfile, validateOrbitMission } from '../model';
import { stubFlight } from '../stubs';
import { orbitClarity, orbitDebrief } from './clarity';
import { forecastOrbit, orbitPhase, orbitView, type OrbitState, type ToggleId } from './phase';
import orbitTexts from '../../ui/orbit/texts.en.json';
import sharedTexts from '../../data/texts.en.json';

const seeds = [4, 7, 12, 42];
const scenarios = ['cubesat-101', 'living-planet', 'disaster', 'lifeline', 'ice-watch',
  'big-eye', 'guest', 'selene', 'red-planet', 'colony'];
const tick = (state: OrbitState) => orbitPhase.step(state, { type: 'tick', dtS: state.input.flight.orbit.periodS });
const toggle = (state: OrbitState, id: ToggleId) => orbitPhase.step(state, { type: 'toggle', id });
function play(state: OrbitState): OrbitState {
  for (let i = 0; i < 100 && !orbitPhase.isDone(state); i++) state = tick(state);
  expect(orbitPhase.isDone(state)).toBe(true);
  return state;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Feasible fixtures use catalog hardware, actual launcher limits and the existing custom optics producer.
function inputFor(id: string): OrbitInput {
  const setup = SCENARIOS[id];
  if (!setup) throw new Error(`Missing scenario ${id}`);
  const mission: Mission = { ...setup.mission, orbitObjective: setup.mission.kind === 'cargo'
    ? { type: 'cargo', telemetryReportMb: 8, telemetryBonusMaxFraction: 0.1 }
    : id === 'guest' ? { type: 'flyby', imagingOrbits: [3, 5] } : { type: 'imaging' } };
  const camera = id === 'big-eye' ? customInstrument('orbit-test', 0.5) : null;
  const base = setup.catalog ?? CAMPAIGN_CATALOG;
  const catalog = camera ? { modules: [...base.modules, camera] } : base;
  for (const launcher of mission.launchers) {
    for (const solar of ['sol-m', 'sol-l']) for (const battery of ['bat-m', 'bat-l']) {
      for (const antenna of ['ant-m', 'ant-l']) for (const fuelKg of [20, 40, 60]) {
        const design: Design = { modules: { engine: 'eng-chem', solar, battery, antenna,
          instrument: mission.kind === 'cargo' ? 'cargo-water' : camera?.id ?? 'cam-m' },
        fuelKg, altKm: mission.altRangeKm[0], launcherId: launcher.id };
        const built = buildSpec({ mission, catalog }, design);
        if (!built.result.margins.every(margin => margin.ok)) continue;
        const flight = stubFlight({ mission, spec: built.result, log: built.log });
        return { mission, spec: built.result, flight: flight.result, log: [...built.log, ...flight.log] };
      }
    }
  }
  throw new Error(`No feasible catalog fixture for ${id}`);
}

function init(id: string, seed = 42): OrbitState { return orbitPhase.init(inputFor(id), seed); }
function shortCargo(passSPerOrbit = 10): OrbitState {
  const input = inputFor('lifeline');
  return orbitPhase.init({ ...input,
    mission: { ...input.mission, durationOrbits: 1, imagingSPerOrbit: 10, passSPerOrbit },
    spec: { ...input.spec, baseLoadW: 20, instrumentW: 5, transmitterW: 30,
      panelPowerW: 100, batteryWh: 100, instrumentRateMbps: 1, downlinkMbps: 1 },
    flight: { ...input.flight, orbit: { ...input.flight.orbit, periodS: 100, eclipseFraction: 0 } },
  }, 42);
}

describe('mission objectives on real mission data', () => {
  it.each(scenarios)('%s has a feasible catalog success across all fixed seeds', id => {
    const input = inputFor(id);
    expect(input.spec.margins.every(margin => margin.ok)).toBe(true);
    for (const seed of seeds) {
      const state = play(orbitPhase.init(input, seed));
      const out = orbitPhase.finish(state);
      expect(out.result.success, `${id}/${seed}`).toBe(true);
      expect(out.result.survivedOrbits).toBe(input.mission.durationOrbits);
      expect(out.result.orbitSummary?.objectiveType).toBe(input.mission.orbitObjective?.type);
      expect(danglingCauses([...input.log, ...out.log])).toEqual([]);
      if (input.mission.orbitObjective?.type === 'cargo') {
        expect(out.result).toMatchObject({ score: 110,
          orbitSummary: { cargoDelivered: true, capturedMb: 0, telemetryReportsSent: 6, telemetryReportsExpected: 6 } });
      }
    }
  });

  it.each(['living-planet', 'guest', 'lifeline'])('%s is pure, deterministic, JSON-safe and forecast equals tick', id => {
    for (const seed of seeds) {
      const input = freeze(inputFor(id));
      let state = freeze(orbitPhase.init(input, seed));
      const initial = JSON.stringify(state);
      while (!orbitPhase.isDone(state)) {
        const before = JSON.stringify(state);
        const forecast = forecastOrbit(state);
        const action = freeze({ type: 'tick' as const, dtS: input.flight.orbit.periodS });
        const next = orbitPhase.step(state, action);
        expect(forecast.nextState).toEqual(next);
        expect(JSON.stringify(state)).toBe(before);
        expect(JSON.parse(JSON.stringify(next))).toEqual(next);
        state = freeze(JSON.parse(JSON.stringify(next)));
      }
      const output = orbitPhase.finish(state);
      expect(orbitPhase.finish(state)).toEqual(output);
      expect(output).toEqual(orbitPhase.finish(play(orbitPhase.init(input, seed))));
      expect(JSON.parse(JSON.stringify(output))).toEqual(output);
      const ids = [...input.log, ...output.log].map(entry => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(output.log.every(entry => entry.phase === 'orbit')).toBe(true);
      expect(JSON.stringify(orbitPhase.init(input, seed))).toBe(initial);
      expect(orbitPhase.step(state, { type: 'toggle', id: 'safeMode' })).toBe(state);
    }
  });

  it.each(['living-planet', 'guest', 'lifeline'])('%s rejects bad altitude and complete power damage causally', id => {
    const input = inputFor(id);
    // Нижче допуску (5% від мінімуму): провал; у смузі допуску місія лише втрачає частину оцінки.
    const wrongOrbit = { ...input.flight, orbit: orbitInfo(input.mission.body, Math.floor(input.mission.altRangeKm[0] * 0.95) - 1) };
    const failed = play(orbitPhase.init({ ...input, flight: wrongOrbit }, 42));
    expect(orbitPhase.finish(failed).result.success).toBe(false);
    expect(failed.log.some(entry => entry.messageKey === 'orbit.proto.orbitFailure')).toBe(true);
    const damaged = orbitPhase.init({ ...input, flight: { ...input.flight, damage: [{ system: 'power', severity: 1 }] } }, 42);
    expect(damaged.status).toBe('failed');
    for (const state of [failed, damaged]) {
      expect(state.log.filter(entry => entry.kind === 'failure').every(entry => (entry.causedBy?.length ?? 0) > 0)).toBe(true);
      expect(danglingCauses([...input.log, ...state.log])).toEqual([]);
      expect(orbitPhase.finish(state).result.success).toBe(false);
    }
  });

  it('keeps the lost-flight bypass without initializing an orbit', () => {
    const input = inputFor('lifeline');
    const out = replayOrbit(input.mission, input.spec, { ...input.flight, deploymentStatus: 'lost' }, input.log, [], 42);
    expect(out.result).toMatchObject({ success: false, survivedOrbits: 0, deliveredMb: 0, score: 0 });
    expect(out.log.some(entry => entry.messageKey === 'campaign.lostInFlight')).toBe(true);
    expect(out.log.some(entry => entry.phase === 'orbit')).toBe(false);
    expect(danglingCauses([...input.log, ...out.log])).toEqual([]);
  });

  it.each(['guest', 'lifeline'])('%s uses the exact nominal battery requirement from the shared model', id => {
    const input = inputFor(id);
    const need = orbitEnergyNeedWh(input.spec, input.flight.orbit, input.mission);
    expect(need).toBeGreaterThan(0);
    for (const [factor, survived] of [[1.001, true], [0.999, false]] as const) {
      const initial = orbitPhase.init({ ...input, spec: { ...input.spec, batteryWh: need * factor } }, 42);
      const end = play({ ...initial, stormOrbit: null });
      expect(end.status !== 'failed', `${id}/${factor}`).toBe(survived);
    }
  });
});

describe('flyby decisions and data', () => {
  it('captures only on orbits 3–5, succeeds below 30000 Mb and emits one opening/closing pair', () => {
    let state = init('guest');
    for (let orbit = 1; orbit <= 8; orbit++) {
      const clarity = orbitClarity(state);
      expect(clarity.view.forecast.cost.cameraS > 0).toBe(orbit >= 3 && orbit <= 5);
      if (orbit < 3 || orbit > 5) expect(clarity.systems.camera).toMatchObject({ commandOn: true, effectiveOn: false, reason: 'noWindow' });
      state = tick(state);
    }
    const out = orbitPhase.finish(state).result;
    expect(out.success).toBe(true);
    expect(out.deliveredMb).toBeGreaterThan(0);
    expect(out.deliveredMb).toBeLessThan(30000);
    expect(state.log.filter(entry => entry.messageKey === 'orbit.flyby.windowOpened')).toHaveLength(1);
    expect(state.log.filter(entry => entry.messageKey === 'orbit.flyby.windowClosed')).toHaveLength(1);
  });

  it('allows downlink after the observation interval and never awards buffered-only data', () => {
    let state = toggle(init('guest'), 'transmitter');
    for (let orbit = 1; orbit <= 5; orbit++) state = tick(state);
    expect(state.bufferMb).toBeGreaterThan(0);
    expect(orbitPhase.finish(play(state)).result.success).toBe(false);
    const end = play(toggle(state, 'transmitter'));
    expect(orbitPhase.finish(end).result.success).toBe(true);
    expect(end.deliveredMb).toBeGreaterThan(0);
    expect(end.history.slice(5).some(row => row.deliveredMb > 0)).toBe(true);
  });

  it('traces a missed flyby back to SAFE ON even after SAFE is switched off', () => {
    let state = tick(tick(init('guest')));
    state = toggle(state, 'safeMode');
    const command = state.log.at(-1);
    for (let orbit = 3; orbit <= 5; orbit++) state = tick(state);
    const end = play(toggle(state, 'safeMode'));
    expect(orbitPhase.finish(end).result.success).toBe(false);
    const problem = orbitDebrief(end).find(item => item.failure.messageKey === 'orbit.flyby.noData');
    expect(problem?.paths.some(path => path.at(-1)?.id === command?.id)).toBe(true);
    expect(danglingCauses([...end.input.log, ...end.log])).toEqual([]);
  });

  it('requires both quality and transmitted data', () => {
    const input = inputFor('guest');
    const poor = play(orbitPhase.init({ ...input, spec: { ...input.spec, resolutionM: 20 } }, 42));
    expect(poor.deliveredMb).toBeGreaterThan(0);
    expect(orbitPhase.finish(poor).result.success).toBe(false);
    expect(orbitPhase.finish(play(toggle(init('guest'), 'camera'))).result.success).toBe(false);
  });
});

describe('cargo delivery and telemetry', () => {
  it.each([[0, 100], [4, 107], [6, 110]])('%i reports yield score %i without changing delivery', (reports, score) => {
    let state = init('lifeline');
    for (let orbit = 1; orbit <= 6; orbit++) {
      const shouldTransmit = orbit > 6 - reports;
      if (state.toggles.transmitter !== shouldTransmit) state = toggle(state, 'transmitter');
      state = tick(state);
    }
    expect(orbitPhase.finish(state).result).toMatchObject({ success: true, score,
      deliveredMb: reports * 8, orbitSummary: { cargoDelivered: true, telemetryReportsSent: reports } });
    expect(state.log.filter(entry => entry.messageKey === 'orbit.cargo.reportMissed')).toHaveLength(6 - reports);
    expect(state.log.filter(entry => entry.messageKey === 'orbit.cargo.reportMissed').every(entry => entry.kind === 'warning')).toBe(true);
  });

  it('hides and ignores camera controls, while SAFE preserves automatic payload consumption', () => {
    const state = init('lifeline');
    expect(orbitPhase.step(state, { type: 'toggle', id: 'camera' })).toBe(state);
    expect(orbitView(state).controls).toEqual(['transmitter', 'heater', 'safeMode']);
    expect(orbitPhase.debugActions?.(state).some(action => action.action.type === 'toggle' && action.action.id === 'camera')).toBe(false);
    const safe = toggle(toggle(state, 'heater'), 'safeMode');
    const forecast = forecastOrbit(safe);
    const view = orbitView(safe);
    expect(forecast.cost.cameraS).toBe(0);
    expect(forecast.cost.monitoringS).toBe(view.imagingS);
    expect(forecast.generatedMb).toBe(8);
    expect(forecast.deliveredMb).toBe(0);
    expect(forecast.lostMb).toBe(8);
    expect(forecast.cost.consumedWh).toBeCloseTo(((safe.input.spec.baseLoadW + safe.input.spec.instrumentW)
      * safe.input.flight.orbit.periodS + safe.input.spec.heaterW * view.shadowS) / 3600, 10);
  });

  it('cold locks status monitoring without cancelling delivery or switching off the payload', () => {
    const end = play(toggle(init('lifeline'), 'heater'));
    expect(orbitPhase.finish(end).result).toMatchObject({ success: true, score: 103,
      orbitSummary: { cargoDelivered: true, telemetryReportsSent: 2 } });
    expect(end.log.some(entry => entry.messageKey === 'orbit.cargo.monitoringCold' && entry.kind === 'warning')).toBe(true);
    expect(end.log.some(entry => entry.messageKey === 'orbit.proto.cameraCold')).toBe(false);
  });

  it.each(['science', 'comms'] as const)('%s damage can remove the bonus while retaining a completed delivery', system => {
    const input = inputFor('lifeline');
    const state = orbitPhase.init({ ...input, flight: { ...input.flight, damage: [{ system, severity: 1 }] } }, 42);
    const end = play(state);
    expect(orbitPhase.finish(end).result).toMatchObject({ success: true, score: 100,
      orbitSummary: { telemetryReportsSent: 0, cargoDelivered: true } });
    expect(danglingCauses([...input.log, ...end.log])).toEqual([]);
  });

  it('does not count slowly generated partial reports as full telemetry', () => {
    const input = inputFor('lifeline');
    const end = play(orbitPhase.init({ ...input,
      flight: { ...input.flight, damage: [{ system: 'science', severity: 0.99 }] } }, 42));
    expect(end.deliveredMb).toBeCloseTo(9, 8);
    expect(orbitPhase.finish(end).result).toMatchObject({ success: true, score: 100,
      orbitSummary: { telemetryReportsSent: 0, cargoDelivered: true } });
  });

  it('does not blame an old SAFE decision for a later damaged transmitter', () => {
    let state = toggle(init('lifeline'), 'safeMode');
    const oldCommand = state.log.at(-1)?.id;
    state = toggle(tick(state), 'safeMode');
    state = tick({ ...state, input: { ...state.input,
      flight: { ...state.input.flight, damage: [{ system: 'comms', severity: 1 }] } } });
    const report = state.log.filter(entry => entry.messageKey === 'orbit.cargo.reportMissed').at(-1);
    const ancestors = new Set<string>();
    const visit = (ids: string[]) => ids.forEach(id => {
      if (ancestors.has(id)) return;
      ancestors.add(id);
      visit(state.log.find(entry => entry.id === id)?.causedBy ?? []);
    });
    visit(report?.causedBy ?? []);
    expect(report).toBeDefined();
    expect(ancestors.has(oldCommand ?? '')).toBe(false);
    expect(ancestors.has('orbit:arrival')).toBe(true);
  });

  it('falls back to the real arrival entry when previous design logs are empty', () => {
    const input = inputFor('lifeline');
    const { cargoKind: _kind, ...spec } = input.spec;
    const failed = orbitPhase.init({ ...input, spec, log: [] }, 42);
    expect(failed.log.at(-1)?.causedBy).toEqual(['orbit:arrival']);
    expect(danglingCauses(failed.log)).toEqual([]);
  });

  it('fails incompatible payloads on arrival and ignores the optical placeholder for valid containers', () => {
    const input = inputFor('lifeline');
    const { cargoKind: _kind, ...camera } = input.spec;
    const missing = orbitPhase.init({ ...input, spec: camera }, 42);
    const unneeded = orbitPhase.init({ ...input, mission: { ...input.mission, stationNeeds: { water: 0 } } }, 42);
    for (const state of [missing, unneeded]) {
      expect(state.status).toBe('failed');
      expect(state.log.at(-1)).toMatchObject({ messageKey: 'orbit.cargo.invalidPayload', kind: 'failure' });
      expect(danglingCauses([...input.log, ...state.log])).toEqual([]);
    }
    const lowOptics = play(orbitPhase.init({ ...input, spec: { ...input.spec, resolutionM: 1e9 } }, 42));
    expect(orbitPhase.finish(lowOptics).result).toMatchObject({ success: true, score: 110 });
  });

  it.each([[8, 1], [7.9999995, 1], [7.999, 0], [0, 0]])('a pass delivering at most %f Mb counts %i reports', (passS, sent) => {
    const end = play(shortCargo(passS));
    expect(end.telemetryReportsSent).toBe(sent);
    expect(end.deliveredMb).toBeCloseTo(Math.min(passS, 8), 8);
    expect(end.bufferMb).toBe(0);
  });

  it('expires partial packets and limits monitoring to eight Mb even with a four-Mb buffer', () => {
    const initial = shortCargo(5);
    const two = { ...initial, input: { ...initial.input, mission: { ...initial.input.mission, durationOrbits: 2 } } };
    const first = tick(two);
    expect(first).toMatchObject({ bufferMb: 0, deliveredMb: 5, lostMb: 3, telemetryReportsSent: 0 });
    expect(tick(first)).toMatchObject({ bufferMb: 0, deliveredMb: 10, lostMb: 6, telemetryReportsSent: 0 });
    const small = tick({ ...initial, input: { ...initial.input, spec: { ...initial.input.spec, bufferMb: 4 } } });
    expect(small).toMatchObject({ deliveredMb: 4, lostMb: 4, telemetryReportsSent: 0 });
    expect(small.log.find(entry => entry.messageKey === 'orbit.proto.overflow')?.kind).toBe('warning');
  });

  it.each([[14.4, 0], [82, 2], [93, 8]])('power loss at %f s stops monitoring and all later report events', (timeS, generatedMb) => {
    const original = shortCargo();
    const energyWs = timeS <= 90 ? timeS * 25 : 90 * 25 + (timeS - 90) * 55;
    const state = { ...original, chargeWh: energyWs / 3600,
      input: { ...original.input, spec: { ...original.input.spec, panelPowerW: 0, batteryWh: energyWs / 3600 } } };
    const forecast = forecastOrbit(state);
    const end = tick(freeze(state));
    expect(end.status).toBe('failed');
    expect(end.tS).toBeCloseTo(timeS, 8);
    expect(forecast.generatedMb).toBeCloseTo(generatedMb, 8);
    expect(end.completedOrbits).toBe(0);
    expect(end.telemetryReportsSent).toBe(0);
    expect(end.log.some(entry => ['orbit.cargo.reportSent', 'orbit.cargo.reportMissed'].includes(entry.messageKey))).toBe(false);
    expect(end.log.at(-1)?.messageKey).toBe('orbit.proto.powerFailure');
    expect(forecast.nextState).toEqual(end);
  });

  it('counts a packet received before a later power loss but never awards failed delivery', () => {
    const original = shortCargo();
    const energyWh = (90 * 25 + 8 * 55 + 0.1 * 25) / 3600;
    const end = tick({ ...original, chargeWh: energyWh, input: { ...original.input,
      spec: { ...original.input.spec, panelPowerW: 0, batteryWh: energyWh } } });
    expect(end.status).toBe('failed');
    expect(end.telemetryReportsSent).toBe(1);
    expect(end.log.find(entry => entry.messageKey === 'orbit.cargo.reportSent')?.tS).toBeCloseTo(98, 8);
    expect(orbitPhase.finish(end).result).toMatchObject({ success: false, score: 0, orbitSummary: { cargoDelivered: false } });
  });
});

describe('validation, compatibility and English event keys', () => {
  it('rejects mismatched and unknown mission kinds before either model or phase can use them', () => {
    for (const [id, kind] of [['guest', 'cargo'], ['lifeline', 'imaging'], ['guest', 'unknown']] as const) {
      const input = inputFor(id);
      const mission = JSON.parse(JSON.stringify(input.mission));
      mission.kind = kind;
      expect(() => validateOrbitMission(mission)).toThrow(/kind/);
      expect(() => orbitPhase.init({ ...input, mission }, 42)).toThrow(/kind/);
    }
  });

  it.each([0, -1, 1.5])('rejects explicit objectives with durationOrbits=%f', durationOrbits => {
    const input = inputFor('guest');
    expect(() => orbitPhase.init({ ...input, mission: { ...input.mission, durationOrbits } }, 42)).toThrow(/durationOrbits/);
  });

  it.each([
    { type: 'flyby', imagingOrbits: [5, 3] }, { type: 'flyby', imagingOrbits: [0, 5] },
    { type: 'flyby', imagingOrbits: [3, 20] }, { type: 'cargo', telemetryReportMb: 0, telemetryBonusMaxFraction: 0.1 },
  ])('rejects invalid mission data: %j', objective => {
    const mission = JSON.parse(JSON.stringify(inputFor(objective.type === 'cargo' ? 'lifeline' : 'guest').mission));
    mission.orbitObjective = objective;
    expect(() => validateOrbitMission(mission)).toThrow();
  });

  it('keeps legacy missions without objective and metadata on the previous output contract', () => {
    const input = inputFor('lifeline');
    const { orbitObjective: _objective, ...mission } = input.mission;
    const { cargoKind: _kind, ...spec } = input.spec;
    const out = orbitPhase.finish(play(orbitPhase.init({ ...input, mission, spec }, 42))).result;
    expect(out.success).toBe(true);
    expect(Object.hasOwn(out, 'orbitSummary')).toBe(false);
  });

  it('never uses fuelLeftKg as an orbital resource or score bonus', () => {
    const input = inputFor('lifeline');
    const empty = play(orbitPhase.init({ ...input, flight: { ...input.flight, fuelLeftKg: 0 } }, 42));
    const full = play(orbitPhase.init({ ...input, flight: { ...input.flight, fuelLeftKg: input.spec.fuelKg } }, 42));
    expect(orbitPhase.finish(empty)).toEqual(orbitPhase.finish(full));
  });

  it('provides English templates and all parameters for new causal messages', () => {
    const dictionary: Record<string, string> = { ...orbitTexts, ...sharedTexts };
    const ends = [play(init('lifeline')), play(toggle(init('lifeline'), 'transmitter')),
      play(toggle(init('lifeline'), 'heater')), play(init('guest')), play(toggle(init('guest'), 'camera'))];
    for (const state of ends) for (const entry of state.log) {
      const template = dictionary[entry.messageKey];
      expect(template, entry.messageKey).toBeDefined();
      for (const match of template?.matchAll(/\{(\w+)\}/g) ?? []) {
        expect(Object.hasOwn(entry.params ?? {}, match[1] ?? ''), entry.messageKey).toBe(true);
      }
    }
  });
});
