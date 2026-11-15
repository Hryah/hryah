import type { Damage, Design, MissionOutcome, OrbitInput } from '../contracts';
import { buildSpec } from '../model';
import { SAMPLE_CATALOG, SAMPLE_MISSION, stubFlight } from '../stubs';
import { forecastOrbit, orbitPhase, orbitView, type OrbitState, type ToggleId } from './phase';

/** Strategy identifiers used by deterministic orbit balance bots. */
export type StrategyId = 'passive' | 'economy' | 'imaging' | 'downlink';

/** Representative spacecraft build archetypes tested for mission balance. */
export type BuildId = 'economy' | 'imaging' | 'imaging-high' | 'downlink' | 'overbuilt';

/** Mission environment stress scenarios testing distinct craft strengths. */
export type ScenarioId = 'nominal' | 'high-orbit' | 'power-stress' | 'comms-stress' | 'science-stress';

/** Fixed seeds spanning all possible storm orbit slots (4, 5, 6, 7). */
export const BALANCE_SEEDS = [4, 7, 12, 42] as const;

export const STRATEGY_BUILDS: Record<BuildId, Design> = {
  economy: {
    launcherId: 'small',
    modules: { engine: 'eng-chem', solar: 'sol-s', battery: 'bat-m', antenna: 'ant-m', instrument: 'cam-m' },
    fuelKg: 14,
    altKm: 400,
  },
  imaging: {
    launcherId: 'medium',
    modules: { engine: 'eng-chem', solar: 'sol-s', battery: 'bat-m', antenna: 'ant-m', instrument: 'cam-l' },
    fuelKg: 24,
    altKm: 400,
  },
  'imaging-high': {
    launcherId: 'medium',
    modules: { engine: 'eng-chem', solar: 'sol-m', battery: 'bat-m', antenna: 'ant-m', instrument: 'cam-l' },
    fuelKg: 24,
    altKm: 600,
  },
  downlink: {
    launcherId: 'small',
    modules: { engine: 'eng-chem', solar: 'sol-m', battery: 'bat-m', antenna: 'ant-l', instrument: 'cam-m' },
    fuelKg: 16,
    altKm: 400,
  },
  overbuilt: {
    launcherId: 'medium',
    modules: { engine: 'eng-chem', solar: 'sol-l', battery: 'bat-l', antenna: 'ant-l', instrument: 'cam-l' },
    fuelKg: 24,
    altKm: 400,
  },
};

export const SCENARIO_DAMAGE: Record<ScenarioId, Damage[]> = {
  nominal: [],
  'high-orbit': [],
  'power-stress': [{ system: 'power', severity: 0.35 }],
  'comms-stress': [{ system: 'comms', severity: 0.8 }],
  'science-stress': [{ system: 'science', severity: 0.6 }],
};

export interface BalanceRunResult {
  build: BuildId;
  strategy: StrategyId;
  scenario: ScenarioId;
  seed: number;
  stormOrbit: number | null;
  costMUsd: number;
  outcome: MissionOutcome;
  lostMb: number;
  decisions: number;
  reason: string;
}

const TOGGLE_ORDER: ToggleId[] = ['camera', 'transmitter', 'heater', 'safeMode'];

/** Apply desired toggle configuration through official Phase toggle actions. */
function applyToggles(state: OrbitState, desired: Record<ToggleId, boolean>): { state: OrbitState; changes: number } {
  let next = state;
  let changes = 0;
  for (const id of TOGGLE_ORDER) {
    if (next.toggles[id] !== desired[id]) {
      next = orbitPhase.step(next, { type: 'toggle', id });
      changes += 1;
    }
  }
  return { state: next, changes };
}

/** Pick the first toggle preset whose one-orbit forecast survives power checks. */
function firstSurvivableToggles(state: OrbitState, candidates: Record<ToggleId, boolean>[]): OrbitState {
  for (const preset of candidates) {
    const candidate = applyToggles(state, preset).state;
    if (!forecastOrbit(candidate).powerFailure) return candidate;
  }
  return applyToggles(state, candidates[candidates.length - 1] ?? {
    camera: false, transmitter: false, heater: false, safeMode: true,
  }).state;
}

/** Choose next-orbit system toggles strictly from public OrbitState and orbitView telemetry. */
function planTurn(state: OrbitState, strategy: StrategyId): OrbitState {
  if (strategy === 'passive') return state;
  const view = orbitView(state);
  const { mission } = state.input;

  if (strategy === 'economy') {
    const base = { camera: true, transmitter: true, heater: true, safeMode: false };
    const fallbacks = [
      base,
      ...(state.coldStress === 0 ? [{ camera: true, transmitter: true, heater: false, safeMode: false }] : []),
      { camera: false, transmitter: false, heater: true, safeMode: true },
      { camera: false, transmitter: false, heater: false, safeMode: true },
    ];
    return firstSurvivableToggles(state, fallbacks);
  }

  if (strategy === 'imaging') {
    const orbitProduceMb = view.instrumentRateMbps * view.imagingS;
    const willOverflowEmpty = orbitProduceMb > view.bufferCapacityMb;
    const softTargetMb = mission.requiredDataMb * 2;
    const totalTrackedMb = state.deliveredMb + state.bufferMb;
    const emergencyQuota = view.remainingOrbits === 1 && totalTrackedMb < mission.requiredDataMb;
    const wantCamera = willOverflowEmpty
      ? state.bufferMb < view.bufferCapacityMb * 0.25 && (totalTrackedMb < softTargetMb || emergencyQuota)
      : state.bufferMb + orbitProduceMb <= view.bufferCapacityMb || emergencyQuota;
    const wantTransmitter = state.bufferMb > 0 || wantCamera;
    const primary = { camera: wantCamera, transmitter: wantTransmitter, heater: true, safeMode: false };
    const fallbacks = [
      primary,
      { camera: false, transmitter: wantTransmitter, heater: true, safeMode: false },
      ...(state.coldStress === 0 ? [{ camera: wantCamera, transmitter: wantTransmitter, heater: false, safeMode: false }] : []),
      { camera: false, transmitter: false, heater: true, safeMode: true },
      { camera: false, transmitter: false, heater: false, safeMode: true },
    ];
    return firstSurvivableToggles(state, fallbacks);
  }

  // Downlink strategy: prioritize clearing buffered frames every pass, holding data only if power forces pause.
  const base = { camera: true, transmitter: true, heater: true, safeMode: false };
  const fallbacks = [
    base,
    { camera: true, transmitter: false, heater: true, safeMode: false },
    ...(state.coldStress === 0 ? [{ camera: true, transmitter: true, heater: false, safeMode: false }] : []),
    { camera: false, transmitter: false, heater: true, safeMode: true },
    { camera: false, transmitter: false, heater: false, safeMode: true },
  ];
  return firstSurvivableToggles(state, fallbacks);
}

/** Build an OrbitInput from a design and scenario stress profile without mutating global stubs. */
export function createBalanceInput(build: BuildId, scenario: ScenarioId): OrbitInput {
  const baseDesign = STRATEGY_BUILDS[build];
  const design: Design = scenario === 'high-orbit'
    ? { ...baseDesign, altKm: 600 }
    : baseDesign;
  const built = buildSpec({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, design);
  const flight = stubFlight({ mission: SAMPLE_MISSION, spec: built.result, log: built.log });
  const damage = SCENARIO_DAMAGE[scenario];
  return {
    mission: SAMPLE_MISSION,
    spec: built.result,
    flight: damage.length > 0 ? { ...flight.result, damage } : flight.result,
    log: [...built.log, ...flight.log],
  };
}

function summarizeReason(state: OrbitState, outcome: MissionOutcome, strategy: StrategyId): string {
  if (!outcome.success) {
    const failure = state.log.find((entry) => entry.kind === 'failure' && entry.messageKey !== 'orbit.proto.overflow');
    return failure?.messageKey ?? 'orbit.proto.incomplete';
  }
  const zeroLag = state.lostMb <= 0.000001 && state.history.every((h) => h.bufferMb <= 0.000001);
  if (strategy === 'imaging') return `high-res/burst gated (lost ${Math.round(state.lostMb)} Mb)`;
  if (strategy === 'downlink') return zeroLag ? 'zero-lag storm flush' : 'buffered burst pass';
  if (strategy === 'economy') {
    const usedConservative = state.log.some((entry) => entry.kind === 'decision');
    return usedConservative
      ? `budget ${state.input.spec.costMUsd}M + power saved`
      : `budget ${state.input.spec.costMUsd}M clean`;
  }
  return `passive (lost ${Math.round(state.lostMb)} Mb)`;
}

/** Execute one full deterministic orbit simulation for a given build, strategy, scenario, and seed. */
export function runOrbitStrategy(
  build: BuildId,
  strategy: StrategyId,
  scenario: ScenarioId,
  seed: number,
): BalanceRunResult {
  const input = createBalanceInput(build, scenario);
  let state = orbitPhase.init(input, seed);
  let decisions = 0;

  while (!orbitPhase.isDone(state)) {
    const beforeLog = state.log.length;
    state = planTurn(state, strategy);
    decisions += state.log.length - beforeLog;
    state = orbitPhase.step(state, { type: 'tick', dtS: input.flight.orbit.periodS });
  }

  const finished = orbitPhase.finish(state);
  return {
    build,
    strategy,
    scenario,
    seed,
    stormOrbit: state.stormOrbit,
    costMUsd: input.spec.costMUsd,
    outcome: finished.result,
    lostMb: Math.round(state.lostMb),
    decisions,
    reason: summarizeReason(state, finished.result, strategy),
  };
}

/** Run the canonical balance verification matrix across representative seeds. */
export function runBalanceSuite(seeds: readonly number[] = BALANCE_SEEDS): BalanceRunResult[] {
  const plan: Array<{ build: BuildId; strategy: StrategyId; scenario: ScenarioId }> = [
    { build: 'economy', strategy: 'economy', scenario: 'nominal' },
    { build: 'imaging', strategy: 'imaging', scenario: 'nominal' },
    { build: 'downlink', strategy: 'downlink', scenario: 'nominal' },
    { build: 'imaging-high', strategy: 'imaging', scenario: 'high-orbit' },
    { build: 'economy', strategy: 'economy', scenario: 'power-stress' },
    { build: 'imaging', strategy: 'imaging', scenario: 'science-stress' },
    { build: 'downlink', strategy: 'downlink', scenario: 'comms-stress' },
  ];
  const results: BalanceRunResult[] = [];
  for (const row of plan) {
    for (const seed of seeds) {
      results.push(runOrbitStrategy(row.build, row.strategy, row.scenario, seed));
    }
  }
  return results;
}
