import { useEffect, useState } from "react";
import { channel, channelStyle, commit } from "./build-info";
import { DebugScreen } from "./ui/debug/DebugScreen";
import { ConsortiumScreen } from "./ui/design/ConsortiumScreen";

// Поки справжніх екранів немає, застосунок показує дебаг-екран: у гру можна грати кнопками.
// Коли з'являться екрани частин, тут буде перемикач за state.phase, а дебаг переїде на окрему вкладку.
// Тимчасовий перемикач екранів за #адресою: #design відкриває консорціум, будь-що інше дебаг.
const useView = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash === "#design" ? "design" : "debug";
};

export function App() {
  const { label, color } = channelStyle[channel];
  const view = useView();

  useEffect(() => {
    document.title = `hryah · ${channel}`;
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#0b0d17", color: "#e8eaf3" }}>
      <div style={{ background: color, color: "#0b0d17", padding: "6px 16px", fontWeight: 700, fontSize: 14 }}>
        {label} · збірка {commit}
      </div>
      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 8px" }}>🚀 hryah</h1>
        <nav style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <a href="#design" style={{ color: view === "design" ? color : "#8a90a8" }}>Консорціум</a>
          <a href="#debug" style={{ color: view === "debug" ? color : "#8a90a8" }}>Дебаг</a>
        </nav>
        {/* Обидва екрани лишаються змонтованими, щоб перемикання не скидало прогрес. */}
        <div style={{ display: view === "design" ? "block" : "none" }}><ConsortiumScreen /></div>
        <div style={{ display: view === "debug" ? "block" : "none" }}><DebugScreen /></div>
      </main>
    </div>
  );
}
