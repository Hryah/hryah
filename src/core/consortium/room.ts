// Кімната консорціуму: лобі (місця, вибір країн, монета при конфліктах) і гра після старту.
// Один і той самий редуктор працює і за одним екраном (клієнт сам шле дії від імені активного гравця),
// і онлайн (сервер перевіряє, що дію шле власник активної агенції). Стан чисті JSON-дані, рандому нема:
// монета береться з rolls(сід кімнати, ключ).

import type { DesignInput } from '../contracts';
import type { AgencyProfile } from '../design/agency';
import type { Market } from './market';
import { rolls } from './seed';
import { newConsortium, stepConsortium, activeAgency, type ConsortiumAction, type ConsortiumState } from './session';

export const MAX_PLAYERS = 4;

export interface Player {
  id: string;
  name: string;
  wish: string | null; // бажана агенція; null: байдуже, дістанеться вільна
  ready: boolean;
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
}

export interface PlayState {
  phase: 'play';
  seed: number;
  assignments: Assignment[];  // порядок збігається з порядком агенцій у consortium
  playerNames: Record<string, string>; // імена, щоб екран показував, чий хід
  left: string[];             // хто вийшов під час гри: їхні агенції більше не ходять (лише «чекати»)
  consortium: ConsortiumState;
}

export type RoomState = LobbyState | PlayState;

export type RoomAction =
  | { type: 'join'; name: string }
  | { type: 'leave' }
  | { type: 'wish'; agencyId: string | null }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'play'; action: ConsortiumAction };

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
    case 'start': case 'leave': return true;
    case 'play': return isConsortiumAction(a.action);
    default: return false;
  }
}

export interface RoomSetup {
  base: DesignInput;
  market: Market;
  agencies: AgencyProfile[];
  deadlineTurn?: number;
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
  if (lobby.players.some((p) => !p.ready && p.id !== lobby.hostId)) out.push('lobby.notReady');
  return out;
}

// Агенції тих, хто вийшов, пропускають хід автоматично, інакше решта чекала б на них до кінця гри.
function skipLeft(state: PlayState): PlayState {
  let consortium = state.consortium;
  for (let guard = 0; guard < 1000 && !consortium.result; guard++) {
    const entry = activeAgency(consortium);
    const owner = state.assignments.find((a) => a.agencyId === entry?.agency.id);
    if (!owner || !state.left.includes(owner.playerId)) break;
    consortium = stepConsortium(consortium, { type: 'wait' });
  }
  return consortium === state.consortium ? state : { ...state, consortium };
}

export function stepRoom(state: RoomState, playerId: string, action: RoomAction, setup: RoomSetup): RoomState {
  if (state.phase === 'play') {
    if (action.type === 'leave') {
      if (!state.assignments.some((a) => a.playerId === playerId) || state.left.includes(playerId)) return state;
      return skipLeft({ ...state, left: [...state.left, playerId] });
    }
    if (action.type !== 'play') return state;
    const entry = activeAgency(state.consortium);
    const owner = state.assignments.find((a) => a.agencyId === entry?.agency.id);
    if (!owner || owner.playerId !== playerId) return state; // ходить лише власник активної агенції
    const consortium = stepConsortium(state.consortium, action.action);
    return consortium === state.consortium ? state : skipLeft({ ...state, consortium });
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
      if (!me) return state;
      const players = state.players.filter((p) => p.id !== playerId);
      if (players.length === 0) return state; // порожню кімнату закриває той, хто її тримає
      return { ...state, players, hostId: state.hostId === playerId ? players[0]!.id : state.hostId };
    }
    case 'wish': {
      if (!me) return state;
      if (action.agencyId !== null && !state.agencyIds.includes(action.agencyId)) return state;
      if (me.wish === action.agencyId) return state;
      // Зміна бажання міняє розклад для всіх (можливий новий конфлікт), тож готовність скидається в усіх.
      return { ...state, players: state.players.map((p) => ({ ...p, wish: p.id === playerId ? action.agencyId : p.wish, ready: false })) };
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
      const consortium = newConsortium(setup.base, setup.market, agencies, setup.deadlineTurn, state.seed);
      const playerNames = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
      return skipLeft({ phase: 'play', seed: state.seed, assignments, playerNames, left: [], consortium });
    }
    case 'play':
      return state;
  }
}
