import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoOrbit, orbitPhase, type OrbitState } from '../../core/orbit';
import type { OrbitInput } from '../../core/contracts';
import sharedMessages from '../../data/texts.en.json';
import messages from './texts.en.json';
import { OrbitPrototype } from './OrbitPrototype';

const copy: Record<string, string> = { ...sharedMessages, ...messages };

function finishMission(initial: OrbitState): OrbitState {
  let state = initial;
  for (let i = 0; i < 12 && !orbitPhase.isDone(state); i += 1) {
    state = orbitPhase.step(state, { type: 'tick', dtS: state.input.flight.orbit.periodS });
  }
  return state;
}

describe('orbit prototype presentation', () => {
  it('renders a readable first-orbit control screen with labelled switches and no missing copy', () => {
    const html = renderToStaticMarkup(<OrbitPrototype />);
    expect(html).toContain('Orbital operations');
    expect(html).toContain('Satellite separation confirmed at 400 km');
    expect(html).toContain('aria-label="Camera"');
    expect(html).toContain('aria-label="Transmitter"');
    expect(html).toContain('aria-label="Heater"');
    expect(html).toContain('aria-label="Safe mode"');
    expect(html.match(/role="switch"/g)).toHaveLength(4);
    expect(html).toContain('Next orbit');
    expect(html).not.toMatch(/\bui\.[A-Za-z][\w.]*|\borbit\.proto\.[A-Za-z][\w.]*|\{(?:altKm|turns|deliveredMb)\}/);
    expect(html).not.toContain('NaN');
  });

  it('has English text and supplied interpolation values for scenario event and failure logs', () => {
    const balanced = createDemoOrbit('balanced');
    const states = [
      finishMission(balanced),
      finishMission(createDemoOrbit('comms')),
      finishMission(createDemoOrbit('power')),
      finishMission(orbitPhase.step(balanced, { type: 'toggle', id: 'safeMode' })),
    ];

    let cold = orbitPhase.step(balanced, { type: 'toggle', id: 'heater' });
    cold = orbitPhase.step(cold, { type: 'tick', dtS: cold.input.flight.orbit.periodS });
    cold = orbitPhase.step(cold, { type: 'tick', dtS: cold.input.flight.orbit.periodS });
    cold = orbitPhase.step(cold, { type: 'toggle', id: 'heater' });
    cold = orbitPhase.step(cold, { type: 'tick', dtS: cold.input.flight.orbit.periodS });
    states.push(finishMission(cold));

    const input: OrbitInput = balanced.input;
    states.push(orbitPhase.init({ ...input, flight: { ...input.flight, damage: [{ system: 'structure', severity: 1 }] } }, 42));
    states.push(finishMission(orbitPhase.init({ ...input, spec: { ...input.spec, resolutionM: 100 } }, 42)));
    states.push(finishMission(orbitPhase.init({ ...input, flight: { ...input.flight, orbit: { ...input.flight.orbit, altKm: 300 } } }, 42)));

    const entries = states.flatMap((state) => [...state.input.log, ...state.log]);
    const observedKeys = new Set(entries.map((entry) => entry.messageKey));
    for (const key of [
      'orbit.proto.success', 'orbit.proto.insufficientData', 'orbit.proto.overflow',
      'orbit.proto.storm', 'orbit.proto.cameraCold', 'orbit.proto.cameraRecovered',
      'orbit.proto.arrivalFailure', 'orbit.proto.resolutionFailure', 'orbit.proto.orbitFailure',
    ]) expect(observedKeys.has(key), `scenario should exercise ${key}`).toBe(true);

    for (const entry of entries) {
      const template = copy[entry.messageKey];
      expect(template, `missing English text for ${entry.messageKey}`).toBeTruthy();
      for (const match of template?.matchAll(/\{(\w+)\}/g) ?? []) {
        expect(entry.params?.[match[1]!], `missing ${match[1]} for ${entry.messageKey}`).toBeDefined();
      }
    }
  });
});
