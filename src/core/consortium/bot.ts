// Бот-агенція: обирає дію тими самими діями, що й людина, тож у кімнаті його не відрізнити від гравця.
// Ціль бота — найцінніший апарат, який він може собі дозволити, за оцінкою заглушок польоту й орбіти
// на тій місії, яку він знає (до першого запуску — номінальну). За хід бот наближає проєкт до цілі,
// а запускається, коли проєкт готовий і минула його «терплячість» (у різних агенцій різна).
// Чиста функція: той самий стан дає ту саму дію.

import type { Design, DesignInput, InstrumentDef } from '../contracts';
import { controlOf, launchBlockers, SLOTS, type DesignAction } from '../design';
import { groundResolutionM } from '../physics';
import { developmentCostMUsd, MAX_APERTURE_M, MIN_APERTURE_M } from './develop';
import { RESEARCH } from './research';
import { cargoKindOf } from './reward';
import { botTarget, designKey, type Taken } from './planner';
export { botTarget } from './planner';
import { hashSeed } from './seed';
import { activeAgency, type ConsortiumAction, type ConsortiumState } from './session';

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
    cargo: others.map((e) => cargoKindOf(state.base.catalog, { spec: e.launch!.spec })).filter((k): k is NonNullable<typeof k> => k !== undefined).sort(),
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
