import type { ReactNode } from "react";
import type { MarginId, ModuleDef, SlotId } from "../../core/contracts";
import { designPhase, launchBlockers, SLOTS, type DesignAction, type DesignState } from "../../core/design";
import { fmt, t } from "../text";

// Екран частини 1. Лише читає стан і шле дії: усі розрахунки робить core/design.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", bad: "#ff5c7a", accent: "#5ca8ff", card: "#1b2038" };

export interface Upcoming {
  id: string;
  slot: SlotId;
  nameKey: string;
  fromTurn: number;
}

interface Props {
  state: DesignState;
  dispatch: (action: DesignAction) => void;
  editable: boolean;
  upcoming?: Upcoming[];
  actionsLeft?: number;
  header?: ReactNode;
}

const MARGIN_ORDER: MarginId[] = ["dv", "energy", "link", "science", "mass", "budget"];
const FUEL_STEP_KG = 2;
const ALT_STEP_KM = 50;

function keyStat(m: ModuleDef): string {
  switch (m.slot) {
    case "engine": return `Isp ${m.ispS} s`;
    case "solar": return `${m.powerW} W`;
    case "battery": return `${m.capacityWh} Wh`;
    case "antenna": return `${m.downlinkMbps} Mbps`;
    case "instrument": return `⌀ ${m.apertureM} m`;
  }
}

const button = {
  padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 14,
} as const;

export function DesignScreen({ state, dispatch, editable, upcoming = [], actionsLeft, header }: Props) {
  const spec = designPhase.finish(state).result;
  const { mission, catalog } = state.input;
  const { design } = state;
  const blockers = launchBlockers(state);
  const act = (action: DesignAction) => editable && dispatch(action);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {header}
      <div style={{ background: C.panel, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
          <strong style={{ fontSize: 18 }}>{t(mission.titleKey)}</strong>
          <span style={{ color: C.dim }}>{t("ui.budget")}: {fmt(mission.budgetMUsd)} M$</span>
          {actionsLeft !== undefined && <span style={{ color: C.accent }}>{t("ui.actionsLeft", { n: actionsLeft })}</span>}
        </div>
        <p style={{ color: C.dim, margin: "8px 0 0" }}>{t(mission.briefKey)}</p>
      </div>

      <div style={{ background: C.panel, borderRadius: 12, padding: 16 }}>
        <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>{t("ui.margins")}</div>
        <div style={{ display: "grid", gap: 10 }}>
          {MARGIN_ORDER.map((id) => {
            const m = spec.margins.find((x) => x.id === id);
            if (!m) return null;
            // Для різкості менше краще, для решти більше.
            const ratio = id === "science" ? m.need / m.have : m.have / m.need;
            const width = Math.max(0, Math.min(1.5, Number.isFinite(ratio) ? ratio : 0)) / 1.5;
            return (
              <div key={id} title={t(`ui.marginHint.${id}`)}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span>{m.ok ? "✅" : "🟥"} {t(`ui.margin.${id}`)}</span>
                  <span style={{ color: m.ok ? C.dim : C.bad }}>{fmt(m.have)} / {fmt(m.need)} {m.unit}</span>
                </div>
                <div style={{ height: 6, background: C.line, borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ width: `${width * 100}%`, height: "100%", background: m.ok ? C.ok : C.bad }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {SLOTS.map((slot) => {
        const options = catalog.modules.filter((m) => m.slot === slot);
        const later = upcoming.filter((u) => u.slot === slot);
        return (
          <div key={slot} style={{ background: C.panel, borderRadius: 12, padding: 16 }}>
            <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>{t(`ui.slot.${slot}`)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
              {options.map((m) => {
                const selected = design.modules[slot] === m.id;
                return (
                  <button
                    key={m.id} disabled={!editable} onClick={() => act({ type: "setModule", slot, moduleId: m.id })}
                    style={{
                      ...button, textAlign: "left", background: C.card, opacity: editable ? 1 : 0.6,
                      border: `1px solid ${selected ? C.accent : C.line}`, boxShadow: selected ? `0 0 0 1px ${C.accent}` : "none",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{t(m.nameKey)}</div>
                    <div style={{ color: C.dim, fontSize: 12 }}>{keyStat(m)}</div>
                    <div style={{ color: C.dim, fontSize: 12 }}>{fmt(m.massKg)} kg · {fmt(m.costMUsd)} M$</div>
                  </button>
                );
              })}
              {later.map((u) => (
                <div key={u.id} style={{ ...button, cursor: "default", border: `1px dashed ${C.line}`, color: C.dim }}>
                  <div style={{ fontWeight: 600 }}>{t(u.nameKey)}</div>
                  <div style={{ fontSize: 12 }}>{t("ui.availableFrom", { turn: u.fromTurn })}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 12 }}>
        <div>
          <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>{t("ui.launcher")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {mission.launchers.map((l) => {
              const selected = design.launcherId === l.id;
              return (
                <button
                  key={l.id} disabled={!editable} onClick={() => act({ type: "setLauncher", launcherId: l.id })}
                  style={{ ...button, background: C.card, border: `1px solid ${selected ? C.accent : C.line}`, opacity: editable ? 1 : 0.6, textAlign: "left" }}
                >
                  <div style={{ fontWeight: 600 }}>{t(l.nameKey)}</div>
                  <div style={{ color: C.dim, fontSize: 12 }}>≤ {l.maxPayloadKg} kg · {fmt(l.costMUsd)} M$</div>
                </button>
              );
            })}
          </div>
        </div>
        <Stepper
          label={t("ui.fuel")} value={`${fmt(design.fuelKg)} kg`} disabled={!editable}
          onMinus={() => act({ type: "setFuel", fuelKg: design.fuelKg - FUEL_STEP_KG })}
          onPlus={() => act({ type: "setFuel", fuelKg: design.fuelKg + FUEL_STEP_KG })}
        />
        <Stepper
          label={t("ui.altitude")} value={`${fmt(design.altKm)} km`} disabled={!editable}
          onMinus={() => act({ type: "setAlt", altKm: design.altKm - ALT_STEP_KM })}
          onPlus={() => act({ type: "setAlt", altKm: design.altKm + ALT_STEP_KM })}
        />
      </div>

      {blockers.length > 0 && (
        <div style={{ color: C.bad }}>{t("ui.blocked", { margins: blockers.map((id) => t(`ui.margin.${id}`)).join(", ") })}</div>
      )}
    </div>
  );
}

function Stepper(props: { label: string; value: string; disabled: boolean; onMinus: () => void; onPlus: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: C.dim, width: 140 }}>{props.label}</span>
      <button style={button} disabled={props.disabled} onClick={props.onMinus}>−</button>
      <strong style={{ minWidth: 80, textAlign: "center" }}>{props.value}</strong>
      <button style={button} disabled={props.disabled} onClick={props.onPlus}>+</button>
    </div>
  );
}
