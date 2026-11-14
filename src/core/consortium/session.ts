// Сесія консорціуму: кілька агенцій по черзі за одним екраном працюють над однією місією.
// Хід агенції: до ACTIONS_PER_TURN змін проєкту, потім «запуск» (апарат зафіксовано) або «чекати»
// (ціни дешевшають, але дедлайн ближчий і цінність даних падає). Коли всі запустились або
// дедлайн минув, рахується нагорода. Польот і орбіта поки заглушки з stubs.ts.
//
// Стан: звичайні JSON-дані, step чиста. Рандому тут нема.

import type { CauseEntry, DesignInput, SpacecraftSpec } from '../contracts';
import { applyAgency, type AgencyProfile } from '../design/agency';
import { controlOf, designPhase, launchBlockers, type DesignAction, type DesignState } from '../design';
import { stubFlight, stubOrbit } from '../stubs';
import { applyDamage } from './damage';
import { defectDamage, developmentLog, isReady, startDevelopment, type DevOrder, type DevProject } from './develop';
import { applyMarket, checkMarket, type Market } from './market';
import { settleRewards, type AgencyRun, type Settlement } from './reward';

// Скільки різних елементів керування (слот, пальне, висота, носій) агенція може чіпати за хід.
// Повторні зміни вже зачепленого за цей хід елемента безкоштовні: пальне чи орбіту не доведеться тицяти по одному кроку.
export const ACTIONS_PER_TURN = 4;
export const DEFAULT_DEADLINE_TURN = 12;

export interface Launch {
  turn: number;
  spec: SpacecraftSpec;
  log: CauseEntry[];
}

export interface AgencyEntry {
  agency: AgencyProfile;
  design: DesignState;
  actionsLeft: number;
  touched: string[];       // елементи керування, зачеплені за цей хід
  projects: DevProject[];  // замовлена власна розробка: гроші списані одразу, модуль з'являється, коли готовий
  launch: Launch | null;
}

export interface ConsortiumState {
  base: DesignInput;       // місія й каталог без агенцій і ринку
  market: Market;
  deadlineTurn: number;
  seed: number;            // сід кидків браку: розробка однієї агенції не залежить від дій інших
  turn: number;            // поточний хід, з 0
  active: number;          // індекс агенції, що ходить
  agencies: AgencyEntry[];
  result: null | { runs: AgencyRun[]; settlement: Settlement };
}

export type ConsortiumAction =
  | { type: 'design'; action: DesignAction }
  | { type: 'develop'; order: DevOrder }
  | { type: 'launch' }
  | { type: 'wait' };

// Вхід частини 1 для агенції на конкретному ході: ринок часу + стартові умови країни.
// Власні розробки списують бюджет одразу, а готовий до цього ходу модуль додається в каталог (санкції його не стосуються).
export function inputFor(
  base: DesignInput, market: Market, agency: AgencyProfile, turn: number, projects: DevProject[] = [],
): DesignInput {
  const input = applyAgency(applyMarket(base, market, turn), agency);
  if (projects.length === 0) return input;
  const spent = projects.reduce((sum, p) => sum + p.developmentCostMUsd, 0);
  const ready = projects.filter((p) => isReady(p, turn)).map((p) => p.module);
  return {
    mission: { ...input.mission, budgetMUsd: Math.round((input.mission.budgetMUsd - spent) * 100) / 100 },
    catalog: { modules: [...input.catalog.modules, ...ready] },
  };
}

export function newConsortium(
  base: DesignInput, market: Market, agencies: AgencyProfile[], deadlineTurn = DEFAULT_DEADLINE_TURN, seed = 1,
): ConsortiumState {
  if (agencies.length === 0) throw new Error('Потрібна хоча б одна агенція');
  checkMarket(market);
  const entries: AgencyEntry[] = agencies.map((agency) => ({
    agency,
    design: designPhase.init(inputFor(base, market, agency, 0), 0),
    actionsLeft: ACTIONS_PER_TURN,
    touched: [],
    projects: [],
    launch: null,
  }));
  return { base, market, deadlineTurn, seed, turn: 0, active: 0, agencies: entries, result: null };
}

export function activeAgency(state: ConsortiumState): AgencyEntry | undefined {
  return state.agencies[state.active];
}

export function isFinished(state: ConsortiumState): boolean {
  return state.result !== null;
}

function replaceAt(state: ConsortiumState, index: number, entry: AgencyEntry): ConsortiumState {
  return { ...state, agencies: state.agencies.map((e, i) => (i === index ? entry : e)) };
}

// Новий ход: оновити ціни й відновити дії всім, хто ще не запустився.
function startTurn(state: ConsortiumState, turn: number): ConsortiumState {
  return {
    ...state,
    turn,
    agencies: state.agencies.map((e) =>
      e.launch
        ? e
        : { ...e, actionsLeft: ACTIONS_PER_TURN, touched: [], design: { ...e.design, input: inputFor(state.base, state.market, e.agency, turn, e.projects) } },
    ),
  };
}

function settle(state: ConsortiumState): ConsortiumState {
  const mission = state.base.mission;
  const runs: AgencyRun[] = [];
  for (const e of state.agencies) {
    if (!e.launch) continue; // не встигла до дедлайну: внеску нема
    // Брак власного модуля проявляється лише тут, після запуску: це пошкодження, яке читають усі частини.
    const used = e.projects.find((p) => p.module.id === e.design.design.modules.instrument);
    const damage = used ? defectDamage(used) : [];
    const spec = applyDamage(e.launch.spec, damage);
    const launchLog = [...e.launch.log, ...(used ? developmentLog(used) : [])];
    const flight = stubFlight({ mission, spec, log: launchLog });
    const orbit = stubOrbit({ mission, spec, flight: flight.result, log: [...launchLog, ...flight.log] });
    runs.push({
      agencyId: e.agency.id, launchTurn: e.launch.turn, spec: e.launch.spec, outcome: orbit.result,
      log: [...launchLog, ...flight.log, ...orbit.log],
    });
  }
  return { ...state, result: { runs, settlement: settleRewards(mission, runs) } };
}

// Передати хід наступній агенції, що ще не запустилась. Коли коло завершене, настає новий ход.
function endAgencyTurn(state: ConsortiumState): ConsortiumState {
  // Усі вже запустились: підсумок на поточному ході, без зайвого переходу на наступний.
  if (state.agencies.every((e) => e.launch)) return settle(state);
  const n = state.agencies.length;
  let next = state;
  let active = state.active;
  for (let i = 0; i < n; i++) {
    active += 1;
    if (active >= n) {
      active = 0;
      next = startTurn(next, next.turn + 1);
      if (next.turn > next.deadlineTurn) return settle({ ...next, turn: next.deadlineTurn });
    }
    if (!next.agencies[active]?.launch) return { ...next, active };
  }
  return settle(next);
}

export function stepConsortium(state: ConsortiumState, action: ConsortiumAction): ConsortiumState {
  if (state.result) return state;
  const entry = activeAgency(state);
  if (!entry || entry.launch) return state;

  switch (action.type) {
    case 'design': {
      // Запуск іде окремою дією, щоб рахувався ход.
      const control = controlOf(action.action);
      if (control === null) return state;
      const already = entry.touched.includes(control);
      if (!already && entry.actionsLeft <= 0) return state;
      const design = designPhase.step(entry.design, action.action);
      if (design === entry.design) return state; // порожня дія не коштує нічого
      return replaceAt(state, state.active, already
        ? { ...entry, design }
        : { ...entry, design, actionsLeft: entry.actionsLeft - 1, touched: [...entry.touched, control] });
    }
    case 'develop': {
      // Одне замовлення на слот і одна дія за хід; гроші списуються одразу, тож бюджету має вистачити.
      const control = `develop:${action.order.slot}`;
      if (entry.touched.includes(control) || entry.actionsLeft <= 0) return state;
      if (entry.projects.some((p) => p.slot === action.order.slot)) return state;
      let project: DevProject;
      try {
        project = startDevelopment(entry.agency, action.order, state.turn, state.seed);
      } catch {
        return state;
      }
      const input = inputFor(state.base, state.market, entry.agency, state.turn, [...entry.projects, project]);
      if (input.mission.budgetMUsd <= 0) return state;
      return replaceAt(state, state.active, {
        ...entry,
        projects: [...entry.projects, project],
        design: { ...entry.design, input },
        actionsLeft: entry.actionsLeft - 1,
        touched: [...entry.touched, control],
      });
    }
    case 'launch': {
      if (launchBlockers(entry.design).length > 0) return state;
      const frozen = designPhase.step(entry.design, { type: 'confirm' });
      const { result, log } = designPhase.finish(frozen);
      const launched: AgencyEntry = { ...entry, design: frozen, launch: { turn: state.turn, spec: result, log } };
      return endAgencyTurn(replaceAt(state, state.active, launched));
    }
    case 'wait':
      return endAgencyTurn(state);
  }
}
