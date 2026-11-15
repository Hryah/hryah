// Кімната консорціуму: лобі (місця, вибір країн, монета при конфліктах) і гра після старту.
// Один і той самий редуктор працює і за одним екраном (клієнт сам шле дії від імені активного гравця),
// і онлайн (сервер перевіряє, що дію шле власник активної агенції). Стан чисті JSON-дані, рандому нема:
// монета береться з rolls(сід кімнати, ключ).

import type { DesignInput } from '../contracts';
import type { AgencyProfile } from '../design/agency';
import type { Market } from './market';
import { rolls } from './seed';
import { botAction } from './bot';
import { isMissionReport, type CampaignConfig, type MissionReport } from './campaign';
import { DEFAULT_SCENARIO, type ScenarioSetup } from './scenarios';
import {
  activeAgency, applyReport, forfeitReport, newConsortium, stepConsortium, type ConsortiumAction, type ConsortiumState,
} from './session';

export const MAX_PLAYERS = 4;

export interface Player {
  id: string;
  name: string;
  wish: string | null; // бажана агенція; null: байдуже, дістанеться вільна
  ready: boolean;
  bot?: boolean;      // місце займає бот: ходить сам, звіту про політ не надсилає
}

export interface Assignment {
  playerId: string;
  agencyId: string;
  // 'free': ніхто інший не хотів; 'coin': виграла монета; 'lost': програла монету й отримала вільну; 'auto': без бажання
  how: 'free' | 'coin' | 'lost' | 'auto';
}

export interface LobbyState {
  phase: 'lobby';
  seed: number;
  hostId: string;
  players: Player[];
  agencyIds: string[];        // агенції, доступні в цій кімнаті; їхній порядок задає порядок ходів у грі
  minPlayers: number;
  scenarioId?: string;        // сценарій кампанії, обраний господарем
}

export interface PlayState {
  phase: 'play';
  seed: number;
  assignments: Assignment[];  // порядок збігається з порядком агенцій у consortium
  playerNames: Record<string, string>; // імена, щоб екран показував, чий хід
  left: string[];             // хто вийшов під час гри: їхні агенції більше не ходять (лише «чекати»)
  bots?: string[];            // id гравців-ботів
  consortium: ConsortiumState;
}

export type RoomState = LobbyState | PlayState;

export type RoomAction =
  | { type: 'join'; name: string }
  | { type: 'leave' }
  | { type: 'wish'; agencyId: string | null }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'addBot' }
  | { type: 'scenario'; scenarioId: string }
  | { type: 'removeBot'; playerId: string }
  | { type: 'play'; action: ConsortiumAction }
  | { type: 'report'; report: MissionReport };

// Чи має значення вигляд дії кімнати. Сервер публічний, тому перевіряємо не лише тип, а й поля, включно з вкладеними
// діями гравця: чужий JSON не повинен потрапити в step. Лише форма (типи); сенс (чи є такий модуль) лишається за step.
const SLOT_IDS = ['engine', 'solar', 'battery', 'antenna', 'instrument'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

function isConsortiumAction(a: unknown): a is ConsortiumAction {
  if (!isObj(a)) return false;
  switch (a.type) {
    case 'launch': case 'wait': return true;
    case 'research': return isStr(a.nodeId);
    case 'analyze': return isStr(a.line) && isStr(a.depositId);
    case 'qualify': return isStr(a.moduleId);
    case 'factory': {
      const o = a.order;
      return isObj(o) && isStr(o.line) && isStr(o.depositId) && isStr(o.baseModuleId)
        && Array.isArray(o.steps) && o.steps.length === 2 && o.steps.every(isStr);
    }
    case 'develop': {
      const o = a.order;
      return isObj(o) && o.slot === 'instrument' && isNum(o.apertureM) && typeof o.inspect === 'boolean';
    }
    case 'design': {
      const d = a.action;
      if (!isObj(d)) return false;
      switch (d.type) {
        case 'setModule': return typeof d.slot === 'string' && SLOT_IDS.includes(d.slot) && isStr(d.moduleId);
        case 'setFuel': return isNum(d.fuelKg);
        case 'setAlt': return isNum(d.altKm);
        case 'setLauncher': return isStr(d.launcherId);
        default: return false; // confirm іде окремою дією launch
      }
    }
    default: return false;
  }
}

export function isRoomAction(a: unknown): a is RoomAction {
  if (!isObj(a)) return false;
  switch (a.type) {
    case 'join': return typeof a.name === 'string';
    case 'ready': return typeof a.ready === 'boolean';
    case 'wish': return a.agencyId === null || isStr(a.agencyId);
    case 'start': case 'leave': case 'addBot': return true;
    case 'removeBot': return isStr(a.playerId);
    case 'scenario': return isStr(a.scenarioId);
    case 'play': return isConsortiumAction(a.action);
    case 'report': return isMissionReport(a.report);
    default: return false;
  }
}

export interface RoomSetup {
  base: DesignInput;
  market: Market;
  agencies: AgencyProfile[];
  deadlineTurn?: number;
  campaign?: CampaignConfig;   // є: кімната грає кампанію з кількох вікон запуску
  scenarios?: Record<string, ScenarioSetup>; // є: господар обирає сценарій; він задає місію й кампанію
}

// Що реально грає кімната: обраний сценарій замінює місію й налаштування кампанії.
export function effectiveSetup(setup: RoomSetup, scenarioId: string | undefined): RoomSetup {
  const scenario = scenarioId ? setup.scenarios?.[scenarioId] : undefined;
  if (!scenario) return setup;
  return { ...setup, base: { mission: scenario.mission, catalog: scenario.catalog ?? setup.base.catalog }, campaign: scenario.campaign };
}

export function newRoom(hostId: string, hostName: string, agencyIds: string[], seed = 1, minPlayers = 1): LobbyState {
  if (agencyIds.length === 0) throw new Error('Потрібна хоча б одна агенція');
  if (new Set(agencyIds).size !== agencyIds.length) throw new Error('Агенції в кімнаті не повинні повторюватись');
  if (minPlayers < 1 || minPlayers > Math.min(MAX_PLAYERS, agencyIds.length)) throw new Error('minPlayers поза межами 1..кількість агенцій');
  return {
    phase: 'lobby', seed, hostId, agencyIds, minPlayers,
    players: [{ id: hostId, name: hostName, wish: null, ready: false }],
  };
}

// Розподіл країн. Конфлікт (кілька гравців хочуть одну агенцію) вирішує монета від сіду й ключа агенції:
// переможець бере її, решта отримують вільні агенції за порядком місць. Гравці без бажання беруть вільні в кінці.
// Результат упорядковано за lobby.agencyIds: саме в такому порядку агенції ходитимуть у грі.
export function assignAgencies(lobby: LobbyState): Assignment[] {
  const out = new Map<string, Assignment>();
  const taken = new Set<string>();
  for (const agencyId of lobby.agencyIds) {
    const claimants = lobby.players.filter((p) => p.wish === agencyId);
    if (claimants.length === 0) continue;
    const [roll = 0] = rolls(lobby.seed, `coin:${agencyId}`, 1);
    const winner = claimants[Math.min(claimants.length - 1, Math.floor(roll * claimants.length))]!;
    out.set(winner.id, { playerId: winner.id, agencyId, how: claimants.length === 1 ? 'free' : 'coin' });
    taken.add(agencyId);
  }
  const free = lobby.agencyIds.filter((id) => !taken.has(id));
  for (const p of lobby.players) {
    if (out.has(p.id)) continue;
    const agencyId = free.shift();
    if (!agencyId) continue; // гравців більше, ніж агенцій: це ловить startBlockers
    out.set(p.id, { playerId: p.id, agencyId, how: p.wish ? 'lost' : 'auto' });
  }
  const order = (a: Assignment) => lobby.agencyIds.indexOf(a.agencyId);
  return lobby.players.map((p) => out.get(p.id)).filter((a): a is Assignment => a !== undefined).sort((a, b) => order(a) - order(b));
}

// knownAgencyIds: які агенції реально є в налаштуваннях гри; якщо кімната посилається на невідому, старт блокується з причиною.
export function startBlockers(lobby: LobbyState, knownAgencyIds?: string[]): string[] {
  const out: string[] = [];
  if (knownAgencyIds && lobby.agencyIds.some((id) => !knownAgencyIds.includes(id))) out.push('lobby.unknownAgency');
  if (lobby.players.length < lobby.minPlayers) out.push('lobby.tooFew');
  if (lobby.players.length > lobby.agencyIds.length) out.push('lobby.tooMany');
  if (lobby.players.some((p) => !p.ready && !p.bot && p.id !== lobby.hostId)) out.push('lobby.notReady');
  if (!lobby.players.some((p) => !p.bot)) out.push('lobby.onlyBots');
  return out;
}

// Агенції тих, хто вийшов, пропускають хід автоматично, інакше решта чекала б на них до кінця гри.
// Агенції ботів ходять самі: та сама дія від того самого стану, тож за одним екраном і онлайн результат однаковий.
function autoPlay(state: PlayState, bots: string[]): PlayState {
  let consortium = state.consortium;
  // Запобіжник від зациклення, з великим запасом: кожна ітерація або змінює стан, або цикл зупиняється.
  for (let guard = 0; guard < 100_000 && !consortium.result && !consortium.awaiting; guard++) {
    const entry = activeAgency(consortium);
    const owner = state.assignments.find((a) => a.agencyId === entry?.agency.id);
    if (!owner) break;
    let next: ConsortiumState;
    if (state.left.includes(owner.playerId)) next = stepConsortium(consortium, { type: 'wait' });
    else if (bots.includes(owner.playerId)) {
      next = stepConsortium(consortium, botAction(consortium));
      // Дія бота нічого не змінила (наприклад, крок уже впирається в межу): хід бота закінчується, щоб не зациклитись.
      if (next === consortium) next = stepConsortium(consortium, { type: 'launch' });
      if (next === consortium) next = stepConsortium(consortium, { type: 'wait' });
    } else break;
    if (next === consortium) break;
    consortium = next;
  }
  return consortium === state.consortium ? state : { ...state, consortium };
}

const botsOf = (state: PlayState): string[] => state.bots ?? [];

export function stepRoom(state: RoomState, playerId: string, action: RoomAction, setup: RoomSetup): RoomState {
  if (state.phase === 'play') {
    const mine = state.assignments.find((a) => a.playerId === playerId);
    if (action.type === 'leave') {
      if (!mine || state.left.includes(playerId)) return state;
      // Від того, хто пішов, звіту про політ уже не буде: його запуск рахуємо заглушками.
      const consortium = forfeitReport(state.consortium, mine.agencyId);
      return autoPlay({ ...state, left: [...state.left, playerId], consortium }, botsOf(state));
    }
    if (action.type === 'report') {
      if (!mine || state.left.includes(playerId)) return state;
      const consortium = applyReport(state.consortium, mine.agencyId, action.report);
      return consortium === state.consortium ? state : autoPlay({ ...state, consortium }, botsOf(state));
    }
    if (action.type !== 'play') return state;
    const entry = activeAgency(state.consortium);
    const owner = state.assignments.find((a) => a.agencyId === entry?.agency.id);
    if (!owner || owner.playerId !== playerId) return state; // ходить лише власник активної агенції
    const consortium = stepConsortium(state.consortium, action.action);
    return consortium === state.consortium ? state : autoPlay({ ...state, consortium }, botsOf(state));
  }

  const me = state.players.find((p) => p.id === playerId);
  switch (action.type) {
    case 'join': {
      if (me || state.players.length >= Math.min(MAX_PLAYERS, state.agencyIds.length)) return state;
      const name = action.name.trim().slice(0, 24);
      if (!name) return state;
      return { ...state, players: [...state.players, { id: playerId, name, wish: null, ready: false }] };
    }
    case 'leave': {
      if (!me || me.bot) return state;
      const players = state.players.filter((p) => p.id !== playerId);
      const humans = players.filter((p) => !p.bot);
      if (humans.length === 0) return state; // порожню кімнату (лише боти) закриває той, хто її тримає
      return { ...state, players, hostId: state.hostId === playerId ? humans[0]!.id : state.hostId };
    }
    case 'addBot': {
      if (playerId !== state.hostId || state.players.length >= Math.min(MAX_PLAYERS, state.agencyIds.length)) return state;
      let n = 1;
      while (state.players.some((p) => p.id === `bot-${n}`)) n++;
      return { ...state, players: [...state.players, { id: `bot-${n}`, name: `Bot ${n}`, wish: null, ready: true, bot: true }] };
    }
    case 'scenario': {
      if (playerId !== state.hostId || !setup.scenarios?.[action.scenarioId] || state.scenarioId === action.scenarioId) return state;
      return { ...state, scenarioId: action.scenarioId };
    }
    case 'removeBot': {
      if (playerId !== state.hostId || !state.players.some((p) => p.id === action.playerId && p.bot)) return state;
      return { ...state, players: state.players.filter((p) => p.id !== action.playerId) };
    }
    case 'wish': {
      if (!me) return state;
      if (action.agencyId !== null && !state.agencyIds.includes(action.agencyId)) return state;
      if (me.wish === action.agencyId) return state;
      // Зміна бажання міняє розклад для всіх (можливий новий конфлікт), тож готовність скидається в усіх.
      // Бот завжди готовий: підтвердити готовність за нього нікому.
      return { ...state, players: state.players.map((p) => ({ ...p, wish: p.id === playerId ? action.agencyId : p.wish, ready: p.bot === true })) };
    }
    case 'ready':
      if (!me) return state;
      return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, ready: action.ready } : p)) };
    case 'start': {
      if (playerId !== state.hostId || startBlockers(state, setup.agencies.map((a) => a.id)).length > 0) return state;
      const assignments = assignAgencies(state);
      const byId = new Map(setup.agencies.map((a) => [a.id, a]));
      const agencies = assignments.map((a) => byId.get(a.agencyId)).filter((a): a is AgencyProfile => a !== undefined);
      if (agencies.length !== assignments.length) return state;
      const bots = state.players.filter((p) => p.bot).map((p) => p.id);
      // Звіт про політ чекаємо лише в кампанії й лише від людей: боти й одиночна гра без кампанії рахуються заглушками.
      const reportsFrom = setup.campaign || setup.scenarios ? assignments.filter((a) => !bots.includes(a.playerId)).map((a) => a.agencyId) : [];
      const play = effectiveSetup(setup, state.scenarioId);
      const consortium = newConsortium(play.base, play.market, agencies, play.deadlineTurn, state.seed, {
        ...(play.campaign ? { campaign: play.campaign } : {}), reportsFrom: play.campaign ? reportsFrom : [],
        ...(setup.scenarios ? { scenarioId: state.scenarioId ?? DEFAULT_SCENARIO } : {}),
      });
      const playerNames = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
      return autoPlay({ phase: 'play', seed: state.seed, assignments, playerNames, left: [], ...(bots.length ? { bots } : {}), consortium }, bots);
    }
    case 'play':
    case 'report':
      return state;
  }
}
