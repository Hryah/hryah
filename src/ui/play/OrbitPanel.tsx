// Екран орбіти всередині наскрізної гри: читає OrbitState із GameState і шле дії частини 3.
// Повний прототип Нікіти (#orbit) лишається окремо; тут компактна версія на тих самих даних.
import { orbitView, type OrbitAction, type OrbitState, type ToggleId } from "../../core/orbit";
import { OrbitScene } from "../orbit/OrbitScene";
import orbitText from "../orbit/texts.en.json";
import sharedText from "../../data/texts.en.json";

const copy: Record<string, string> = { ...sharedText, ...orbitText };
const tr = (key: string, params: Record<string, string | number> = {}) =>
  (copy[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
const num = (n: number, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);

const TOGGLES: ToggleId[] = ["camera", "transmitter", "heater", "safeMode"];

export function OrbitPanel({ state, dispatch }: { state: OrbitState; dispatch: (a: OrbitAction) => void }) {
  const view = orbitView(state);
  const total = state.input.mission.durationOrbits;
  const done = state.status !== "active";
  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="orbit-panel">
      <div style={{ color: "#8a90a8" }}>
        {tr("ui.orbit")} {Math.min(state.completedOrbits + 1, total)} / {total} · {num(state.deliveredMb)} / {num(state.input.mission.requiredDataMb)} Mb · {num(state.chargeWh, 1)} / {num(view.capacityWh, 1)} Wh
      </div>
      <OrbitScene turn={state.completedOrbits} totalTurns={total} storm={view.stormNext && !done}
        safeMode={state.toggles.safeMode} complete={done} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TOGGLES.map((id) => (
          <button key={id} role="switch" aria-checked={state.toggles[id]} disabled={done}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${state.toggles[id] ? "#5ad19a" : "#2a2f45"}`, background: "#161a2b", color: "inherit", cursor: "pointer" }}
            onClick={() => dispatch({ type: "toggle", id })}>
            {tr(`ui.control.${id}`)}: {tr(state.toggles[id] ? "ui.enabled" : "ui.off")}
          </button>
        ))}
      </div>
      {!done && view.stormNext && <div style={{ color: "#f4b46a" }}>{tr("ui.stormWarning")}</div>}
      <div>
        <button disabled={done} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #5ad19a", background: "#161a2b", color: "inherit", cursor: "pointer" }}
          onClick={() => dispatch({ type: "tick", dtS: state.input.flight.orbit.periodS })}>
          {tr("ui.nextOrbit")}
        </button>
      </div>
    </div>
  );
}
