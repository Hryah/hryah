import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildSpec, orbitInfo } from '../../core/model';
import { CAMPAIGN_CATALOG, SCENARIOS } from '../../core/consortium/scenarios';
import { SAMPLE_DESIGN } from '../../core/stubs';
import { orbitPhase } from '../../core/orbit';
import { OrbitPanel } from '../play/OrbitPanel';
import { OrbitPrototype } from './OrbitPrototype';
import { orbitReportSummary } from '../campaign/MissionRunner';

function stateFor(id: string) {
  const setup = SCENARIOS[id];
  if (!setup) throw new Error(`Missing scenario ${id}`);
  const mission = setup.mission;
  const design = { ...SAMPLE_DESIGN, altKm: mission.altRangeKm[0],
    modules: { ...SAMPLE_DESIGN.modules, instrument: mission.kind === 'cargo' ? 'cargo-water' : 'cam-m' } };
  const built = buildSpec({ mission, catalog: setup.catalog ?? CAMPAIGN_CATALOG }, design);
  return orbitPhase.init({ mission, spec: built.result, log: built.log,
    flight: { orbit: orbitInfo(mission.body, design.altKm), fuelLeftKg: built.result.fuelKg, damage: [] } }, 42);
}

describe.each(['prototype', 'compact'] as const)('%s mission objective reader', renderer => {
  const render = (id: string) => {
    const state = stateFor(id);
    return renderToStaticMarkup(renderer === 'prototype' ? <OrbitPrototype initialState={state} />
      : <OrbitPanel state={state} dispatch={() => undefined} />);
  };

  it('shows cargo delivery with three commands and no camera or zero-Mb quota', () => {
    const html = render('lifeline');
    expect(html).toContain('Deliver the Water container');
    expect(html).toContain('survive 6 approach orbits');
    expect(html).toContain('Status reports: 0 / 6');
    expect(html.match(/role="switch"/g)).toHaveLength(3);
    expect(html).not.toMatch(/aria-label="Camera"|Camera:|0 \/ 0 Mb/);
    expect(html).not.toMatch(/\{cargo\}|\borbit\.objective\.|\borbit\.telemetry\./);
  });

  it('explains the flyby interval without presenting the score reference as a quota', () => {
    const html = render('guest');
    expect(html).toContain('Observe on orbits 3–5');
    expect(html).toContain('there is no fixed data quota');
    expect(html).toContain('Resolution must be 3 m or better');
    expect(html).not.toMatch(/30,000|30000/);
    expect(html.match(/role="switch"/g)).toHaveLength(4);
  });

  it('keeps imaging quota and inclusive altitude requirements visible', () => {
    const html = render('living-planet');
    expect(html).toContain('Transmit at least');
    expect(html).toContain('survive 10 orbits');
    expect(html).toContain('Required altitude: 400–800 km. Actual altitude: 400 km.');
    expect(html.match(/role="switch"/g)).toHaveLength(4);
  });

  it.each(['selene', 'red-planet', 'colony'])('%s labels the actual body in both nominal and storm scenes', id => {
    for (const storm of [false, true]) {
      const original = stateFor(id);
      const state = { ...original, stormOrbit: storm ? 1 : null };
      const html = renderToStaticMarkup(renderer === 'prototype' ? <OrbitPrototype initialState={state} />
        : <OrbitPanel state={state} dispatch={() => undefined} />);
      expect(html).toContain(`Mission spacecraft orbiting ${state.input.mission.body.name}`);
      expect(html).not.toMatch(/around Earth|approaching Earth|Earth observation satellite/);
      if (renderer === 'compact') expect(html).toContain(`Body: ${state.input.mission.body.name}`);
    }
  });
});

describe('campaign report reads the canonical orbit summary', () => {
  it('shows 100% cargo delivery even with zero transmitted status data', () => {
    let state = orbitPhase.step(stateFor('lifeline'), { type: 'toggle', id: 'transmitter' });
    while (!orbitPhase.isDone(state)) state = orbitPhase.step(state, { type: 'tick', dtS: state.input.flight.orbit.periodS });
    const outcome = orbitPhase.finish(state).result;
    expect(outcome.deliveredMb).toBe(0);
    expect(orbitReportSummary(state.input.mission, outcome))
      .toContainEqual({ label: 'Supplies delivered', value: '100%' });
  });

  it('shows 0% for cargo on the wrong orbit even when all reports reached the ground', () => {
    const original = stateFor('lifeline');
    let state = orbitPhase.init({ ...original.input, flight: { ...original.input.flight,
      orbit: { ...original.input.flight.orbit, altKm: 399 } } }, 42);
    while (!orbitPhase.isDone(state)) state = orbitPhase.step(state, { type: 'tick', dtS: state.input.flight.orbit.periodS });
    const outcome = orbitPhase.finish(state).result;
    expect(outcome.deliveredMb).toBe(48);
    expect(orbitReportSummary(state.input.mission, outcome))
      .toContainEqual({ label: 'Supplies delivered', value: '0%' });
  });

  it('reports flyby Mb without the 30000-Mb score reference', () => {
    let state = stateFor('guest');
    while (!orbitPhase.isDone(state)) state = orbitPhase.step(state, { type: 'tick', dtS: state.input.flight.orbit.periodS });
    const row = orbitReportSummary(state.input.mission, orbitPhase.finish(state).result).find(item => item.label === 'Data delivered');
    expect(row?.value).toMatch(/^\d+ Mb$/);
    expect(row?.value).not.toContain('30000');
  });
});
