// Екран орбіти всередині наскрізної гри: читає OrbitState із GameState і шле дії частини 3.
// Повний прототип Нікіти (#orbit) лишається окремо; тут компактна версія на тих самих даних.
import { orbitView, type OrbitAction, type OrbitState } from "../../core/orbit";
import { OrbitScene } from "../orbit/OrbitScene";
import { fmt, t } from "../text";
import { describeEntry } from "../design/cause";

const tr = t;
const num = (n: number, d = 0) => fmt(n, d);

export function OrbitPanel({ state, dispatch }: { state: OrbitState; dispatch: (a: OrbitAction) => void }) {
  const view = orbitView(state);
  const goalParams = { ...view.goalParams, ...(view.cargoNameKey ? { cargo: tr(view.cargoNameKey) } : {}) };
  const total = state.input.mission.durationOrbits;
  const done = state.status !== "active";
  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="orbit-panel">
      <div style={{ color: "#8a90a8" }}>
        {tr("ui.orbit")} {view.nextOrbit} / {total} · {num(state.deliveredMb)}{view.dataTargetMb !== null && <> / {num(view.dataTargetMb)}</>} Mb · {num(state.chargeWh, 1)} / {num(view.capacityWh, 1)} Wh
      </div>
      <div data-testid="orbit-objective" style={{ color: "#8a90a8", fontSize: 13 }}>
        <p>{tr("orbit.objective.body", { mission: tr(state.input.mission.titleKey), body: state.input.mission.body.name })}</p>
        <p>{tr(view.goalKey, goalParams)}</p>
        <p>{tr("orbit.objective.altitude", goalParams)}</p>
        {view.cargoNameKey && <p>{tr("orbit.telemetry.progress", { sent: view.telemetryReportsSent,
          expected: view.telemetryReportsExpected })} · {tr("orbit.telemetry.optional")}</p>}
      </div>
      <OrbitScene turn={state.completedOrbits} totalTurns={total} storm={view.stormNext && !done}
        safeMode={state.toggles.safeMode} complete={done} bodyName={state.input.mission.body.name} />
      <div style={{ color: "#8a90a8", fontSize: 13 }} data-testid="orbit-status">
        {tr("ui.onboardStorage")}: {num(state.bufferMb)} / {num(view.bufferCapacityMb)} Mb · {tr("ui.thermalStatus")}:{" "}
        {tr(`ui.${view.thermalState}`)}
        {!done && <> · {tr("ui.endingCharge")}: {num(view.forecast.chargeWh, 1)} Wh · +{num(view.forecast.deliveredMb)} Mb</>}
        {!done && view.forecast.lostMb > 0 && <span style={{ color: "#f4b46a" }}> · {tr("ui.dataLoss")}: {num(view.forecast.lostMb)} Mb</span>}
      </div>
      {!done && view.forecast.powerFailure && <div style={{ color: "#f4b46a" }}>{tr("ui.powerRisk")}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {view.controls.map((id) => {
          // Безпечний режим перевизначає решту перемикачів: показуємо, що реально працює.
          const overridden = state.toggles.safeMode && id !== "safeMode";
          const on = overridden ? view.activeSystems[id] : state.toggles[id];
          // Увімкнено, але система не працює (холод, пошкодження з польоту): показуємо «недоступно», а не «увімкнено».
          // Безпечний режим форсує обігрівач: якщо він при цьому не працює (термічні пошкодження), це теж «недоступно».
          const unavailable = !done && (overridden ? id === "heater" && !view.activeSystems.heater : state.toggles[id] && !view.activeSystems[id]);
          const note = overridden ? tr(id === "heater" ? "controls.forcedHeater" : "controls.overridden") : null;
          return (
          <button key={id} role="switch" aria-checked={on && !unavailable} disabled={done || overridden}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${on && !unavailable ? "#5ad19a" : "#2a2f45"}`, background: "#161a2b", color: "inherit", cursor: done || overridden ? "default" : "pointer" }}
            onClick={() => dispatch({ type: "toggle", id })}>
            {tr(`ui.control.${id}`)}: {unavailable ? tr("controls.unavailable") : tr(on ? "ui.enabled" : "ui.off")}{note ? ` (${note})` : ""}
          </button>
          );
        })}
      </div>
      {!done && view.stormNext && <div style={{ color: "#f4b46a" }}>{tr("ui.stormWarning")}</div>}
      {!done && !view.stormNext && view.stormInOrbits !== null && view.stormInOrbits <= 2 && (
        <div style={{ color: "#f4b46a" }}>{tr("ui.stormSoon", { turns: view.stormInOrbits })}</div>
      )}
      <div style={{ color: "#8a90a8", fontSize: 13, display: "grid", gap: 2 }} data-testid="orbit-log">
        <strong>{tr("ui.missionLog")}</strong>
        {[...state.log].reverse().slice(0, 4).map((e) => (
          // Записи орбіти не мають параметра module, тому порожній каталог безпечний; якщо такий запис з'явиться, додати каталог у OrbitInput.
          <div key={e.id}>{describeEntry(e, { mission: state.input.mission, catalog: { modules: [] } })}</div>
        ))}
      </div>
      <div>
        <button disabled={done} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #5ad19a", background: "#161a2b", color: "inherit", cursor: done ? "default" : "pointer" }}
          onClick={() => dispatch({ type: "tick", dtS: state.input.flight.orbit.periodS })}>
          {tr("ui.nextOrbit")}
        </button>
      </div>
    </div>
  );
}
