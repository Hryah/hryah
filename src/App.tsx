import { lazy, Suspense, useEffect, useState } from "react";
import { channel, channelStyle, commit } from "./build-info";
import { DebugScreen } from "./ui/debug/DebugScreen";
import { ConsortiumScreen } from "./ui/design/ConsortiumScreen";
import { PlayScreen, startPlay } from "./ui/play/PlayScreen";
import type { GameState } from "./core/game";
import { resolveAssetUrl } from "./ui/graphics/registry";
import { OrbitPrototype } from "./ui/orbit/OrbitPrototype";
import orbitText from "./ui/orbit/texts.en.json";
import { Gallery } from "./scenes/gallery";
import "./ui/design/planning-console.css";
import { t } from "./ui/text";

const RoomScreen = lazy(() =>
  import("./ui/room/RoomScreen").then((module) => ({
    default: module.RoomScreen,
  })),
);

// #play — гра (кампанія агенції, docs/EXPANSION.md), #mission — одна місія без економіки, #orbit — прототип орбіти,
// #debug — дебаг, #room — 3D-каюта, #gallery — галерея сцен.
// Каюта завантажується при першому відкритті та зберігає стан.
type View = "play" | "mission" | "orbit" | "debug" | "room" | "gallery";

const viewFromHash = (hash: string): View =>
  hash === "#debug" ? "debug" :
  hash === "#gallery" ? "gallery" :
  hash === "#mission" ? "mission" :
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
      <div hidden={view === "orbit"} lang="uk" className="mc-app-backdrop" style={{ fontFamily: "system-ui, sans-serif" }}>
        <div style={{ background: color, color: "#001524", padding: "6px 16px", fontWeight: 700, fontSize: 14 }}>
          {label} · збірка {commit}
        </div>
        <main style={{ padding: "18px 20px 28px", maxWidth: 1760, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            <h1 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--c-cream, #ffecd1)", fontSize: 22 }}>
              <img src={resolveAssetUrl("assets/icons/ui/rocket.svg")} alt="" width={24} height={24} />
              hryah
            </h1>
            <nav style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 14 }}>
              <a href="#play" style={{ color: view === "play" ? "var(--c-orange, #ff7d00)" : "var(--c-text-muted, #ffecd1)" }}>Гра</a>
              <a href="#room" style={{ color: view === "room" ? "var(--c-orange, #ff7d00)" : "var(--c-text-muted, #ffecd1)" }}>{t("room.nav")}</a>
              <a href="#orbit" style={{ color: "var(--c-text-muted, #ffecd1)" }}>{orbitText["ui.orbitOperations"]}</a>
              <a href="#mission" style={{ color: view === "mission" ? "var(--c-orange, #ff7d00)" : "var(--c-text-muted, #ffecd1)" }}>{t("ui.nav.mission")}</a>
              <a href="#debug" style={{ color: view === "debug" ? "var(--c-orange, #ff7d00)" : "var(--c-text-muted, #ffecd1)" }}>Дебаг</a>
              <a href="#gallery" style={{ color: view === "gallery" ? "var(--c-orange, #ff7d00)" : "var(--c-text-muted, #ffecd1)" }}>Галерея</a>
            </nav>
          </div>
          <div style={{ display: view === "play" ? "block" : "none" }}><ConsortiumScreen active={view === "play"} /></div>
          <div style={{ display: view === "mission" ? "block" : "none" }}><PlayScreen game={game} setGame={setGame} active={view === "mission"} /></div>
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
