// buildSpec: апарат і запаси з проєкту. Раніше це була stubDesign у stubs.ts.
// Це єдине місце, де проєкт перетворюється на SpacecraftSpec: частина 1, заглушки й перебір рахують однаково.

import type {
  Catalog, CauseEntry, Design, DesignInput, Margin, ModuleDef, PhaseOutput, SlotId, SpacecraftSpec,
} from '../contracts';
import { deltaVMs, groundResolutionM } from '../physics';
import { orbitInfo } from './orbit';
import { orbitEnergyNeedWh, type EnergySpec } from './orbitEnergy';

// Константи апарата, яких гравець не обирає.
export const STRUCTURE_MASS_KG = 40;
export const BASE_LOAD_W = 20;
export const HEATER_W = 15;
export const BUFFER_MB = 4000;

const SLOT_SYSTEM = {
  engine: 'propulsion', solar: 'power', battery: 'power', antenna: 'comms', instrument: 'science',
} as const;

function pick<S extends SlotId>(catalog: Catalog, design: Design, slot: S): Extract<ModuleDef, { slot: S }> {
  const found = catalog.modules.find((m) => m.slot === slot && m.id === design.modules[slot]);
  if (!found) throw new Error(`У каталозі немає модуля ${design.modules[slot]} для слота ${slot}`);
  return found as Extract<ModuleDef, { slot: S }>;
}

export function buildSpec(input: DesignInput, design: Design): PhaseOutput<SpacecraftSpec> {
  const { mission, catalog } = input;
  const engine = pick(catalog, design, 'engine');
  const solar = pick(catalog, design, 'solar');
  const battery = pick(catalog, design, 'battery');
  const antenna = pick(catalog, design, 'antenna');
  const instrument = pick(catalog, design, 'instrument');
  const launcher = mission.launchers.find((l) => l.id === design.launcherId);
  if (!launcher) throw new Error(`У місії немає носія ${design.launcherId}`);

  const modules = [engine, solar, battery, antenna, instrument];
  const dryMassKg = STRUCTURE_MASS_KG + modules.reduce((sum, m) => sum + m.massKg, 0);
  const wetMassKg = dryMassKg + design.fuelKg;
  const costMUsd = launcher.costMUsd + modules.reduce((sum, m) => sum + m.costMUsd, 0);
  const dvMs = deltaVMs(engine.ispS, dryMassKg, design.fuelKg);
  const resolutionM = groundResolutionM(instrument.wavelengthM, design.altKm, instrument.apertureM);

  // Енергія: батарея має пережити усі витки місії зі звичайним режимом (камера, передавач, обігрів увімкнені).
  const orbit = orbitInfo(mission.body, design.altKm);
  const energy: EnergySpec = {
    panelPowerW: solar.powerW, baseLoadW: BASE_LOAD_W, instrumentW: instrument.powerW,
    transmitterW: antenna.powerW, heaterW: HEATER_W,
    instrumentRateMbps: instrument.dataRateMbps, downlinkMbps: antenna.downlinkMbps, bufferMb: BUFFER_MB,
  };
  const needWh = orbitEnergyNeedWh(energy, orbit, mission);
  // Зв'язок: за проліт треба скинути все, що камера зняла за вікно зйомки.
  const dataPerOrbitMb = instrument.dataRateMbps * mission.imagingSPerOrbit;
  const downlinkPerOrbitMb = antenna.downlinkMbps * mission.passSPerOrbit;

  const margins: Margin[] = [
    { id: 'dv', have: dvMs, need: mission.dvRequiredMs, unit: 'm/s', ok: dvMs >= mission.dvRequiredMs },
    { id: 'energy', have: battery.capacityWh, need: needWh, unit: 'Wh', ok: needWh <= 0 || battery.capacityWh > needWh },
    { id: 'link', have: downlinkPerOrbitMb, need: dataPerOrbitMb, unit: 'Mb/orbit', ok: downlinkPerOrbitMb >= dataPerOrbitMb },
    { id: 'science', have: resolutionM, need: mission.requiredResolutionM, unit: 'm', ok: resolutionM <= mission.requiredResolutionM },
    { id: 'mass', have: launcher.maxPayloadKg, need: wetMassKg, unit: 'kg', ok: launcher.maxPayloadKg >= wetMassKg },
    { id: 'budget', have: mission.budgetMUsd, need: costMUsd, unit: 'M$', ok: mission.budgetMUsd >= costMUsd },
  ];

  const spec: SpacecraftSpec = {
    design, dryMassKg, fuelKg: design.fuelKg, wetMassKg, ispS: engine.ispS, dvMs,
    panelPowerW: solar.powerW, batteryWh: battery.capacityWh, baseLoadW: BASE_LOAD_W, heaterW: HEATER_W,
    downlinkMbps: antenna.downlinkMbps, transmitterW: antenna.powerW, bufferMb: BUFFER_MB,
    instrumentRateMbps: instrument.dataRateMbps, instrumentW: instrument.powerW, resolutionM,
    costMUsd, margins,
  };

  // Кожен вибір гравця — запис у журналі; на них потім посилаються пізніші відмови.
  const log: CauseEntry[] = (Object.keys(design.modules) as SlotId[]).map((slot) => ({
    id: `design:${slot}`, phase: 'design', tS: 0, kind: 'decision', system: SLOT_SYSTEM[slot],
    messageKey: 'design.chose', params: { slot, module: design.modules[slot] },
  }));
  return { result: spec, log };
}
