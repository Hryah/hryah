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
import { RetroProvider, RetroToggle } from "./ui/style/RetroStyle";

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

  const isConsoleView = view === "play";
  // Тестові екрани (каюта, дебаг, галерея) на стабільному сайті не показуємо в навігації: туди дивиться журі.
  // За прямою адресою (#room, #debug, #gallery) вони й далі відкриваються.
  const devLinks = channel !== "main";

  return (
    <RetroProvider>
      <div hidden={view !== "orbit"}>
        <OrbitPrototype />
        {/* На #orbit навігації немає, а сцена теж під фільтром: перемикач окремо в куті, під довідковим вікном (z-index 10). */}
        {view === "orbit" && <div style={{ position: "fixed", right: 16, bottom: 12, zIndex: 5 }}><RetroToggle /></div>}
      </div>
      <div
        hidden={view === "orbit"}
        lang="uk"
        className={isConsoleView ? "mc-app-backdrop" : undefined}
        style={
          isConsoleView
            ? { fontFamily: "system-ui, sans-serif" }
            : { fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#0b0d17", color: "#e8eaf3" }
        }
      >
        <div style={{ background: color, color: isConsoleView ? "#001524" : "#0b0d17", padding: "6px 16px", fontWeight: 700, fontSize: 14 }}>
          {label} · збірка {commit}
        </div>
        <main style={{ padding: isConsoleView ? "18px 20px 28px" : 24, maxWidth: isConsoleView ? 1760 : 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: isConsoleView ? 14 : 16 }}>
            <h1 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: isConsoleView ? "var(--c-cream, #ffecd1)" : "#e8eaf3", fontSize: isConsoleView ? 22 : undefined }}>
              <img src={resolveAssetUrl("assets/icons/ui/rocket.svg")} alt="" width={isConsoleView ? 24 : 26} height={isConsoleView ? 24 : 26} />
              hryah
            </h1>
            <nav style={{ display: "flex", flexWrap: "wrap", gap: isConsoleView ? 14 : 12, fontSize: isConsoleView ? 14 : undefined }}>
              <a href="#play" style={{ color: view === "play" ? (isConsoleView ? "var(--c-orange, #ff7d00)" : color) : isConsoleView ? "var(--c-text-muted, #ffecd1)" : "#8a90a8" }}>Гра</a>
              {devLinks && <a href="#room" style={{ color: view === "room" ? (isConsoleView ? "var(--c-orange, #ff7d00)" : color) : isConsoleView ? "var(--c-text-muted, #ffecd1)" : "#8a90a8" }}>{t("room.nav")}</a>}
              <a href="#orbit" style={{ color: isConsoleView ? "var(--c-text-muted, #ffecd1)" : "#8a90a8" }}>{orbitText["ui.orbitOperations"]}</a>
              <a href="#mission" style={{ color: view === "mission" ? (isConsoleView ? "var(--c-orange, #ff7d00)" : color) : isConsoleView ? "var(--c-text-muted, #ffecd1)" : "#8a90a8" }}>{t("ui.nav.mission")}</a>
              {devLinks && <a href="#debug" style={{ color: view === "debug" ? (isConsoleView ? "var(--c-orange, #ff7d00)" : color) : isConsoleView ? "var(--c-text-muted, #ffecd1)" : "#8a90a8" }}>Дебаг</a>}
              {devLinks && <a href="#gallery" style={{ color: view === "gallery" ? (isConsoleView ? "var(--c-orange, #ff7d00)" : color) : isConsoleView ? "var(--c-text-muted, #ffecd1)" : "#8a90a8" }}>Галерея</a>}
              <RetroToggle />
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
    </RetroProvider>
  );
}
