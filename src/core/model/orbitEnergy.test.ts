import { describe, expect, it } from 'vitest';
import type { Design, Mission, OrbitInfo } from '../contracts';
import { CARGO_CATALOG, SCENARIOS } from '../consortium/scenarios';
import { applyDamage } from '../consortium/damage';
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION } from '../stubs';
import { buildSpec, orbitEnergyNeedWh, orbitGeneratedMb, orbitProfile, orbitTiming, segmentLoadW,
  type EnergySpec, type SegmentKind } from './index';

const nominal: EnergySpec = {
  panelPowerW: 0, baseLoadW: 20, instrumentW: 30, transmitterW: 30, heaterW: 15,
  instrumentRateMbps: 4, downlinkMbps: 10, bufferMb: 4000,
};
const orbit: OrbitInfo = { altKm: 500, periodS: 3600, eclipseFraction: 0 };
const imaging: Mission = { ...SAMPLE_MISSION, imagingSPerOrbit: 600, passSPerOrbit: 300,
  durationOrbits: 8, orbitObjective: { type: 'imaging' } };
const flyby: Mission = { ...imaging, orbitObjective: { type: 'flyby', imagingOrbits: [3, 5] } };
const cargo: Mission = { ...imaging, kind: 'cargo', durationOrbits: 1,
  orbitObjective: { type: 'cargo', telemetryReportMb: 8, telemetryBonusMaxFraction: 0.1 } };
const cargoSpec: EnergySpec = { ...nominal, instrumentW: 5,
  instrumentRateMbps: 0.5, downlinkMbps: 2, bufferMb: 100 };
const shadowOrbit = { ...orbit, eclipseFraction: 0.25 };
const on = { camera: true, transmitter: true, heater: true };

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('mission orbit profile', () => {
  it.each([[2, false], [3, true], [5, true], [6, false]] as const)(
    'flyby orbit %i: inclusive window is %s without changing timing', (index, allowed) => {
      const profile = orbitProfile(flyby, index);
      expect(profile.cameraWindow).toBe(allowed);
      expect(orbitGeneratedMb(profile, nominal.instrumentRateMbps, 600, true)).toBe(allowed ? 2400 : 0);
      expect(segmentLoadW(nominal, 'imaging', on, profile)).toBe(allowed ? 50 : 20);
      const timing = orbitTiming(orbit, flyby);
      expect(timing).toEqual(orbitTiming(orbit, imaging));
      expect(timing.idleSunS + timing.imagingS + timing.passS + timing.shadowS).toBe(3600);
    });

  it('keeps legacy imaging available on every orbit', () => {
    const { orbitObjective: _objective, ...fields } = imaging;
    const legacy: Mission = fields;
    expect(orbitProfile(legacy, 2)).toEqual(orbitProfile(imaging, 2));
    expect(orbitGeneratedMb(orbitProfile(legacy, 2), 4, 600, false)).toBe(0);
  });

  it('limits automatic status generation by elapsed time and report size', () => {
    const profile = orbitProfile(cargo, 1);
    expect(orbitGeneratedMb(profile, 0.5, 2, false)).toBe(1);
    expect(orbitGeneratedMb(profile, 0.5, 600, false)).toBe(8);
    expect(orbitGeneratedMb(profile, 0, 600, true)).toBe(0);
    expect(orbitGeneratedMb(profile, 0.5, 0, true)).toBe(0);
    expect(profile).toEqual({ cameraWindow: false, continuousPayload: true,
      reportLimitMb: 8, expireAfterPass: true });
  });

  it.each([
    ['sunIdle', 25], ['imaging', 25], ['transmit', 55], ['passRest', 25], ['shadow', 40],
  ] satisfies [SegmentKind, number][])(
    'cargo load in %s includes exactly one payload load', (segment, watts) => {
      const profile = orbitProfile(cargo, 1);
      expect(segmentLoadW(cargoSpec, segment, on, profile)).toBe(watts);
      expect(segmentLoadW(cargoSpec, segment,
        { camera: false, transmitter: false, heater: false }, profile)).toBe(25);
    });
});

describe('mission energy requirement', () => {
  it('charges only the three flyby observation windows and preserves all eight orbits', () => {
    expect(orbitEnergyNeedWh(nominal, orbit, flyby)).toBeCloseTo(181, 10);
    expect(orbitEnergyNeedWh(nominal, orbit, imaging)).toBeCloseTo(216, 10);
    expect(orbitEnergyNeedWh(nominal, orbit, flyby, { ...on, camera: false })).toBeCloseTo(160, 10);
  });

  it('powers cargo throughout the orbit and transmits only an eight-Mb report', () => {
    const expectedWh = 25 + 15 * 900 / 3600 + 30 * 4 / 3600;
    expect(orbitEnergyNeedWh(cargoSpec, shadowOrbit, cargo)).toBeCloseTo(expectedWh, 10);
    expect(orbitEnergyNeedWh(cargoSpec, shadowOrbit, cargo, { ...on, camera: false })).toBeCloseTo(expectedWh, 10);
    expect(orbitEnergyNeedWh(cargoSpec, shadowOrbit, cargo, { ...on, transmitter: false })).toBeCloseTo(28.75, 10);
  });

  it('reduces transmitter time for a small buffer, without switching off the payload', () => {
    expect(orbitEnergyNeedWh({ ...cargoSpec, bufferMb: 4 }, shadowOrbit, cargo))
      .toBeCloseTo(28.75 + 30 * 2 / 3600, 10);
    expect(orbitEnergyNeedWh({ ...cargoSpec, bufferMb: 0 }, shadowOrbit, cargo)).toBeCloseTo(28.75, 10);
    expect(orbitEnergyNeedWh({ ...cargoSpec, instrumentRateMbps: 0 }, shadowOrbit, cargo)).toBeCloseTo(28.75, 10);
  });

  it('expires incomplete reports instead of transmitting their backlog after monitoring becomes cold-locked', () => {
    const mission = { ...cargo, durationOrbits: 3 };
    // Two reports send 3 Mb each; the third report is blocked after two unheated shadows.
    expect(orbitEnergyNeedWh({ ...cargoSpec, downlinkMbps: 0.01 }, shadowOrbit,
      mission, { ...on, heater: false })).toBeCloseTo(3 * 25 + 2 * 30 * 300 / 3600, 10);
  });

  it('keeps legacy cargo energy unchanged unless an objective is present', () => {
    const { orbitObjective: _objective, ...fields } = cargo;
    const legacy: Mission = fields;
    expect(orbitEnergyNeedWh(cargoSpec, shadowOrbit, legacy))
      .toBeCloseTo(20 + 5 * 600 / 3600 + 30 * 50 / 3600 + 15 * 900 / 3600, 10);
    const imagingLegacy: Mission = { ...legacy, kind: 'imaging' };
    expect(orbitEnergyNeedWh(cargoSpec, shadowOrbit, legacy))
      .toBe(orbitEnergyNeedWh(cargoSpec, shadowOrbit, imagingLegacy));
  });

  it('handles zero duration and accounts for a cumulative deficit with weak panels', () => {
    expect(orbitEnergyNeedWh(cargoSpec, shadowOrbit, { ...cargo, durationOrbits: 0 })).toBe(0);
    const shortOrbit = { ...orbit, periodS: 100, eclipseFraction: 0.2 };
    const mission = { ...cargo, durationOrbits: 3, imagingSPerOrbit: 10, passSPerOrbit: 10 };
    const spec = { ...cargoSpec, panelPowerW: 6, baseLoadW: 2, instrumentW: 3,
      transmitterW: 10, heaterW: 5, instrumentRateMbps: 2, downlinkMbps: 1 };
    expect(orbitEnergyNeedWh(spec, shortOrbit, mission)).toBeCloseTo(670 / 3600, 10);
  });

  it('is pure, deterministic and identical after JSON round-trip', () => {
    const frozenMission = deepFreeze(structuredClone(flyby));
    const frozenSpec = deepFreeze({ ...nominal });
    const frozenOrbit = deepFreeze({ ...orbit });
    const frozenOn = deepFreeze({ ...on });
    const before = JSON.stringify([frozenMission, frozenSpec, frozenOrbit, frozenOn]);
    const first = orbitEnergyNeedWh(frozenSpec, frozenOrbit, frozenMission, frozenOn);
    expect(orbitEnergyNeedWh(frozenSpec, frozenOrbit, frozenMission, frozenOn)).toBe(first);
    expect(orbitEnergyNeedWh(JSON.parse(JSON.stringify(frozenSpec)), JSON.parse(JSON.stringify(frozenOrbit)),
      JSON.parse(JSON.stringify(frozenMission)), JSON.parse(JSON.stringify(frozenOn)))).toBe(first);
    const profile = orbitProfile(frozenMission, 3);
    expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
    expect(JSON.stringify([frozenMission, frozenSpec, frozenOrbit, frozenOn])).toBe(before);
  });
});

describe('cargo metadata and design margins', () => {
  const scenario = SCENARIOS['lifeline'];
  if (!scenario) throw new Error('Missing lifeline scenario');
  const design: Design = { ...SAMPLE_DESIGN, fuelKg: 20, altKm: 400, launcherId: 'medium',
    modules: { engine: 'eng-chem', solar: 'sol-m', battery: 'bat-m', antenna: 'ant-s', instrument: 'cargo-water' } };

  it('copies all four catalog cargo kinds and preserves them through damage and JSON', () => {
    const containers = CARGO_CATALOG.modules.filter((m) => m.slot === 'instrument');
    expect(containers).toHaveLength(4);
    for (const module of containers) {
      const input = deepFreeze({ mission: { ...scenario.mission, orbitObjective: cargo.orbitObjective }, catalog: CARGO_CATALOG });
      const chosen = deepFreeze({ ...design, modules: { ...design.modules, instrument: module.id } });
      const output = buildSpec(input, chosen);
      expect(output.result.cargoKind).toBe(module.cargoKind);
      expect(JSON.parse(JSON.stringify(output))).toEqual(output);
      expect(applyDamage(output.result, [{ system: 'science', severity: 0.5 },
        { system: 'power', severity: 0.5 }, { system: 'comms', severity: 0.5 }]).cargoKind).toBe(module.cargoKind);
      expect(buildSpec(input, chosen)).toEqual(output);
    }
  });

  it('omits cargoKind for a camera even when its id starts with cargo-', () => {
    const cameraId = SAMPLE_DESIGN.modules.instrument;
    const input = { mission: SAMPLE_MISSION, catalog: { modules: SAMPLE_CATALOG.modules
      .map((module) => module.id === cameraId ? { ...module, id: 'cargo-camera' } : module) } };
    const output = buildSpec(input, { ...SAMPLE_DESIGN, modules: { ...SAMPLE_DESIGN.modules, instrument: 'cargo-camera' } });
    expect(Object.hasOwn(output.result, 'cargoKind')).toBe(false);
    expect(JSON.parse(JSON.stringify(output))).toEqual(output);
  });

  it('requires an eight-Mb report in the link margin instead of a fictional imaging quota', () => {
    const mission = { ...scenario.mission, passSPerOrbit: 15 };
    const legacy = buildSpec({ mission, catalog: CARGO_CATALOG }, design).result;
    const modern = buildSpec({ mission: { ...mission, orbitObjective: cargo.orbitObjective }, catalog: CARGO_CATALOG }, design).result;
    expect(legacy.margins.find((m) => m.id === 'link')).toMatchObject({ have: 30, need: 150, ok: false });
    expect(modern.margins.find((m) => m.id === 'link')).toMatchObject({ have: 30, need: 8, ok: true });
    expect(modern.dryMassKg).toBe(126);
    expect(modern.wetMassKg).toBe(146);
    expect(modern.costMUsd).toBe(25);
  });
});
