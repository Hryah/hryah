// Сесія консорціуму: кілька агенцій по черзі за одним екраном працюють над однією місією.
// Хід агенції: до ACTIONS_PER_TURN змін проєкту, потім «запуск» (апарат зафіксовано) або «чекати»
// (ціни дешевшають, але дедлайн ближчий і цінність даних падає). Коли всі запустились або
// дедлайн минув, рахується нагорода. Польот і орбіта поки заглушки з stubs.ts.
//
// Стан: звичайні JSON-дані, step чиста. Рандому тут нема.

import type { CauseEntry, DesignInput, SpacecraftSpec } from '../contracts';
import { applyAgency, type AgencyProfile } from '../design/agency';
import { designPhase, launchBlockers, type DesignAction, type DesignState } from '../design';
import { stubFlight, stubOrbit } from '../stubs';
import { applyMarket, checkMarket, type Market } from './market';
import { settleRewards, type AgencyRun, type Settlement } from './reward';

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
  launch: Launch | null;
}

export interface ConsortiumState {
  base: DesignInput;       // місія й каталог без агенцій і ринку
  market: Market;
  deadlineTurn: number;
  turn: number;            // поточний хід, з 0
  active: number;          // індекс агенції, що ходить
  agencies: AgencyEntry[];
  result: null | { runs: AgencyRun[]; settlement: Settlement };
}

export type ConsortiumAction =
  | { type: 'design'; action: DesignAction }
  | { type: 'launch' }
  | { type: 'wait' };

// Вхід частини 1 для агенції на конкретному ході: ринок часу + стартові умови країни.
export function inputFor(base: DesignInput, market: Market, agency: AgencyProfile, turn: number): DesignInput {
  return applyAgency(applyMarket(base, market, turn), agency);
}

export function newConsortium(
  base: DesignInput, market: Market, agencies: AgencyProfile[], deadlineTurn = DEFAULT_DEADLINE_TURN,
): ConsortiumState {
  if (agencies.length === 0) throw new Error('Потрібна хоча б одна агенція');
  checkMarket(market);
  const entries: AgencyEntry[] = agencies.map((agency) => ({
    agency,
    design: designPhase.init(inputFor(base, market, agency, 0), 0),
    actionsLeft: ACTIONS_PER_TURN,
    launch: null,
  }));
  return { base, market, deadlineTurn, turn: 0, active: 0, agencies: entries, result: null };
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
        : { ...e, actionsLeft: ACTIONS_PER_TURN, design: { ...e.design, input: inputFor(state.base, state.market, e.agency, turn) } },
    ),
  };
}

function settle(state: ConsortiumState): ConsortiumState {
  const mission = state.base.mission;
  const runs: AgencyRun[] = [];
  for (const e of state.agencies) {
    if (!e.launch) continue; // не встигла до дедлайну: внеску нема
    const flight = stubFlight({ mission, spec: e.launch.spec, log: e.launch.log });
    const orbit = stubOrbit({ mission, spec: e.launch.spec, flight: flight.result, log: [...e.launch.log, ...flight.log] });
    runs.push({ agencyId: e.agency.id, launchTurn: e.launch.turn, spec: e.launch.spec, outcome: orbit.result });
  }
  return { ...state, result: { runs, settlement: settleRewards(mission, runs) } };
}

// Передати хід наступній агенції, що ще не запустилась. Коли коло завершене, настає новий ход.
function endAgencyTurn(state: ConsortiumState): ConsortiumState {
  const n = state.agencies.length;
  let next = state;
  let active = state.active;
  for (let i = 0; i < n; i++) {
    active += 1;
    if (active >= n) {
      active = 0;
      next = startTurn(next, next.turn + 1);
      if (next.turn > next.deadlineTurn) return settle(next);
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
      if (action.action.type === 'confirm' || entry.actionsLeft <= 0) return state;
      const design = designPhase.step(entry.design, action.action);
      if (design === entry.design) return state; // порожня дія не коштує нічого
      return replaceAt(state, state.active, { ...entry, design, actionsLeft: entry.actionsLeft - 1 });
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
