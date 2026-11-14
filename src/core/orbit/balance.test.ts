import { describe, expect, it } from 'vitest';
import {
  BALANCE_SEEDS,
  STRATEGY_BUILDS,
  runBalanceSuite,
  runOrbitStrategy,
  type BuildId,
  type ScenarioId,
} from './balance';
import { SAMPLE_MISSION } from '../stubs';

describe('orbit balance and multi-strategy progression', () => {
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
