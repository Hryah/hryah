import { describe, expect, it } from 'vitest';
import { designPhase } from '../core/design';
import { createDemoOrbit, orbitPhase, orbitView } from '../core/orbit';
import { SAMPLE_CATALOG, SAMPLE_MISSION } from '../core/stubs';
import { fakeDesignView, fakeOrbitView } from './gallery';
import { designSceneView, orbitSceneView } from './views';

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

describe('designSceneView', () => {
  const start = () => designPhase.init({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, 1);

  it('показує обрані модулі й не ділить об\u0027єкт зі станом', () => {
    const state = start();
    const view = designSceneView(state);
    expect(view.modules).toEqual(state.design.modules);
    expect(view.modules).not.toBe(state.design.modules);
    expect(view.confirmed).toBe(false);
  });

  it('зміна модуля в грі міняє вид', () => {
    const state = designPhase.step(start(), { type: 'setModule', slot: 'antenna', moduleId: 'ant-s' });
    expect(designSceneView(state).modules.antenna).toBe('ant-s');
  });

  it('тривога слота збігається з червоним запасом ядра', () => {
    const slotsOf = { dv: ['engine'], energy: ['solar', 'battery'], link: ['antenna'], science: ['instrument'] } as const;
    const variants = [
      start(),
      designPhase.step(start(), { type: 'setFuel', fuelKg: 0 }),
      designPhase.step(start(), { type: 'setModule', slot: 'antenna', moduleId: 'ant-s' }),
      designPhase.step(start(), { type: 'setModule', slot: 'instrument', moduleId: 'cam-s' }),
      designPhase.step(start(), { type: 'setModule', slot: 'solar', moduleId: 'sol-s' }),
    ];
    let reds = 0;
    for (const state of variants) {
      const view = designSceneView(state);
      const margins = designPhase.finish(state).result.margins;
      for (const [id, slots] of Object.entries(slotsOf)) {
        const red = margins.some((m) => m.id === id && !m.ok);
        if (red) reds += 1;
        for (const slot of slots) if (red) expect(view.alerts[slot], `${id} → ${slot}`).toBe(true);
      }
      const anyRed = margins.some((m) => !m.ok && m.id !== 'mass' && m.id !== 'budget');
      if (!anyRed) expect(Object.values(view.alerts).some(Boolean)).toBe(false);
    }
    expect(reds).toBeGreaterThan(0); // принаймні один варіант справді червоний
  });

  it('жорсткий запас блокує запуск, підтвердження видно у виді', () => {
    const heavy = designPhase.step(start(), { type: 'setFuel', fuelKg: 100 });
    expect(designSceneView(heavy).launchBlocked).toBe(true);
    const ok = start();
    expect(designSceneView(ok).launchBlocked).toBe(false);
    expect(designSceneView(designPhase.step(ok, { type: 'confirm' })).confirmed).toBe(true);
  });

  it('вид є звичайними JSON-даними', () => {
    const view = designSceneView(start());
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('вид проєктування міняє модулі й тривоги, а наприкінці циклу підтверджується', () => {
    const modules = new Set<string>();
    const alerts = new Set<string>();
    for (let t = 0; t < 40; t += 1) {
      const view = fakeDesignView(t);
      modules.add(JSON.stringify(view.modules));
      alerts.add(JSON.stringify(view.alerts));
      for (const id of Object.values(view.modules)) expect(id).not.toBe('');
    }
    expect(modules.size).toBeGreaterThan(5);
    expect(alerts.size).toBeGreaterThan(2);
    expect(fakeDesignView(12).launchBlocked).toBe(true);
    expect(fakeDesignView(2).confirmed).toBe(false);
    expect(fakeDesignView(37).confirmed).toBe(true);
  });
});
