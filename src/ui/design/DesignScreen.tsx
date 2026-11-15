import { useEffect, useState, type ReactNode } from "react";
import type { MarginId, ModuleDef, SlotId } from "../../core/contracts";
import { controlOf, designPhase, launchBlockers, SLOTS, type DesignAction, type DesignState } from "../../core/design";
import spritesManifest from "../../data/sprites.json";
import { resolveAssetUrl } from "../graphics";
import { fmt, t } from "../text";
import { DesignPreview, type DesignPreviewMode, type DesignPreviewView } from "./DesignPreview";
import "./planning-console.css";

// Екран частини 1. Лише читає стан і шле дії: усі розрахунки робить core/design.

export interface Upcoming {
  id: string;
  slot: SlotId;
  nameKey: string;
  fromTurn: number;
}

export interface DesignScreenProps {
  state: DesignState;
  active?: boolean;
  dispatch: (action: DesignAction) => void;
  // Чи можна міняти: усе разом або кожен елемент керування окремо ("slot:engine", "fuel", "alt", "launcher").
  editable: boolean | ((control: string) => boolean);
  upcoming?: Upcoming[];
  actionsLeft?: number;
  header?: ReactNode;
  customSlotFooter?: ReactNode;
  actionsFooter?: ReactNode;
  layoutMode?: "standalone" | "console";
  resetKey?: string;
  defaultPreviewMode?: DesignPreviewMode;
  extraPreviewViews?: readonly DesignPreviewView[];
}

export const DEDICATED_MODULE_SPRITES: readonly string[] = Object.entries(spritesManifest)
  .filter(([, def]) => typeof def.file === "string" && def.file.startsWith("modules/"))
  .map(([id]) => id);

const DEDICATED_SET = new Set<string>(DEDICATED_MODULE_SPRITES);

/** Повертає URL спрайта 2x лише для 15 базових модулів із власним малюнком (включно з fab-<baseId>-*). */
export function resolveDedicatedSpriteUrl(moduleId: string): string | null {
  if (DEDICATED_SET.has(moduleId)) {
    return resolveAssetUrl(`assets/sprites/modules/${moduleId}.png`);
  }
  if (moduleId.startsWith("fab-")) {
    const rest = moduleId.slice(4);
    const match = DEDICATED_MODULE_SPRITES.find((base) => rest === base || rest.startsWith(`${base}-`));
    if (match) return resolveAssetUrl(`assets/sprites/modules/${match}.png`);
  }
  return null;
}

function CargoContainerIcon() {
  return (
    <svg viewBox="0 0 64 64" width={54} height={54} aria-hidden="true" data-placeholder="cargo">
      <rect x="10" y="16" width="44" height="32" rx="4" fill="#78350f" stroke="#ffecd1" strokeWidth="2.5" />
      <line x1="20" y1="18" x2="20" y2="46" stroke="#ffecd1" strokeOpacity="0.65" strokeWidth="2" />
      <line x1="32" y1="18" x2="32" y2="46" stroke="#ffecd1" strokeOpacity="0.65" strokeWidth="2" />
      <line x1="44" y1="18" x2="44" y2="46" stroke="#ffecd1" strokeOpacity="0.65" strokeWidth="2" />
      <circle cx="16" cy="22" r="2" fill="#ff7d00" />
      <circle cx="48" cy="42" r="2" fill="#ff7d00" />
    </svg>
  );
}

function ModulePlaceholderIcon({ slot }: { readonly slot: SlotId }) {
  return (
    <svg viewBox="0 0 64 64" width={52} height={52} aria-hidden="true" data-placeholder="module">
      <rect x="6" y="6" width="52" height="52" rx="8" fill="#001524" stroke="#15616d" strokeWidth="2" strokeDasharray="4 3" />
      {slot === "engine" && (
        <>
          <rect x="22" y="14" width="20" height="14" rx="3" fill="#15616d" stroke="#ffecd1" strokeWidth="1.8" />
          <path d="M24 28 L18 46 H46 L40 28 Z" fill="#78290f" stroke="#ffecd1" strokeWidth="1.8" />
          <path d="M26 48 Q32 56 38 48" fill="none" stroke="#ff7d00" strokeWidth="2.2" strokeLinecap="round" />
        </>
      )}
      {slot === "solar" && (
        <>
          <rect x="12" y="20" width="40" height="24" rx="2" fill="#15616d" stroke="#ffecd1" strokeWidth="1.8" />
          <line x1="12" y1="32" x2="52" y2="32" stroke="#ffecd1" strokeOpacity="0.65" strokeWidth="1.4" />
          <line x1="25" y1="20" x2="25" y2="44" stroke="#ffecd1" strokeOpacity="0.65" strokeWidth="1.4" />
          <line x1="39" y1="20" x2="39" y2="44" stroke="#ffecd1" strokeOpacity="0.65" strokeWidth="1.4" />
          <circle cx="32" cy="32" r="3" fill="#ff7d00" />
        </>
      )}
      {slot === "battery" && (
        <>
          <rect x="17" y="18" width="30" height="30" rx="4" fill="#15616d" stroke="#ffecd1" strokeWidth="1.8" />
          <rect x="25" y="13" width="14" height="5" rx="1.5" fill="#ff7d00" />
          <path d="M34 24 L27 34 H33 L30 42 L38 32 H32 Z" fill="#ffecd1" />
        </>
      )}
      {slot === "antenna" && (
        <>
          <path d="M18 42 Q32 24 46 42" fill="#15616d" stroke="#ffecd1" strokeWidth="1.8" />
          <line x1="32" y1="20" x2="32" y2="46" stroke="#ffecd1" strokeWidth="2" />
          <circle cx="32" cy="18" r="3" fill="#ff7d00" />
          <path d="M23 15 Q32 9 41 15" fill="none" stroke="#ff7d00" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {slot === "instrument" && (
        <>
          <rect x="16" y="20" width="26" height="24" rx="4" fill="#15616d" stroke="#ffecd1" strokeWidth="1.8" />
          <rect x="42" y="24" width="7" height="16" rx="2" fill="#78290f" stroke="#ffecd1" strokeWidth="1.5" />
          <circle cx="29" cy="32" r="7" fill="#001524" stroke="#ff7d00" strokeWidth="2" />
          <circle cx="29" cy="32" r="2.5" fill="#ffecd1" />
        </>
      )}
    </svg>
  );
}

function LauncherPlaceholderIcon({ id }: { readonly id: string }) {
  const tier = id.includes("heavy") ? 3 : id.includes("medium") ? 2 : 1;
  return (
    <svg viewBox="0 0 64 64" width={52} height={52} aria-hidden="true" data-placeholder="launcher">
      <rect x="6" y="6" width="52" height="52" rx="8" fill="#001524" stroke="#15616d" strokeWidth="1.5" />
      {tier >= 2 && <rect x="16" y="30" width="7" height="20" rx="2" fill="#78290f" stroke="#ffecd1" strokeWidth="1.5" />}
      {tier >= 3 && <rect x="41" y="30" width="7" height="20" rx="2" fill="#78290f" stroke="#ffecd1" strokeWidth="1.5" />}
      {tier === 2 && <rect x="41" y="34" width="7" height="16" rx="2" fill="#78290f" stroke="#ffecd1" strokeWidth="1.5" />}
      <path d="M27 48 V22 L32 12 L37 22 V48 Z" fill="#15616d" stroke="#ffecd1" strokeWidth="1.8" />
      <path d="M29 50 L32 56 L35 50" fill="#ff7d00" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width={12} height={12} aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7 V5 A3 3 0 0 1 11 5 V7" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ModuleVisualSlot({
  slot,
  moduleId,
  dimmed = false,
}: {
  readonly slot: SlotId;
  readonly moduleId: string;
  readonly dimmed?: boolean;
}) {
  const isCargo = slot === "instrument" && (moduleId.startsWith("cargo-") || moduleId.startsWith("fab-cargo-"));
  const spriteUrl = isCargo ? null : resolveDedicatedSpriteUrl(moduleId);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [moduleId, spriteUrl]);

  return (
    <div className="mc-sprite-slot" style={dimmed ? { opacity: 0.55 } : undefined}>
      {isCargo ? (
        <CargoContainerIcon />
      ) : spriteUrl && !failed ? (
        <img
          src={spriteUrl}
          alt=""
          loading="lazy"
          width={60}
          height={60}
          onError={() => setFailed(true)}
          className="mc-module-sprite"
        />
      ) : (
        <ModulePlaceholderIcon slot={slot} />
      )}
    </div>
  );
}

const MARGIN_ORDER: MarginId[] = ["dv", "energy", "link", "science", "mass", "budget"];
const FUEL_STEP_KG = 2;
const ALT_STEP_KM = 50;

function keyStat(m: ModuleDef): string {
  switch (m.slot) {
    case "engine":
      return `Isp ${m.ispS} s`;
    case "solar":
      return `${m.powerW} W`;
    case "battery":
      return `${m.capacityWh} Wh`;
    case "antenna":
      return `${m.downlinkMbps} Mbps`;
    case "instrument":
      return m.cargoKind ? `${t(`ui.cargoKind.${m.cargoKind}`)} · ${m.powerW} W` : `⌀ ${m.apertureM} m`;
  }
}

export function DesignCheckPanel({
  state,
  actionsFooter,
}: {
  readonly state: DesignState;
  readonly actionsFooter?: ReactNode;
}) {
  const spec = designPhase.finish(state).result;
  const { mission } = state.input;
  const blockers = launchBlockers(state);

  return (
    <div className="mc-panel" data-testid="design-check-panel" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="mc-label">{t("ui.margins")}</span>
        <span
          className="mc-tabular"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: blockers.length === 0 ? "var(--c-status-ok)" : "var(--c-status-bad)",
          }}
        >
          {spec.margins.filter((m) => m.ok && !(m.id === "science" && mission.kind === "cargo")).length}/
          {spec.margins.filter((m) => !(m.id === "science" && mission.kind === "cargo")).length}
        </span>
      </div>

      <div className="mc-margins">
        {MARGIN_ORDER.map((id) => {
          const m = spec.margins.find((x) => x.id === id);
          if (!m) return null;
          if (id === "science" && mission.kind === "cargo") return null;
          const ratio = id === "science" ? m.need / Math.max(1e-6, m.have) : m.have / Math.max(1e-6, m.need);
          const width = Math.max(0, Math.min(1.5, Number.isFinite(ratio) ? ratio : 0)) / 1.5;
          const statusColor = !m.ok
            ? "var(--c-status-bad)"
            : ratio < 1.15
              ? "var(--c-status-warn)"
              : "var(--c-status-ok)";

          return (
            <div key={id} className="mc-margin-row" title={t(`ui.marginHint.${id}`)}>
              <div className="mc-margin-head">
                <span className="mc-margin-name">
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      background: m.ok ? "rgba(78, 205, 196, 0.16)" : "rgba(120, 41, 15, 0.45)",
                      border: `1px solid ${statusColor}`,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={resolveAssetUrl(m.ok ? "assets/icons/ui/circle-check.svg" : "assets/icons/ui/circle-x.svg")}
                      alt=""
                      width={11}
                      height={11}
                    />
                  </span>
                  {t(`ui.margin.${id}`)}
                </span>
                <span className="mc-tabular" style={{ color: m.ok ? "var(--c-text-muted)" : "var(--c-status-bad)", fontSize: 12 }}>
                  {fmt(m.have)} / {fmt(m.need)} {m.unit}
                </span>
              </div>
              <div className="mc-margin-bar-track">
                <div className="mc-margin-bar-fill" style={{ width: `${width * 100}%`, background: statusColor }} />
              </div>
            </div>
          );
        })}
      </div>

      {blockers.length > 0 ? (
        <div className="mc-alert-bad" role="status">
          {t("ui.blocked", { margins: blockers.map((id) => t(`ui.margin.${id}`)).join(", ") })}
        </div>
      ) : (
        <div className="mc-alert-ok">{t("ui.console.readyToLaunch")}</div>
      )}

      {actionsFooter && (
        <div style={{ borderTop: "1px solid var(--c-border-soft)", paddingTop: 10, display: "grid", gap: 8 }}>
          {actionsFooter}
        </div>
      )}
    </div>
  );
}

export function DesignScreen({
  state,
  dispatch,
  editable,
  active = true,
  upcoming = [],
  actionsLeft,
  header,
  customSlotFooter,
  actionsFooter,
  layoutMode = "standalone",
  resetKey,
  defaultPreviewMode,
  extraPreviewViews,
}: DesignScreenProps) {
  const { mission, catalog } = state.input;
  const { design } = state;
  const [category, setCategory] = useState<"all" | SlotId | "launcher">("all");
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setCategory("all");
  }
  const can = (control: string) => (typeof editable === "function" ? editable(control) : editable);
  const act = (action: DesignAction) => {
    const control = controlOf(action);
    if (control !== null && can(control)) dispatch(action);
  };

  const slotLabel = (slot: SlotId) =>
    t(slot === "instrument" && mission.kind === "cargo" ? "ui.slot.cargo" : `ui.slot.${slot}`);

  return (
    <div className="mc-shell" style={{ gap: 12 }}>
      {header}

      <div className="mc-panel mc-panel-tight" style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
            <strong style={{ fontSize: 18, color: "var(--c-cream)" }}>{t(mission.titleKey)}</strong>
            <span className="mc-stat-pill">
              <span className="mc-label">{t("ui.budget")}</span>
              <strong className="mc-tabular">{fmt(mission.budgetMUsd)} M$</strong>
            </span>
          </div>
          {actionsLeft !== undefined && (
            <span className={`mc-stat-pill ${actionsLeft > 0 ? "is-accent" : "is-warn"}`}>
              {t("ui.actionsLeft", { n: actionsLeft })}
            </span>
          )}
        </div>
        <p style={{ color: "var(--c-text-muted)", margin: 0, fontSize: 13 }}>{t(mission.briefKey)}</p>
      </div>

      <DesignPreview state={state} active={active} defaultMode={defaultPreviewMode} extraViews={extraPreviewViews} />

      {layoutMode === "standalone" && <DesignCheckPanel state={state} actionsFooter={actionsFooter} />}

      <div className="mc-panel mc-panel-tight" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span className="mc-label">{t("ui.console.filterLabel")}</span>
          <div className="mc-filter-bar" role="group" aria-label={t("ui.console.filterLabel")}>
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={`mc-filter-pill ${category === "all" ? "is-active" : ""}`}
            >
              {t("ui.console.filterAll")}
            </button>
            {SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setCategory(slot)}
                className={`mc-filter-pill ${category === slot ? "is-active" : ""}`}
              >
                {slotLabel(slot)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCategory("launcher")}
              className={`mc-filter-pill ${category === "launcher" ? "is-active" : ""}`}
            >
              {t("ui.launcher")}
            </button>
          </div>
        </div>
      </div>

      {SLOTS.map((slot) => {
        if (category !== "all" && category !== slot) return null;
        const options = catalog.modules.filter((m) => m.slot === slot);
        const later = upcoming.filter((u) => u.slot === slot);
        return (
          <section key={slot} className="mc-panel" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="mc-label">{slotLabel(slot)}</span>
              <span style={{ color: "var(--c-text-dim)", fontSize: 12 }}>
                {options.length} {t("ui.console.stateAvailable").toLowerCase()}
              </span>
            </div>

            <div className="mc-module-row">
              {options.map((m) => {
                const selected = design.modules[slot] === m.id;
                const slotEnabled = can(`slot:${slot}`);
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!slotEnabled}
                    aria-pressed={selected}
                    onClick={() => act({ type: "setModule", slot, moduleId: m.id })}
                    className={`mc-module-card ${selected ? "is-selected" : ""}`}
                  >
                    <ModuleVisualSlot slot={slot} moduleId={m.id} />
                    <div style={{ minWidth: 0, display: "grid", gap: 3, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--c-cream)" }}>{t(m.nameKey)}</span>
                      </div>
                      <div className="mc-tabular" style={{ color: "var(--c-status-ok)", fontSize: 12, fontWeight: 600 }}>
                        {keyStat(m)}
                      </div>
                      <div className="mc-tabular" style={{ color: "var(--c-text-muted)", fontSize: 12 }}>
                        {fmt(m.massKg)} kg · {fmt(m.costMUsd)} M$
                      </div>
                      {selected && (
                        <div>
                          <span className="mc-state-badge is-selected">✓ {t("ui.console.stateSelected")}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

              {later.map((u) => (
                <div
                  key={u.id}
                  className="mc-module-card is-locked"
                  aria-disabled="true"
                >
                  <ModuleVisualSlot slot={slot} moduleId={u.id} dimmed />
                  <div style={{ minWidth: 0, display: "grid", gap: 4, flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--c-text-muted)" }}>{t(u.nameKey)}</span>
                    <span className="mc-state-badge is-locked">
                      <LockIcon />
                      {t("ui.availableFrom", { turn: u.fromTurn })}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {slot === "instrument" && customSlotFooter}
          </section>
        );
      })}

      {(category === "all" || category === "launcher") && (
        <section className="mc-panel" style={{ display: "grid", gap: 12 }}>
          <span className="mc-label">{t("ui.launcher")}</span>
          <div className="mc-module-row">
            {mission.launchers.map((l) => {
              const selected = design.launcherId === l.id;
              const launcherEnabled = can("launcher");
              return (
                <button
                  key={l.id}
                  type="button"
                  disabled={!launcherEnabled}
                  aria-pressed={selected}
                  onClick={() => act({ type: "setLauncher", launcherId: l.id })}
                  className={`mc-module-card ${selected ? "is-selected" : ""}`}
                >
                  <div className="mc-sprite-slot">
                    <LauncherPlaceholderIcon id={l.id} />
                  </div>
                  <div style={{ minWidth: 0, display: "grid", gap: 3, flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--c-cream)" }}>{t(l.nameKey)}</span>
                    <span className="mc-tabular" style={{ color: "var(--c-text-muted)", fontSize: 12 }}>
                      ≤ {l.maxPayloadKg} kg · {fmt(l.costMUsd)} M$
                    </span>
                    {selected && (
                      <div>
                        <span className="mc-state-badge is-selected">✓ {t("ui.console.stateSelected")}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mc-steppers-grid">
            <Stepper
              label={t("ui.fuel")}
              value={`${fmt(design.fuelKg)} kg`}
              disabled={!can("fuel")}
              onMinus={() => act({ type: "setFuel", fuelKg: design.fuelKg - FUEL_STEP_KG })}
              onPlus={() => act({ type: "setFuel", fuelKg: design.fuelKg + FUEL_STEP_KG })}
            />
            <Stepper
              label={t("ui.altitude")}
              value={`${fmt(design.altKm)} km`}
              disabled={!can("alt")}
              onMinus={() => act({ type: "setAlt", altKm: design.altKm - ALT_STEP_KM })}
              onPlus={() => act({ type: "setAlt", altKm: design.altKm + ALT_STEP_KM })}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function Stepper(props: { label: string; value: string; disabled: boolean; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="mc-stepper-box">
      <span className="mc-label">{props.label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="mc-btn mc-btn-sm" disabled={props.disabled} onClick={props.onMinus}>
          −
        </button>
        <strong className="mc-tabular" style={{ minWidth: 68, textAlign: "center", color: "var(--c-cream)", fontSize: 14 }}>
          {props.value}
        </strong>
        <button type="button" className="mc-btn mc-btn-sm" disabled={props.disabled} onClick={props.onPlus}>
          +
        </button>
      </div>
    </div>
  );
}
