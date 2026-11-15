import { useEffect, useMemo, useRef, useState } from "react";
import agenciesData from "../../data/agencies.json";
import marketData from "../../data/market.json";
import {
  activeAgency, agencyAfterEvents, campaignRoomSetup, developerProfile, effectiveSetup, flownMission, flownSpec, newRoom, pendingReports, seedsFor, stepRoom,
  type ConsortiumAction, type ConsortiumState, type Market, type RoomAction, type RoomSetup, type RoomState,
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
import { defectChance, developmentCostMUsd, developmentTurns, MAX_APERTURE_M, MIN_APERTURE_M, type DevOrder, type DevProject } from "../../core/consortium/develop";
import { launchBlockers } from "../../core/design";
import type { AgencyProfile } from "../../core/design/agency";
import { resolveAssetUrl } from "../graphics/registry";
import { fmt, t } from "../text";
import { causeChains } from "../../core/debrief";
import { describeEntry } from "./cause";
import { DesignScreen, type Upcoming } from "./DesignScreen";

// Консорціум: кілька агенцій по черзі за одним екраном. Екран лише показує сесію й шле дії.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", bad: "#ff5c7a", accent: "#5ca8ff", gold: "#ffd166" };
const AGENCIES = Object.values(agenciesData) as AgencyProfile[];
const MARKET = marketData as Market;
// Сід кидків браку береться тут, на екрані: ядро власного рандому не має, тож кожна нова гра отримує свій.
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

const button = {
  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 15,
} as const;

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

export function ConsortiumScreen({ active = true }: { active?: boolean }) {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = loadSession();
    return saved ? { kind: "online", session: saved } : { kind: "menu" };
  });
  const [notice, setNotice] = useState<string | null>(null);
  const leave = (message?: string) => { saveSession(null); setNotice(message ?? null); setMode({ kind: "menu" }); };
  if (mode.kind === "local") return <LocalRoom key={String(mode.solo)} solo={mode.solo} active={active} onExit={() => leave()} />;
  if (mode.kind === "online") return <OnlineRoom active={active} session={mode.session} onExit={leave} />;
  return <Menu notice={notice} onSolo={() => setMode({ kind: "local", solo: true })} onLocal={() => setMode({ kind: "local", solo: false })} onOnline={(session) => { saveSession(session); setMode({ kind: "online", session }); }} />;
}

function Menu({ onSolo, onLocal, onOnline, notice }: { onSolo: () => void; onLocal: () => void; onOnline: (s: Session) => void; notice: string | null }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (job: () => Promise<Session>) => {
    setBusy(true); setError(null);
    job().then(onOnline).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  };
  const named = name.trim().length > 0;
  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 20, display: "grid", gap: 12 }} data-testid="menu">
      <h2 style={{ margin: 0 }}>{t("ui.menu.title")}</h2>
      <div>
        <button style={{ ...button, borderColor: C.ok }} onClick={onSolo}>{t("ui.menu.solo")}</button>
        <span style={{ color: C.dim, marginLeft: 10, fontSize: 13 }}>{t("ui.menu.soloHint")}</span>
      </div>
      <div>
        <button style={{ ...button, borderColor: C.accent }} onClick={onLocal}>{t("ui.menu.local")}</button>
        <span style={{ color: C.dim, marginLeft: 10, fontSize: 13 }}>{t("ui.menu.localHint")}</span>
      </div>
      <hr style={{ borderColor: C.line, width: "100%" }} />
      <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.menu.onlineHint")}</div>
      <form
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        onSubmit={(e) => {
          e.preventDefault(); // Enter: із кодом із 4 літер — вхід, інакше створення кімнати
          if (!named || busy) return;
          if (code.length === 4) run(() => joinRoom(code, name)); else run(() => createRoom(name));
        }}
      >
        <input value={name} maxLength={24} placeholder={t("ui.menu.name")} aria-label={t("ui.menu.name")} onChange={(e) => setName(e.target.value)} />
        <button type="button" style={{ ...button, opacity: named && !busy ? 1 : 0.5 }} disabled={!named || busy} onClick={() => run(() => createRoom(name))}>
          {t("ui.menu.create")}
        </button>
        <input value={code} maxLength={4} size={5} placeholder={t("ui.menu.code")} aria-label={t("ui.menu.code")} onChange={(e) => setCode(e.target.value.replace(/\s/g, "").toUpperCase())} />
        <button type="button" style={{ ...button, opacity: named && code.length === 4 && !busy ? 1 : 0.5 }} disabled={!named || code.length !== 4 || busy} onClick={() => run(() => joinRoom(code, name))}>
          {t("ui.menu.join")}
        </button>
      </form>
      {notice && <div style={{ color: C.gold }}>{notice}</div>}
      {error && <div style={{ color: C.bad }}>{t("ui.menu.error", { error })}</div>}
    </div>
  );
}

function LocalRoom({ onExit, active, solo }: { onExit: () => void; active: boolean; solo: boolean }) {
  const [room, setRoom] = useState<RoomState>(solo ? newSoloRoom : newLocalRoom);
  const send = (playerId: string, action: RoomAction) => setRoom((r) => stepRoom(r, playerId, action, ROOM_SETUP));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div><button style={button} onClick={onExit}>← {t("ui.menu.back")}</button></div>
      <RoomView
        room={room} local active={active} send={send}
        onStart={() => {
          // За одним екраном «готовий» не потрібен: гравці домовились поруч.
          setRoom((r) => {
            if (r.phase !== "lobby") return r;
            const ready = r.players.reduce<RoomState>((acc, p) => stepRoom(acc, p.id, { type: "ready", ready: true }, ROOM_SETUP), r);
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
          if (message === "unauthorized" || message === "no such room") { exitRef.current(t("ui.menu.roomGone")); return; }
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
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button style={button} onClick={() => act({ type: "leave" })}>← {t("ui.menu.leave")}</button>
        <strong>{t("ui.menu.roomCode", { code: session.code })}</strong>
        {error && <span style={{ color: C.bad }}>{t("ui.menu.error", { error })}</span>}
      </div>
      {room ? (
        <RoomView room={room} active={active} meId={session.player} send={(_, action) => act(action)} onStart={() => act({ type: "start" })} onRestart={() => act({ type: "leave" })} />
      ) : (
        <div style={{ color: C.dim }}>{t("ui.menu.connecting")}</div>
      )}
    </div>
  );
}

interface RoomViewProps {
  room: RoomState; local?: boolean; active?: boolean; meId?: string;
  send: (playerId: string, action: RoomAction) => void; onStart: () => void; onRestart: () => void;
}

function RoomView({ room, local = false, active = true, meId, send, onStart, onRestart }: RoomViewProps) {
  if (room.phase === "lobby") return <Lobby room={room} agencies={AGENCIES} scenarios={ROOM_SETUP.scenarios} local={local} meId={meId} send={send} onStart={onStart} />;
  const { consortium } = room;
  const bots = room.bots ?? [];
  // Чиї агенції «мої»: за одним екраном — усіх людей, онлайн — лише своя.
  const myAgencyIds = room.assignments
    .filter((a) => !bots.includes(a.playerId) && (local ? !room.left.includes(a.playerId) : a.playerId === meId))
    .map((a) => a.agencyId);
  if (consortium.result) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
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
        agencyName={t(flyingEntry.agency.nameKey)} mission={flownMission(consortium, flyingEntry)} spec={spec}
        seeds={seedsFor(consortium, flyingEntry.agency.id)} active={active}
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
      <div style={{ display: "grid", gap: 8 }}>
        <CampaignPanel state={consortium} myAgencyIds={myAgencyIds} />
        <div style={{ color: C.dim }}>{t("ui.campaign.awaiting", { players: waiting.join(", ") })}</div>
      </div>
    );
  }
  const entry = activeAgency(consortium);
  const owner = room.assignments.find((a) => a.agencyId === entry?.agency.id);
  const name = owner ? room.playerNames[owner.playerId] ?? owner.playerId : "";
  const mine = local || owner?.playerId === meId;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {mine && entry && active && <WindowCard key={`${entry.agency.id}:${consortium.campaign?.round ?? 0}`} state={consortium} agencyId={entry.agency.id} />}
      {mine && entry && <BriefingPanel state={consortium} agencyId={entry.agency.id} />}
      <CampaignPanel state={consortium} myAgencyIds={myAgencyIds} />
      {consortium.campaign && <CardsToggle />}
      <div style={{ color: mine ? C.gold : C.dim }}>{t(mine ? "ui.lobby.playerTurn" : "ui.lobby.waitingFor", { player: name })}</div>
      <div inert={!mine} style={mine ? undefined : { pointerEvents: "none", opacity: 0.7 }}>
        <Turn state={consortium} active={active} dispatch={(action) => owner && mine && send(owner.playerId, { type: "play", action })} />
      </div>
      {mine && entry && entry.account && (
        <>
          <FactoryPanel key={entry.agency.id} entry={entry} turn={consortium.turn} dispatch={(action) => owner && send(owner.playerId, { type: "play", action })} />
          <GroundPanel entry={entry} dispatch={(action) => owner && send(owner.playerId, { type: "play", action })} />
          <TrlPanel entry={entry} dispatch={(action) => owner && send(owner.playerId, { type: "play", action })} />
          <ResearchPanel entry={entry} dispatch={(action) => owner && send(owner.playerId, { type: "play", action })} />
        </>
      )}
    </div>
  );
}

const APERTURE_STEP_M = 0.05;

function DevelopPanel({ state, dispatch }: { state: ConsortiumState; dispatch: (a: ConsortiumAction) => void }) {
  const entry = activeAgency(state);
  const [apertureM, setApertureM] = useState(0.3);
  const [inspect, setInspect] = useState(false);
  if (!entry) return null;
  const project: DevProject | undefined = entry.projects[0];

  if (project) {
    const left = project.readyTurn - state.turn;
    return (
      <div style={{ color: C.dim, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
        <img src={resolveAssetUrl("assets/icons/ui/camera.svg")} alt="" width={15} height={15} />
        <span>
          {t("ui.dev.project", { aperture: fmt(project.apertureM), cost: fmt(project.developmentCostMUsd) })}{" "}
          <span style={{ color: left > 0 ? C.gold : C.ok }}>{left > 0 ? t("ui.dev.inTurns", { n: left }) : t("ui.dev.ready")}</span>
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
  const canOrder = entry.actionsLeft > 0 && affordable;
  return (
    <div style={{ display: "grid", gap: 6, borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
      <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <img src={resolveAssetUrl("assets/icons/ui/camera.svg")} alt="" width={15} height={15} />
        {t("ui.dev.title")}
      </strong>
      <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.dev.hint")}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          {t("ui.dev.aperture", { aperture: fmt(apertureM) })}{" "}
          <input type="range" min={MIN_APERTURE_M} max={MAX_APERTURE_M} step={APERTURE_STEP_M} value={apertureM}
            onChange={(e) => setApertureM(Math.round(Number(e.target.value) * 100) / 100)} />
        </label>
        <label>
          <input type="checkbox" checked={inspect} onChange={(e) => setInspect(e.target.checked)} /> {t("ui.dev.inspect")}
        </label>
      </div>
      <div style={{ color: C.dim, fontSize: 13 }}>
        {t("ui.dev.estimate", { cost: fmt(cost), turns, chance: fmt(chance * 100, 0) })}
      </div>
      <div>
        <button style={{ ...button, opacity: canOrder ? 1 : 0.5 }} disabled={!canOrder} onClick={() => dispatch({ type: "develop", order })}>
          {t("ui.dev.order")}
        </button>
      </div>
    </div>
  );
}

export function Turn({ state, dispatch, active = true }: { state: ConsortiumState; dispatch: (a: ConsortiumAction) => void; active?: boolean }) {
  const entry = activeAgency(state);
  const { base, market, turn } = state;
  // Що ще з'явиться на ринку: модулі, яких агенція зараз не бачить, але які не під санкціями.
  const catalogNow = entry?.design.input.catalog;
  // Санкції з урахуванням подій (зняття санкцій діє назавжди).
  const blocked = entry ? agencyAfterEvents(entry.agency, state.campaign?.events ?? []).blockedModules : undefined;
  const lead = entry?.agency.marketLeadTurns ?? 0; // дослідження «ранній доступ»: новинки на кілька ходів раніше
  const upcoming: Upcoming[] = useMemo(
    () => {
      const available = new Set((catalogNow?.modules ?? []).map((m) => m.id));
      return base.catalog.modules
        .filter((m) => market[m.id] !== undefined && (market[m.id]?.fromTurn ?? 0) - lead > turn && !available.has(m.id) && !(blocked ?? []).includes(m.id))
        .map((m) => ({ id: m.id, slot: m.slot, nameKey: m.nameKey, fromTurn: (market[m.id]?.fromTurn ?? 0) - lead }));
    },
    [base, market, turn, catalogNow, blocked, lead],
  );
  if (!entry) return null;
  const canLaunch = launchBlockers(entry.design).length === 0;

  const header = (
    <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <img src={resolveAssetUrl(`assets/icons/agencies/${entry.agency.id}.svg`)} alt="" width={24} height={24} />
        <strong style={{ fontSize: 20 }}>{t("ui.activeAgency", { agency: t(entry.agency.nameKey) })}</strong>
        <span style={{ color: C.accent }}>{t("ui.turn", { turn: state.turn, deadline: state.deadlineTurn })}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {state.agencies.map((e, i) => (
          <span
            key={e.agency.id}
            style={{
              padding: "4px 10px", borderRadius: 999, fontSize: 13, border: `1px solid ${i === state.active ? C.accent : C.line}`,
              color: e.launch ? C.ok : C.dim, display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <img src={resolveAssetUrl(`assets/icons/agencies/${e.agency.id}.svg`)} alt="" width={14} height={14} />
            {t(e.agency.nameKey)} · {e.launch ? t("ui.status.launched", { turn: e.launch.turn }) : t("ui.status.planning")}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={{ ...button, borderColor: canLaunch ? C.ok : C.line, opacity: canLaunch ? 1 : 0.5, display: "inline-flex", alignItems: "center", gap: 6 }} disabled={!canLaunch} onClick={() => dispatch({ type: "launch" })}>
          <img src={resolveAssetUrl("assets/icons/ui/rocket.svg")} alt="" width={15} height={15} />
          {t("ui.launch")}
        </button>
        <button style={{ ...button, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => dispatch({ type: "wait" })}>
          <img src={resolveAssetUrl("assets/icons/ui/clock.svg")} alt="" width={15} height={15} />
          {t("ui.wait")}
        </button>
      </div>
      <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.waitHint")}</div>
      {entry.design.input.mission.kind !== "cargo" && <DevelopPanel state={state} dispatch={dispatch} />}
    </div>
  );

  return (
    <DesignScreen
      active={active}
      state={entry.design} editable={(control) => entry.actionsLeft > 0 || entry.touched.includes(control)} actionsLeft={entry.actionsLeft} upcoming={upcoming} header={header}
      dispatch={(action) => dispatch({ type: "design", action })}
    />
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
    <div style={{ background: C.panel, borderRadius: 12, padding: 20, display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>{t("ui.result.title")}</h2>
      {runs.length === 0 ? (
        <p style={{ color: C.bad }}>{t("ui.result.nobody")}</p>
      ) : (
        <>
          <div style={{ color: C.dim }}>{t("ui.result.pool", { pool: fmt(settlement.poolMUsd), diversity: fmt(settlement.diversity) })}</div>
          {settlement.bonusMUsd > 0 && <div style={{ color: C.gold }}>{t("ui.result.bonusLine", { bonus: fmt(settlement.bonusMUsd) })}</div>}
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ color: C.dim, textAlign: "left", fontSize: 13 }}>
                <th>{t("ui.result.agency")}</th><th>{t("ui.result.value")}</th><th>{t("ui.result.share")}</th><th>{t("ui.result.payout")}</th>
              </tr>
            </thead>
            <tbody>
              {settlement.payouts.map((p) => (
                <tr key={p.agencyId} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: "8px 0" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <img src={resolveAssetUrl(`assets/icons/agencies/${p.agencyId}.svg`)} alt="" width={18} height={18} />
                      {p.winner && <img src={resolveAssetUrl("assets/icons/ui/trophy.svg")} alt="" width={15} height={15} />}
                      {nameOf(p.agencyId)}
                    </span>
                  </td>
                  <td>{fmt(p.valueMUsd)} M$</td>
                  <td>{fmt(p.share * 100, 1)}%</td>
                  <td style={{ color: p.winner ? C.gold : "inherit" }}>{fmt(p.payoutMUsd)} M${p.winner ? ` · ${t("ui.result.bonus")}` : ""}</td>
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
          <div key={run.agencyId} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
            <strong>{t("ui.result.why", { agency: nameOf(run.agencyId) })}</strong>
            {chains.map((chain) => (
              <div key={chain.failure.id} style={{ marginTop: 6 }}>
                <div style={{ color: C.bad, display: "flex", alignItems: "center", gap: 6 }}>
                  <img src={resolveAssetUrl("assets/icons/ui/circle-x.svg")} alt="" width={14} height={14} />
                  {describeEntry(chain.failure, state.base)}
                </div>
                {chain.causes.filter((c) => c.kind !== "event").map((cause) => (
                  <div key={cause.id} style={{ color: C.dim, fontSize: 13, marginLeft: 16 }}>↳ {describeEntry(cause, state.base)}</div>
                ))}
              </div>
            ))}
            {chains.length === 0 && warnings.map((w) => (
              <div key={w.id} style={{ color: C.dim, fontSize: 13, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <img src={resolveAssetUrl("assets/icons/ui/triangle-alert.svg")} alt="" width={14} height={14} />
                {describeEntry(w, state.base)}
              </div>
            ))}
          </div>
        );
      })}
      {runs.length > 0 && state.agencies.filter((e) => !e.launch).map((e) => (
        <div key={e.agency.id} style={{ color: C.bad }}>{t("ui.result.missed", { agency: t(e.agency.nameKey) })}</div>
      ))}
      <div><button style={button} onClick={onRestart}>{t("ui.result.again")}</button></div>
    </div>
  );
}
