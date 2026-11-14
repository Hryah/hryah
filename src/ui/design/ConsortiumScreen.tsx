import { useEffect, useMemo, useRef, useState } from "react";
import agenciesData from "../../data/agencies.json";
import marketData from "../../data/market.json";
import { activeAgency, newRoom, stepRoom, type ConsortiumAction, type ConsortiumState, type Market, type RoomAction, type RoomSetup, type RoomState } from "../../core/consortium";
import { Lobby } from "./Lobby";
import { createRoom, joinRoom, loadSession, poll, saveSession, sendAction, type Session } from "./online";
import { defectChance, developmentCostMUsd, developmentTurns, MAX_APERTURE_M, MIN_APERTURE_M, type DevOrder, type DevProject } from "../../core/consortium/develop";
import { launchBlockers } from "../../core/design";
import type { AgencyProfile } from "../../core/design/agency";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../../core/stubs";
import { fmt, t } from "../text";
import { causeChains } from "../../core/debrief";
import { describeEntry } from "./cause";
import { DesignScreen, type Upcoming } from "./DesignScreen";

// Консорціум: кілька агенцій по черзі за одним екраном. Екран лише показує сесію й шле дії.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", bad: "#ff5c7a", accent: "#5ca8ff", gold: "#ffd166" };
const AGENCIES = Object.values(agenciesData) as AgencyProfile[];
const MARKET = marketData as Market;
const BASE = { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG };
// Сід кидків браку береться тут, на екрані: ядро власного рандому не має, тож кожна нова гра отримує свій.
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

const button = {
  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 15,
} as const;

// Локальний режим: кімната живе в стані екрана, усі гравці за одним екраном.
// Онлайн: той самий RoomState приходить із сервера кімнат (online.ts), а дії йдуть на сервер.
const ROOM_SETUP: RoomSetup = { base: BASE, market: MARKET, agencies: AGENCIES };
const newLocalRoom = () => newRoom("p1", "Player 1", AGENCIES.map((a) => a.id), newSeed());

type Mode = { kind: "menu" } | { kind: "local" } | { kind: "online"; session: Session };

export function ConsortiumScreen() {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = loadSession();
    return saved ? { kind: "online", session: saved } : { kind: "menu" };
  });
  const leave = () => { saveSession(null); setMode({ kind: "menu" }); };
  if (mode.kind === "local") return <LocalRoom onExit={leave} />;
  if (mode.kind === "online") return <OnlineRoom session={mode.session} onExit={leave} />;
  return <Menu onLocal={() => setMode({ kind: "local" })} onOnline={(session) => { saveSession(session); setMode({ kind: "online", session }); }} />;
}

function Menu({ onLocal, onOnline }: { onLocal: () => void; onOnline: (s: Session) => void }) {
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
        <button style={{ ...button, borderColor: C.accent }} onClick={onLocal}>{t("ui.menu.local")}</button>
        <span style={{ color: C.dim, marginLeft: 10, fontSize: 13 }}>{t("ui.menu.localHint")}</span>
      </div>
      <hr style={{ borderColor: C.line, width: "100%" }} />
      <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.menu.onlineHint")}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={name} maxLength={24} placeholder={t("ui.menu.name")} aria-label={t("ui.menu.name")} onChange={(e) => setName(e.target.value)} />
        <button style={{ ...button, opacity: named && !busy ? 1 : 0.5 }} disabled={!named || busy} onClick={() => run(() => createRoom(name))}>
          {t("ui.menu.create")}
        </button>
        <input value={code} maxLength={4} size={5} placeholder={t("ui.menu.code")} aria-label={t("ui.menu.code")} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button style={{ ...button, opacity: named && code.length === 4 && !busy ? 1 : 0.5 }} disabled={!named || code.length !== 4 || busy} onClick={() => run(() => joinRoom(code, name))}>
          {t("ui.menu.join")}
        </button>
      </div>
      {error && <div style={{ color: C.bad }}>{t("ui.menu.error", { error })}</div>}
    </div>
  );
}

function LocalRoom({ onExit }: { onExit: () => void }) {
  const [room, setRoom] = useState<RoomState>(newLocalRoom);
  const send = (playerId: string, action: RoomAction) => setRoom((r) => stepRoom(r, playerId, action, ROOM_SETUP));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div><button style={button} onClick={onExit}>← {t("ui.menu.back")}</button></div>
      <RoomView
        room={room} local send={send}
        onStart={() => {
          // За одним екраном «готовий» не потрібен: гравці домовились поруч.
          setRoom((r) => {
            if (r.phase !== "lobby") return r;
            const ready = r.players.reduce<RoomState>((acc, p) => stepRoom(acc, p.id, { type: "ready", ready: true }, ROOM_SETUP), r);
            return stepRoom(ready, r.hostId, { type: "start" }, ROOM_SETUP);
          });
        }}
        onRestart={() => setRoom(newLocalRoom())}
      />
    </div>
  );
}

function OnlineRoom({ session, onExit }: { session: Session; onExit: () => void }) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  useEffect(() => {
    const ctl = new AbortController();
    let version = 0;
    (async () => {
      while (!ctl.signal.aborted) {
        try {
          const snap = await poll(session, version, ctl.signal);
          version = snap.version;
          if (snap.changed) setRoom(snap.state);
          setError(null);
        } catch (e) {
          if (ctl.signal.aborted) return;
          const message = (e as Error).message;
          if (message === "unauthorized" || message === "no such room") { exitRef.current(); return; }
          setError(message);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
    return () => ctl.abort();
  }, [session]);

  const act = (action: RoomAction) => { sendAction(session, action).catch((e: Error) => setError(e.message)); };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button style={button} onClick={() => { act({ type: "leave" }); onExit(); }}>← {t("ui.menu.leave")}</button>
        <strong>{t("ui.menu.roomCode", { code: session.code })}</strong>
        {error && <span style={{ color: C.bad }}>{t("ui.menu.error", { error })}</span>}
      </div>
      {room ? (
        <RoomView room={room} meId={session.player} send={(_, action) => act(action)} onStart={() => act({ type: "start" })} onRestart={onExit} />
      ) : (
        <div style={{ color: C.dim }}>{t("ui.menu.connecting")}</div>
      )}
    </div>
  );
}

interface RoomViewProps {
  room: RoomState; local?: boolean; meId?: string;
  send: (playerId: string, action: RoomAction) => void; onStart: () => void; onRestart: () => void;
}

function RoomView({ room, local = false, meId, send, onStart, onRestart }: RoomViewProps) {
  if (room.phase === "lobby") return <Lobby room={room} agencies={AGENCIES} local={local} meId={meId} send={send} onStart={onStart} />;
  const { consortium } = room;
  if (consortium.result) return <Results state={consortium} onRestart={onRestart} />;
  const entry = activeAgency(consortium);
  const owner = room.assignments.find((a) => a.agencyId === entry?.agency.id);
  const name = owner ? room.playerNames[owner.playerId] ?? owner.playerId : "";
  const mine = local || owner?.playerId === meId;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: mine ? C.gold : C.dim }}>{t(mine ? "ui.lobby.playerTurn" : "ui.lobby.waitingFor", { player: name })}</div>
      <div inert={!mine} style={mine ? undefined : { pointerEvents: "none", opacity: 0.7 }}>
        <Turn state={consortium} dispatch={(action) => owner && mine && send(owner.playerId, { type: "play", action })} />
      </div>
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
      <div style={{ color: C.dim, fontSize: 13 }}>
        🔬 {t("ui.dev.project", { aperture: fmt(project.apertureM), cost: fmt(project.developmentCostMUsd) })}{" "}
        <span style={{ color: left > 0 ? C.gold : C.ok }}>{left > 0 ? t("ui.dev.inTurns", { n: left }) : t("ui.dev.ready")}</span>
        {project.inspect && ` · ${t("ui.dev.inspected")}`}
      </div>
    );
  }

  const order: DevOrder = { slot: "instrument", apertureM, inspect };
  const cost = developmentCostMUsd(entry.agency, order);
  const turns = developmentTurns(entry.agency, order);
  const chance = defectChance(entry.agency, order);
  const affordable = cost < entry.design.input.mission.budgetMUsd;
  const canOrder = entry.actionsLeft > 0 && affordable;
  return (
    <div style={{ display: "grid", gap: 6, borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
      <strong>🔬 {t("ui.dev.title")}</strong>
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

export function Turn({ state, dispatch }: { state: ConsortiumState; dispatch: (a: ConsortiumAction) => void }) {
  const entry = activeAgency(state);
  const { base, market, turn } = state;
  const upcoming: Upcoming[] = useMemo(
    () =>
      base.catalog.modules
        .filter((m) => (market[m.id]?.fromTurn ?? 0) > turn)
        .map((m) => ({ id: m.id, slot: m.slot, nameKey: m.nameKey, fromTurn: market[m.id]?.fromTurn ?? 0 })),
    [base, market, turn],
  );
  if (!entry) return null;
  const canLaunch = launchBlockers(entry.design).length === 0;

  const header = (
    <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 20 }}>{t("ui.activeAgency", { agency: t(entry.agency.nameKey) })}</strong>
        <span style={{ color: C.accent }}>{t("ui.turn", { turn: state.turn, deadline: state.deadlineTurn })}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {state.agencies.map((e, i) => (
          <span
            key={e.agency.id}
            style={{
              padding: "4px 10px", borderRadius: 999, fontSize: 13, border: `1px solid ${i === state.active ? C.accent : C.line}`,
              color: e.launch ? C.ok : C.dim,
            }}
          >
            {t(e.agency.nameKey)} · {e.launch ? t("ui.status.launched", { turn: e.launch.turn }) : t("ui.status.planning")}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={{ ...button, borderColor: canLaunch ? C.ok : C.line, opacity: canLaunch ? 1 : 0.5 }} disabled={!canLaunch} onClick={() => dispatch({ type: "launch" })}>
          🚀 {t("ui.launch")}
        </button>
        <button style={button} onClick={() => dispatch({ type: "wait" })}>⏳ {t("ui.wait")}</button>
      </div>
      <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.waitHint")}</div>
      <DevelopPanel state={state} dispatch={dispatch} />
    </div>
  );

  return (
    <DesignScreen
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
                  <td style={{ padding: "8px 0" }}>{p.winner ? "🏆 " : ""}{nameOf(p.agencyId)}</td>
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
                <div style={{ color: C.bad }}>🟥 {describeEntry(chain.failure, state.base)}</div>
                {chain.causes.filter((c) => c.kind !== "event").map((cause) => (
                  <div key={cause.id} style={{ color: C.dim, fontSize: 13, marginLeft: 16 }}>↳ {describeEntry(cause, state.base)}</div>
                ))}
              </div>
            ))}
            {chains.length === 0 && warnings.map((w) => (
              <div key={w.id} style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>⚠ {describeEntry(w, state.base)}</div>
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
