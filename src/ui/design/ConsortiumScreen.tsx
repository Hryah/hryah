import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
import { launchBlockers } from "../../core/design";
import type { AgencyProfile } from "../../core/design/agency";
import { resolveAssetUrl } from "../graphics/registry";
import { fmt, t } from "../text";
import { causeChains } from "../../core/debrief";
import { describeEntry } from "./cause";
import { DesignCheckPanel, DesignScreen, type Upcoming } from "./DesignScreen";
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

const WORKSPACE_TABS: readonly { id: WorkspaceTab; labelKey: string }[] = [
  { id: "design", labelKey: "ui.console.tab.design" },
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
    <div className="mc-panel" style={{ display: "grid", gap: 14, maxWidth: 760 }} data-testid="menu">
      <h2 style={{ margin: 0, color: "var(--c-cream)" }}>{t("ui.menu.title")}</h2>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="mc-btn mc-btn-primary" onClick={onSolo}>
          {t("ui.menu.solo")}
        </button>
        <span style={{ color: "var(--c-text-muted)", fontSize: 13 }}>{t("ui.menu.soloHint")}</span>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="mc-btn" onClick={onLocal}>
          {t("ui.menu.local")}
        </button>
        <span style={{ color: "var(--c-text-muted)", fontSize: 13 }}>{t("ui.menu.localHint")}</span>
      </div>
      <hr style={{ borderColor: "var(--c-border-soft)", width: "100%", margin: "2px 0" }} />
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
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const entry = activeAgency(state);
  const currentAgencyId = entry?.agency.id;
  const [prevAgencyId, setPrevAgencyId] = useState(currentAgencyId);
  if (currentAgencyId !== prevAgencyId) {
    setPrevAgencyId(currentAgencyId);
    setTab(initialTab);
  }
  const shellRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    const headerEl = headerRef.current;
    const shellEl = shellRef.current;
    if (!headerEl || !shellEl) return;
    const updateOffset = () => {
      const h = Math.ceil(headerEl.getBoundingClientRect().height);
      shellEl.style.setProperty("--mc-sticky-offset", `${h + 20}px`);
    };
    updateOffset();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateOffset) : null;
    ro?.observe(headerEl);
    window.addEventListener("resize", updateOffset);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, [currentAgencyId, state.turn, isMyTurn, state.agencies.length]);

  if (!entry) return null;
  const canLaunch = launchBlockers(entry.design).length === 0;
  const resolvedMyAgencyIds = myAgencyIds ?? [entry.agency.id];
  const account = entry.account;
  const campaign = state.campaign;
  const campaignTabsEnabled = isMyTurn && Boolean(account);

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const enabledTabs = WORKSPACE_TABS.filter((item) => item.id === "design" || campaignTabsEnabled);
    if (enabledTabs.length === 0) return;
    const currentItem = WORKSPACE_TABS[currentIndex];
    const currentEnabledIdx = currentItem ? enabledTabs.findIndex((item) => item.id === currentItem.id) : 0;
    const safeIdx = currentEnabledIdx >= 0 ? currentEnabledIdx : 0;
    const nextIndex =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? enabledTabs.length - 1
          : (safeIdx + (e.key === "ArrowRight" ? 1 : -1) + enabledTabs.length) % enabledTabs.length;
    const target = enabledTabs[nextIndex];
    if (target) {
      setTab(target.id);
      document.getElementById(`mc-tab-${target.id}`)?.focus();
    }
  };

  const launchControls = (
    <div style={{ display: "grid", gap: 8 }} aria-label={t("ui.console.actionsLabel")}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="mc-btn mc-btn-primary"
          style={{ flex: "1 1 130px" }}
          disabled={!isMyTurn || !canLaunch}
          onClick={() => dispatch({ type: "launch" })}
        >
          <img src={resolveAssetUrl("assets/icons/ui/rocket.svg")} alt="" width={15} height={15} />
          {t("ui.launch")}
        </button>
        <button
          type="button"
          className="mc-btn"
          style={{ flex: "1 1 120px" }}
          disabled={!isMyTurn}
          onClick={() => dispatch({ type: "wait" })}
        >
          <img src={resolveAssetUrl("assets/icons/ui/clock.svg")} alt="" width={15} height={15} />
          {t("ui.wait")}
        </button>
      </div>
      <div style={{ color: "var(--c-text-dim)", fontSize: 12, lineHeight: 1.4 }}>{t("ui.waitHint")}</div>
    </div>
  );

  const inactiveTabMessage = (
    <div className="mc-panel" style={{ color: "var(--c-text-muted)", fontSize: 13 }}>
      {t(!account ? "ui.console.tabCampaignOnly" : "ui.console.tabWaitingTurn")}
    </div>
  );

  return (
    <div ref={shellRef} className="mc-shell" data-testid="mission-control-console">
      <header ref={headerRef} className="mc-sticky-bar">
        <div className="mc-header-top">
          <div className="mc-active-agency">
            <img src={resolveAssetUrl(`assets/icons/agencies/${entry.agency.id}.svg`)} alt="" width={26} height={26} />
            <div style={{ display: "grid", gap: 2 }}>
              <strong style={{ fontSize: 17, color: "var(--c-cream)" }}>
                {t("ui.activeAgency", { agency: t(entry.agency.nameKey) })}
              </strong>
              {playerTurnText && (
                <span style={{ fontSize: 12, color: isMyTurn ? "var(--c-orange)" : "var(--c-text-muted)", fontWeight: 600 }}>
                  {playerTurnText}
                </span>
              )}
            </div>
          </div>

          <div className="mc-hud-stats">
            <span className="mc-stat-pill">
              <span className="mc-label">{t("ui.campaign.funds")}</span>
              <strong>{fmt(account ? account.fundsMUsd : entry.design.input.mission.budgetMUsd)} M$</strong>
            </span>
            {account && (
              <>
                <span className="mc-stat-pill">
                  <span className="mc-label">{t("ui.campaign.research")}</span>
                  <strong>{account.researchPts}</strong>
                </span>
                <span className="mc-stat-pill">
                  <span className="mc-label">{t("ui.console.reputation")}</span>
                  <strong>{account.reputation ?? 0}</strong>
                </span>
              </>
            )}
            {campaign && (
              <span className="mc-stat-pill">
                {t("ui.console.windowBadge", { n: campaign.round + 1, total: campaign.config.rounds })}
              </span>
            )}
            <span className="mc-stat-pill is-accent">
              {t("ui.turn", { turn: state.turn, deadline: state.deadlineTurn })}
            </span>
            <span className={`mc-stat-pill ${entry.actionsLeft > 0 ? "" : "is-warn"}`}>
              {t("ui.console.controlsLeftShort", { n: entry.actionsLeft })}
            </span>
          </div>
        </div>

        <div className="mc-agency-strip">
          {state.agencies.map((e, i) => {
            const isCurrent = i === state.active;
            const launched = !!e.launch;
            return (
              <span
                key={e.agency.id}
                className={`mc-agency-chip ${isCurrent ? "is-active" : ""} ${launched ? "is-launched" : ""}`}
              >
                <img src={resolveAssetUrl(`assets/icons/agencies/${e.agency.id}.svg`)} alt="" width={14} height={14} />
                <span>{t(e.agency.nameKey)}</span>
                <span style={{ opacity: 0.75 }}>·</span>
                <span>{e.launch ? t("ui.status.launched", { turn: e.launch.turn }) : t("ui.status.planning")}</span>
              </span>
            );
          })}
        </div>
      </header>

      <div className="mc-grid">
        <aside className="mc-col-left" aria-label={t("ui.console.missionControl")}>
          <div className="mc-label" style={{ paddingLeft: 4 }}>
            {t("ui.console.missionControl")}
          </div>
          {isMyTurn && campaign && <BriefingPanel state={state} agencyId={entry.agency.id} />}
          {campaign ? (
            <>
              <CampaignPanel state={state} myAgencyIds={resolvedMyAgencyIds} />
              <CardsToggle />
            </>
          ) : (
            <div className="mc-panel" style={{ display: "grid", gap: 8 }}>
              <strong>{t(entry.agency.nameKey)}</strong>
              <p style={{ margin: 0, color: "var(--c-text-muted)", fontSize: 13 }}>{t(entry.agency.descriptionKey)}</p>
            </div>
          )}
        </aside>

        <section className="mc-col-center" aria-label={t("ui.console.tabsLabel")}>
          <div className="mc-tablist" role="tablist" aria-label={t("ui.console.tabsLabel")}>
            {WORKSPACE_TABS.map((item, idx) => {
              const selected = tab === item.id;
              const disabled = item.id !== "design" && !campaignTabsEnabled;
              return (
                <button
                  key={item.id}
                  id={`mc-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`mc-panel-${item.id}`}
                  tabIndex={selected ? 0 : -1}
                  disabled={disabled}
                  className="mc-tab"
                  onClick={() => setTab(item.id)}
                  onKeyDown={(e) => onTabKeyDown(e, idx)}
                >
                  {t(item.labelKey)}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id="mc-panel-design"
            aria-labelledby="mc-tab-design"
            className="mc-tabpanel"
            hidden={tab !== "design"}
            style={{ display: tab === "design" ? "block" : "none" }}
          >
            <DesignScreen
              layoutMode="console"
              resetKey={entry.agency.id}
              active={active && tab === "design"}
              state={entry.design}
              editable={(control) => isMyTurn && (entry.actionsLeft > 0 || entry.touched.includes(control))}
              actionsLeft={entry.actionsLeft}
              upcoming={upcoming}
              customSlotFooter={
                entry.design.input.mission.kind !== "cargo" ? (
                  <DevelopPanel key={entry.agency.id} state={state} dispatch={dispatch} canInteract={isMyTurn} />
                ) : undefined
              }
              dispatch={(action) => dispatch({ type: "design", action })}
            />
          </div>

          <div
            role="tabpanel"
            id="mc-panel-factory"
            aria-labelledby="mc-tab-factory"
            className="mc-tabpanel"
            hidden={tab !== "factory"}
          >
            {isMyTurn && account ? (
              <FactoryPanel key={entry.agency.id} entry={entry} turn={state.turn} dispatch={dispatch} />
            ) : (
              inactiveTabMessage
            )}
          </div>

          <div
            role="tabpanel"
            id="mc-panel-ground"
            aria-labelledby="mc-tab-ground"
            className="mc-tabpanel"
            hidden={tab !== "ground"}
          >
            {isMyTurn && account ? <GroundPanel entry={entry} dispatch={dispatch} /> : inactiveTabMessage}
          </div>

          <div
            role="tabpanel"
            id="mc-panel-trl"
            aria-labelledby="mc-tab-trl"
            className="mc-tabpanel"
            hidden={tab !== "trl"}
          >
            {isMyTurn && account ? <TrlPanel entry={entry} dispatch={dispatch} /> : inactiveTabMessage}
          </div>

          <div
            role="tabpanel"
            id="mc-panel-research"
            aria-labelledby="mc-tab-research"
            className="mc-tabpanel"
            hidden={tab !== "research"}
          >
            {isMyTurn && account ? <ResearchPanel entry={entry} dispatch={dispatch} /> : inactiveTabMessage}
          </div>
        </section>

        <aside className="mc-col-right" aria-label={t("ui.console.designCheck")}>
          <DesignCheckPanel state={entry.design} actionsFooter={launchControls} />
        </aside>
      </div>
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
