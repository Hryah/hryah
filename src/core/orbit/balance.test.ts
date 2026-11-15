import { describe, expect, it } from 'vitest';
import {
  BALANCE_SEEDS,
  STRATEGY_BUILDS,
  createBalanceInput,
  runBalanceSuite,
  runOrbitStrategy,
  type BuildId,
  type ScenarioId,
} from './balance';
import { SAMPLE_MISSION } from '../stubs';
import type { Mission, OrbitInput } from '../contracts';
import missionsData from '../../data/missions.json';
import { orbitInfo } from '../model';
import { createDemoOrbit } from './demo';
import { orbitPhase } from './phase';

function finishOrbit(input: OrbitInput) {
  let state = orbitPhase.init(input, 42);
  for (let turn = 0; turn < input.mission.durationOrbits && !orbitPhase.isDone(state); turn++) {
    state = orbitPhase.step(state, { type: 'tick', dtS: input.flight.orbit.periodS });
  }
  expect(orbitPhase.isDone(state)).toBe(true);
  return orbitPhase.finish(state).result;
}

describe('mission-specific orbit scoring', () => {
  it.each(['station-resupply', 'colony-resupply'] as const)('ignores the optical placeholder when scoring %s cargo', (id) => {
    const mission = missionsData[id] as Mission;
    const { input } = createDemoOrbit();
    const cargoInput: OrbitInput = {
      ...input,
      mission,
      spec: { ...input.spec, batteryWh: 10_000 },
      flight: { ...input.flight, orbit: orbitInfo(mission.body, 400) },
    };
    const result = finishOrbit(cargoInput);
    const changedPlaceholder = finishOrbit({
      ...cargoInput, mission: { ...mission, requiredResolutionM: mission.requiredResolutionM * 2 },
    });
    expect(result.success).toBe(true);
    expect(result.score).toBeLessThan(10_000);
    expect(changedPlaceholder).toEqual(result);
  });

  it('preserves optical scoring for both legacy and explicit imaging missions', () => {
    const { input } = createDemoOrbit();
    const legacy = finishOrbit(input);
    const imaging = finishOrbit({ ...input, mission: { ...input.mission, kind: 'imaging' } });
    const higherQualityBonus = finishOrbit({
      ...input, mission: { ...input.mission, requiredResolutionM: input.mission.requiredResolutionM * 2 },
    });
    expect(legacy.success).toBe(true);
    expect(imaging).toEqual(legacy);
    expect(higherQualityBonus.success).toBe(true);
    expect(higherQualityBonus.deliveredMb).toBe(legacy.deliveredMb);
    expect(higherQualityBonus.score).toBeGreaterThan(legacy.score);
  });
});

describe('orbit balance and multi-strategy progression', () => {
  it('starts every representative build on its intended orbit within launch constraints', () => {
    for (const build of Object.keys(STRATEGY_BUILDS) as BuildId[]) {
      for (const scenario of ['nominal', 'high-orbit', 'power-stress', 'comms-stress', 'science-stress'] as const) {
        const input = createBalanceInput(build, scenario);
        const label = `${build}/${scenario}`;
        expect(input.spec.dvMs, label).toBeGreaterThanOrEqual(input.mission.dvRequiredMs);
        expect(input.spec.margins.filter(margin => ['mass', 'budget'].includes(margin.id) && !margin.ok), label).toEqual([]);
        expect(input.flight.orbit.altKm, label).toBe(input.spec.design.altKm);
        expect(input.log.some(entry => entry.id === 'flight:low-orbit'), label).toBe(false);
      }
    }
  });

  it('passes the mission deterministically across fixed seeds for three distinct build strategies', () => {
    const pairs: Array<{ build: BuildId; strategy: 'economy' | 'imaging' | 'downlink' }> = [
      { build: 'economy', strategy: 'economy' },
      { build: 'imaging', strategy: 'imaging' },
      { build: 'downlink', strategy: 'downlink' },
    ];

    const seenStormOrbits = new Set<number | null>();
    for (const seed of BALANCE_SEEDS) {
      for (const { build, strategy } of pairs) {
        const first = runOrbitStrategy(build, strategy, 'nominal', seed);
        const replay = runOrbitStrategy(build, strategy, 'nominal', seed);
        expect(first).toEqual(replay);
        expect(first.outcome.success).toBe(true);
        expect(first.outcome.survivedOrbits).toBe(SAMPLE_MISSION.durationOrbits);
        expect(first.outcome.deliveredMb).toBeGreaterThanOrEqual(SAMPLE_MISSION.requiredDataMb);
        seenStormOrbits.add(first.stormOrbit);
      }
    }

    expect(seenStormOrbits).toEqual(new Set([4, 5, 6, 7]));
  });

  it('prevents bloated max-everything or passive overflow builds from dominating balanced strategies', () => {
    for (const seed of BALANCE_SEEDS) {
      const economy = runOrbitStrategy('economy', 'economy', 'nominal', seed);
      const imagingSmart = runOrbitStrategy('imaging', 'imaging', 'nominal', seed);
      const imagingPassive = runOrbitStrategy('imaging', 'passive', 'nominal', seed);
      const downlink = runOrbitStrategy('downlink', 'downlink', 'nominal', seed);
      const overbuiltPassive = runOrbitStrategy('overbuilt', 'passive', 'nominal', seed);

      expect(economy.costMUsd).toBeLessThan(downlink.costMUsd);
      expect(downlink.costMUsd).toBeLessThan(imagingSmart.costMUsd);
      expect(imagingSmart.outcome.score).toBeGreaterThan(imagingPassive.outcome.score);
      expect(imagingSmart.lostMb).toBeLessThan(imagingPassive.lostMb);
      expect(economy.outcome.score).toBeGreaterThan(overbuiltPassive.outcome.score);
      expect(downlink.outcome.score).toBeGreaterThan(overbuiltPassive.outcome.score);
      expect(imagingSmart.outcome.score).toBeGreaterThan(overbuiltPassive.outcome.score);

      const balancedScores = [economy.outcome.score, imagingSmart.outcome.score, downlink.outcome.score];
      const spread = Math.max(...balancedScores) - Math.min(...balancedScores);
      expect(spread).toBeLessThan(40);
    }
  });

  it('lets each build and strategy win through its own strength across mission stresses', () => {
    for (const seed of BALANCE_SEEDS) {
      // 1. Economy wins under power stress by conserving thermal/safe-mode energy where passive fails.
      const ecoActive = runOrbitStrategy('economy', 'economy', 'power-stress', seed);
      const ecoPassive = runOrbitStrategy('economy', 'passive', 'power-stress', seed);
      expect(ecoActive.outcome.success).toBe(true);
      expect(ecoPassive.outcome.success).toBe(false);
      expect(ecoActive.decisions).toBeGreaterThan(0);

      // 2. Imaging (cam-l) passes high-altitude (600 km) and science-degraded orbits where cam-m fails.
      const imgHigh = runOrbitStrategy('imaging-high', 'imaging', 'high-orbit', seed);
      const ecoHigh = runOrbitStrategy('economy', 'economy', 'high-orbit', seed);
      const comHigh = runOrbitStrategy('downlink', 'downlink', 'high-orbit', seed);
      expect(imgHigh.outcome.success).toBe(true);
      expect(ecoHigh.outcome.success).toBe(false);
      expect(comHigh.outcome.success).toBe(false);

      const imgScience = runOrbitStrategy('imaging', 'imaging', 'science-stress', seed);
      const ecoScience = runOrbitStrategy('economy', 'economy', 'science-stress', seed);
      const comScience = runOrbitStrategy('downlink', 'downlink', 'science-stress', seed);
      expect(imgScience.outcome.success).toBe(true);
      expect(imgScience.lostMb).toBe(0);
      expect(ecoScience.outcome.success).toBe(false);
      expect(comScience.outcome.success).toBe(false);

      // 3. Downlink (ant-l) is the sole survivor under severe comms degradation without losing frames.
      const comLink = runOrbitStrategy('downlink', 'downlink', 'comms-stress', seed);
      const ecoLink = runOrbitStrategy('economy', 'economy', 'comms-stress', seed);
      const imgLink = runOrbitStrategy('imaging', 'imaging', 'comms-stress', seed);
      expect(comLink.outcome.success).toBe(true);
      expect(comLink.lostMb).toBe(0);
      expect(ecoLink.outcome.success).toBe(false);
      expect(imgLink.outcome.success).toBe(false);
    }
  });

  it('keeps full balance suite consistent with JSON-pure execution and distinct build designs', () => {
    expect(new Set(Object.values(STRATEGY_BUILDS).map((d) => JSON.stringify(d))).size).toBe(5);
    const suite = runBalanceSuite(BALANCE_SEEDS);
    expect(suite).toHaveLength(7 * BALANCE_SEEDS.length);
    for (const row of suite) {
      expect(row.outcome.success).toBe(true);
      expect(JSON.parse(JSON.stringify(row))).toEqual(row);
    }
  });
});

// Compile check helper usage for scenario typing.
const _scenariosCheck: ScenarioId[] = ['nominal', 'high-orbit', 'power-stress', 'comms-stress', 'science-stress'];
void _scenariosCheck;
