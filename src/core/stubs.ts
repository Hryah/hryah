// stubs.ts — заглушки всіх трьох частин + тестові дані.
// Кожна група бере заглушки двох ІНШИХ частин і одразу працює в наскрізній грі.
// Усі цифри тут умовні: справжні збирає той, хто веде каталог.

import type {
  Catalog, CauseEntry, Design, DesignInput, FlightInput, FlightResult, Margin, Mission,
  MissionOutcome, ModuleDef, OrbitInput, PhaseOutput, RunRecord, SlotId, SpacecraftSpec,
} from './contracts';
import { deltaVMs, eclipseFraction, fuelLeftKg, groundResolutionM, orbitalPeriodS } from './physics';

// ───────────────────────── Тестові дані ─────────────────────────

export const SAMPLE_MISSION: Mission = {
  id: 'earth-observer',
  titleKey: 'mission.earthObserver.title',
  briefKey: 'mission.earthObserver.brief',
  body: { name: 'Earth', radiusKm: 6371, muKm3S2: 398600 },
  budgetMUsd: 60,
  dvRequiredMs: 300,
  altRangeKm: [400, 800],
  requiredResolutionM: 2,
  requiredDataMb: 10000,
  durationOrbits: 10,
  imagingSPerOrbit: 300,
  passSPerOrbit: 480,
  launchers: [
    { id: 'small', nameKey: 'launcher.small', maxPayloadKg: 120, costMUsd: 8 },
    { id: 'medium', nameKey: 'launcher.medium', maxPayloadKg: 200, costMUsd: 15 },
    { id: 'heavy', nameKey: 'launcher.heavy', maxPayloadKg: 400, costMUsd: 30 },
  ],
};

// По три варіанти на слот, кожен зі своїм характером.
export const SAMPLE_CATALOG: Catalog = {
  modules: [
    { slot: 'engine', id: 'eng-cold', nameKey: 'engine.cold', massKg: 4, costMUsd: 1, ispS: 220 },
    { slot: 'engine', id: 'eng-chem', nameKey: 'engine.chem', massKg: 8, costMUsd: 3, ispS: 300 },
    { slot: 'engine', id: 'eng-ion', nameKey: 'engine.ion', massKg: 20, costMUsd: 9, ispS: 1500 },
    { slot: 'solar', id: 'sol-s', nameKey: 'solar.s', massKg: 5, costMUsd: 1, powerW: 80 },
    { slot: 'solar', id: 'sol-m', nameKey: 'solar.m', massKg: 10, costMUsd: 2, powerW: 160 },
    { slot: 'solar', id: 'sol-l', nameKey: 'solar.l', massKg: 20, costMUsd: 4, powerW: 320 },
    { slot: 'battery', id: 'bat-s', nameKey: 'battery.s', massKg: 3, costMUsd: 1, capacityWh: 30 },
    { slot: 'battery', id: 'bat-m', nameKey: 'battery.m', massKg: 6, costMUsd: 2, capacityWh: 60 },
    { slot: 'battery', id: 'bat-l', nameKey: 'battery.l', massKg: 12, costMUsd: 4, capacityWh: 120 },
    { slot: 'antenna', id: 'ant-s', nameKey: 'antenna.s', massKg: 2, costMUsd: 1, downlinkMbps: 2, powerW: 10 },
    { slot: 'antenna', id: 'ant-m', nameKey: 'antenna.m', massKg: 6, costMUsd: 3, downlinkMbps: 10, powerW: 30 },
    { slot: 'antenna', id: 'ant-l', nameKey: 'antenna.l', massKg: 15, costMUsd: 7, downlinkMbps: 50, powerW: 80 },
    { slot: 'instrument', id: 'cam-s', nameKey: 'camera.s', massKg: 5, costMUsd: 3, apertureM: 0.1, wavelengthM: 550e-9, dataRateMbps: 2, powerW: 10 },
    { slot: 'instrument', id: 'cam-m', nameKey: 'camera.m', massKg: 20, costMUsd: 10, apertureM: 0.2, wavelengthM: 550e-9, dataRateMbps: 8, powerW: 30 },
    { slot: 'instrument', id: 'cam-l', nameKey: 'camera.l', massKg: 70, costMUsd: 25, apertureM: 0.4, wavelengthM: 550e-9, dataRateMbps: 30, powerW: 60 },
  ],
};

export const SAMPLE_DESIGN: Design = {
  modules: { engine: 'eng-chem', solar: 'sol-m', battery: 'bat-m', antenna: 'ant-m', instrument: 'cam-m' },
  fuelKg: 12,
  altKm: 500,
  launcherId: 'small',
};

// Константи апарата, яких гравець не обирає.
const STRUCTURE_MASS_KG = 40;
const BASE_LOAD_W = 20;
const HEATER_W = 15;
const BUFFER_MB = 4000;

// ───────────────────────── Заглушка частини 1 ─────────────────────────
// Бере готовий Design (без інтерфейсу вибору) і рахує опис апарата та запаси.

function pick<S extends SlotId>(catalog: Catalog, design: Design, slot: S): Extract<ModuleDef, { slot: S }> {
  const found = catalog.modules.find((m) => m.slot === slot && m.id === design.modules[slot]);
  if (!found) throw new Error(`У каталозі немає модуля ${design.modules[slot]} для слота ${slot}`);
  return found as Extract<ModuleDef, { slot: S }>;
}

export function stubDesign(input: DesignInput, design: Design = SAMPLE_DESIGN): PhaseOutput<SpacecraftSpec> {
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

  // Енергія: батарея має прожити тінь з увімкненими камерою та обігрівом.
  const shadowH = (orbitalPeriodS(mission.body, design.altKm) * eclipseFraction(mission.body, design.altKm)) / 3600;
  const shadowNeedWh = (BASE_LOAD_W + HEATER_W + instrument.powerW) * shadowH;
  // Зв'язок: за проліт треба скинути все, що камера зняла за вікно зйомки.
  const dataPerOrbitMb = instrument.dataRateMbps * mission.imagingSPerOrbit;
  const downlinkPerOrbitMb = antenna.downlinkMbps * mission.passSPerOrbit;

  const margins: Margin[] = [
    { id: 'dv', have: dvMs, need: mission.dvRequiredMs, unit: 'm/s', ok: dvMs >= mission.dvRequiredMs },
    { id: 'energy', have: battery.capacityWh, need: shadowNeedWh, unit: 'Wh', ok: battery.capacityWh >= shadowNeedWh },
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

const SLOT_SYSTEM = {
  engine: 'propulsion', solar: 'power', battery: 'power', antenna: 'comms', instrument: 'science',
} as const;

// ───────────────────────── Заглушка частини 2 ─────────────────────────
// Без геймплею: чесна формула «чи вистачило Δv і на яку орбіту вийшли».

export function stubFlight(input: FlightInput): PhaseOutput<FlightResult> {
  const { mission, spec } = input;
  const log: CauseEntry[] = [];
  const reached = spec.dvMs >= mission.dvRequiredMs;

  // Не вистачило Δv: виходимо нижче в тій самій пропорції (груба, але монотонна модель).
  const altKm = reached
    ? spec.design.altKm
    : mission.altRangeKm[0] * 0.5 + (spec.design.altKm - mission.altRangeKm[0] * 0.5) * (spec.dvMs / mission.dvRequiredMs);

  if (!reached) {
    log.push({
      id: 'flight:low-orbit', phase: 'flight', tS: 0, kind: 'failure', system: 'propulsion',
      messageKey: 'flight.lowOrbit', params: { haveMs: Math.round(spec.dvMs), needMs: mission.dvRequiredMs },
      causedBy: ['design:engine', 'design:instrument'],
    });
  }

  return {
    result: {
      orbit: {
        altKm,
        periodS: orbitalPeriodS(mission.body, altKm),
        eclipseFraction: eclipseFraction(mission.body, altKm),
      },
      fuelLeftKg: reached ? fuelLeftKg(spec.ispS, spec.dryMassKg, spec.fuelKg, mission.dvRequiredMs) : 0,
      damage: [],
    },
    log,
  };
}

// ───────────────────────── Заглушка частини 3 ─────────────────────────
// Без тумблерів: грає «все ввімкнено за розкладом» і рахує підсумок по витках.

export function stubOrbit(input: OrbitInput): PhaseOutput<MissionOutcome> {
  const { mission, spec, flight } = input;
  const log: CauseEntry[] = [];
  const shadowH = (flight.orbit.periodS * flight.orbit.eclipseFraction) / 3600;
  const shadowNeedWh = (spec.baseLoadW + spec.heaterW + spec.instrumentW) * shadowH;
  const batteryDies = spec.batteryWh < shadowNeedWh;

  const perOrbitMb = Math.min(
    spec.instrumentRateMbps * mission.imagingSPerOrbit,
    spec.downlinkMbps * mission.passSPerOrbit,
  );
  const survivedOrbits = batteryDies ? 1 : mission.durationOrbits;
  const deliveredMb = perOrbitMb * survivedOrbits;

  if (batteryDies) {
    log.push({
      id: 'orbit:battery-dead', phase: 'orbit', tS: flight.orbit.periodS, kind: 'failure', system: 'power',
      messageKey: 'orbit.batteryDead', params: { haveWh: spec.batteryWh, needWh: Math.round(shadowNeedWh) },
      causedBy: ['design:battery', 'design:instrument'],
    });
  }

  const success = !batteryDies && deliveredMb >= mission.requiredDataMb;
  return { result: { success, deliveredMb, survivedOrbits, score: Math.round(deliveredMb / 100) }, log };
}

// ───────────────────────── Наскрізний прохід ─────────────────────────
// Так три частини з'єднуються. Справжні частини підставляються замість заглушок по одній.

export function runStubGame(seed: number, design: Design = SAMPLE_DESIGN): RunRecord {
  const mission = SAMPLE_MISSION;
  const d = stubDesign({ mission, catalog: SAMPLE_CATALOG }, design);
  const f = stubFlight({ mission, spec: d.result, log: d.log });
  const o = stubOrbit({ mission, spec: d.result, flight: f.result, log: [...d.log, ...f.log] });
  return {
    seed, missionId: mission.id, spec: d.result, flight: f.result, outcome: o.result,
    log: [...d.log, ...f.log, ...o.log],
  };
}
