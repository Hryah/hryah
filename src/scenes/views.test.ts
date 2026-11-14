import { describe, expect, it } from 'vitest';
import { createDemoOrbit, orbitPhase, orbitView } from '../core/orbit';
import { fakeOrbitView } from './gallery';
import { orbitSceneView } from './views';

describe('orbitSceneView', () => {
  it('на старті: повний заряд, системи ввімкнені, частки в межах 0..1', () => {
    const state = createDemoOrbit('balanced');
    const view = orbitSceneView(state);
    const core = orbitView(state);
    const periodS = state.input.flight.orbit.periodS;
    expect(view.status).toBe('active');
    expect(view.chargeFraction).toBeCloseTo(1, 6);
    expect(view.linkActive).toBe(true);
    expect(view.cameraActive).toBe(true);
    expect(view.safeMode).toBe(false);
    expect(view.eclipseFraction).toBeCloseTo(core.shadowS / periodS, 10);
    expect(view.passFraction).toBeCloseTo(core.passS / periodS, 10);
    for (const x of [view.eclipseFraction, view.passFraction]) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('тумблери видно у виді', () => {
    let state = createDemoOrbit('balanced');
    state = orbitPhase.step(state, { type: 'toggle', id: 'transmitter' });
    expect(orbitSceneView(state).linkActive).toBe(false);
    state = orbitPhase.step(state, { type: 'toggle', id: 'safeMode' });
    const view = orbitSceneView(state);
    expect(view.safeMode).toBe(true);
    expect(view.cameraActive).toBe(false);
  });

  it('буря показується на витку, де вона станеться', () => {
    let state = createDemoOrbit('balanced');
    const stormOrbit = state.stormOrbit;
    expect(stormOrbit).not.toBeNull();
    expect(orbitSceneView(state).storm).toBe(false);
    while (state.completedOrbits + 1 < (stormOrbit ?? 0)) {
      state = orbitPhase.step(state, { type: 'tick', dtS: state.input.flight.orbit.periodS });
    }
    expect(orbitSceneView(state).storm).toBe(true);
  });

  it('після завершення місії статус не active і системи вимкнені', () => {
    let state = createDemoOrbit('balanced');
    for (let i = 0; i < 50 && !orbitPhase.isDone(state); i += 1) {
      state = orbitPhase.step(state, { type: 'tick', dtS: state.input.flight.orbit.periodS });
    }
    const view = orbitSceneView(state);
    expect(view.status).not.toBe('active');
    expect(view.linkActive).toBe(false);
    expect(view.storm).toBe(false);
  });

  it('вид є звичайними JSON-даними', () => {
    const view = orbitSceneView(createDemoOrbit('power'));
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});

describe('вигаданий вид галереї', () => {
  it('змінюється в часі й лишається в межах', () => {
    const seen = new Set<string>();
    for (let t = 0; t < 40; t += 1) {
      const view = fakeOrbitView(t);
      expect(view.chargeFraction).toBeGreaterThanOrEqual(0);
      expect(view.chargeFraction).toBeLessThanOrEqual(1);
      seen.add(`${view.storm}-${view.linkActive}-${view.safeMode}-${view.status}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});
