import { useEffect, useState } from "react";
import { channel, channelStyle, commit } from "./build-info";
import { DebugScreen } from "./ui/debug/DebugScreen";
import { OrbitPrototype } from "./ui/orbit/OrbitPrototype";
import orbitText from "./ui/orbit/texts.en.json";

// Прототип орбіти й попередній дебаг мають незалежний стан до інтеграції фаз.
export function App() {
  const [debug, setDebug] = useState(() => window.location.hash === '#debug');
  const { label, color } = channelStyle[channel];

  useEffect(() => {
    const update = () => setDebug(window.location.hash === '#debug');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    document.title = debug ? `hryah · ${channel}` : 'hryah · Orbital operations';
  }, [debug]);

  return (
    <>
    <div hidden={debug}><OrbitPrototype /></div>
    <div hidden={!debug} lang="uk" style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#0b0d17", color: "#e8eaf3" }}>
      <a href="#orbit" style={{ display: 'block', padding: '12px 24px', color: '#c4ef8b' }}>← {orbitText['ui.orbitOperations']}</a>
      <div style={{ background: color, color: "#0b0d17", padding: "6px 16px", fontWeight: 700, fontSize: 14 }}>
        {label} · збірка {commit}
      </div>
      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 16px" }}>🚀 hryah · дебаг</h1>
        <DebugScreen />
      </main>
    </div>
    </>
  );
}
