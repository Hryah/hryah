import { GROUND_STATION, type AgencyEntry, type ConsortiumAction } from "../../core/consortium";
import { fmt, t } from "../text";

// Наземний сегмент місії (поділ NASA: запуск, космічний, наземний, користувацький): власні станції подовжують сеанси зв'язку.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8" };
const button = { padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13 } as const;

export function GroundPanel({ entry, dispatch }: { entry: AgencyEntry; dispatch: (a: ConsortiumAction) => void }) {
  const account = entry.account;
  if (!account) return null;
  const n = account.groundStations ?? 0;
  const can = n < GROUND_STATION.max && entry.actionsLeft > 0 && !entry.touched.includes("ground") && account.fundsMUsd >= GROUND_STATION.costMUsd && !entry.launch;
  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 6 }} data-testid="ground-panel">
      <strong>📡 {t("ui.ground.title", { n, max: GROUND_STATION.max })}</strong>
      <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.ground.hint", { percent: Math.round(GROUND_STATION.passBonus * 100), pass: entry.design.input.mission.passSPerOrbit })}</div>
      <div>
        <button style={{ ...button, opacity: can ? 1 : 0.5 }} disabled={!can} onClick={() => dispatch({ type: "groundStation" })}>
          {t("ui.ground.build", { cost: fmt(GROUND_STATION.costMUsd) })}
        </button>
      </div>
    </div>
  );
}
