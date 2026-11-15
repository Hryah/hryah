import type { CauseEntry, OrbitInput, OrbitPhase, MissionOutcome, SystemId } from '../contracts';
import { downlinkMb, orbitAccepted, orbitGeneratedMb, orbitLowBand, orbitProfile, orbitTiming, segmentLoadW, stepCharge,
  transmitSeconds, validateOrbitMission } from '../model';
import { nextRandom } from '../physics';
import rules from '../../data/orbit-rules.json';

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
  telemetryReportsSent: number;
  toggles: Record<ToggleId, boolean>;
  stormOrbit: number | null;
  status: 'active' | 'complete' | 'failed';
  log: CauseEntry[];
  history: OrbitTelemetry[];
}

export interface OrbitTurnCost {
  elapsedS: number;
  consumedWh: number;
  generatedWh: number;
  minimumChargeWh: number;
  peakBufferMb: number;
  cameraS: number;
  transmitterS: number;
  heaterS: number;
  monitoringS: number;
}

export interface OrbitForecast {
  bufferMb: number;
  chargeDeltaWh: number;
  bufferDeltaMb: number;
  cost: OrbitTurnCost;
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
    resolutionOk: mission.orbitObjective?.type === 'cargo' || resolutionM <= mission.requiredResolutionM,
    // Трохи нижче мінімуму (до lowToleranceFraction) — не провал, а нижча якість: штраф польоту на кілька кілометрів
    // не повинен зводити нанівець місію з усіма даними. Сильний недолiт і вихід за верх діапазону лишаються провалом.
    orbitOk: orbitAccepted(mission, flight.orbit.altKm),
    orbitLow: orbitLowBand(mission, flight.orbit.altKm),
  };
}

function effectiveSystems(state: OrbitState) {
  const caps = capabilities(state);
  const profile = orbitProfile(state.input.mission, state.completedOrbits + 1);
  if (state.status !== 'active') return { camera: false, transmitter: false, heater: false, safeMode: false };
  return {
    camera: state.toggles.camera && profile.cameraWindow && !state.toggles.safeMode
      && state.coldStress < rules.cold.lockStress && caps.instrumentRateMbps > 0,
    transmitter: state.toggles.transmitter && !state.toggles.safeMode && caps.downlinkMbps > 0,
    heater: (state.toggles.heater || state.toggles.safeMode) && caps.heaterFactor > 0,
    safeMode: state.toggles.safeMode,
  };
}

function eventIds(state: OrbitState, keys: string[]): string[] {
  return state.log.filter((entry) => keys.includes(entry.messageKey)).map((entry) => entry.id);
}

function causes(state: OrbitState, ids: string[], commands: Partial<Record<ToggleId, boolean>> = {}): string[] {
  const all = [...state.input.log, ...state.log];
  const existing = all.map((e) => e.id);
  const result = ids.filter((id) => existing.includes(id));
  // Each event selects the command values that actually contributed to it.
  for (const toggle of Object.keys(commands) as ToggleId[]) {
    const enabled = commands[toggle];
    if (enabled === undefined || state.toggles[toggle] !== enabled) continue;
    const entry = [...state.log].reverse().find((e) => e.kind === 'decision' && e.params?.toggle === toggle);
    if (entry?.params?.enabled === (enabled ? 1 : 0) && !result.includes(entry.id)) result.push(entry.id);
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

function missionScore(state: OrbitState, caps: ReturnType<typeof capabilities>, success: boolean): number {
  const raw = rawMissionScore(state, caps, success);
  return caps.orbitLow ? Math.round(raw * rules.orbit.lowScoreFactor) : raw;
}

function rawMissionScore(state: OrbitState, caps: ReturnType<typeof capabilities>, success: boolean): number {
  const { mission, spec } = state.input;
  const objective = mission.orbitObjective;
  if (objective?.type === 'cargo') {
    const ratio = clamp(state.telemetryReportsSent / mission.durationOrbits, 0, 1);
    return success ? Math.round(rules.score.cargoBasePoints * (1 + objective.telemetryBonusMaxFraction * ratio)) : 0;
  }
  if (!success) return Math.round(state.deliveredMb / rules.score.failureDivisorMb);
  const softTargetMb = Math.max(rules.score.minimumSoftTargetMb, mission.requiredDataMb * rules.score.softTargetMultiplier);
  const baseMb = Math.min(state.deliveredMb, softTargetMb);
  const extraMb = Math.max(0, state.deliveredMb - softTargetMb);
  const dataPoints = baseMb / rules.score.fullRateDivisorMb + extraMb / rules.score.extraDivisorMb;
  const wastePenalty = state.lostMb / rules.score.overflowDivisorMb;
  const resolutionPoints = mission.kind !== 'cargo' && caps.resolutionM > 0 && caps.resolutionOk
    ? (mission.requiredResolutionM / Math.max(rules.score.minimumResolutionM, caps.resolutionM)) * rules.score.resolutionWeight
    : 0;
  const budgetPoints = Math.max(0, mission.budgetMUsd - spec.costMUsd) * rules.score.savedBudgetPointsPerMUsd;
  const zeroBacklog = state.lostMb <= rules.epsilon
    && state.history.length > 0
    && state.history.every((h) => h.bufferMb <= rules.epsilon);
  const stormFlushHeadroom = caps.downlinkMbps * rules.storm.linkFactor * caps.passS >= spec.bufferMb;
  const commsPoints = zeroBacklog && stormFlushHeadroom ? rules.score.commsMarginPoints : 0;
  return Math.max(0, Math.round(dataPoints - wastePenalty + resolutionPoints + budgetPoints + commsPoints));
}

function validCargo(state: OrbitState): boolean {
  const kind = state.input.spec.cargoKind;
  return !!kind && (state.input.mission.stationNeeds?.[kind] ?? 0) > 0;
}

function outcome(state: OrbitState): MissionOutcome {
  const caps = capabilities(state);
  const { mission } = state.input;
  const objective = mission.orbitObjective;
  const cargo = objective?.type === 'cargo';
  const goalMet = cargo ? validCargo(state) : objective?.type === 'flyby'
    ? state.deliveredMb > 0 : state.deliveredMb >= mission.requiredDataMb;
  const success = state.status === 'complete' && state.completedOrbits >= state.input.mission.durationOrbits
    && goalMet && caps.resolutionOk && caps.orbitOk;
  return {
    success,
    deliveredMb: state.deliveredMb,
    survivedOrbits: state.completedOrbits,
    score: missionScore(state, caps, success),
    ...(objective ? { orbitSummary: {
      objectiveType: objective.type, actualResolutionM: caps.resolutionM,
      capturedMb: cargo ? 0 : state.deliveredMb + state.bufferMb + state.lostMb,
      lostMb: state.lostMb, cargoDelivered: cargo && success,
      telemetryReportsSent: cargo ? state.telemetryReportsSent : 0,
      telemetryReportsExpected: cargo ? mission.durationOrbits : 0,
    } } : {}),
  };
}

function completeMission(state: OrbitState): void {
  const caps = capabilities(state);
  const mission = state.input.mission;
  const cargo = mission.orbitObjective?.type === 'cargo';
  const flyby = mission.orbitObjective?.type === 'flyby';
  state.status = 'complete';
  if (!cargo && (flyby ? state.deliveredMb <= 0 : state.deliveredMb < mission.requiredDataMb)) {
    addEntry(state, flyby ? 'orbit.flyby.noData' : 'orbit.proto.insufficientData', 'failure', flyby ? 'science' : 'comms',
      { deliveredMb: state.deliveredMb, requiredMb: mission.requiredDataMb },
      causes(state, ['design:instrument', 'design:antenna', ...eventIds(state,
        ['orbit.proto.storm', 'orbit.proto.cameraCold', 'orbit.proto.overflow',
          'orbit.clarity.missedImaging', 'orbit.clarity.missedDownlink'])]));
  }
  if (!caps.resolutionOk) {
    addEntry(state, 'orbit.proto.resolutionFailure', 'failure', 'science',
      { resolutionM: caps.resolutionM, requiredM: mission.requiredResolutionM },
      causes(state, ['design:instrument', 'design:altitude']));
  }
  if (!caps.orbitOk) {
    addEntry(state, 'orbit.proto.orbitFailure', 'failure', 'propulsion', { altKm: state.input.flight.orbit.altKm },
      causes(state, ['design:engine', 'design:fuel', 'design:altitude']));
  } else if (caps.orbitLow) {
    addEntry(state, 'orbit.proto.orbitLow', 'warning', 'propulsion',
      { altKm: state.input.flight.orbit.altKm, minKm: mission.altRangeKm[0] },
      causes(state, ['design:engine', 'design:fuel', 'design:altitude']));
  }
  const cargoKind = state.input.spec.cargoKind;
  if (cargo && cargoKind && outcome(state).success) {
    // Назву контейнера дає ключ тексту (orbit.cargo.delivered.<kind>): ядро не перекладає сирий cargoKind.
    addEntry(state, `orbit.cargo.delivered.${cargoKind}`, 'event', 'structure', { cargoKind, orbits: state.completedOrbits },
      causes(state, ['design:instrument', 'orbit:arrival']));
  }
  addEntry(state, outcome(state).success ? 'orbit.proto.success' : 'orbit.proto.complete',
    'event', 'science', { deliveredMb: state.deliveredMb, orbits: state.completedOrbits });
}

// Integrates only a fresh local state; the incoming state and its nested values are never changed.
function advanceOrbit(previous: OrbitState, cost?: OrbitTurnCost): OrbitState {
  if (previous.status !== 'active') return previous;
  const state: OrbitState = { ...previous, log: [...previous.log], history: [...previous.history] };
  const logStart = state.log.length;
  const caps = capabilities(state);
  const active = effectiveSystems(state);
  const { spec } = state.input;
  const mission = state.input.mission;
  const profile = orbitProfile(mission, state.completedOrbits + 1);
  const cargo = mission.orbitObjective?.type === 'cargo' ? mission.orbitObjective : null;
  const monitoring = !!cargo && state.coldStress < rules.cold.lockStress && caps.instrumentRateMbps > 0;
  const orbit = state.completedOrbits + 1;
  const storm = state.stormOrbit === orbit;
  const generationW = caps.panelPowerW * (storm ? rules.storm.powerFactor : 1);
  const linkMbps = caps.downlinkMbps * (storm ? rules.storm.linkFactor : 1);
  const operated = { camera: false, transmitter: false, heater: false };
  let reportSent = false;

  const flyby = mission.orbitObjective?.type === 'flyby' ? mission.orbitObjective : null;
  if (flyby && orbit === flyby.imagingOrbits[0]) {
    addEntry(state, 'orbit.flyby.windowOpened', 'event', 'science', { orbit },
      causes(state, ['design:instrument', 'design:altitude']));
  } else if (flyby && orbit === flyby.imagingOrbits[1] + 1) {
    addEntry(state, 'orbit.flyby.windowClosed', 'event', 'science', { orbit },
      causes(state, eventIds(state, ['orbit.flyby.windowOpened'])));
  }

  if (storm) {
    addEntry(state, 'orbit.proto.storm', 'event', 'power', { orbit });
  }

  const move = (durationS: number, generation: number, loadW: number,
    operation: 'idle' | 'camera' | 'monitoring' | 'transmitter' | 'heater' = 'idle') => {
    if (state.status !== 'active' || durationS <= 0) return;
    const deficitW = loadW - generation;
    const untilEmptyS = deficitW > 0 ? Math.max(0, state.chargeWh) * 3600 / deficitW : Infinity;
    const elapsedS = Math.min(durationS, untilEmptyS);
    if (elapsedS > 0 && operation !== 'idle' && operation !== 'monitoring'
      && (operation !== 'heater' || active.heater)) operated[operation] = true;
    state.chargeWh = stepCharge(state.chargeWh, caps.capacityWh, generation - loadW, elapsedS);
    state.tS += elapsedS;
    if (cost) {
      cost.elapsedS += elapsedS;
      cost.consumedWh += loadW * elapsedS / 3600;
      cost.generatedWh += generation * elapsedS / 3600;
      cost.minimumChargeWh = Math.min(cost.minimumChargeWh, state.chargeWh);
      if (operation === 'camera') cost.cameraS += elapsedS;
      if (operation === 'monitoring') cost.monitoringS += elapsedS;
      if (operation === 'transmitter') cost.transmitterS += elapsedS;
      if (operation === 'heater' && active.heater) cost.heaterS += elapsedS;
    }

    if (operation === 'camera' || operation === 'monitoring') {
      const producedMb = orbitGeneratedMb(profile, caps.instrumentRateMbps, elapsedS, active.camera);
      const addedMb = Math.min(producedMb, Math.max(0, spec.bufferMb - state.bufferMb));
      state.bufferMb += addedMb;
      if (cost) cost.peakBufferMb = Math.max(cost.peakBufferMb, state.bufferMb);
      const lostMb = producedMb - addedMb;
      state.lostMb += lostMb;
      if (lostMb > rules.epsilon) {
        addEntry(state, 'orbit.proto.overflow', cargo ? 'warning' : 'failure', 'comms', { lostMb },
          causes(state, ['design:instrument', 'design:antenna', ...eventIds(state, ['orbit.proto.storm'])],
          { camera: true, transmitter: false }));
      }
    } else if (operation === 'transmitter') {
      const sentMb = downlinkMb(state.bufferMb, linkMbps, 0, elapsedS, true);
      state.bufferMb = Math.max(0, state.bufferMb - sentMb);
      state.deliveredMb += sentMb;
      if (cargo && !reportSent && state.deliveredMb - previous.deliveredMb + rules.epsilon >= cargo.telemetryReportMb) {
        reportSent = true;
        state.telemetryReportsSent += 1;
        addEntry(state, 'orbit.cargo.reportSent', 'event', 'comms', { orbit, reportMb: cargo.telemetryReportMb },
          causes(state, ['design:antenna'], { transmitter: true }));
      }
    }

    if (untilEmptyS <= durationS) {
      state.status = 'failed';
      state.chargeWh = 0;
      addEntry(state, 'orbit.proto.powerFailure', 'failure', 'power', { orbit },
        causes(state, ['design:battery', 'design:solar',
          ...(spec.instrumentW > 0 && (operated.camera || (cargo && state.tS > previous.tS)) ? ['design:instrument'] : []),
          ...eventIds(state, ['orbit.proto.storm'])], {
          ...(operated.camera ? { camera: true } : {}),
          ...(operated.transmitter ? { transmitter: true } : {}),
          ...(operated.heater ? state.toggles.heater ? { heater: true } : { safeMode: true } : {}),
        }));
    }
  };

  // Навантаження відрізків і тривалість передачі беруться з model/: їх же рахує запас energy у частині 1.
  move(caps.idleSunS, generationW, segmentLoadW(spec, 'sunIdle', active, profile));
  if (state.status === 'active' && !cargo && profile.cameraWindow && caps.imagingS > 0 && !active.camera) {
    addEntry(state, 'orbit.clarity.missedImaging', 'event', 'science', {},
      // Причиною є кожна команда, що зупинила камеру: і SAFE, і вимкнений тумблер (обидві, якщо гравець зробив обидва).
      causes(state, ['design:instrument', ...(state.coldStress >= rules.cold.lockStress ? eventIds(state, ['orbit.proto.cameraCold']) : [])], {
        ...(state.toggles.safeMode ? { safeMode: true } : {}),
        ...(!state.toggles.camera && caps.instrumentRateMbps > 0 ? { camera: false } : {}),
      }));
  }
  move(caps.imagingS, generationW, segmentLoadW(spec, 'imaging', active, profile),
    monitoring ? 'monitoring' : active.camera ? 'camera' : 'idle');
  if (state.status === 'active' && caps.passS > 0 && state.bufferMb > 0 && !active.transmitter) {
    addEntry(state, 'orbit.clarity.missedDownlink', 'event', 'comms', {},
      causes(state, ['design:antenna'], {
        ...(state.toggles.safeMode ? { safeMode: true } : {}),
        ...(!state.toggles.transmitter && caps.downlinkMbps > 0 ? { transmitter: false } : {}),
      }));
  }
  const transmitS = transmitSeconds(caps.passS, state.bufferMb, linkMbps, active.transmitter);
  move(transmitS, generationW, segmentLoadW(spec, 'transmit', active, profile), 'transmitter');
  move(caps.passS - transmitS, generationW, segmentLoadW(spec, 'passRest', active, profile));
  if (cargo && state.status === 'active') {
    state.lostMb += state.bufferMb;
    state.bufferMb = 0;
    if (!reportSent) {
      addEntry(state, 'orbit.cargo.reportMissed', 'warning', 'comms',
        { orbit, sentMb: state.deliveredMb - previous.deliveredMb, reportMb: cargo.telemetryReportMb },
        causes(state, ['design:instrument', 'design:antenna',
          ...state.log.slice(logStart).filter(entry =>
            ['orbit.clarity.missedDownlink', 'orbit.proto.storm', 'orbit.proto.overflow'].includes(entry.messageKey))
            .map(entry => entry.id),
          ...(state.coldStress >= rules.cold.lockStress ? eventIds(state, ['orbit.cargo.monitoringCold']).slice(-1) : [])], {
          ...(state.toggles.safeMode ? { safeMode: true } : {}),
          ...(!state.toggles.transmitter && caps.downlinkMbps > 0 ? { transmitter: false } : {}),
        }));
    }
  }
  move(caps.shadowS, 0, segmentLoadW(spec, 'shadow', active, profile), 'heater');

  if (state.status === 'active') {
    const previousStress = state.coldStress;
    if (caps.shadowS > 0 && !active.heater) {
      addEntry(state, 'orbit.clarity.unheatedShadow', 'event', 'thermal', {},
        causes(state, [], caps.heaterFactor > 0 ? { heater: false } : {}));
    }
    if (caps.shadowS > 0) state.coldStress = clamp(state.coldStress
      + (active.heater ? -caps.heaterFactor * rules.cold.heatedRecovery : rules.cold.unheatedGain), 0, rules.cold.maximumStress);
    if (state.coldStress >= rules.cold.lockStress && previousStress < rules.cold.lockStress) {
      addEntry(state, cargo ? 'orbit.cargo.monitoringCold' : 'orbit.proto.cameraCold', cargo ? 'warning' : 'failure', 'thermal', {},
        causes(state, eventIds(state, ['orbit.clarity.unheatedShadow'])));
    } else if (state.coldStress < rules.cold.lockStress && previousStress >= rules.cold.lockStress) {
      addEntry(state, cargo ? 'orbit.cargo.monitoringRecovered' : 'orbit.proto.cameraRecovered', 'event', 'thermal');
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
    validateOrbitMission(input.mission);
    const [random, rngState] = nextRandom(seed);
    const maxStormOrbit = Math.min(rules.storm.lastOrbit, input.mission.durationOrbits);
    const state: OrbitState = {
      input, rngState, tS: 0, completedOrbits: 0,
      chargeWh: input.spec.batteryWh * (1 - damage(input, 'power')),
      bufferMb: 0, deliveredMb: 0, lostMb: 0, coldStress: 0, telemetryReportsSent: 0,
      toggles: { camera: input.mission.orbitObjective?.type !== 'cargo', transmitter: true, heater: true, safeMode: false },
      stormOrbit: maxStormOrbit >= rules.storm.firstOrbit
        ? rules.storm.firstOrbit + Math.floor(random * (maxStormOrbit - rules.storm.firstOrbit + 1)) : null,
      status: 'active',
      log: [{ id: 'orbit:arrival', phase: 'orbit', tS: 0, kind: 'event', system: 'structure',
        messageKey: 'orbit.proto.arrival', params: { altKm: input.flight.orbit.altKm } }],
      history: [],
    };
    if (damage(input, 'power') >= 1 || damage(input, 'structure') >= 1) {
      state.status = 'failed';
      addEntry(state, 'orbit.proto.arrivalFailure', 'failure', damage(input, 'power') >= 1 ? 'power' : 'structure', {}, ['orbit:arrival']);
    } else if (input.mission.orbitObjective?.type === 'cargo' && !validCargo(state)) {
      state.status = 'failed';
      addEntry(state, 'orbit.cargo.invalidPayload', 'failure', 'science', {}, causes(state, ['design:instrument']));
    } else if (input.mission.durationOrbits <= 0) completeMission(state);
    return state;
  },
  step(state, action) {
    if (state.status !== 'active') return state;
    if (action.type === 'toggle') {
      if (action.id === 'camera' && state.input.mission.orbitObjective?.type === 'cargo') return state;
      if (!Object.prototype.hasOwnProperty.call(state.toggles, action.id)) return state;
      const next = { ...state, toggles: { ...state.toggles, [action.id]: !state.toggles[action.id] }, log: [...state.log] };
      addEntry(next, 'orbit.proto.toggle', 'decision', action.id === 'heater' ? 'thermal' : action.id === 'transmitter' ? 'comms' : 'power',
        { toggle: action.id, enabled: next.toggles[action.id] ? 1 : 0 });
      return next;
    }
    if (!Number.isFinite(action.dtS) || action.dtS <= 0
      || Math.abs(action.dtS - state.input.flight.orbit.periodS) > rules.epsilon) return state;
    return advanceOrbit(state);
  },
  isDone: (state) => state.status !== 'active',
  finish: (state) => ({ result: outcome(state), log: state.log }),
  debugActions: (state) => state.status !== 'active' ? [] : [
    ...orbitControls(state).map((id) => ({
      group: 'orbit.proto.systems', label: `orbit.proto.${id}`, action: { type: 'toggle' as const, id },
    })),
    { group: 'orbit.proto.go', label: 'orbit.proto.nextOrbit', action: { type: 'tick' as const, dtS: state.input.flight.orbit.periodS } },
  ],
};

export function forecastOrbit(state: OrbitState): OrbitForecast {
  const cost: OrbitTurnCost = { elapsedS: 0, consumedWh: 0, generatedWh: 0,
    minimumChargeWh: state.chargeWh, peakBufferMb: state.bufferMb, cameraS: 0, transmitterS: 0, heaterS: 0, monitoringS: 0 };
  const nextState = advanceOrbit(state, cost);
  const deliveredMb = nextState.deliveredMb - state.deliveredMb;
  const lostMb = nextState.lostMb - state.lostMb;
  return {
    nextState, chargeWh: nextState.chargeWh, deliveredMb, lostMb,
    bufferMb: nextState.bufferMb, chargeDeltaWh: nextState.chargeWh - state.chargeWh,
    bufferDeltaMb: nextState.bufferMb - state.bufferMb, cost,
    generatedMb: Math.max(0, nextState.bufferMb - state.bufferMb + deliveredMb + lostMb),
    storm: state.status === 'active' && state.stormOrbit === state.completedOrbits + 1,
    powerFailure: state.status === 'active' && nextState.status === 'failed',
  };
}

export function orbitView(state: OrbitState) {
  const caps = capabilities(state);
  const { mission, spec } = state.input;
  const total = mission.durationOrbits;
  const objective = mission.orbitObjective;
  const cargo = objective?.type === 'cargo';
  const flyby = objective?.type === 'flyby';
  const goalParams: Record<string, number | string> = {
    orbits: total, requiredDataMb: mission.requiredDataMb, requiredResolutionM: mission.requiredResolutionM,
    firstOrbit: flyby ? objective.imagingOrbits[0] : 1,
    lastOrbit: flyby ? objective.imagingOrbits[1] : total,
    minKm: mission.altRangeKm[0], maxKm: mission.altRangeKm[1], altKm: state.input.flight.orbit.altKm,
  };
  return {
    ...caps,
    profile: orbitProfile(state.input.mission, state.completedOrbits + 1),
    thermalState: state.coldStress >= rules.cold.lockStress ? 'cold' : state.coldStress > 0 ? 'cooling' : 'stable',
    controls: orbitControls(state),
    goalKey: cargo ? 'orbit.objective.cargo' : flyby ? 'orbit.objective.flyby' : 'orbit.objective.imaging',
    goalParams,
    cargoNameKey: cargo ? spec.cargoKind ? `cargo.${spec.cargoKind}` : 'orbit.cargo.unknown' : null,
    dataTargetMb: cargo || flyby ? null : mission.requiredDataMb,
    dataLabelKey: cargo ? 'orbit.telemetry.title' : 'ui.dataDelivered',
    sequenceKey: cargo ? 'orbit.sequence.telemetry' : 'ui.imaging',
    telemetryReportsSent: state.telemetryReportsSent,
    telemetryReportsExpected: state.input.mission.orbitObjective?.type === 'cargo' ? total : 0,
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

function orbitControls(state: OrbitState): ToggleId[] {
  return state.input.mission.orbitObjective?.type === 'cargo'
    ? ['transmitter', 'heater', 'safeMode'] : ['camera', 'transmitter', 'heater', 'safeMode'];
}
