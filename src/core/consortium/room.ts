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
  agencyIds: string[];        // агенції, доступні в цій кімнаті, у порядку ходів
  minPlayers: number;
}

export interface PlayState {
  phase: 'play';
  seed: number;
  assignments: Assignment[];  // порядок збігається з порядком агенцій у consortium
  playerNames: Record<string, string>; // імена, щоб екран показував, чий хід
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

export interface RoomSetup {
  base: DesignInput;
  market: Market;
  agencies: AgencyProfile[];
  deadlineTurn?: number;
}

export function newRoom(hostId: string, hostName: string, agencyIds: string[], seed = 1, minPlayers = 1): LobbyState {
  if (agencyIds.length === 0) throw new Error('Потрібна хоча б одна агенція');
  return {
    phase: 'lobby', seed, hostId, agencyIds, minPlayers,
    players: [{ id: hostId, name: hostName, wish: null, ready: false }],
  };
}

// Розподіл країн. Конфлікт (кілька гравців хочуть одну агенцію) вирішує монета від сіду й ключа агенції:
// переможець бере її, решта отримують вільні агенції за порядком місць. Гравці без бажання беруть вільні в кінці.
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
    if (!agencyId) continue; // гравців більше, ніж агенцій: перевіряє canStart
    out.set(p.id, { playerId: p.id, agencyId, how: p.wish ? 'lost' : 'auto' });
  }
  return lobby.players.map((p) => out.get(p.id)).filter((a): a is Assignment => a !== undefined);
}

export function startBlockers(lobby: LobbyState): string[] {
  const out: string[] = [];
  if (lobby.players.length < lobby.minPlayers) out.push('lobby.tooFew');
  if (lobby.players.length > lobby.agencyIds.length) out.push('lobby.tooMany');
  if (lobby.players.some((p) => !p.ready && p.id !== lobby.hostId)) out.push('lobby.notReady');
  return out;
}

export function stepRoom(state: RoomState, playerId: string, action: RoomAction, setup: RoomSetup): RoomState {
  if (state.phase === 'play') {
    if (action.type !== 'play') return state;
    const entry = activeAgency(state.consortium);
    const owner = state.assignments.find((a) => a.agencyId === entry?.agency.id);
    if (!owner || owner.playerId !== playerId) return state; // ходить лише власник активної агенції
    const consortium = stepConsortium(state.consortium, action.action);
    return consortium === state.consortium ? state : { ...state, consortium };
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
      // Зміна бажання скидає готовність: інші мали погодитись на інший розклад.
      return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, wish: action.agencyId, ready: false } : p)) };
    }
    case 'ready':
      if (!me) return state;
      return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, ready: action.ready } : p)) };
    case 'start': {
      if (playerId !== state.hostId || startBlockers(state).length > 0) return state;
      const assignments = assignAgencies(state);
      const byId = new Map(setup.agencies.map((a) => [a.id, a]));
      const agencies = assignments.map((a) => byId.get(a.agencyId)).filter((a): a is AgencyProfile => a !== undefined);
      if (agencies.length !== assignments.length) return state;
      const consortium = newConsortium(setup.base, setup.market, agencies, setup.deadlineTurn, state.seed);
      const playerNames = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
      return { phase: 'play', seed: state.seed, assignments, playerNames, consortium };
    }
    case 'play':
      return state;
  }
}
