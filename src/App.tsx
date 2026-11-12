import { useState } from "react";
import { initialState, step, type GameState } from "./core/state";
import { load, save } from "./storage";

// Плейсхолдер: UI лише читає стан і шле дії, уся логіка в src/core.
export function App() {
  const [state, setState] = useState<GameState>(() => load<GameState>("state") ?? initialState(1));

  const burn = () => {
    const next = step(state, { type: "burn", amount: 10 });
    setState(next);
    save("state", next);
  };

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>🚀 hryah</h1>
      <p>
        тік {state.tick} · паливо {state.fuel}
      </p>
      <button onClick={burn}>Спалити 10</button>
    </main>
  );
}
