import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import agenciesData from "../../data/agencies.json";
import marketData from "../../data/market.json";
import {
  activeAgency,
  agencyAfterEvents,
  campaignRoomSetup,
  developerProfile,
  flownMission,
  flownSpec,
  newRoom,
  pendingReports,
  programProgress,
  seedsFor,
  stepRoom,
  type ConsortiumAction,
  type ConsortiumState,
  type Market,
  type RoomAction,
  type RoomSetup,
  type RoomState,
} from "../../core/consortium";
import { CampaignPanel, CampaignStandings } from "../campaign/CampaignPanel";
import { MissionRunner } from "../campaign/MissionRunner";
import { ResearchPanel } from "../campaign/ResearchPanel";
import { FactoryPanel } from "../campaign/FactoryPanel";
import { TrlPanel } from "../campaign/TrlPanel";
import { BriefingPanel } from "../campaign/BriefingPanel";
import { WindowCard } from "../campaign/WindowCard";
import { CardsToggle } from "../campaign/PhaseCard";
import { GroundPanel } from "../campaign/GroundPanel";
import { Lobby } from "./Lobby";
import { createRoom, joinRoom, loadSession, poll, saveSession, sendAction, sendLeave, type Session } from "./online";
import {
  defectChance,
  developmentCostMUsd,
  developmentTurns,
  MAX_APERTURE_M,
  MIN_APERTURE_M,
  type DevOrder,
  type DevProject,
} from "../../core/consortium/develop";
import { designPhase, launchBlockers } from "../../core/design";
import type { AgencyProfile } from "../../core/design/agency";
import { resolveAssetUrl } from "../graphics/registry";
import { fmt, t } from "../text";
import { causeChains } from "../../core/debrief";
import { describeEntry } from "./cause";
import { DesignCheckPanel, DesignSteppers, designControls, MissionHeader, ModulePicker, type Upcoming } from "./DesignScreen";
import { DesignPreview } from "./DesignPreview";
import "./planning-console.css";

// Консорціум: кілька агенцій по черзі за одним екраном. Екран лише показує сесію й шле дії.

const AGENCIES = Object.values(agenciesData) as AgencyProfile[];
const MARKET = marketData as Market;
// Сід кидків браку береться тут, на екрані: ядро власного рандому не має, тож кожна нова гра отримує свій.
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

// Локальний режим: кімната живе в стані екрана, усі гравці за одним екраном.
// Онлайн: той самий RoomState приходить із сервера кімнат (online.ts), а дії йдуть на сервер.
// Основний режим — кампанія з кількох вікон запуску (docs/EXPANSION.md); сервер кімнат грає з тими самими налаштуваннями.
const ROOM_SETUP: RoomSetup = campaignRoomSetup(MARKET, AGENCIES);
const newLocalRoom = () => newRoom("p1", "Player 1", AGENCIES.map((a) => a.id), newSeed());
// Соло: одна людина й три боти-конкуренти. Країну гравець обирає в лобі.
const newSoloRoom = (): RoomState => {
  let room: RoomState = newLocalRoom();
  for (let i = 0; i < 3; i++) room = stepRoom(room, "p1", { type: "addBot" }, ROOM_SETUP);
  return room;
};

type Mode = { kind: "menu" } | { kind: "local"; solo: boolean } | { kind: "online"; session: Session };
export type WorkspaceTab = "design" | "factory" | "ground" | "trl" | "research";

// Вкладки «палуби» поруч із модулями. Проєктування не вкладка: апарат, перевірка й модулі видно завжди.
type DeckTab = Exclude<WorkspaceTab, "design">;
const WORKSPACE_TABS: readonly { id: DeckTab; labelKey: string }[] = [
  { id: "factory", labelKey: "ui.console.tab.factory" },
  { id: "ground", labelKey: "ui.console.tab.ground" },
  { id: "trl", labelKey: "ui.console.tab.trl" },
  { id: "research", labelKey: "ui.console.tab.research" },
];

export function ConsortiumScreen({ active = true }: { active?: boolean }) {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = loadSession();
    return saved ? { kind: "online", session: saved } : { kind: "menu" };
  });
  const [notice, setNotice] = useState<string | null>(null);
  const leave = (message?: string) => {
    saveSession(null);
    setNotice(message ?? null);
    setMode({ kind: "menu" });
  };
  if (mode.kind === "local") {
    return <LocalRoom key={String(mode.solo)} solo={mode.solo} active={active} onExit={() => leave()} />;
  }
  if (mode.kind === "online") {
    return <OnlineRoom active={active} session={mode.session} onExit={leave} />;
  }
  return (
    <Menu
      notice={notice}
      onSolo={() => setMode({ kind: "local", solo: true })}
      onLocal={() => setMode({ kind: "local", solo: false })}
      onOnline={(session) => {
        saveSession(session);
        setMode({ kind: "online", session });
      }}
    />
  );
}

function Menu({
  onSolo,
  onLocal,
  onOnline,
  notice,
}: {
  onSolo: () => void;
  onLocal: () => void;
  onOnline: (s: Session) => void;
  notice: string | null;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (job: () => Promise<Session>) => {
    setBusy(true);
    setError(null);
    job()
      .then(onOnline)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  const named = name.trim().length > 0;
  return (
    <div className="mc-panel" style={{ display: "grid", gap: 18, maxWidth: 1100 }} data-testid="menu">
      {/* Вітання: що це за гра й що тут обирати (прохання Ашота). */}
      <div style={{ display: "grid", gap: 8 }}>
        <span className="mc-label">{t("ui.menu.title")}</span>
        <h2 style={{ margin: 0, color: "var(--c-cream)", fontSize: 28 }}>{t("ui.menu.welcome")}</h2>
        <p style={{ margin: 0, color: "var(--c-text-muted)", fontSize: 15, lineHeight: 1.5, maxWidth: 820 }}>{t("ui.menu.pitch")}</p>
        <ol style={{ margin: "4px 0 0", paddingLeft: 20, color: "var(--c-text-muted)", fontSize: 14, lineHeight: 1.6, display: "grid", gap: 2 }}>
          <li>{t("ui.menu.loop1")}</li>
          <li>{t("ui.menu.loop2")}</li>
          <li>{t("ui.menu.loop3")}</li>
          <li>{t("ui.menu.loop4")}</li>
        </ol>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div className="mc-panel" style={{ display: "grid", gap: 8, alignContent: "space-between" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <strong style={{ color: "var(--c-cream)", fontSize: 16 }}>🚀 {t("ui.menu.solo")}</strong>
            <span style={{ color: "var(--c-text-muted)", fontSize: 13 }}>{t("ui.menu.soloHint")}</span>
          </div>
          <button type="button" className="mc-btn mc-btn-primary" onClick={onSolo}>
            {t("ui.menu.solo")}
          </button>
        </div>
        <div className="mc-panel" style={{ display: "grid", gap: 8, alignContent: "space-between" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <strong style={{ color: "var(--c-cream)", fontSize: 16 }}>👥 {t("ui.menu.local")}</strong>
            <span style={{ color: "var(--c-text-muted)", fontSize: 13 }}>{t("ui.menu.localHint")}</span>
          </div>
          <button type="button" className="mc-btn" onClick={onLocal}>
            {t("ui.menu.local")}
          </button>
        </div>
        <div className="mc-panel" style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <strong style={{ color: "var(--c-cream)", fontSize: 16 }}>🌐 {t("ui.menu.online")}</strong>
      <div style={{ color: "var(--c-text-muted)", fontSize: 13 }}>{t("ui.menu.onlineHint")}</div>
      <form
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        onSubmit={(e) => {
          e.preventDefault(); // Enter: із кодом із 4 літер — вхід, інакше створення кімнати
          if (!named || busy) return;
          if (code.length === 4) run(() => joinRoom(code, name));
          else run(() => createRoom(name));
        }}
      >
        <input
          className="mc-input"
          value={name}
          maxLength={24}
          placeholder={t("ui.menu.name")}
          aria-label={t("ui.menu.name")}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="button" className="mc-btn mc-btn-sm" disabled={!named || busy} onClick={() => run(() => createRoom(name))}>
          {t("ui.menu.create")}
        </button>
        <input
          className="mc-input"
          value={code}
          maxLength={4}
          size={5}
          placeholder={t("ui.menu.code")}
          aria-label={t("ui.menu.code")}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, "").toUpperCase())}
        />
        <button
          type="button"
          className="mc-btn mc-btn-sm"
          disabled={!named || code.length !== 4 || busy}
          onClick={() => run(() => joinRoom(code, name))}
        >
          {t("ui.menu.join")}
        </button>
      </form>
        </div>
      </div>
      {notice && <div style={{ color: "var(--c-orange)", fontSize: 13 }}>{notice}</div>}
      {error && <div className="mc-alert-bad">{t("ui.menu.error", { error })}</div>}
    </div>
  );
}

function LocalRoom({ onExit, active, solo }: { onExit: () => void; active: boolean; solo: boolean }) {
  const [room, setRoom] = useState<RoomState>(solo ? newSoloRoom : newLocalRoom);
  const send = (playerId: string, action: RoomAction) => setRoom((r) => stepRoom(r, playerId, action, ROOM_SETUP));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div>
        <button type="button" className="mc-btn mc-btn-sm" onClick={onExit}>
          ← {t("ui.menu.back")}
        </button>
      </div>
      <RoomView
        room={room}
        local
        active={active}
        send={send}
        onStart={() => {
          // За одним екраном «готовий» не потрібен: гравці домовились поруч.
          setRoom((r) => {
            if (r.phase !== "lobby") return r;
            const ready = r.players.reduce<RoomState>(
              (acc, p) => stepRoom(acc, p.id, { type: "ready", ready: true }, ROOM_SETUP),
              r,
            );
            return stepRoom(ready, r.hostId, { type: "start" }, ROOM_SETUP);
          });
        }}
        onRestart={() => setRoom(solo ? newSoloRoom() : newLocalRoom())}
      />
    </div>
  );
}

function OnlineRoom({ session, onExit, active }: { session: Session; onExit: (notice?: string) => void; active: boolean }) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const leaving = useRef(false); // гравець сам вийшов: 403 від сервера після цього очікуваний, без повідомлення «кімнату втрачено»
  useEffect(() => {
    const ctl = new AbortController();
    let version = 0;
    (async () => {
      while (!ctl.signal.aborted) {
        try {
          const snap = await poll(session, version, ctl.signal);
          version = snap.version;
          if (snap.changed && snap.state) setRoom(snap.state);
          setError(null);
        } catch (e) {
          if (ctl.signal.aborted || leaving.current) return;
          const message = (e as Error).message;
          if (message === "unauthorized" || message === "no such room") {
            exitRef.current(t("ui.menu.roomGone"));
            return;
          }
          setError(message);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
    return () => ctl.abort();
  }, [session]);

  const act = (action: RoomAction) => {
    if (action.type === "leave") {
      leaving.current = true;
      void sendLeave(session); // з повторами при мережевому збої, щоб місце не лишилось зайнятим
      onExit(); // і «✕» у лобі, і кнопка «Вийти», і «Ще раз» після гри: одразу в меню, без повідомлення
      return;
    }
    sendAction(session, action).catch((e: Error) => setError(e.message));
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="mc-btn mc-btn-sm" onClick={() => act({ type: "leave" })}>
          ← {t("ui.menu.leave")}
        </button>
        <span className="mc-stat-pill">
          <strong>{t("ui.menu.roomCode", { code: session.code })}</strong>
        </span>
        {error && <span style={{ color: "var(--c-status-bad)" }}>{t("ui.menu.error", { error })}</span>}
      </div>
      {room ? (
        <RoomView
          room={room}
          active={active}
          meId={session.player}
          send={(_, action) => act(action)}
          onStart={() => act({ type: "start" })}
          onRestart={() => act({ type: "leave" })}
        />
      ) : (
        <div style={{ color: "var(--c-text-muted)" }}>{t("ui.menu.connecting")}</div>
      )}
    </div>
  );
}

interface RoomViewProps {
  room: RoomState;
  local?: boolean;
  active?: boolean;
  meId?: string;
  send: (playerId: string, action: RoomAction) => void;
  onStart: () => void;
  onRestart: () => void;
}

function RoomView({ room, local = false, active = true, meId, send, onStart, onRestart }: RoomViewProps) {
  if (room.phase === "lobby") {
    return (
      <Lobby
        room={room}
        agencies={AGENCIES}
        scenarios={ROOM_SETUP.scenarios}
        local={local}
        meId={meId}
        send={send}
        onStart={onStart}
      />
    );
  }
  const { consortium } = room;
  const bots = room.bots ?? [];
  // Чиї агенції «мої»: за одним екраном — усіх людей, онлайн — лише своя.
  const myAgencyIds = room.assignments
    .filter((a) => !bots.includes(a.playerId) && (local ? !room.left.includes(a.playerId) : a.playerId === meId))
    .map((a) => a.agencyId);

  if (consortium.result) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <CampaignStandings state={consortium} />
        <Results state={consortium} onRestart={onRestart} />
      </div>
    );
  }
  // Мій апарат уже злетів: граю політ і орбіту, звіт іде в кімнату. Решта агенцій тим часом ходять далі.
  const flying = pendingReports(consortium).find((id) => myAgencyIds.includes(id));
  const flyingEntry = consortium.agencies.find((e) => e.agency.id === flying);
  const flyingOwner = room.assignments.find((a) => a.agencyId === flying);
  const spec = flyingEntry ? flownSpec(flyingEntry) : null;
  if (flyingEntry && flyingOwner && spec) {
    return (
      <MissionRunner
        key={`${flyingEntry.agency.id}:${consortium.campaign?.round ?? 0}`}
        agencyName={t(flyingEntry.agency.nameKey)}
        mission={flownMission(consortium, flyingEntry)}
        spec={spec}
        seeds={seedsFor(consortium, flyingEntry.agency.id)}
        active={active}
        onReport={(report) => send(flyingOwner.playerId, { type: "report", report })}
      />
    );
  }
  if (consortium.awaiting) {
    const waiting = pendingReports(consortium).map((id) => {
      const a = room.assignments.find((x) => x.agencyId === id);
      return a ? room.playerNames[a.playerId] ?? a.playerId : id;
    });
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <CampaignPanel state={consortium} myAgencyIds={myAgencyIds} />
        <div className="mc-panel" style={{ color: "var(--c-text-muted)" }}>
          {t("ui.campaign.awaiting", { players: waiting.join(", ") })}
        </div>
      </div>
    );
  }
  const entry = activeAgency(consortium);
  const owner = room.assignments.find((a) => a.agencyId === entry?.agency.id);
  const name = owner ? room.playerNames[owner.playerId] ?? owner.playerId : "";
  const mine = local || owner?.playerId === meId;

  return (
    <>
      {mine && entry && active && <WindowCard key={`${entry.agency.id}:${consortium.campaign?.round ?? 0}`} state={consortium} agencyId={entry.agency.id} />}
      <Turn
        state={consortium}
        active={active}
        myAgencyIds={myAgencyIds}
        playerTurnText={t(mine ? "ui.lobby.playerTurn" : "ui.lobby.waitingFor", { player: name })}
        isMyTurn={mine}
        dispatch={(action) => owner && mine && send(owner.playerId, { type: "play", action })}
      />
    </>
  );
}

const APERTURE_STEP_M = 0.05;

function DevelopPanel({
  state,
  dispatch,
  canInteract = true,
}: {
  state: ConsortiumState;
  dispatch: (a: ConsortiumAction) => void;
  canInteract?: boolean;
}) {
  const entry = activeAgency(state);
  const [apertureM, setApertureM] = useState(0.3);
  const [inspect, setInspect] = useState(false);

  useEffect(() => {
    setApertureM(0.3);
    setInspect(false);
  }, [entry?.agency.id]);

  if (!entry) return null;
  const project: DevProject | undefined = entry.projects[0];

  if (project) {
    const left = project.readyTurn - state.turn;
    return (
      <div
        className="mc-stepper-box"
        style={{ borderColor: "var(--c-teal)", justifyContent: "flex-start", gap: 8, fontSize: 13 }}
      >
        <img src={resolveAssetUrl("assets/icons/ui/camera.svg")} alt="" width={15} height={15} />
        <span>
          {t("ui.dev.project", { aperture: fmt(project.apertureM), cost: fmt(project.developmentCostMUsd) })}{" "}
          <span style={{ color: left > 0 ? "var(--c-orange)" : "var(--c-status-ok)", fontWeight: 600 }}>
            {left > 0 ? t("ui.dev.inTurns", { n: left }) : t("ui.dev.ready")}
          </span>
          {project.inspect && ` · ${t("ui.dev.inspected")}`}
        </span>
      </div>
    );
  }

  const order: DevOrder = { slot: "instrument", apertureM, inspect };
  const cost = developmentCostMUsd(entry.agency, order);
  const turns = developmentTurns(entry.agency, order);
  const chance = defectChance(developerProfile(entry, state.turn), order);
  const affordable = cost < entry.design.input.mission.budgetMUsd;
  const canOrder = canInteract && entry.actionsLeft > 0 && affordable;
  return (
    <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--c-border-soft)", paddingTop: 10 }}>
      <strong style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--c-cream)" }}>
        <img src={resolveAssetUrl("assets/icons/ui/camera.svg")} alt="" width={15} height={15} />
        {t("ui.dev.title")}
      </strong>
      <div style={{ color: "var(--c-text-muted)", fontSize: 12 }}>{t("ui.dev.hint")}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span className="mc-tabular">{t("ui.dev.aperture", { aperture: fmt(apertureM) })}</span>
          <input
            type="range"
            min={MIN_APERTURE_M}
            max={MAX_APERTURE_M}
            step={APERTURE_STEP_M}
            value={apertureM}
            disabled={!canInteract}
            onChange={(e) => setApertureM(Math.round(Number(e.target.value) * 100) / 100)}
          />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={inspect} disabled={!canInteract} onChange={(e) => setInspect(e.target.checked)} />
          <span>{t("ui.dev.inspect")}</span>
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span className="mc-tabular" style={{ color: "var(--c-text-muted)", fontSize: 12 }}>
          {t("ui.dev.estimate", { cost: fmt(cost), turns, chance: fmt(chance * 100, 0) })}
        </span>
        <button
          type="button"
          className="mc-btn mc-btn-sm"
          disabled={!canOrder}
          onClick={() => dispatch({ type: "develop", order })}
        >
          {t("ui.dev.order")}
        </button>
      </div>
    </div>
  );
}

export interface TurnProps {
  state: ConsortiumState;
  dispatch: (a: ConsortiumAction) => void;
  active?: boolean;
  myAgencyIds?: string[];
  playerTurnText?: string;
  isMyTurn?: boolean;
  initialTab?: WorkspaceTab;
}

export function Turn({
  state,
  dispatch,
  active = true,
  myAgencyIds,
  playerTurnText,
  isMyTurn = true,
  initialTab = "design",
}: TurnProps) {
  // «design» лишився для сумісності: відкриває першу вкладку палуби.
  const firstTab: DeckTab = initialTab === "design" ? "factory" : initialTab;
  const [tab, setTab] = useState<DeckTab>(firstTab);
  const entry = activeAgency(state);
  const currentAgencyId = entry?.agency.id;
  const [prevAgencyId, setPrevAgencyId] = useState(currentAgencyId);
  if (currentAgencyId !== prevAgencyId) {
    setPrevAgencyId(currentAgencyId);
    setTab(firstTab);
  }
  // Нижня панель із запасами й запуском з'являється, коли картка перевірки виходить з екрана (вибір модулів нижче).
  const checkRef = useRef<HTMLDivElement | null>(null);
  const [checkVisible, setCheckVisible] = useState(true);
  useEffect(() => {
    const el = checkRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setCheckVisible(e?.isIntersecting ?? true), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [currentAgencyId]);
  const { base, market, turn } = state;
  // Що ще з'явиться на ринку: модулі, яких агенція зараз не бачить, але які не під санкціями.
  const catalogNow = entry?.design.input.catalog;
  // Санкції з урахуванням подій (зняття санкцій діє назавжди).
  const blocked = entry ? agencyAfterEvents(entry.agency, state.campaign?.events ?? []).blockedModules : undefined;
  const lead = entry?.agency.marketLeadTurns ?? 0; // дослідження «ранній доступ»: новинки на кілька ходів раніше
  const upcoming: Upcoming[] = useMemo(() => {
    const available = new Set((catalogNow?.modules ?? []).map((m) => m.id));
    return base.catalog.modules
      .filter(
        (m) =>
          market[m.id] !== undefined &&
          (market[m.id]?.fromTurn ?? 0) - lead > turn &&
          !available.has(m.id) &&
          !(blocked ?? []).includes(m.id),
      )
      .map((m) => ({
        id: m.id,
        slot: m.slot,
        nameKey: m.nameKey,
        fromTurn: (market[m.id]?.fromTurn ?? 0) - lead,
      }));
  }, [base, market, turn, catalogNow, blocked, lead]);

  if (!entry) return null;
  const blockers = launchBlockers(entry.design);
  const canLaunch = blockers.length === 0;
  const resolvedMyAgencyIds = myAgencyIds ?? [entry.agency.id];
  const account = entry.account;
  const campaign = state.campaign;
  const campaignTabsEnabled = isMyTurn && Boolean(account);
  const controls = designControls(
    (control) => isMyTurn && (entry.actionsLeft > 0 || entry.touched.includes(control)),
    (action) => dispatch({ type: "design", action }),
  );
  const turnsLeft = Math.max(0, state.deadlineTurn - state.turn + 1);

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    if (!campaignTabsEnabled) return;
    const n = WORKSPACE_TABS.length;
    const nextIndex =
      e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (currentIndex + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    const target = WORKSPACE_TABS[nextIndex];
    if (target) {
      setTab(target.id);
      document.getElementById(`mc-tab-${target.id}`)?.focus();
    }
  };

  const launchControls = (
    <div style={{ display: "grid", gap: 8 }} aria-label={t("ui.console.actionsLabel")}>
      <div className="mc-launch-row">
        <button
          type="button"
          className="mc-btn mc-btn-primary mc-btn-launch"
          disabled={!isMyTurn || !canLaunch}
          onClick={() => dispatch({ type: "launch" })}
        >
          <img src={resolveAssetUrl("assets/icons/ui/rocket.svg")} alt="" width={18} height={18} />
          {t("ui.launch")}
        </button>
        <button
          type="button"
          className="mc-btn mc-btn-launch-alt"
          disabled={!isMyTurn}
          onClick={() => dispatch({ type: "wait" })}
        >
          <img src={resolveAssetUrl("assets/icons/ui/clock.svg")} alt="" width={15} height={15} />
          {t("ui.wait")}
        </button>
      </div>
      <div style={{ color: "var(--c-text-dim)", fontSize: 12, lineHeight: 1.4, textAlign: "center" }}>{t("ui.waitHint")}</div>
    </div>
  );

  const inactiveTabMessage = (
    <div className="mc-panel" style={{ color: "var(--c-text-muted)", fontSize: 13 }}>
      {t(!account ? "ui.console.tabCampaignOnly" : "ui.console.tabWaitingTurn")}
    </div>
  );

  const stat = (label: string, value: ReactNode, tone?: "ok" | "accent") => (
    <div className="mc-hero-stat">
      <span className="mc-label">{label}</span>
      <strong className={`mc-tabular ${tone ? `is-${tone}` : ""}`}>{value}</strong>
    </div>
  );

  return (
    <div className="mc-shell mc-board" data-testid="mission-control-console">
      <header className="mc-hero">
        <div className="mc-hero-top">
          <div className="mc-active-agency">
            <span className="mc-hero-emblem">
              <img src={resolveAssetUrl(`assets/icons/agencies/${entry.agency.id}.svg`)} alt="" width={30} height={30} />
            </span>
            <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <strong style={{ fontSize: 20, color: "var(--c-cream)" }}>
                {t("ui.activeAgency", { agency: t(entry.agency.nameKey) })}
              </strong>
              <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>{t(entry.design.input.mission.titleKey)}</span>
              {playerTurnText && (
                <span style={{ fontSize: 12, color: isMyTurn ? "var(--c-orange)" : "var(--c-text-muted)", fontWeight: 600 }}>
                  {playerTurnText}
                </span>
              )}
            </div>
          </div>

          <div className="mc-hero-stats">
            {stat(t("ui.campaign.funds"), `${fmt(account ? account.fundsMUsd : entry.design.input.mission.budgetMUsd)} M$`)}
            {account && stat(t("ui.campaign.research"), account.researchPts)}
            {account && stat(t("ui.console.reputation"), (account.reputation ?? 0) > 0 ? `+${account.reputation}` : account.reputation ?? 0, (account.reputation ?? 0) > 0 ? "ok" : undefined)}
            {campaign &&
              stat(
                t("ui.console.launchWindow"),
                <>
                  {t("ui.console.nOfTotal", { n: campaign.round + 1, total: campaign.config.rounds })}{" "}
                  <small className="mc-hero-sub">{t("ui.console.turnsLeft", { n: turnsLeft })}</small>
                </>,
              )}
            {stat(t("ui.console.turnLabel"), t("ui.console.nOfTotal", { n: state.turn, total: state.deadlineTurn }))}
            {campaign && stat(t("ui.console.programme"), t("ui.console.programmeValue", { percent: fmt(programProgress(state) * 100, 1) }), "accent")}
          </div>
        </div>

        <div className="mc-hero-bottom">
          <div className="mc-agency-strip">
            {state.agencies.map((e, i) => {
              const isCurrent = i === state.active;
              const launched = !!e.launch;
              return (
                <span
                  key={e.agency.id}
                  className={`mc-agency-chip ${isCurrent ? "is-active" : ""} ${launched ? "is-launched" : ""}`}
                  title={e.launch ? t("ui.status.launched", { turn: e.launch.turn }) : t("ui.status.planning")}
                >
                  <span className="mc-agency-dot" aria-hidden="true" />
                  <img src={resolveAssetUrl(`assets/icons/agencies/${e.agency.id}.svg`)} alt="" width={14} height={14} />
                  <span>{t(e.agency.nameKey)}</span>
                  {e.account ? (
                    <span className="mc-tabular" style={{ opacity: 0.85 }}>{fmt(e.account.fundsMUsd)} M$</span>
                  ) : (
                    <span style={{ opacity: 0.75 }}>
                      · {e.launch ? t("ui.status.launched", { turn: e.launch.turn }) : t("ui.status.planning")}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className={`mc-stat-pill ${entry.actionsLeft > 0 ? "is-accent" : "is-warn"}`}>
              {t("ui.console.controlsLeftShort", { n: entry.actionsLeft })}
            </span>
            {campaign && <CardsToggle className="mc-btn mc-btn-sm" />}
          </div>
        </div>
        <div className={`mc-hero-tip ${canLaunch ? "is-ok" : "is-bad"}`} role="status">
          {canLaunch
            ? t("ui.console.tipReady")
            : t("ui.blocked", { margins: blockers.map((id) => t(`ui.margin.${id}`)).join(", ") })}
        </div>
      </header>

      <div className="mc-row">
        <section className="mc-panel mc-card" id="mc-panel-design" aria-label={t("ui.console.spacecraft")}>
          <div className="mc-card-head">
            <div style={{ display: "grid", gap: 2 }}>
              <span className="mc-label">{t("ui.console.platform")}</span>
              <strong className="mc-card-title">{t("ui.console.spacecraft")}</strong>
            </div>
          </div>
          <MissionHeader state={entry.design} compact />
          <DesignPreview state={entry.design} active={active} />
          <DesignSteppers state={entry.design} controls={controls} />
        </section>

        <div ref={checkRef}>
          <DesignCheckPanel state={entry.design} actionsFooter={launchControls} twoColumns />
        </div>
      </div>

      <div className="mc-row">
        <ModulePicker
          state={entry.design}
          controls={controls}
          upcoming={upcoming}
          resetKey={entry.agency.id}
          customSlotFooter={
            entry.design.input.mission.kind !== "cargo" ? (
              <DevelopPanel key={entry.agency.id} state={state} dispatch={dispatch} canInteract={isMyTurn} />
            ) : undefined
          }
        />

        <section className="mc-panel mc-card" aria-label={t("ui.console.tabsLabel")}>
          <div className="mc-card-head">
            <div style={{ display: "grid", gap: 2 }}>
              <span className="mc-label">{t("ui.console.deck")}</span>
              <strong className="mc-card-title">{t(WORKSPACE_TABS.find((x) => x.id === tab)?.labelKey ?? "ui.console.tab.factory")}</strong>
            </div>
            <div className="mc-tablist" role="tablist" aria-label={t("ui.console.tabsLabel")}>
              {WORKSPACE_TABS.map((item, idx) => {
                const selected = tab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`mc-tab-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`mc-panel-${item.id}`}
                    tabIndex={selected ? 0 : -1}
                    disabled={!campaignTabsEnabled}
                    className="mc-tab"
                    onClick={() => setTab(item.id)}
                    onKeyDown={(e) => onTabKeyDown(e, idx)}
                  >
                    {t(item.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          {WORKSPACE_TABS.map((item) => (
            <div
              key={item.id}
              role="tabpanel"
              id={`mc-panel-${item.id}`}
              aria-labelledby={`mc-tab-${item.id}`}
              className="mc-tabpanel"
              hidden={tab !== item.id}
            >
              {tab !== item.id ? null : !(isMyTurn && account) ? (
                inactiveTabMessage
              ) : item.id === "factory" ? (
                <FactoryPanel key={entry.agency.id} entry={entry} turn={state.turn} dispatch={dispatch} />
              ) : item.id === "ground" ? (
                <GroundPanel entry={entry} dispatch={dispatch} />
              ) : item.id === "trl" ? (
                <TrlPanel entry={entry} dispatch={dispatch} />
              ) : (
                <ResearchPanel entry={entry} dispatch={dispatch} />
              )}
            </div>
          ))}
        </section>
      </div>

      {isMyTurn && campaign && <BriefingPanel state={state} agencyId={entry.agency.id} />}

      {!checkVisible && active && (
        <div className="mc-dock" role="region" aria-label={t("ui.margins")} data-testid="margins-dock">
          <div className="mc-dock-margins">
            {designPhase
              .finish(entry.design)
              .result.margins.filter((m) => !(m.id === "science" && entry.design.input.mission.kind === "cargo"))
              .map((m) => (
                <span key={m.id} className={`mc-dock-chip ${m.ok ? "is-ok" : "is-bad"}`} title={`${fmt(m.have)} / ${fmt(m.need)} ${m.unit}`}>
                  {m.ok ? "✓" : "✗"} {t(`ui.margin.${m.id}`)}
                </span>
              ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="mc-btn mc-btn-primary" disabled={!isMyTurn || !canLaunch} onClick={() => dispatch({ type: "launch" })}>
              <img src={resolveAssetUrl("assets/icons/ui/rocket.svg")} alt="" width={15} height={15} />
              {t("ui.launch")}
            </button>
            <button type="button" className="mc-btn" disabled={!isMyTurn} onClick={() => dispatch({ type: "wait" })}>
              {t("ui.wait")}
            </button>
          </div>
        </div>
      )}

      {campaign ? (
        <div className="mc-row">
          <CampaignPanel state={state} myAgencyIds={resolvedMyAgencyIds} part="standings" />
          <CampaignPanel state={state} myAgencyIds={resolvedMyAgencyIds} part="results" />
        </div>
      ) : (
        <div className="mc-panel" style={{ display: "grid", gap: 8 }}>
          <strong>{t(entry.agency.nameKey)}</strong>
          <p style={{ margin: 0, color: "var(--c-text-muted)", fontSize: 13 }}>{t(entry.agency.descriptionKey)}</p>
        </div>
      )}
    </div>
  );
}

export function Results({ state, onRestart }: { state: ConsortiumState; onRestart: () => void }) {
  const result = state.result;
  if (!result) return null;
  const { settlement, runs } = result;
  const nameOf = (id: string) => {
    const a = state.agencies.find((e) => e.agency.id === id);
    return a ? t(a.agency.nameKey) : id;
  };

  return (
    <div className="mc-panel" style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0, color: "var(--c-cream)" }}>{t("ui.result.title")}</h2>
      {runs.length === 0 ? (
        <p style={{ color: "var(--c-status-bad)" }}>{t("ui.result.nobody")}</p>
      ) : (
        <>
          <div style={{ color: "var(--c-text-muted)" }}>
            {t("ui.result.pool", { pool: fmt(settlement.poolMUsd), diversity: fmt(settlement.diversity) })}
          </div>
          {settlement.bonusMUsd > 0 && (
            <div style={{ color: "var(--c-orange)", fontWeight: 600 }}>
              {t("ui.result.bonusLine", { bonus: fmt(settlement.bonusMUsd) })}
            </div>
          )}
          <table className="mc-table">
            <thead>
              <tr>
                <th>{t("ui.result.agency")}</th>
                <th>{t("ui.result.value")}</th>
                <th>{t("ui.result.share")}</th>
                <th>{t("ui.result.payout")}</th>
              </tr>
            </thead>
            <tbody>
              {settlement.payouts.map((p) => (
                <tr key={p.agencyId} className={p.winner ? "is-player" : undefined}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <img src={resolveAssetUrl(`assets/icons/agencies/${p.agencyId}.svg`)} alt="" width={18} height={18} />
                      {p.winner && <img src={resolveAssetUrl("assets/icons/ui/trophy.svg")} alt="" width={15} height={15} />}
                      {nameOf(p.agencyId)}
                    </span>
                  </td>
                  <td>{fmt(p.valueMUsd)} M$</td>
                  <td>{fmt(p.share * 100, 1)}%</td>
                  <td style={{ color: p.winner ? "var(--c-orange)" : "inherit" }}>
                    {fmt(p.payoutMUsd)} M${p.winner ? ` · ${t("ui.result.bonus")}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {runs.map((run) => {
        const chains = causeChains(run.log);
        const warnings = run.log.filter((e) => e.kind === "warning");
        if (chains.length === 0 && warnings.length === 0) return null;
        return (
          <div key={run.agencyId} style={{ borderTop: "1px solid var(--c-border-soft)", paddingTop: 8 }}>
            <strong>{t("ui.result.why", { agency: nameOf(run.agencyId) })}</strong>
            {chains.map((chain) => (
              <div key={chain.failure.id} style={{ marginTop: 6 }}>
                <div style={{ color: "var(--c-status-bad)", display: "flex", alignItems: "center", gap: 6 }}>
                  <img src={resolveAssetUrl("assets/icons/ui/circle-x.svg")} alt="" width={14} height={14} />
                  {describeEntry(chain.failure, state.base)}
                </div>
                {chain.causes
                  .filter((c) => c.kind !== "event")
                  .map((cause) => (
                    <div key={cause.id} style={{ color: "var(--c-text-muted)", fontSize: 13, marginLeft: 16 }}>
                      ↳ {describeEntry(cause, state.base)}
                    </div>
                  ))}
              </div>
            ))}
            {chains.length === 0 &&
              warnings.map((w) => (
                <div
                  key={w.id}
                  style={{ color: "var(--c-text-muted)", fontSize: 13, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}
                >
                  <img src={resolveAssetUrl("assets/icons/ui/triangle-alert.svg")} alt="" width={14} height={14} />
                  {describeEntry(w, state.base)}
                </div>
              ))}
          </div>
        );
      })}
      {runs.length > 0 &&
        state.agencies
          .filter((e) => !e.launch)
          .map((e) => (
            <div key={e.agency.id} style={{ color: "var(--c-status-bad)" }}>
              {t("ui.result.missed", { agency: t(e.agency.nameKey) })}
            </div>
          ))}
      <div>
        <button type="button" className="mc-btn mc-btn-primary" onClick={onRestart}>
          {t("ui.result.again")}
        </button>
      </div>
    </div>
  );
}
