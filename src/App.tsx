import { useEffect } from "react";
import { channel, channelStyle, commit } from "./build-info";
import { DebugScreen } from "./ui/debug/DebugScreen";

// Поки справжніх екранів немає, застосунок показує дебаг-екран: у гру можна грати кнопками.
// Коли з'являться екрани частин, тут буде перемикач за state.phase, а дебаг переїде на окрему вкладку.
export function App() {
  const { label, color } = channelStyle[channel];

  useEffect(() => {
    document.title = `hryah · ${channel}`;
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#0b0d17", color: "#e8eaf3" }}>
      <div style={{ background: color, color: "#0b0d17", padding: "6px 16px", fontWeight: 700, fontSize: 14 }}>
        {label} · збірка {commit}
      </div>
      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 16px" }}>🚀 hryah · дебаг</h1>
        <DebugScreen />
      </main>
    </div>
  );
}
