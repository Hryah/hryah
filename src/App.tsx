import { useEffect, useState } from "react";
import { initialState, step, type GameState } from "./core/state";
import { channel, channelStyle, commit } from "./build-info";
import { load, save } from "./storage";

// Бланки екранів: порожні заготовки, щоб на обох сайтах було що відкрити й порівняти.
// UI лише читає стан і шле дії, уся логіка в src/core.
type Tab = "build" | "launch" | "mission";

const TABS: { id: Tab; title: string; todo: string }[] = [
  { id: "build", title: "Збірка ракети", todo: "Вибір ступенів, двигунів і корисного навантаження." },
  { id: "launch", title: "Запуск", todo: "Симуляція польоту: тяга, маса, рівняння Ціолковського." },
  { id: "mission", title: "Місія", todo: "Цілі NASA, результати й оцінка." },
];

export function App() {
  const [state, setState] = useState<GameState>(() => load<GameState>("state") ?? initialState(1));
  const [tab, setTab] = useState<Tab>("build");
  const { label, color } = channelStyle[channel];

  useEffect(() => {
    document.title = `hryah · ${channel}`;
  }, []);

  const burn = () => {
    const next = step(state, { type: "burn", amount: 10 });
    setState(next);
    save("state", next);
  };

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#0b0d17", color: "#e8eaf3" }}>
      <div style={{ background: color, color: "#0b0d17", padding: "6px 16px", fontWeight: 700, fontSize: 14 }}>
        {label} · збірка {commit}
      </div>
      <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 16px" }}>🚀 hryah</h1>
        <nav style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${t.id === tab ? color : "#2a2f4a"}`,
                background: t.id === tab ? "#1b2038" : "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              {t.title}
            </button>
          ))}
        </nav>
        <section style={{ background: "#141829", borderRadius: 12, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>{current.title}</h2>
          <p style={{ color: "#8a90a8" }}>🚧 Бланк. {current.todo}</p>
          <p>
            тік {state.tick} · паливо {state.fuel}
          </p>
          <button onClick={burn}>Спалити 10</button>
        </section>
      </main>
    </div>
  );
}
