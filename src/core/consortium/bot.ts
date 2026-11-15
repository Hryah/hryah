// Бот-агенція: обирає дію тими самими діями, що й людина, тож у кімнаті його не відрізнити від гравця.
// Ціль бота — найцінніший апарат, який він може собі дозволити, за оцінкою заглушок польоту й орбіти
// на тій місії, яку він знає (до першого запуску — номінальну). За хід бот наближає проєкт до цілі,
// а запускається, коли проєкт готовий і минула його «терплячість» (у різних агенцій різна).
// Чиста функція: той самий стан дає ту саму дію.

import type { Design, DesignInput, InstrumentDef, ModuleDef, SlotId } from '../contracts';
import { controlOf, launchBlockers, SLOTS, type DesignAction } from '../design';
import { buildSpec } from '../model';
import { deltaVMs, groundResolutionM } from '../physics';
import { developmentCostMUsd, MAX_APERTURE_M, MIN_APERTURE_M } from './develop';
import { RESEARCH } from './research';
import { stubFlight, stubOrbit } from '../stubs';
import { cargoKindOf, runValueMUsd, TUNING } from './reward';
import { hashSeed } from './seed';
import { activeAgency, type ConsortiumAction, type ConsortiumState } from './session';

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
const designKey = (d: Design) => `${d.modules.instrument}@${Math.floor(d.altKm / TUNING.altBandKm)}`;

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
  let modules = Object.fromEntries(SLOTS.map((slot, i) => [slot, [...bySlot[i]!].sort((a, b) => a.costMUsd - b.costMUsd)[0]!.id])) as Record<SlotId, string>;
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
  return best?.design ?? null;
}

// Наступна зміна, що наближає проєкт до цілі.
function nextChange(current: Design, target: Design): DesignAction | null {
  for (const slot of SLOTS) {
    if (current.modules[slot] !== target.modules[slot]) return { type: 'setModule', slot, moduleId: target.modules[slot] };
  }
  if (current.launcherId !== target.launcherId) return { type: 'setLauncher', launcherId: target.launcherId };
  if (current.fuelKg !== target.fuelKg) return { type: 'setFuel', fuelKg: target.fuelKg };
  if (current.altKm !== target.altKm) return { type: 'setAlt', altKm: target.altKm };
  return null;
}

// Скільки ходів вікна бот чекає перед запуском: 0..2 залежно від агенції.
export function botPatience(agencyId: string): number {
  return hashSeed(`patience:${agencyId}`) % 3;
}

// Порядок, у якому бот купує дослідження: спершу дешеве й корисне всім.
const RESEARCH_ORDER = ['scouting', 'series', 'test-stand', 'early-access', 'ind-manufacturing', 'ind-electronics', 'ind-optics', 'ind-chemistry', 'ind-metallurgy', 'ind-software', 'fast-track'];

// Каталог не дає потрібної різкості навіть на найнижчій орбіті: потрібне власне дзеркало.
function mirrorAperture(input: DesignInput): number | null {
  const { mission } = input;
  if (mission.kind === 'cargo') return null;
  const lo = mission.altRangeKm[0];
  const cams = input.catalog.modules.filter((m): m is InstrumentDef => m.slot === 'instrument');
  if (cams.some((c) => groundResolutionM(c.wavelengthM, lo, c.apertureM) <= mission.requiredResolutionM)) return null;
  const wavelength = cams[0]?.wavelengthM ?? 5.5e-7;
  const need = (1.22 * wavelength * lo * 1000) / mission.requiredResolutionM;
  const aperture = Math.ceil(need / 0.05) * 0.05;
  return aperture >= MIN_APERTURE_M && aperture <= MAX_APERTURE_M ? Math.round(aperture * 100) / 100 : null;
}

export function botAction(state: ConsortiumState): ConsortiumAction {
  const entry = activeAgency(state);
  if (!entry || entry.launch) return { type: 'wait' };
  // Дослідження не забирають дій ходу: купуємо, коли вистачає очок.
  const account = entry.account;
  if (account) {
    const pick = RESEARCH_ORDER.find((id) => RESEARCH[id] && !account.unlocked.includes(id) && account.researchPts >= RESEARCH[id]!.costPts);
    if (pick) return { type: 'research', nodeId: pick };
  }
  // Власне дзеркало, якщо каталог не дотягує до вимоги (Big Eye).
  const aperture = mirrorAperture(entry.design.input);
  if (aperture !== null && entry.actionsLeft > 0 && !entry.projects.some((p) => p.slot === 'instrument') && !entry.touched.includes('develop:instrument')) {
    const order = { slot: 'instrument' as const, apertureM: aperture, inspect: true };
    if (developmentCostMUsd(entry.agency, order) < entry.design.input.mission.budgetMUsd * 0.6) return { type: 'develop', order };
  }
  const others = state.agencies.filter((e) => e !== entry && e.launch);
  const taken: Taken = {
    designs: others.map((e) => designKey(e.launch!.spec.design)).sort(),
    cargo: others.map((e) => cargoKindOf(state.base.catalog, { agencyId: '', launchTurn: 0, spec: e.launch!.spec, outcome: { success: true, deliveredMb: 0, survivedOrbits: 0, score: 0 }, log: [] })).filter((k): k is NonNullable<typeof k> => k !== undefined).sort(),
  };
  const target = botTarget(entry.design.input, taken);
  if (target) {
    const change = nextChange(entry.design.design, target);
    if (change) {
      const control = controlOf(change);
      if (control && (entry.touched.includes(control) || entry.actionsLeft > 0)) return { type: 'design', action: change };
      return { type: 'wait' };
    }
  }
  const windowStart = state.campaign?.windowStartTurn ?? 0;
  const lastTurn = state.turn >= state.deadlineTurn;
  // Чекаємо на власне дзеркало, якщо воно ще не готове (але не довше за вікно).
  const mirrorPending = aperture !== null && entry.projects.some((p) => p.slot === 'instrument' && p.readyTurn > state.turn);
  const patient = state.turn - windowStart < botPatience(entry.agency.id) || mirrorPending;
  if (launchBlockers(entry.design).length === 0 && (!patient || lastTurn)) return { type: 'launch' };
  return { type: 'wait' };
}
