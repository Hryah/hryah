// Сесія консорціуму: кілька агенцій по черзі за одним екраном працюють над однією місією.
// Хід агенції: до ACTIONS_PER_TURN змін проєкту, потім «запуск» (апарат зафіксовано) або «чекати»
// (ціни дешевшають, але дедлайн ближчий і цінність даних падає). Коли всі запустились або
// дедлайн минув, рахується нагорода.
//
// Кампанія (campaign у стані): те саме, але вікон запуску кілька. Після вікна рахується виплата й грант,
// агенції отримують гроші й очки досліджень, і починається нове вікно з тим самим календарем ходів.
// Гравці-люди після запуску самі грають політ і орбіту й надсилають звіт (applyReport); вікно не закривається,
// доки звіти не надійшли. Без звіту (бот, вийшов) політ і орбіта рахуються заглушками.
//
// Стан: звичайні JSON-дані, step чиста. Рандому тут нема.

import type { CauseEntry, Damage, Design, DesignInput, Mission, SpacecraftSpec } from '../contracts';
import { applyAgency, type AgencyProfile } from '../design/agency';
import { controlOf, designPhase, launchBlockers, type DesignAction, type DesignState } from '../design';
import { stubFlight, stubOrbit } from '../stubs';
import {
  checkCampaign, hiddenMission, missionSeeds, pickReport, replayOrbit, sanitizeFlight, type CampaignConfig, type MissionReport,
} from './campaign';
import { applyDamage } from './damage';
import { defectDamage, developmentLog, isReady, startDevelopment, type DevOrder, type DevProject } from './develop';
import { applyMarket, checkMarket, type Market } from './market';
import { applyResearch, RESEARCH } from './research';
import { qualifyCostMUsd, rollTrlFailures, trlOf } from './trl';
import { optimalValue } from './planner';
import {
  depositsOf, emptyFactory, glassDefectFactor, MATERIALS, planBatch, readyModules, type FactoryOrder, type FactoryState,
} from '../factory';
import { runValueMUsd, settleRewards, type AgencyRun, type Settlement } from './reward';

// Скільки різних елементів керування (слот, пальне, висота, носій) агенція може чіпати за хід.
// Повторні зміни вже зачепленого за цей хід елемента безкоштовні: пальне чи орбіту не доведеться тицяти по одному кроку.
export const ACTIONS_PER_TURN = 4;
export const DEFAULT_DEADLINE_TURN = 12;

export interface Launch {
  turn: number;
  spec: SpacecraftSpec;
  log: CauseEntry[];
  damage?: Damage[];       // відмови незрілих технологій (TRL), що проявились після запуску
}

// Рахунок агенції в кампанії.
export interface Account {
  fundsMUsd: number;
  researchPts: number;
  programPts: number;        // внесок у наукову програму за всі вікна
  knowsConditions: boolean;  // після першого запуску агенція знає справжні умови місії
  missedInRow: number;       // скільки вікон поспіль без запуску
  unlocked: string[];        // відкриті вузли досліджень
  trlGain?: Record<string, number>; // досвід агенції з модулем: +1 TRL за вдалий запуск чи наземні випробування
  lastDesign?: Design;       // проєкт останнього запуску (для серії)
}

export interface AgencyEntry {
  agency: AgencyProfile;
  design: DesignState;
  actionsLeft: number;
  touched: string[];       // елементи керування, зачеплені за цей хід
  projects: DevProject[];  // замовлена власна розробка: гроші списані одразу, модуль з'являється, коли готовий
  launch: Launch | null;
  account?: Account;       // лише в кампанії
  factory?: FactoryState;  // лише в кампанії: партії власного виробництва
  report?: MissionReport;  // звіт гравця про політ і орбіту цього вікна
}

export interface AgencyRoundResult {
  agencyId: string;
  launched: boolean;
  valuePts: number;
  payoutMUsd: number;
  grantMUsd: number;
  researchPts: number;
  optimalPts: number;      // скільки дав би найкращий доступний проєкт зі знанням справжніх умов (для розбору)
  optimalDesign?: Design;
}

export interface RoundSummary {
  round: number;
  runs: AgencyRun[];
  settlement: Settlement;
  agencies: AgencyRoundResult[];
}

export interface CampaignState {
  config: CampaignConfig;
  round: number;           // поточне вікно, з 0
  windowStartTurn: number;
  trueMission: Mission;    // справжні умови; агенція бачить їх у проєктуванні лише після першого запуску
  rounds: RoundSummary[];  // підсумки закритих вікон
  scenarioId?: string;     // сценарій кімнати (для брифінгу, назви й реальної місії-аналога)
}

export interface ConsortiumState {
  base: DesignInput;       // місія й каталог без агенцій і ринку
  market: Market;
  deadlineTurn: number;    // останній хід поточного вікна
  seed: number;            // сід кидків браку: розробка однієї агенції не залежить від дій інших
  turn: number;            // поточний хід, з 0 (у кампанії наскрізний)
  active: number;          // індекс агенції, що ходить
  agencies: AgencyEntry[];
  result: null | { runs: AgencyRun[]; settlement: Settlement };
  campaign?: CampaignState;
  reportsFrom?: string[];  // агенції, від яких чекаємо звіт про політ і орбіту (люди)
  awaiting?: boolean;      // вікно скінчилось, але ще не всі звіти надійшли
}

export type ConsortiumAction =
  | { type: 'design'; action: DesignAction }
  | { type: 'develop'; order: DevOrder }
  | { type: 'launch' }
  | { type: 'wait' }
  | { type: 'research'; nodeId: string }
  | { type: 'factory'; order: FactoryOrder }
  | { type: 'analyze'; line: string; depositId: string }
  | { type: 'qualify'; moduleId: string };

export interface ConsortiumOptions {
  campaign?: CampaignConfig;
  scenarioId?: string;
  reportsFrom?: string[];
}

const money = (x: number) => Math.round(x * 100) / 100 + 0;

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

// Яку місію бачить агенція: номінальну, поки не запускалась, або справжню.
export function knownMission(state: Pick<ConsortiumState, 'base' | 'campaign'>, entry: Pick<AgencyEntry, 'account'>): Mission {
  return state.campaign && entry.account?.knowsConditions ? state.campaign.trueMission : state.base.mission;
}

// Вхід частини 1 з урахуванням кампанії: бюджет — це рахунок агенції (розробки вже списані з нього).
function entryInput(
  state: Pick<ConsortiumState, 'base' | 'market' | 'campaign'>, agency: AgencyProfile, turn: number,
  projects: DevProject[], account: Account | undefined, factory?: FactoryState,
): DesignInput {
  if (!state.campaign || !account) return inputFor(state.base, state.market, agency, turn, projects);
  const mission = knownMission(state, { account });
  const input = applyAgency(applyMarket({ mission, catalog: state.base.catalog }, state.market, turn + (agency.marketLeadTurns ?? 0)), agency);
  const ready = projects.filter((p) => isReady(p, turn)).map((p) => p.module);
  return {
    mission: { ...input.mission, budgetMUsd: money(account.fundsMUsd) },
    catalog: { modules: [...input.catalog.modules, ...ready, ...readyModules(factory, turn)] },
  };
}

export function newConsortium(
  base: DesignInput, market: Market, agencies: AgencyProfile[], deadlineTurn = DEFAULT_DEADLINE_TURN, seed = 1,
  options: ConsortiumOptions = {},
): ConsortiumState {
  if (agencies.length === 0) throw new Error('Потрібна хоча б одна агенція');
  checkMarket(market);
  const config = options.campaign;
  if (config) checkCampaign(config);
  const campaign: CampaignState | undefined = config
    ? { config, round: 0, windowStartTurn: 0, trueMission: hiddenMission(base.mission, seed), rounds: [], ...(options.scenarioId ? { scenarioId: options.scenarioId } : {}) }
    : undefined;
  const head = { base, market, ...(campaign ? { campaign } : {}) };
  const entries: AgencyEntry[] = agencies.map((agency) => {
    const account: Account | undefined = campaign
      ? { fundsMUsd: money(base.mission.budgetMUsd * agency.budgetFactor), researchPts: 0, programPts: 0, knowsConditions: false, missedInRow: 0, unlocked: [] }
      : undefined;
    return {
      agency,
      design: fitLauncher(designPhase.init(entryInput(head, agency, 0, [], account), 0), Boolean(campaign)),
      actionsLeft: ACTIONS_PER_TURN,
      touched: [],
      projects: [],
      launch: null,
      ...(account ? { account, factory: emptyFactory() } : {}),
    };
  });
  return {
    ...head,
    deadlineTurn: campaign ? config!.windowTurns - 1 : deadlineTurn,
    seed, turn: 0, active: 0, agencies: entries, result: null,
    ...(options.reportsFrom && options.reportsFrom.length > 0 ? { reportsFrom: [...options.reportsFrom] } : {}),
  };
}

// Стартовий проєкт кампанії одразу на носії, що витягує його масу: інакше перший запуск новачка блокується масою
// без пояснення. Одиночна місія лишається як була (там вибір носія — частина навчання).
function fitLauncher(design: DesignState, enabled: boolean): DesignState {
  if (!enabled || !launchBlockers(design).includes('mass')) return design;
  const launchers = [...design.input.mission.launchers].sort((a, b) => a.maxPayloadKg - b.maxPayloadKg);
  for (const l of launchers) {
    const next = designPhase.step(design, { type: 'setLauncher', launcherId: l.id });
    if (!launchBlockers(next).includes('mass')) return next;
  }
  return design;
}

// Профіль агенції для власної розробки: скло з власної фабрики впливає на брак дзеркала.
// Ним користуються і ядро, і екран (оцінка ризику), щоб цифри збігались.
export function developerProfile(entry: AgencyEntry, turn: number): AgencyProfile {
  const glass = glassDefectFactor(entry.factory, turn);
  return glass === 1 ? entry.agency : { ...entry.agency, defectFactor: (entry.agency.defectFactor ?? 1) * glass };
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
        : { ...e, actionsLeft: ACTIONS_PER_TURN, touched: [], design: { ...e.design, input: entryInput(state, e.agency, turn, e.projects, e.account, e.factory) } },
    ),
  };
}

// Апарат, який реально полетів: брак власного модуля проявляється після запуску як пошкодження.
export function flownSpec(entry: AgencyEntry): SpacecraftSpec | null {
  if (!entry.launch) return null;
  const used = entry.projects.find((p) => p.module.id === entry.design.design.modules.instrument);
  return applyDamage(entry.launch.spec, [...(used ? defectDamage(used) : []), ...(entry.launch.damage ?? [])]);
}

function launchLog(entry: AgencyEntry): CauseEntry[] {
  if (!entry.launch) return [];
  const used = entry.projects.find((p) => p.module.id === entry.design.design.modules.instrument);
  return [...entry.launch.log, ...(used ? developmentLog(used) : [])];
}

// Місія, яку агенція реально виконує (у кампанії — справжні умови).
export function flownMission(state: ConsortiumState): Mission {
  return state.campaign ? state.campaign.trueMission : state.base.mission;
}

// Сіди польоту й орбіти, з якими гравець має грати свій запуск у цьому вікні.
export function seedsFor(state: ConsortiumState, agencyId: string): { flight: number; orbit: number } {
  return missionSeeds(state.seed, agencyId, state.campaign?.round ?? 0);
}

function runOf(state: ConsortiumState, e: AgencyEntry): AgencyRun | null {
  const spec = flownSpec(e);
  if (!e.launch || !spec) return null;
  const mission = flownMission(state);
  const log = launchLog(e);
  const windowStart = state.campaign?.windowStartTurn ?? 0;
  let flightLog: CauseEntry[] = [];
  let orbitOut;
  if (e.report) {
    const flight = sanitizeFlight(mission, spec, e.report.flight);
    orbitOut = replayOrbit(mission, spec, flight, log, e.report.orbitActions, seedsFor(state, e.agency.id).orbit);
  } else {
    const flight = stubFlight({ mission, spec, log });
    flightLog = flight.log;
    orbitOut = stubOrbit({ mission, spec, flight: flight.result, log: [...log, ...flight.log] });
  }
  return {
    agencyId: e.agency.id, launchTurn: e.launch.turn - windowStart, spec, outcome: orbitOut.result,
    log: [...log, ...flightLog, ...orbitOut.log],
  };
}

// Хто запустився у цьому вікні, але ще не надіслав звіт.
export function pendingReports(state: ConsortiumState): string[] {
  const from = state.reportsFrom ?? [];
  return state.agencies.filter((e) => e.launch && !e.report && from.includes(e.agency.id)).map((e) => e.agency.id);
}

function settle(state: ConsortiumState): ConsortiumState {
  if (pendingReports(state).length > 0) return { ...state, awaiting: true };
  const ready = state.awaiting ? { ...state, awaiting: false } : state;
  if (ready.campaign) return closeRound(ready);
  const runs = ready.agencies.map((e) => runOf(ready, e)).filter((r): r is AgencyRun => r !== null);
  const { awaiting: _a, ...rest } = ready;
  return { ...rest, result: { runs, settlement: settleRewards(ready.base.mission, runs, undefined, ready.base.catalog) } };
}

// Кінець вікна в кампанії: виплати, гранти, дослідження, потім нове вікно або підсумок кампанії.
function closeRound(state: ConsortiumState): ConsortiumState {
  const campaign = state.campaign!;
  const { config } = campaign;
  const mission = campaign.trueMission;
  const runs = state.agencies.map((e) => runOf(state, e)).filter((r): r is AgencyRun => r !== null);
  const settlement = settleRewards(mission, runs, undefined, state.base.catalog);

  const results: AgencyRoundResult[] = [];
  const agencies = state.agencies.map((e) => {
    const run = runs.find((r) => r.agencyId === e.agency.id);
    const account = e.account!;
    const launched = run !== undefined;
    // Внесок у програму — та сама цінність, що й у виплаті (для вантажу з урахуванням повторів).
    const valuePts = run ? settlement.payouts.find((p) => p.agencyId === e.agency.id)?.valueMUsd ?? 0 : 0;
    const payoutMUsd = settlement.payouts.find((p) => p.agencyId === e.agency.id)?.payoutMUsd ?? 0;
    const missedInRow = launched ? 0 : account.missedInRow + 1;
    const grantFactor = launched ? 1 : missedInRow >= 2 ? config.missedTwiceGrantFactor : config.missedGrantFactor;
    const grantMUsd = money(config.grantMUsd * grantFactor);
    const researchPts = (run ? Math.floor(run.outcome.deliveredMb / config.mbPerResearchPt) : 0) + (launched ? 0 : config.missedResearchPts);
    const optimal = optimalValue(e.design.input, mission);
    results.push({
      agencyId: e.agency.id, launched, valuePts: money(valuePts), payoutMUsd, grantMUsd, researchPts,
      optimalPts: optimal.value, ...(optimal.design ? { optimalDesign: optimal.design } : {}),
    });
    const next: Account = {
      fundsMUsd: money(account.fundsMUsd + payoutMUsd + grantMUsd),
      researchPts: account.researchPts + researchPts,
      programPts: money(account.programPts + valuePts),
      knowsConditions: account.knowsConditions || launched,
      missedInRow,
      unlocked: account.unlocked,
      ...(e.launch ? { trlGain: flightHeritage(account.trlGain ?? {}, e) } : account.trlGain ? { trlGain: account.trlGain } : {}),
      ...(e.launch ? { lastDesign: e.launch.spec.design } : account.lastDesign ? { lastDesign: account.lastDesign } : {}),
    };
    return { ...e, account: next };
  });

  const summary: RoundSummary = { round: campaign.round, runs, settlement, agencies: results };
  const total = agencies.reduce((sum, e) => sum + (e.account?.programPts ?? 0), 0);
  const nextCampaign: CampaignState = { ...campaign, rounds: [...campaign.rounds, summary] };
  const done = campaign.round + 1 >= config.rounds || total >= config.programGoal;
  if (done) {
    // Сирі звіти (до 400 дій орбіти на гравця) після підсумку не потрібні: не тягнемо їх у фінальний стан.
    const clean = agencies.map((e) => { const { report: _r, ...rest } = e; return rest; });
    return { ...state, agencies: clean, campaign: nextCampaign, result: { runs, settlement } };
  }

  // Нове вікно: календар іде далі, проєкт агенції лишається (друге коло коротше), звіти скидаються.
  const turn = state.turn + 1;
  const opened: CampaignState = { ...nextCampaign, round: campaign.round + 1, windowStartTurn: turn };
  const head = { ...state, campaign: opened };
  return {
    ...head,
    turn,
    deadlineTurn: turn + config.windowTurns - 1,
    active: 0,
    agencies: agencies.map((e) => {
      const { report: _r, ...rest } = e;
      return {
        ...rest,
        launch: null,
        actionsLeft: ACTIONS_PER_TURN,
        touched: [],
        design: { ...e.design, confirmed: false, input: entryInput(head, e.agency, turn, e.projects, e.account, e.factory) },
      };
    }),
  };
}

// Прогрес наукової програми, 0..1.
export function programProgress(state: ConsortiumState): number {
  if (!state.campaign) return 0;
  const total = state.agencies.reduce((sum, e) => sum + (e.account?.programPts ?? 0), 0);
  return Math.min(1, total / state.campaign.config.programGoal);
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

// Звіт гравця про політ і орбіту свого запуску в поточному вікні. Приймається незалежно від черги ходу.
export function applyReport(state: ConsortiumState, agencyId: string, report: MissionReport): ConsortiumState {
  if (state.result || !(state.reportsFrom ?? []).includes(agencyId)) return state;
  const index = state.agencies.findIndex((e) => e.agency.id === agencyId);
  const entry = state.agencies[index];
  if (!entry || !entry.launch || entry.report) return state;
  const next = replaceAt(state, index, {
    ...entry,
    report: pickReport(report),
  });
  return next.awaiting ? settle(next) : next;
}

// Від агенції більше не чекаємо звіту (гравець вийшов): її запуск рахується заглушками.
export function forfeitReport(state: ConsortiumState, agencyId: string): ConsortiumState {
  if (!(state.reportsFrom ?? []).includes(agencyId)) return state;
  const next = { ...state, reportsFrom: (state.reportsFrom ?? []).filter((id) => id !== agencyId) };
  return next.awaiting && !next.result ? settle(next) : next;
}

export function stepConsortium(state: ConsortiumState, action: ConsortiumAction): ConsortiumState {
  if (state.result || state.awaiting) return state;
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
        project = startDevelopment(developerProfile(entry, state.turn), action.order, state.turn, state.seed);
      } catch {
        return state;
      }
      const account = entry.account
        ? { ...entry.account, fundsMUsd: money(entry.account.fundsMUsd - project.developmentCostMUsd) }
        : undefined;
      const projects = [...entry.projects, project];
      const input = entryInput(state, entry.agency, state.turn, projects, account, entry.factory);
      if (input.mission.budgetMUsd <= 0) return state;
      return replaceAt(state, state.active, {
        ...entry,
        projects,
        design: { ...entry.design, input },
        actionsLeft: entry.actionsLeft - 1,
        touched: [...entry.touched, control],
        ...(account ? { account } : {}),
      });
    }
    case 'launch': {
      if (launchBlockers(entry.design).length > 0) return state;
      const frozen = designPhase.step(entry.design, { type: 'confirm' });
      const { result, log } = designPhase.finish(frozen);
      // Серія: повторний запуск того самого проєкту дешевший (частина ціни повертається).
      const series = entry.account?.unlocked.includes('series') && sameDesign(entry.account.lastDesign, result.design);
      const refund = series ? result.costMUsd * seriesRefund() : 0;
      const account = entry.account
        ? { ...entry.account, fundsMUsd: money(entry.account.fundsMUsd - result.costMUsd + refund) }
        : undefined;
      // Незрілі технології можуть відмовити після запуску (лише в кампанії: там є досвід і випробування).
      const trl = account
        ? rollTrlFailures(state.seed, entry.agency.id, state.campaign?.round ?? 0, result.design, account.trlGain ?? {}, state.base.catalog.modules.map((m) => m.id))
        : { damage: [], log: [] };
      const launch = { turn: state.turn, spec: result, log: [...log, ...trl.log], ...(trl.damage.length ? { damage: trl.damage } : {}) };
      const launched: AgencyEntry = { ...entry, design: frozen, launch, ...(account ? { account } : {}) };
      return endAgencyTurn(replaceAt(state, state.active, launched));
    }
    case 'wait':
      return endAgencyTurn(state);
    case 'factory':
    case 'analyze':
      return stepFactory(state, entry, action);
    case 'qualify': {
      // Наземні випробування модуля: 1 дія й трохи грошей, +1 TRL для цієї агенції.
      const account = entry.account;
      const module = entry.design.input.catalog.modules.find((m) => m.id === action.moduleId);
      if (!account || !module || entry.actionsLeft <= 0 || entry.touched.includes(`qualify:${module.id}`)) return state;
      const gain = account.trlGain ?? {};
      if (trlOf(module.id, gain, state.base.catalog.modules.map((m) => m.id)) >= 9) return state;
      const cost = qualifyCostMUsd(module.costMUsd);
      if (account.fundsMUsd <= cost) return state;
      const next: Account = { ...account, fundsMUsd: money(account.fundsMUsd - cost), trlGain: { ...gain, [module.id]: (gain[module.id] ?? 0) + 1 } };
      return replaceAt(state, state.active, {
        ...entry, account: next, actionsLeft: entry.actionsLeft - 1, touched: [...entry.touched, `qualify:${module.id}`],
        design: { ...entry.design, input: entryInput(state, entry.agency, state.turn, entry.projects, next, entry.factory) },
      });
    }
    case 'research': {
      // Дослідження не забирає дій ходу: лише очки.
      const node = RESEARCH[action.nodeId];
      const account = entry.account;
      if (!node || !account || account.unlocked.includes(node.id) || account.researchPts < node.costPts) return state;
      const agency = applyResearch(entry.agency, node);
      const next: Account = {
        ...account,
        researchPts: account.researchPts - node.costPts,
        unlocked: [...account.unlocked, node.id],
        knowsConditions: account.knowsConditions || node.effect.kind === 'scout',
      };
      return replaceAt(state, state.active, {
        ...entry, agency, account: next,
        design: { ...entry.design, input: entryInput(state, agency, state.turn, entry.projects, next, entry.factory) },
      });
    }
  }
}

function stepFactory(state: ConsortiumState, entry: AgencyEntry, action: Extract<ConsortiumAction, { type: 'factory' | 'analyze' }>): ConsortiumState {
  const { account, factory } = entry;
  if (!account || !factory || entry.actionsLeft <= 0) return state;
  if (action.type === 'analyze') {
    const key = `${action.line}:${action.depositId}`;
    if (factory.analyzed.includes(key) || !depositsOf(entry.agency.id, action.line).includes(action.depositId)) return state;
    if (account.fundsMUsd < MATERIALS.analyzeCostMUsd) return state;
    const nextAccount = { ...account, fundsMUsd: money(account.fundsMUsd - MATERIALS.analyzeCostMUsd) };
    return replaceAt(state, state.active, {
      ...entry, account: nextAccount, factory: { ...factory, analyzed: [...factory.analyzed, key] }, actionsLeft: entry.actionsLeft - 1,
      design: { ...entry.design, input: entryInput(state, entry.agency, state.turn, entry.projects, nextAccount, entry.factory) },
    });
  }
  // Базою партії може бути лише те, що агенція бачить зараз: без санкційних і ще не відкритих ринком модулів.
  const plan = planBatch(entry.agency, factory, action.order, state.turn, entry.design.input.catalog.modules);
  if (!plan.batch || account.fundsMUsd <= plan.batch.costMUsd) return state;
  const nextAccount = { ...account, fundsMUsd: money(account.fundsMUsd - plan.batch.costMUsd) };
  const nextFactory = { ...factory, batches: [...factory.batches, plan.batch] };
  return replaceAt(state, state.active, {
    ...entry, account: nextAccount, factory: nextFactory, actionsLeft: entry.actionsLeft - 1,
    design: { ...entry.design, input: entryInput(state, entry.agency, state.turn, entry.projects, nextAccount, nextFactory) },
  });
}

// Вдалий запуск — це досвід: кожен модуль, що не відмовив, стає на рівень зрілішим для цієї агенції.
function flightHeritage(gain: Record<string, number>, e: AgencyEntry): Record<string, number> {
  const failed = new Set((e.launch?.log ?? []).filter((x) => x.id.startsWith('design:trl-')).map((x) => String(x.params?.module)));
  const next = { ...gain };
  for (const id of Object.values(e.launch!.spec.design.modules)) if (!failed.has(id)) next[id] = (next[id] ?? 0) + 1;
  return next;
}

function sameDesign(a: Design | undefined, b: Design): boolean {
  return a !== undefined && JSON.stringify(a.modules) === JSON.stringify(b.modules) && a.launcherId === b.launcherId;
}

function seriesRefund(): number {
  const e = RESEARCH.series?.effect;
  return e && e.kind === 'series' ? e.refund : 0;
}
