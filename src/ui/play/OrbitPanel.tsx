// Екран орбіти всередині наскрізної гри: читає OrbitState із GameState і шле дії частини 3.
// Повний прототип Нікіти (#orbit) лишається окремо; тут компактна версія на тих самих даних.
import { orbitView, type OrbitAction, type OrbitState, type ToggleId } from "../../core/orbit";
import { OrbitScene } from "../orbit/OrbitScene";
import { fmt, t } from "../text";

const tr = t;
const num = (n: number, d = 0) => fmt(n, d);

const TOGGLES: ToggleId[] = ["camera", "transmitter", "heater", "safeMode"];

export function OrbitPanel({ state, dispatch }: { state: OrbitState; dispatch: (a: OrbitAction) => void }) {
  const view = orbitView(state);
  const total = state.input.mission.durationOrbits;
  const done = state.status !== "active";
  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="orbit-panel">
      <div style={{ color: "#8a90a8" }}>
        {tr("ui.orbit")} {view.nextOrbit} / {total} · {num(state.deliveredMb)} / {num(state.input.mission.requiredDataMb)} Mb · {num(state.chargeWh, 1)} / {num(view.capacityWh, 1)} Wh
      </div>
      <OrbitScene turn={state.completedOrbits} totalTurns={total} storm={view.stormNext && !done}
        safeMode={state.toggles.safeMode} complete={done} />
      <div style={{ color: "#8a90a8", fontSize: 13 }} data-testid="orbit-status">
        {tr("ui.onboardStorage")}: {num(state.bufferMb)} / {num(view.bufferCapacityMb)} Mb · {tr("ui.thermalStatus")}:{" "}
        {tr(state.coldStress >= 2 ? "ui.cold" : state.coldStress > 0 ? "ui.cooling" : "ui.stable")}
        {!done && <> · {tr("ui.endingCharge")}: {num(view.forecast.chargeWh, 1)} Wh · +{num(view.forecast.deliveredMb)} Mb</>}
        {!done && view.forecast.lostMb > 0 && <span style={{ color: "#f4b46a" }}> · {tr("ui.dataLoss")}: {num(view.forecast.lostMb)} Mb</span>}
      </div>
      {!done && view.forecast.powerFailure && <div style={{ color: "#f4b46a" }}>{tr("ui.powerRisk")}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TOGGLES.map((id) => {
          // Безпечний режим перевизначає решту перемикачів: показуємо, що реально працює.
          const overridden = state.toggles.safeMode && id !== "safeMode";
          const on = overridden ? view.activeSystems[id] : state.toggles[id];
          // Увімкнено, але система не працює (холод, пошкодження з польоту): показуємо «недоступно», а не «увімкнено».
          const unavailable = !done && !overridden && state.toggles[id] && !view.activeSystems[id];
          const note = unavailable ? tr("controls.unavailable")
            : overridden ? tr(id === "heater" ? "controls.forcedHeater" : "controls.overridden") : null;
          return (
          <button key={id} role="switch" aria-checked={on && !unavailable} disabled={done || overridden}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${on && !unavailable ? "#5ad19a" : "#2a2f45"}`, background: "#161a2b", color: "inherit", cursor: done || overridden ? "default" : "pointer" }}
            onClick={() => dispatch({ type: "toggle", id })}>
            {tr(`ui.control.${id}`)}: {tr(on ? "ui.enabled" : "ui.off")}{note ? ` (${note})` : ""}
          </button>
          );
        })}
      </div>
      {!done && view.stormNext && <div style={{ color: "#f4b46a" }}>{tr("ui.stormWarning")}</div>}
      <div>
        <button disabled={done} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #5ad19a", background: "#161a2b", color: "inherit", cursor: done ? "default" : "pointer" }}
          onClick={() => dispatch({ type: "tick", dtS: state.input.flight.orbit.periodS })}>
          {tr("ui.nextOrbit")}
        </button>
      </div>
    </div>
  );
}
