import { useEffect, useMemo, useRef, useState } from "react";
import type { FlightResult, Mission, SpacecraftSpec } from "../../core/contracts";
import { MAX_ORBIT_ACTIONS, sanitizeFlight, type MissionReport } from "../../core/consortium";
import { flightPhase } from "../../core/flight";
import { orbitPhase, type OrbitAction } from "../../core/orbit";
import { FlightScreen } from "../flight";
import { OrbitPanel } from "../play/OrbitPanel";
import { t } from "../text";

// Виконавець місії в кампанії: гравець сам грає політ і орбіту свого запуску, а наприкінці звіт іде в кімнату.
// Кімната перераховує орбіту з тих самих дій і сіду, тож показане тут збігається з тим, що зарахують.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", bad: "#ff5c7a", accent: "#5ca8ff" };
const button = {
  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 15,
} as const;
const overlay = {
  position: "fixed", right: 16, top: 16, zIndex: 1100, maxWidth: 360, gap: 8, display: "grid",
  background: "rgba(20, 24, 41, 0.92)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 12,
} as const;

export interface MissionRunnerProps {
  agencyName: string;
  mission: Mission;
  spec: SpacecraftSpec;
  seeds: { flight: number; orbit: number };
  active: boolean;
  onReport: (report: MissionReport) => void;
}

type Stage =
  | { kind: "flight" }
  | { kind: "orbit"; flight: FlightResult };

export function MissionRunner({ agencyName, mission, spec, seeds, active, onReport }: MissionRunnerProps) {
  const [stage, setStage] = useState<Stage>({ kind: "flight" });
  const [flight, setFlight] = useState(() => flightPhase.init({ mission, spec, log: [] }, seeds.flight));
  const [orbitActions, setOrbitActions] = useState<OrbitAction[]>([]);
  const flightResult = stage.kind === "orbit" ? stage.flight : null;
  const orbit = useMemo(() => {
    if (!flightResult) return null;
    let s = orbitPhase.init({ mission, spec, flight: flightResult, log: [] }, seeds.orbit);
    for (const a of orbitActions) s = orbitPhase.step(s, a);
    return s;
  }, [flightResult, orbitActions, mission, spec, seeds.orbit]);

  // Політ завершився (сам чи кнопкою): переходимо до орбіти, а якщо апарат втрачено, звіт іде одразу.
  const reportRef = useRef(onReport);
  reportRef.current = onReport;
  useEffect(() => {
    if (stage.kind !== "flight" || !flightPhase.isDone(flight)) return;
    const result = sanitizeFlight(mission, spec, flightPhase.finish(flight).result);
    if (result.deploymentStatus === "lost") reportRef.current({ flight: result, orbitActions: [] });
    else setStage({ kind: "orbit", flight: result });
  }, [flight, stage.kind, mission, spec]);

  if (stage.kind === "flight") {
    const lost = flight.gameMode === "GAME_OVER";
    return (
      <>
        {active && (
          <FlightScreen
            state={flight}
            dispatch={(action) => setFlight((s) => flightPhase.step(s, action))}
          />
        )}
        <div data-testid="campaign-flight-overlay" style={{ ...overlay, display: active ? "grid" : "none" }}>
          <strong>{t("ui.campaign.flightOf", { agency: agencyName })}</strong>
          <div style={{ color: C.dim, fontSize: 13 }}>{t(lost ? "ui.play.lostFlightHint" : "ui.play.flightHint")}</div>
          <div>
            <button
              style={button}
              onClick={() => setFlight((s) => flightPhase.step(s, { type: "complete_phase" }))}
            >
              {t(lost ? "ui.play.finishLostFlight" : "ui.play.skipFlight")}
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!orbit || !flightResult) return null;
  const done = orbitPhase.isDone(orbit);
  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 10 }} data-testid="campaign-orbit">
      <h2 style={{ margin: 0 }}>{t("ui.campaign.orbitOf", { agency: agencyName })}</h2>
      <div style={{ color: C.dim }}>{t("ui.play.orbitHint")}</div>
      {/* Звіт приймає не більше MAX_ORBIT_ACTIONS дій: далі решта витків іде автопілотом у кімнаті. */}
      <OrbitPanel state={orbit} dispatch={(a) => !done && setOrbitActions((list) => (list.length >= MAX_ORBIT_ACTIONS ? list : [...list, a]))} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          style={{ ...button, borderColor: done ? C.ok : C.line }}
          onClick={() => onReport({ flight: flightResult, orbitActions })}
        >
          📡 {t(done ? "ui.campaign.sendReport" : "ui.campaign.sendEarly")}
        </button>
        {!done && <span style={{ color: C.dim, fontSize: 13 }}>{t("ui.campaign.sendEarlyHint")}</span>}
      </div>
    </div>
  );
}
