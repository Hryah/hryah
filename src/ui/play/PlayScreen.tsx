import type { Dispatch, ReactNode, SetStateAction } from "react";
import { newGame, step, type GameAction, type GameState } from "../../core/game";
import { causeChains } from "../../core/debrief";
import { launchBlockers } from "../../core/design";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../../core/stubs";
import { DesignScreen } from "../design/DesignScreen";
import { describeEntry } from "../design/cause";
import { FlightScreen } from "../flight";
import { OrbitPanel } from "./OrbitPanel";
import { fmt, t } from "../text";

// Наскрізна гра для одного гравця: проєктування → політ → орбіта → розбір. Екран лише показує стан
// core/game і шле дії; перехід між частинами робить сама склейка в core/game.ts, коли частина завершується.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", bad: "#ff5c7a", accent: "#5ca8ff" };
const BASE = { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG };
const STAGES = ["design", "flight", "orbit", "debrief"] as const;

const button = {
  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 15,
} as const;

const overlay = {
  position: "fixed", right: 16, top: 16, zIndex: 1100, maxWidth: 360, gap: 8,
  background: "rgba(20, 24, 41, 0.92)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 12,
} as const;

export const startPlay = (): GameState => newGame(SAMPLE_MISSION, SAMPLE_CATALOG, Math.floor(Math.random() * 2 ** 31));

interface Props {
  game: GameState;
  setGame: Dispatch<SetStateAction<GameState>>;
  active: boolean; // канвас польоту й клавіатура живі лише коли екран видно
}

export function PlayScreen({ game, setGame, active }: Props) {
  const dispatch = (action: GameAction) => setGame((g) => step(g, action));
  const satelliteLost = game.phase === "debrief" && game.record.flight.deploymentStatus === "lost";

  const stepper = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {STAGES.map((stage, i) => {
        const index = STAGES.indexOf(game.phase);
        const orbitSkipped = satelliteLost && stage === "orbit";
        const color = satelliteLost && stage === "flight" ? C.bad : orbitSkipped ? C.dim : i < index ? C.ok : i === index ? C.accent : C.dim;
        return (
          <span key={stage} style={{ padding: "4px 12px", borderRadius: 999, fontSize: 13, border: `1px solid ${color}`, color }}>
            {i + 1}. {t(orbitSkipped ? "ui.play.stage.orbitSkipped" : `ui.play.stage.${stage}`)}
          </span>
        );
      })}
    </div>
  );

  let body: ReactNode;
  switch (game.phase) {
    case "design": {
      const blockers = launchBlockers(game.design);
      const header = (
        <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 8 }}>
          {stepper}
          <div>
            <button
              style={{ ...button, borderColor: blockers.length === 0 ? C.ok : C.line, opacity: blockers.length === 0 ? 1 : 0.5 }}
              disabled={blockers.length > 0}
              onClick={() => dispatch({ phase: "design", action: { type: "confirm" } })}
            >
              🚀 {t("ui.launch")}
            </button>
          </div>
        </div>
      );
      body = <DesignScreen state={game.design} editable dispatch={(action) => dispatch({ phase: "design", action })} header={header} />;
      break;
    }
    case "flight":
      body = (
        <>
          {active && <FlightScreen state={game.flight} dispatch={(action) => dispatch({ phase: "flight", action })} />}
          {/* Екран польоту займає весь вікно (fixed, z-index 1000), тож наша панель лежить над ним. */}
          <div data-testid="flight-overlay" style={{ ...overlay, display: active ? "grid" : "none" }}>
            {stepper}
            <div style={{ color: C.dim, fontSize: 13 }}>{t(game.flight.gameMode === "GAME_OVER" ? "ui.play.lostFlightHint" : "ui.play.flightHint")}</div>
            <div>
              <button style={button} onClick={() => dispatch({ phase: "flight", action: { type: "complete_phase" } })}>
                {t(game.flight.gameMode === "GAME_OVER" ? "ui.play.finishLostFlight" : "ui.play.skipFlight")}
              </button>
            </div>
          </div>
        </>
      );
      break;
    case "orbit":
      body = (
        <Panel stepper={stepper}>
          <h2 style={{ margin: 0 }}>{t("ui.play.orbitTitle")}</h2>
          <div style={{ color: C.dim }}>{t("ui.play.orbitHint")}</div>
          <OrbitPanel state={game.orbit} dispatch={(action) => dispatch({ phase: "orbit", action })} />
        </Panel>
      );
      break;
    case "debrief": {
      const { outcome, log } = game.record;
      const chains = causeChains(log);
      body = (
        <Panel stepper={stepper}>
          <h2 style={{ margin: 0, color: outcome.success ? C.ok : C.bad }}>
            {t(outcome.success ? "ui.play.success" : "ui.play.failure")}
          </h2>
          {satelliteLost && <div role="status" style={{ padding: 14, borderRadius: 8, border: `1px solid ${C.bad}`, background: "#321f2b" }}>
            <strong>{t("ui.play.satelliteLostTitle")}</strong>
            <p style={{ margin: "6px 0 0", color: "#d7b3bf", fontSize: 14 }}>{t("ui.play.orbitNotStarted")}</p>
          </div>}
          <div style={{ color: C.dim }}>
            {t("ui.play.outcome", { mb: fmt(outcome.deliveredMb, 0), orbits: outcome.survivedOrbits, score: fmt(outcome.score, 0) })}
          </div>
          {chains.map((chain) => (
            <div key={chain.failure.id}>
              <div style={{ color: C.bad }}>🟥 {describeEntry(chain.failure, BASE)}</div>
              {chain.causes.filter((c) => c.kind !== "event" || satelliteLost).map((cause) => (
                <div key={cause.id} style={{ color: C.dim, fontSize: 13, marginLeft: 16 }}>↳ {describeEntry(cause, BASE)}</div>
              ))}
            </div>
          ))}
          <div><button style={button} onClick={() => setGame(() => startPlay())}>{t("ui.result.again")}</button></div>
        </Panel>
      );
      break;
    }
  }
  return <div style={{ display: "grid", gap: 12 }}>{body}</div>;
}

function Panel({ stepper, children }: { stepper: ReactNode; children: ReactNode }) {
  return <div style={{ background: C.panel, borderRadius: 12, padding: 20, display: "grid", gap: 12 }}>{stepper}{children}</div>;
}
