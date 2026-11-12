// Ядро гри: чисті функції, JSON-стан, жодного DOM/рендеру/недетермінізму.
// CI (крок "core purity") валить збірку, якщо це правило порушено.

export interface GameState {
  tick: number;
  seed: number;
  fuel: number;
}

export type Action = { type: "burn"; amount: number } | { type: "coast" };

export const initialState = (seed: number): GameState => ({ tick: 0, seed, fuel: 100 });

export function step(state: GameState, action: Action): GameState {
  const fuel = action.type === "burn" ? Math.max(0, state.fuel - action.amount) : state.fuel;
  return { ...state, tick: state.tick + 1, fuel };
}
