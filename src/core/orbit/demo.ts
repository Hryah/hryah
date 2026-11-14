import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION, stubDesign, stubFlight } from '../stubs';
import { orbitPhase } from './phase';

export type DemoPreset = 'balanced' | 'comms' | 'power';

export function createDemoOrbit(preset: DemoPreset = 'balanced', seed = 42) {
  const modules = { ...SAMPLE_DESIGN.modules };
  if (preset === 'comms') modules.antenna = 'ant-s';
  if (preset === 'power') { modules.solar = 'sol-s'; modules.battery = 'bat-s'; }
  const design = { ...SAMPLE_DESIGN, modules, altKm: 400 };
  const built = stubDesign({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, design);
  const flight = stubFlight({ mission: SAMPLE_MISSION, spec: built.result, log: built.log });
  if (preset === 'power') flight.result = { ...flight.result, damage: [{ system: 'power', severity: 0.05 }] };
  return orbitPhase.init({ mission: SAMPLE_MISSION, spec: built.result, flight: flight.result,
    log: [...built.log, ...flight.log] }, seed);
}
