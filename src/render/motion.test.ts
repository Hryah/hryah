import { describe, expect, it } from 'vitest';
import { angleDelta, approach, approachAngle, inArc, onCircle, orbitAngle, pulse, wrapAngle } from './motion';

describe('motion', () => {
  it('approach наближається до цілі й не перестрибує її', () => {
    const next = approach(0, 10, 3, 0.1);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
    expect(approach(0, 10, 3, 100)).toBeCloseTo(10, 6);
  });

  it('approach не залежить від частоти кадрів', () => {
    const oneStep = approach(0, 10, 3, 0.2);
    const twoSteps = approach(approach(0, 10, 3, 0.1), 10, 3, 0.1);
    expect(twoSteps).toBeCloseTo(oneStep, 10);
  });

  it('approach стоїть на місці за нульового чи хибного кроку', () => {
    expect(approach(4, 10, 3, 0)).toBe(4);
    expect(approach(4, 10, 3, Number.NaN)).toBe(4);
    expect(approach(4, 10, 0, 1)).toBe(4);
  });

  it('кути загортаються й ідуть найкоротшою дугою', () => {
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5, 10);
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2, 10);
    const next = approachAngle(0.1, Math.PI * 2 - 0.1, 5, 0.05);
    expect(angleDelta(0.1, next)).toBeLessThan(0); // пішов через нуль, а не довгою дугою
  });

  it('pulse лишається в межах 0..1', () => {
    for (let t = 0; t < 5; t += 0.13) {
      expect(pulse(t, 1.5)).toBeGreaterThanOrEqual(0);
      expect(pulse(t, 1.5)).toBeLessThanOrEqual(1);
    }
    expect(pulse(1, 0)).toBe(0);
  });

  it('orbitAngle робить повний оберт за період', () => {
    expect(orbitAngle(0, 20)).toBe(0);
    expect(orbitAngle(5, 20)).toBeCloseTo(Math.PI / 2, 10);
    expect(orbitAngle(20, 20, 1)).toBeCloseTo(1, 10);
  });

  it('onCircle: кут 0 на +X, чверть оберту на −Z', () => {
    const start = onCircle(0, 2);
    expect(start.x).toBeCloseTo(2, 10);
    expect(start.z).toBeCloseTo(0, 10);
    const quarter = onCircle(Math.PI / 2, 2);
    expect(quarter.x).toBeCloseTo(0, 10);
    expect(quarter.z).toBeCloseTo(-2, 10);
  });

  it('inArc враховує перехід через нуль', () => {
    expect(inArc(0.1, 0, 0.4)).toBe(true);
    expect(inArc(Math.PI * 2 - 0.1, 0, 0.4)).toBe(true);
    expect(inArc(0.3, 0, 0.4)).toBe(false);
    expect(inArc(1, 0, 0)).toBe(false);
  });
});
