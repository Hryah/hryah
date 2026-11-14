import { describe, expect, it } from 'vitest';
import type { Design, FlightInput } from '../contracts';
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION, stubDesign } from '../stubs';
import { flightPhase, type FlightState } from './index';

function makeFlightInput(design: Design = SAMPLE_DESIGN): FlightInput {
  const d = stubDesign({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, design);
  return {
    mission: SAMPLE_MISSION,
    spec: d.result,
    log: d.log,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('flightPhase (Частина 2: Політ та космонавт у невагомості)', () => {
  it('init створює серіалізований JSON-стан без мутацій при step', () => {
    const input = makeFlightInput();
    const initial = deepFreeze(flightPhase.init(input, 42));
    expect(JSON.parse(JSON.stringify(initial))).toEqual(initial);
    expect( flightPhase.isDone(initial) ).toBe(false);

    const stepped = flightPhase.step(initial, { type: 'pushOff', targetNodeId: 'handrail-tl' });
    expect(JSON.parse(JSON.stringify(stepped))).toEqual(stepped);
    expect(stepped.astronaut.grabbedNodeId).toBeNull();
    expect(stepped.astronaut.targetNodeId).toBe('handrail-tl');
  });

  it('детермінована за сідом: однаковий сід і послідовність дій дають ідентичний стан і фініш', () => {
    const input = makeFlightInput();
    const run = (seed: number): FlightState => {
      let s = flightPhase.init(input, seed);
      s = flightPhase.step(s, { type: 'pushOff', targetNodeId: 'console-propulsion' });
      s = flightPhase.step(s, { type: 'tick', dtS: 2 });
      s = flightPhase.step(s, { type: 'pushOff', targetNodeId: 'console-solar' });
      s = flightPhase.step(s, { type: 'tick', dtS: 3 });
      s = flightPhase.step(s, { type: 'completeFlight' });
      return s;
    };

    const s1 = run(99);
    const s2 = run(99);
    expect(s1).toEqual(s2);
    expect(flightPhase.finish(s1)).toEqual(flightPhase.finish(s2));
  });

  it('механіка пересування: короткий стрибок по сусідніх ручках швидкий (lastHopFast=true), довгий — повільніший (lastHopFast=false)', () => {
    const s0 = flightPhase.init(makeFlightInput(), 1);
    // З handrail-bl (2.4, 5.1) до console-propulsion (1.1, 3.0) — коротка дистанція (~2.47 м)
    const shortHop = flightPhase.step(s0, { type: 'pushOff', targetNodeId: 'console-propulsion' });
    expect(shortHop.astronaut.lastHopFast).toBe(true);
    const shortSpeed = Math.hypot(shortHop.astronaut.vxMs, shortHop.astronaut.vyMs);

    // З handrail-bl (2.4, 5.1) до console-separation (10.9, 3.0) — довгий переліт через усю кабіну (~8.75 м)
    const longHop = flightPhase.step(s0, { type: 'pushOff', targetNodeId: 'console-separation' });
    expect(longHop.astronaut.lastHopFast).toBe(false);
    const longSpeed = Math.hypot(longHop.astronaut.vxMs, longHop.astronaut.vyMs);

    expect(shortSpeed).toBeGreaterThan(longSpeed);
    expect(longHop.astronaut.omegaDegS).toBeGreaterThan(shortHop.astronaut.omegaDegS);
  });

  it('проходить частину від init до isDone через перельоти космонавта між пультами та перевіряє finish', () => {
    let state = flightPhase.init(makeFlightInput(), 7);

    // Переліт на пульт двигуна і розв'язання задачі
    state = flightPhase.step(state, { type: 'pushOff', targetNodeId: 'console-propulsion' });
    state = flightPhase.step(state, { type: 'tick', dtS: 2 });
    expect(state.astronaut.grabbedNodeId).toBe('console-propulsion');

    // Переліт на пульт сонячних панелей
    state = flightPhase.step(state, { type: 'pushOff', targetNodeId: 'console-solar' });
    state = flightPhase.step(state, { type: 'tick', dtS: 2 });
    expect(state.astronaut.grabbedNodeId).toBe('console-solar');

    // Вирішення решти задач на пультах терморегуляції та зв'язку
    state = flightPhase.step(state, { type: 'interactConsole', consoleId: 'console-thermal' });
    state = flightPhase.step(state, { type: 'interactConsole', consoleId: 'console-comms' });

    // Відділення супутника на пульті шлюзу
    state = flightPhase.step(state, { type: 'interactConsole', consoleId: 'console-separation' });
    expect(flightPhase.isDone(state)).toBe(true);

    const out = flightPhase.finish(state);
    expect(out.result.orbit.altKm).toBe(SAMPLE_DESIGN.altKm);
    expect(out.result.fuelLeftKg).toBeGreaterThan(0);
    expect(out.result.damage).toEqual([]);
    const failures = out.log.filter((e) => e.kind === 'failure');
    expect(failures).toEqual([]);
  });

  it('прострочення таймера кризи пошкоджує систему, зменшує Δv і пише failure з непорожнім causedBy', () => {
    const badDesign: Design = {
      ...SAMPLE_DESIGN,
      modules: { ...SAMPLE_DESIGN.modules, battery: 'bat-s', instrument: 'cam-l' },
      fuelKg: 4,
    };
    let state = flightPhase.init(makeFlightInput(badDesign), 3);

    // Чекаємо, поки спливуть таймери активних криз без дій космонавта
    for (let i = 0; i < 6; i++) {
      state = flightPhase.step(state, { type: 'tick', dtS: 10 });
    }
    state = flightPhase.step(state, { type: 'separatePayload' });
    expect(flightPhase.isDone(state)).toBe(true);

    const out = flightPhase.finish(state);
    expect(out.result.damage.length).toBeGreaterThan(0);
    expect(out.result.orbit.altKm).toBeLessThan(badDesign.altKm);

    const failures = out.log.filter((e) => e.kind === 'failure');
    expect(failures.length).toBeGreaterThan(0);
    for (const f of failures) {
      expect(f.causedBy).toBeDefined();
      expect(f.causedBy!.length).toBeGreaterThan(0);
    }
  });
});
