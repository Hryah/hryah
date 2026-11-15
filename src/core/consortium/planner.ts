// Планувальник: найцінніший доступний апарат за оцінкою заглушок польоту й орбіти. Ним користуються бот
// (як ціль) і підсумок вікна (як «оптимальний прохід» для порівняння з гравцем). Чистий і без стану сесії.

import type { Design, DesignInput, ModuleDef, SlotId } from '../contracts';
import { SLOTS } from '../design';
import { buildSpec } from '../model';
import { deltaVMs } from '../physics';
import { stubFlight, stubOrbit } from '../stubs';
import { cargoKindOf, runValueMUsd, TUNING } from './reward';

const FUEL_STEP_KG = 2;
const DV_RESERVE = 1.1;    // бот бере трохи більше пального, ніж треба
const COST_WEIGHT = 0.25;  // скільки цінності бот готовий віддати за 1 млн $

function fuelFor(input: DesignInput, design: Design): number {
  const engine = input.catalog.modules.find((m) => m.slot === 'engine' && m.id === design.modules.engine);
  if (!engine || engine.slot !== 'engine') return 0;
  const dry = buildSpec(input, { ...design, fuelKg: 0 }).result.dryMassKg;
  const need = input.mission.dvRequiredMs * DV_RESERVE;
  let fuel = 0;
  for (let guard = 0; guard < 200 && deltaVMs(engine.ispS, dry, fuel) < need; guard++) fuel += FUEL_STEP_KG;
  return fuel;
}

// Що вже полетіло в цьому вікні в інших агенцій: бот не хоче дублювати (вантаж того самого типу цінується менше,
// а однакові апарати не дають бонусу різноманітності).
export interface Taken {
  designs: string[];   // `${instrument}@${смуга висоти}`
  cargo: string[];     // типи контейнерів
}
const NO_TAKEN: Taken = { designs: [], cargo: [] };
const DUPLICATE_DESIGN_FACTOR = 0.85;
const DUPLICATE_CARGO_FACTOR = 0.5;
export const designKey = (d: Design) => `${d.modules.instrument}@${Math.floor(d.altKm / TUNING.altBandKm)}`;

function score(input: DesignInput, design: Design, taken: Taken): number | null {
  const { result: spec, log } = buildSpec(input, design);
  if (spec.margins.some((m) => (m.id === 'mass' || m.id === 'budget') && !m.ok)) return null;
  const flight = stubFlight({ mission: input.mission, spec, log });
  const orbit = stubOrbit({ mission: input.mission, spec, flight: flight.result, log });
  const run = { agencyId: '', launchTurn: 0, spec, outcome: orbit.result, log: [], reachedOrbit: spec.dvMs >= input.mission.dvRequiredMs };
  let value = runValueMUsd(input.mission, run, undefined, input.catalog);
  const kind = cargoKindOf(input.catalog, run);
  if (kind && taken.cargo.includes(kind)) value *= DUPLICATE_CARGO_FACTOR ** taken.cargo.filter((k) => k === kind).length;
  else if (!kind && taken.designs.includes(designKey(design))) value *= DUPLICATE_DESIGN_FACTOR;
  return value - COST_WEIGHT * spec.costMUsd;
}

// Повний перебір дорогий, коли модулів багато (каталог кампанії): тоді покоординатний спуск від найдешевшого проєкту.
const FULL_SEARCH_LIMIT = 400;
const cache = new WeakMap<DesignInput, Map<string, Design | null>>();

// Найкращий доступний проєкт: модулі × три висоти, пальне під Δv, найменший носій, що підходить.
export function botTarget(input: DesignInput, taken: Taken = NO_TAKEN): Design | null {
  const key = JSON.stringify(taken);
  let byTaken = cache.get(input);
  if (!byTaken) { byTaken = new Map(); cache.set(input, byTaken); }
  if (byTaken.has(key)) return byTaken.get(key) ?? null;
  const result = searchTarget(input, taken);
  byTaken.set(key, result);
  return result;
}

function searchTarget(input: DesignInput, taken: Taken): Design | null {
  const bySlot = SLOTS.map((slot) => input.catalog.modules.filter((m: ModuleDef) => m.slot === slot));
  if (bySlot.some((list) => list.length === 0)) return null;
  const [lo, hi] = input.mission.altRangeKm;
  const mid = Math.min(hi, Math.max(lo, Math.round((lo + hi) / 100) * 50));
  const alts = [...new Set([lo, mid, hi])];
  const launchers = [...input.mission.launchers].sort((a, b) => a.maxPayloadKg - b.maxPayloadKg);
  if (launchers.length === 0) return null;

  const evaluate = (modules: Record<SlotId, string>): { design: Design; value: number } | null => {
    let best: { design: Design; value: number } | null = null;
    for (const altKm of alts) {
      const draft: Design = { modules, altKm, fuelKg: 0, launcherId: launchers[0]!.id };
      const fuelKg = fuelFor(input, draft);
      const wet = buildSpec(input, { ...draft, fuelKg }).result.wetMassKg;
      const launcher = launchers.find((l) => l.maxPayloadKg >= wet);
      if (!launcher) continue;
      const design = { ...draft, fuelKg, launcherId: launcher.id };
      const value = score(input, design, taken);
      if (value !== null && (best === null || value > best.value)) best = { design, value };
    }
    return best;
  };

  const combos = bySlot.reduce((n, list) => n * list.length, 1);
  if (combos <= FULL_SEARCH_LIMIT) {
    let best: { design: Design; value: number } | null = null;
    const walk = (i: number, acc: Partial<Record<SlotId, string>>) => {
      if (i === SLOTS.length) {
        const r = evaluate(acc as Record<SlotId, string>);
        if (r && (best === null || r.value > best.value)) best = r;
        return;
      }
      for (const m of bySlot[i]!) walk(i + 1, { ...acc, [SLOTS[i]!]: m.id });
    };
    walk(0, {});
    return (best as { design: Design } | null)?.design ?? null;
  }

  // Покоординатний спуск: по черзі пробуємо кожен модуль слота, решту тримаємо; три проходи вистачає.
  // Стартів два: найдешевші модулі та найдешевші з найефективнішим двигуном. Слабкий двигун (холодний газ) вимагає стільки
  // палива, що жоден інший модуль уже не влазить у носій: з одного старту спуск застрягав би на слабкому проєкті.
  const cheapest = (list: ModuleDef[]) => [...list].sort((a, b) => a.costMUsd - b.costMUsd)[0]!.id;
  const descend = (start: Record<SlotId, string>): { design: Design; value: number } | null => {
    let modules = start;
    let best = evaluate(modules);
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      SLOTS.forEach((slot, i) => {
        for (const m of bySlot[i]!) {
          if (m.id === modules[slot]) continue;
          const candidate = { ...modules, [slot]: m.id };
          const r = evaluate(candidate);
          if (r && (best === null || r.value > best.value)) { best = r; modules = candidate; improved = true; }
        }
      });
      if (!improved) break;
    }
    return best;
  };
  const cheap = Object.fromEntries(SLOTS.map((slot, i) => [slot, cheapest(bySlot[i]!)])) as Record<SlotId, string>;
  const engines = bySlot[SLOTS.indexOf('engine')]!.filter((m): m is Extract<ModuleDef, { slot: 'engine' }> => m.slot === 'engine');
  const antennas = bySlot[SLOTS.indexOf('antenna')]!.filter((m): m is Extract<ModuleDef, { slot: 'antenna' }> => m.slot === 'antenna');
  const efficient = [...engines].sort((a, b) => b.ispS - a.ispS)[0]?.id ?? cheap.engine;
  const fastest = [...antennas].sort((a, b) => b.downlinkMbps - a.downlinkMbps)[0]?.id ?? cheap.antenna;
  // Старти: найдешевший проєкт і, для кожного приладу, проєкт із ним, найефективнішим двигуном і найшвидшою антеною.
  // Перехід до важкого приладу (власне дзеркало) вимагає змінити одразу двигун і антену, а спуск міняє по одному слоту.
  const instrumentSlot = SLOTS.indexOf('instrument');
  const starts: Record<SlotId, string>[] = [cheap, ...bySlot[instrumentSlot]!.map((m) => ({ ...cheap, engine: efficient, antenna: fastest, instrument: m.id }))];
  let winner: { design: Design; value: number } | null = null;
  for (const start of starts) {
    const r = descend(start);
    if (r && (winner === null || r.value > winner.value)) winner = r;
  }
  return winner?.design ?? null;
}


// «Оптимальний прохід» для розбору: що дав би найкращий доступний проєкт, якби агенція знала справжні умови.
export function optimalValue(input: DesignInput, trueMission: DesignInput['mission']): { design: Design | null; value: number } {
  const known: DesignInput = { mission: { ...trueMission, budgetMUsd: input.mission.budgetMUsd, launchers: input.mission.launchers }, catalog: input.catalog };
  const design = botTarget(known);
  if (!design) return { design: null, value: 0 };
  const { result: spec, log } = buildSpec(known, design);
  const flight = stubFlight({ mission: known.mission, spec, log });
  const orbit = stubOrbit({ mission: known.mission, spec, flight: flight.result, log });
  return { design, value: Math.round(runValueMUsd(known.mission, { agencyId: '', launchTurn: 0, spec, outcome: orbit.result, log: [], reachedOrbit: spec.dvMs >= known.mission.dvRequiredMs }, undefined, input.catalog) * 100) / 100 };
}
