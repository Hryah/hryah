import type { CauseEntry, OrbitInput, OrbitPhase, MissionOutcome, SystemId } from '../contracts';
import { downlinkMb, orbitTiming, segmentLoadW, stepCharge, transmitSeconds } from '../model';
import { nextRandom } from '../physics';

export type ToggleId = 'camera' | 'transmitter' | 'heater' | 'safeMode';
export type OrbitAction = { type: 'toggle'; id: ToggleId } | { type: 'tick'; dtS: number };

export interface OrbitTelemetry {
  orbit: number;
  chargeWh: number;
  bufferMb: number;
  deliveredMb: number;
  lostMb: number;
  tS: number;
  storm: boolean;
}

export interface OrbitState {
  input: OrbitInput;
  rngState: number;
  tS: number;
  completedOrbits: number;
  chargeWh: number;
  bufferMb: number;
  deliveredMb: number;
  lostMb: number;
  coldStress: number;
  toggles: Record<ToggleId, boolean>;
  stormOrbit: number | null;
  status: 'active' | 'complete' | 'failed';
  log: CauseEntry[];
  history: OrbitTelemetry[];
}

export interface OrbitForecast {
  nextState: OrbitState;
  chargeWh: number;
  deliveredMb: number;
  generatedMb: number;
  lostMb: number;
  storm: boolean;
  powerFailure: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const damage = (input: OrbitInput, system: SystemId) =>
  Math.max(0, ...input.flight.damage.filter((d) => d.system === system).map((d) => clamp(d.severity, 0, 1)));

function capabilities(state: OrbitState) {
  const { input } = state;
  const { spec, flight, mission } = input;
  const powerFactor = 1 - damage(input, 'power');
  const { shadowS, sunlightS, imagingS, passS, idleSunS } = orbitTiming(flight.orbit, mission);
  const resolutionM = spec.resolutionM * flight.orbit.altKm / spec.design.altKm;
  return {
    capacityWh: spec.batteryWh * powerFactor,
    panelPowerW: spec.panelPowerW * powerFactor,
    downlinkMbps: spec.downlinkMbps * (1 - damage(input, 'comms')),
    instrumentRateMbps: spec.instrumentRateMbps * (1 - damage(input, 'science')),
    heaterFactor: 1 - damage(input, 'thermal'),
    shadowS, sunlightS, imagingS, passS,
    idleSunS,
    resolutionM,
    resolutionOk: resolutionM <= mission.requiredResolutionM,
    orbitOk: flight.orbit.altKm >= mission.altRangeKm[0] && flight.orbit.altKm <= mission.altRangeKm[1],
  };
}

function effectiveSystems(state: OrbitState) {
  const caps = capabilities(state);
  if (state.status !== 'active') return { camera: false, transmitter: false, heater: false, safeMode: false };
  return {
    camera: state.toggles.camera && !state.toggles.safeMode && state.coldStress < 2 && caps.instrumentRateMbps > 0,
    transmitter: state.toggles.transmitter && !state.toggles.safeMode && caps.downlinkMbps > 0,
    heater: (state.toggles.heater || state.toggles.safeMode) && caps.heaterFactor > 0,
    safeMode: state.toggles.safeMode,
  };
}

function eventIds(state: OrbitState, keys: string[]): string[] {
  return state.log.filter((entry) => keys.includes(entry.messageKey)).map((entry) => entry.id);
}

function causes(state: OrbitState, ids: string[], toggles: ToggleId[] = []): string[] {
  const all = [...state.input.log, ...state.log];
  const existing = all.map((e) => e.id);
  const result = ids.filter((id) => existing.includes(id));
  for (const toggle of toggles) {
    const entry = [...state.log].reverse().find((e) => e.kind === 'decision' && e.params?.toggle === toggle);
    if (entry && !result.includes(entry.id)) result.push(entry.id);
  }
  if (state.input.flight.damage.length > 0) result.push('orbit:arrival');
  return result.length > 0 ? [...new Set(result)] : ['orbit:arrival'];
}

function addEntry(state: OrbitState, messageKey: string, kind: CauseEntry['kind'], system: SystemId,
  params: Record<string, string | number> = {}, causedBy: string[] = []): void {
  const id = `orbit:${state.completedOrbits + 1}-${state.log.length}`;
  state.log.push({ id, phase: 'orbit', tS: state.tS, kind, system, messageKey, params,
    ...(causedBy.length > 0 ? { causedBy } : {}) });
}

function outcome(state: OrbitState): MissionOutcome {
  const caps = capabilities(state);
  return {
    success: state.status === 'complete' && state.completedOrbits >= state.input.mission.durationOrbits
      && state.deliveredMb >= state.input.mission.requiredDataMb && caps.resolutionOk && caps.orbitOk,
    deliveredMb: state.deliveredMb,
    survivedOrbits: state.completedOrbits,
    score: Math.round(state.deliveredMb / 100),
  };
}

function completeMission(state: OrbitState): void {
  const caps = capabilities(state);
  const mission = state.input.mission;
  state.status = 'complete';
  if (state.deliveredMb < mission.requiredDataMb) {
    addEntry(state, 'orbit.proto.insufficientData', 'failure', 'comms',
      { deliveredMb: state.deliveredMb, requiredMb: mission.requiredDataMb },
      causes(state, ['design:instrument', 'design:antenna', ...eventIds(state,
        ['orbit.proto.storm', 'orbit.proto.cameraCold', 'orbit.proto.overflow'])],
      ['camera', 'transmitter', 'safeMode']));
  }
  if (!caps.resolutionOk) {
    addEntry(state, 'orbit.proto.resolutionFailure', 'failure', 'science',
      { resolutionM: caps.resolutionM, requiredM: mission.requiredResolutionM },
      causes(state, ['design:instrument', 'design:altitude']));
  }
  if (!caps.orbitOk) {
    addEntry(state, 'orbit.proto.orbitFailure', 'failure', 'propulsion', { altKm: state.input.flight.orbit.altKm },
      causes(state, ['design:engine', 'design:fuel', 'design:altitude']));
  }
  addEntry(state, outcome(state).success ? 'orbit.proto.success' : 'orbit.proto.complete',
    'event', 'science', { deliveredMb: state.deliveredMb, orbits: state.completedOrbits });
}

// Integrates only a fresh local state; the incoming state and its nested values are never changed.
function advanceOrbit(previous: OrbitState): OrbitState {
  if (previous.status !== 'active') return previous;
  const state: OrbitState = { ...previous, log: [...previous.log], history: [...previous.history] };
  const caps = capabilities(state);
  const active = effectiveSystems(state);
  const { spec } = state.input;
  const orbit = state.completedOrbits + 1;
  const storm = state.stormOrbit === orbit;
  const stormFactor = storm ? 0.5 : 1;
  const generationW = caps.panelPowerW * stormFactor;
  const linkMbps = caps.downlinkMbps * stormFactor;

  if (storm) {
    addEntry(state, 'orbit.proto.storm', 'event', 'power', { orbit });
  }

  const move = (durationS: number, generation: number, loadW: number,
    operation: 'idle' | 'camera' | 'transmitter' = 'idle') => {
    if (state.status !== 'active' || durationS <= 0) return;
    const deficitW = loadW - generation;
    const untilEmptyS = deficitW > 0 ? Math.max(0, state.chargeWh) * 3600 / deficitW : Infinity;
    const elapsedS = Math.min(durationS, untilEmptyS);
    state.chargeWh = stepCharge(state.chargeWh, caps.capacityWh, generation - loadW, elapsedS);
    state.tS += elapsedS;

    if (operation === 'camera') {
      const producedMb = caps.instrumentRateMbps * elapsedS;
      const addedMb = Math.min(producedMb, Math.max(0, spec.bufferMb - state.bufferMb));
      state.bufferMb += addedMb;
      const lostMb = producedMb - addedMb;
      state.lostMb += lostMb;
      if (lostMb > 0.000001) {
        addEntry(state, 'orbit.proto.overflow', 'failure', 'comms', { lostMb },
          causes(state, ['design:instrument', 'design:antenna', ...eventIds(state, ['orbit.proto.storm'])],
          ['camera', 'transmitter']));
      }
    } else if (operation === 'transmitter') {
      const sentMb = downlinkMb(state.bufferMb, linkMbps, 0, elapsedS, true);
      state.bufferMb = Math.max(0, state.bufferMb - sentMb);
      state.deliveredMb += sentMb;
    }

    if (untilEmptyS <= durationS) {
      state.status = 'failed';
      state.chargeWh = 0;
      addEntry(state, 'orbit.proto.powerFailure', 'failure', 'power', { orbit },
        causes(state, ['design:battery', 'design:solar', 'design:instrument',
          ...eventIds(state, ['orbit.proto.storm'])], ['camera', 'transmitter', 'heater', 'safeMode']));
    }
  };

  // Навантаження відрізків і тривалість передачі беруться з model/: їх же рахує запас energy у частині 1.
  move(caps.idleSunS, generationW, segmentLoadW(spec, 'sunIdle', active));
  move(caps.imagingS, generationW, segmentLoadW(spec, 'imaging', active), active.camera ? 'camera' : 'idle');
  const transmitS = transmitSeconds(caps.passS, state.bufferMb, linkMbps, active.transmitter);
  move(transmitS, generationW, segmentLoadW(spec, 'transmit', active), 'transmitter');
  move(caps.passS - transmitS, generationW, segmentLoadW(spec, 'passRest', active));
  move(caps.shadowS, 0, segmentLoadW(spec, 'shadow', active));

  if (state.status === 'active') {
    const previousStress = state.coldStress;
    if (caps.shadowS > 0) state.coldStress = clamp(state.coldStress + (active.heater ? -caps.heaterFactor : 1), 0, 2);
    if (state.coldStress >= 2 && previousStress < 2) {
      addEntry(state, 'orbit.proto.cameraCold', 'failure', 'thermal', {},
        causes(state, ['design:battery'], ['heater', 'safeMode']));
    } else if (state.coldStress < 2 && previousStress >= 2) {
      addEntry(state, 'orbit.proto.cameraRecovered', 'event', 'thermal');
    }
    state.completedOrbits += 1;
    addEntry(state, 'orbit.proto.turnComplete', 'event', 'science',
      { orbit, deliveredMb: state.deliveredMb - previous.deliveredMb, chargeWh: state.chargeWh });
    if (state.completedOrbits >= state.input.mission.durationOrbits) completeMission(state);
    else if (state.stormOrbit === state.completedOrbits + 1) {
      addEntry(state, 'orbit.proto.stormWarning', 'warning', 'power', { orbit: state.stormOrbit });
    }
  }
  state.history.push({ orbit, chargeWh: state.chargeWh, bufferMb: state.bufferMb,
    deliveredMb: state.deliveredMb, lostMb: state.lostMb, tS: state.tS, storm });
  return state;
}

export const orbitPhase: OrbitPhase<OrbitState, OrbitAction> = {
  init(input, seed) {
    const [random, rngState] = nextRandom(seed);
    const maxStormOrbit = Math.min(7, input.mission.durationOrbits);
    const state: OrbitState = {
      input, rngState, tS: 0, completedOrbits: 0,
      chargeWh: input.spec.batteryWh * (1 - damage(input, 'power')),
      bufferMb: 0, deliveredMb: 0, lostMb: 0, coldStress: 0,
      toggles: { camera: true, transmitter: true, heater: true, safeMode: false },
      stormOrbit: maxStormOrbit >= 4 ? 4 + Math.floor(random * (maxStormOrbit - 3)) : null,
      status: 'active',
      log: [{ id: 'orbit:arrival', phase: 'orbit', tS: 0, kind: 'event', system: 'structure',
        messageKey: 'orbit.proto.arrival', params: { altKm: input.flight.orbit.altKm } }],
      history: [],
    };
    if (damage(input, 'power') >= 1 || damage(input, 'structure') >= 1) {
      state.status = 'failed';
      addEntry(state, 'orbit.proto.arrivalFailure', 'failure', damage(input, 'power') >= 1 ? 'power' : 'structure', {}, ['orbit:arrival']);
    } else if (input.mission.durationOrbits <= 0) completeMission(state);
    return state;
  },
  step(state, action) {
    if (state.status !== 'active') return state;
    if (action.type === 'toggle') {
      if (!Object.prototype.hasOwnProperty.call(state.toggles, action.id)) return state;
      const next = { ...state, toggles: { ...state.toggles, [action.id]: !state.toggles[action.id] }, log: [...state.log] };
      addEntry(next, 'orbit.proto.toggle', 'decision', action.id === 'heater' ? 'thermal' : action.id === 'transmitter' ? 'comms' : 'power',
        { toggle: action.id, enabled: next.toggles[action.id] ? 1 : 0 });
      return next;
    }
    if (!Number.isFinite(action.dtS) || action.dtS <= 0
      || Math.abs(action.dtS - state.input.flight.orbit.periodS) > 0.000001) return state;
    return advanceOrbit(state);
  },
  isDone: (state) => state.status !== 'active',
  finish: (state) => ({ result: outcome(state), log: state.log }),
  debugActions: (state) => state.status !== 'active' ? [] : [
    ...(['camera', 'transmitter', 'heater', 'safeMode'] as ToggleId[]).map((id) => ({
      group: 'orbit.proto.systems', label: `orbit.proto.${id}`, action: { type: 'toggle' as const, id },
    })),
    { group: 'orbit.proto.go', label: 'orbit.proto.nextOrbit', action: { type: 'tick' as const, dtS: state.input.flight.orbit.periodS } },
  ],
};

export function forecastOrbit(state: OrbitState): OrbitForecast {
  const nextState = advanceOrbit(state);
  const deliveredMb = nextState.deliveredMb - state.deliveredMb;
  const lostMb = nextState.lostMb - state.lostMb;
  return {
    nextState, chargeWh: nextState.chargeWh, deliveredMb, lostMb,
    generatedMb: Math.max(0, nextState.bufferMb - state.bufferMb + deliveredMb + lostMb),
    storm: state.status === 'active' && state.stormOrbit === state.completedOrbits + 1,
    powerFailure: state.status === 'active' && nextState.status === 'failed',
  };
}

export function orbitView(state: OrbitState) {
  const caps = capabilities(state);
  const total = state.input.mission.durationOrbits;
  return {
    ...caps,
    bufferCapacityMb: state.input.spec.bufferMb,
    chargePercent: caps.capacityWh > 0 ? clamp(state.chargeWh / caps.capacityWh * 100, 0, 100) : 0,
    bufferPercent: state.input.spec.bufferMb > 0 ? clamp(state.bufferMb / state.input.spec.bufferMb * 100, 0, 100) : 0,
    dataPercent: state.input.mission.requiredDataMb > 0 ? clamp(state.deliveredMb / state.input.mission.requiredDataMb * 100, 0, 100) : 100,
    remainingOrbits: Math.max(0, total - state.completedOrbits),
    nextOrbit: Math.min(total, state.completedOrbits + 1),
    stormNext: state.status === 'active' && state.stormOrbit === state.completedOrbits + 1,
    stormInOrbits: state.stormOrbit !== null && state.stormOrbit > state.completedOrbits ? state.stormOrbit - state.completedOrbits : null,
    periodMin: state.input.flight.orbit.periodS / 60,
    activeSystems: effectiveSystems(state),
    forecast: forecastOrbit(state),
    history: state.history,
  };
}
