// game.ts — склейка трьох частин в одну гру.
// Гра завжди перебуває рівно в одній частині; коли частина каже isDone,
// склейка забирає її результат (finish) і запускає наступну (init).

import type {
  Catalog, CauseEntry, DebugAction, FlightResult, Mission, Phase, RunRecord, SpacecraftSpec,
} from './contracts';
import { designPhase, flightPhase, orbitPhase } from './phases';

// Типи стану й дій беремо з самих частин, тож заміна заглушки в phases.ts оновлює їх автоматично.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StateOf<P> = P extends Phase<any, infer S, any, any> ? S : never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionOf<P> = P extends Phase<any, any, infer A, any> ? A : never;

export type DesignState = StateOf<typeof designPhase>;
export type FlightState = StateOf<typeof flightPhase>;
export type OrbitState = StateOf<typeof orbitPhase>;
export type DesignAction = ActionOf<typeof designPhase>;
export type FlightAction = ActionOf<typeof flightPhase>;
export type OrbitAction = ActionOf<typeof orbitPhase>;

export type GameState =
  | { phase: 'design'; seed: number; mission: Mission; design: DesignState }
  | { phase: 'flight'; seed: number; mission: Mission; spec: SpacecraftSpec; log: CauseEntry[]; flight: FlightState }
  | {
      phase: 'orbit'; seed: number; mission: Mission; spec: SpacecraftSpec; flightResult: FlightResult;
      log: CauseEntry[]; orbit: OrbitState;
    }
  | { phase: 'debrief'; seed: number; mission: Mission; record: RunRecord };

// Дія адресована конкретній частині. Дія не для поточної частини ігнорується.
export type GameAction =
  | { phase: 'design'; action: DesignAction }
  | { phase: 'flight'; action: FlightAction }
  | { phase: 'orbit'; action: OrbitAction };

export function newGame(mission: Mission, catalog: Catalog, seed: number): GameState {
  return advance({ phase: 'design', seed, mission, design: designPhase.init({ mission, catalog }, seed) });
}

export function step(state: GameState, a: GameAction): GameState {
  if (state.phase === 'design' && a.phase === 'design') {
    return advance({ ...state, design: designPhase.step(state.design, a.action) });
  }
  if (state.phase === 'flight' && a.phase === 'flight') {
    return advance({ ...state, flight: flightPhase.step(state.flight, a.action) });
  }
  if (state.phase === 'orbit' && a.phase === 'orbit') {
    return advance({ ...state, orbit: orbitPhase.step(state.orbit, a.action) });
  }
  return state;
}

// Перехід між частинами. Кожна частина отримує свій сід (seed, seed+1, seed+2),
// щоб зміна рандому в одній не зсувала події в іншій.
function advance(state: GameState): GameState {
  const { seed, mission } = state;

  if (state.phase === 'design' && designPhase.isDone(state.design)) {
    const out = designPhase.finish(state.design);
    return advance({
      phase: 'flight', seed, mission, spec: out.result, log: out.log,
      flight: flightPhase.init({ mission, spec: out.result, log: out.log }, seed + 1),
    });
  }

  if (state.phase === 'flight' && flightPhase.isDone(state.flight)) {
    const out = flightPhase.finish(state.flight);
    const log = [...state.log, ...out.log];
    return advance({
      phase: 'orbit', seed, mission, spec: state.spec, flightResult: out.result, log,
      orbit: orbitPhase.init({ mission, spec: state.spec, flight: out.result, log }, seed + 2),
    });
  }

  if (state.phase === 'orbit' && orbitPhase.isDone(state.orbit)) {
    const out = orbitPhase.finish(state.orbit);
    return {
      phase: 'debrief', seed, mission,
      record: {
        seed, missionId: mission.id, spec: state.spec, flight: state.flightResult,
        outcome: out.result, log: [...state.log, ...out.log],
      },
    };
  }

  return state;
}

// ───────────────────────── Для дебаг-екрана й ботів ─────────────────────────

// Усі дії, доступні зараз, уже загорнуті в GameAction.
export function availableActions(state: GameState): DebugAction<GameAction>[] {
  const wrap = <A>(list: DebugAction<A>[] | undefined, toGame: (action: A) => GameAction) =>
    (list ?? []).map((d) => ({ group: d.group, label: d.label, action: toGame(d.action) }));

  switch (state.phase) {
    case 'design':
      return wrap(designPhase.debugActions?.(state.design), (action) => ({ phase: 'design', action }));
    case 'flight':
      return wrap(flightPhase.debugActions?.(state.flight), (action) => ({ phase: 'flight', action }));
    case 'orbit':
      return wrap(orbitPhase.debugActions?.(state.orbit), (action) => ({ phase: 'orbit', action }));
    case 'debrief':
      return [];
  }
}

// Що частина віддала б, якби закінчилась просто зараз. finish чиста, тому це безпечно.
export function preview(state: GameState): unknown {
  switch (state.phase) {
    case 'design': return designPhase.finish(state.design).result;
    case 'flight': return flightPhase.finish(state.flight).result;
    case 'orbit': return orbitPhase.finish(state.orbit).result;
    case 'debrief': return state.record.outcome;
  }
}

// Внутрішній стан поточної частини (для показу й графіків).
export function phaseState(state: GameState): unknown {
  switch (state.phase) {
    case 'design': return state.design;
    case 'flight': return state.flight;
    case 'orbit': return state.orbit;
    case 'debrief': return state.record;
  }
}
