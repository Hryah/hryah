import { lazy, Suspense, useEffect, useState } from "react";
import { channel, channelStyle, commit } from "./build-info";
import { DebugScreen } from "./ui/debug/DebugScreen";
import { ConsortiumScreen } from "./ui/design/ConsortiumScreen";
import { PlayScreen, startPlay } from "./ui/play/PlayScreen";
import type { GameState } from "./core/game";
import { OrbitPrototype } from "./ui/orbit/OrbitPrototype";
import orbitText from "./ui/orbit/texts.en.json";
import { Gallery } from "./scenes/gallery";
import { t } from "./ui/text";

const RoomScreen = lazy(() =>
  import("./ui/room/RoomScreen").then((module) => ({
    default: module.RoomScreen,
  })),
);

// #play — гра, #design — консорціум, #orbit — прототип орбіти,
// #debug — дебаг, #room — 3D-каюта, #gallery — галерея сцен.
// Каюта завантажується при першому відкритті та зберігає стан.
type View = "play" | "orbit" | "design" | "debug" | "room" | "gallery";

const viewFromHash = (hash: string): View =>
  hash === "#debug" ? "debug" :
  hash === "#gallery" ? "gallery" :
  hash === "#design" ? "design" :
  hash === "#orbit" ? "orbit" :
  hash === "#room" ? "room" :
  "play";

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
  const [game, setGame] = useState<GameState>(startPlay);
  const [roomVisited, setRoomVisited] = useState(view === "room");

  useEffect(() => {
    if (view === "room") setRoomVisited(true);
  }, [view]);

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
          <nav style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <a href="#play" style={{ color: view === "play" ? color : "#8a90a8" }}>Гра</a>
            <a href="#room" style={{ color: view === "room" ? color : "#8a90a8" }}>{t("room.nav")}</a>
            <a href="#orbit" style={{ color: "#8a90a8" }}>{orbitText["ui.orbitOperations"]}</a>
            <a href="#design" style={{ color: view === "design" ? color : "#8a90a8" }}>Консорціум</a>
            <a href="#debug" style={{ color: view === "debug" ? color : "#8a90a8" }}>Дебаг</a>
            <a href="#gallery" style={{ color: view === "gallery" ? color : "#8a90a8" }}>Галерея</a>
          </nav>
          <div style={{ display: view === "play" ? "block" : "none" }}><PlayScreen game={game} setGame={setGame} active={view === "play"} /></div>
          <div style={{ display: view === "design" ? "block" : "none" }}><ConsortiumScreen /></div>
          <div style={{ display: view === "debug" ? "block" : "none" }}><DebugScreen /></div>
          {view === "gallery" && <Gallery active />}

          {(roomVisited || view === "room") && (
            <div hidden={view !== "room"}>
              <Suspense fallback={<p role="status">{t("room.loading")}</p>}>
                <RoomScreen active={view === "room"} />
              </Suspense>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
