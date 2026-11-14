// stubs.ts — заглушки всіх трьох частин + імпорт тестових даних.
// Кожна група бере заглушки двох ІНШИХ частин і одразу працює в наскрізній грі.
// Усі цифри тут умовні: справжні збирає той, хто веде каталог.

import type {
  Catalog, CauseEntry, Design, DesignInput, FlightInput, FlightResult, Mission,
  MissionOutcome, OrbitInput, PhaseOutput, RunRecord, SlotId, SpacecraftSpec,
} from './contracts';
import { buildSpec, orbitInfo, reachedAltKm, shadowNeedWh } from './model';
import { fuelLeftKg } from './physics';
import catalogData from '../data/catalog.json';
import missionsData from '../data/missions.json';
import sampleDesignData from '../data/sample-design.json';

// ───────────────────────── Тестові дані ─────────────────────────

export const SAMPLE_MISSION: Mission = missionsData['earth-observer'] as Mission;

// По три варіанти на слот, кожен зі своїм характером.
export const SAMPLE_CATALOG: Catalog = catalogData as Catalog;

export const SAMPLE_DESIGN: Design = sampleDesignData;

// ───────────────────────── Заглушка частини 1 ─────────────────────────
// Бере готовий Design (без інтерфейсу вибору) і рахує опис апарата та запаси.

// Зберігаємо демонстраційний вибір, якщо він є у вході; інакше беремо перший доступний.
export function initialDesign({ mission, catalog }: DesignInput): Design {
  const moduleId = (slot: SlotId): string => {
    const preferred = catalog.modules.find((m) => m.slot === slot && m.id === SAMPLE_DESIGN.modules[slot]);
    const module = preferred ?? catalog.modules.find((m) => m.slot === slot);
    if (!module) throw new Error(`У каталозі немає модуля для слота ${slot}`);
    return module.id;
  };
  const launcher = mission.launchers.find((l) => l.id === SAMPLE_DESIGN.launcherId) ?? mission.launchers[0];
  if (!launcher) throw new Error('У місії немає жодного носія');
  const [lo, hi] = mission.altRangeKm;
  return {
    modules: {
      engine: moduleId('engine'), solar: moduleId('solar'), battery: moduleId('battery'),
      antenna: moduleId('antenna'), instrument: moduleId('instrument'),
    },
    fuelKg: SAMPLE_DESIGN.fuelKg,
    altKm: Math.min(hi, Math.max(lo, SAMPLE_DESIGN.altKm)),
    launcherId: launcher.id,
  };
}

// Розрахунок апарата живе в model/ (buildSpec); заглушка лише підставляє початковий проєкт.
export function stubDesign(input: DesignInput, design: Design = initialDesign(input)): PhaseOutput<SpacecraftSpec> {
  return buildSpec(input, design);
}

// ───────────────────────── Заглушка частини 2 ─────────────────────────
// Без геймплею: чесна формула «чи вистачило Δv і на яку орбіту вийшли».

export function stubFlight(input: FlightInput): PhaseOutput<FlightResult> {
  const { mission, spec } = input;
  const log: CauseEntry[] = [];
  const reached = spec.dvMs >= mission.dvRequiredMs;

  const altKm = reachedAltKm(mission, spec);

  if (!reached) {
    log.push({
      id: 'flight:low-orbit', phase: 'flight', tS: 0, kind: 'failure', system: 'propulsion',
      messageKey: 'flight.lowOrbit', params: { haveMs: Math.round(spec.dvMs), needMs: mission.dvRequiredMs },
      causedBy: ['design:engine', 'design:instrument'],
    });
  }

  return {
    result: {
      orbit: orbitInfo(mission.body, altKm),
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
  const needWh = shadowNeedWh(spec, flight.orbit.periodS * flight.orbit.eclipseFraction);
  const batteryDies = spec.batteryWh < needWh;

  const perOrbitMb = Math.min(
    spec.instrumentRateMbps * mission.imagingSPerOrbit,
    spec.downlinkMbps * mission.passSPerOrbit,
  );
  const survivedOrbits = batteryDies ? 1 : mission.durationOrbits;
  const deliveredMb = perOrbitMb * survivedOrbits;

  if (batteryDies) {
    log.push({
      id: 'orbit:battery-dead', phase: 'orbit', tS: flight.orbit.periodS, kind: 'failure', system: 'power',
      messageKey: 'orbit.batteryDead', params: { haveWh: spec.batteryWh, needWh: Math.round(needWh) },
      causedBy: ['design:battery', 'design:instrument'],
    });
  }

  const enoughData = deliveredMb >= mission.requiredDataMb;
  const enoughResolution = spec.resolutionM <= mission.requiredResolutionM;
  const endS = flight.orbit.periodS * survivedOrbits;

  // Розряд батареї вже пояснює передчасне завершення й недоставлені дані.
  if (!batteryDies && !enoughData) {
    log.push({
      id: 'orbit:insufficient-data', phase: 'orbit', tS: endS, kind: 'failure', system: 'science',
      messageKey: 'orbit.insufficientData', params: { deliveredMb, requiredMb: mission.requiredDataMb },
      causedBy: ['design:instrument', 'design:antenna'],
    });
  }
  if (!enoughResolution) {
    log.push({
      id: 'orbit:insufficient-resolution', phase: 'orbit', tS: endS, kind: 'failure', system: 'science',
      messageKey: 'orbit.insufficientResolution',
      params: { resolutionM: spec.resolutionM, requiredM: mission.requiredResolutionM },
      causedBy: ['design:instrument'],
    });
  }

  const success = !batteryDies && enoughData && enoughResolution;
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
