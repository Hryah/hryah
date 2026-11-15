import { GROUND_STATION, type AgencyEntry, type ConsortiumAction } from "../../core/consortium";
import { fmt, t } from "../text";

// Наземний сегмент місії (поділ NASA: запуск, космічний, наземний, користувацький): власні станції подовжують сеанси зв'язку.

export function GroundPanel({ entry, dispatch }: { entry: AgencyEntry; dispatch: (a: ConsortiumAction) => void }) {
  const account = entry.account;
  if (!account) return null;
  const n = account.groundStations ?? 0;
  const can =
    n < GROUND_STATION.max &&
    entry.actionsLeft > 0 &&
    !entry.touched.includes("ground") &&
    account.fundsMUsd >= GROUND_STATION.costMUsd &&
    !entry.launch;
  return (
    <div className="mc-panel" style={{ display: "grid", gap: 10 }} data-testid="ground-panel">
      <strong style={{ fontSize: 16 }}>📡 {t("ui.ground.title", { n, max: GROUND_STATION.max })}</strong>
      <div style={{ color: "var(--c-text-muted)", fontSize: 13 }}>
        {t("ui.ground.hint", {
          percent: Math.round(GROUND_STATION.passBonus * 100),
          pass: entry.design.input.mission.passSPerOrbit,
        })}
      </div>
      <div>
        <button
          type="button"
          className={`mc-btn ${can ? "mc-btn-selected" : ""}`}
          disabled={!can}
          onClick={() => dispatch({ type: "groundStation" })}
        >
          {t("ui.ground.build", { cost: fmt(GROUND_STATION.costMUsd) })}
        </button>
      </div>
    </div>
  );
}
