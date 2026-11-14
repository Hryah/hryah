import { useEffect, useState } from "react";
import { channel, channelStyle, commit } from "./build-info";
import { DebugScreen } from "./ui/debug/DebugScreen";
import { ConsortiumScreen } from "./ui/design/ConsortiumScreen";
import { OrbitPrototype } from "./ui/orbit/OrbitPrototype";
import orbitText from "./ui/orbit/texts.en.json";

// Тимчасовий перемикач екранів за #адресою до інтеграції фаз: без адреси прототип орбіти,
// #design консорціум (частина 1), #debug дебаг-екран. Усі екрани лишаються змонтованими,
// тож перемикання не скидає прогрес.
type View = "orbit" | "design" | "debug";

const viewFromHash = (hash: string): View => (hash === "#debug" ? "debug" : hash === "#design" ? "design" : "orbit");

const useView = (): View => {
  const [view, setView] = useState<View>(() => viewFromHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setView(viewFromHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return view;
};

export function App() {
  const { label, color } = channelStyle[channel];
  const view = useView();

  useEffect(() => {
    document.title = view === "orbit" ? "hryah · Orbital operations" : `hryah · ${channel}`;
  }, [view]);

  return (
    <>
      <div hidden={view !== "orbit"}><OrbitPrototype /></div>
      <div hidden={view === "orbit"} lang="uk" style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#0b0d17", color: "#e8eaf3" }}>
        <div style={{ background: color, color: "#0b0d17", padding: "6px 16px", fontWeight: 700, fontSize: 14 }}>
          {label} · збірка {commit}
        </div>
        <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 8px" }}>🚀 hryah</h1>
          <nav style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <a href="#orbit" style={{ color: "#8a90a8" }}>{orbitText["ui.orbitOperations"]}</a>
            <a href="#design" style={{ color: view === "design" ? color : "#8a90a8" }}>Консорціум</a>
            <a href="#debug" style={{ color: view === "debug" ? color : "#8a90a8" }}>Дебаг</a>
          </nav>
          <div style={{ display: view === "design" ? "block" : "none" }}><ConsortiumScreen /></div>
          <div style={{ display: view === "debug" ? "block" : "none" }}><DebugScreen /></div>
        </main>
      </div>
    </>
  );
}
