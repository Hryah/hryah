import { useMemo, useState } from "react";
import agenciesData from "../../data/agencies.json";
import marketData from "../../data/market.json";
import { newConsortium, activeAgency, stepConsortium, type ConsortiumAction, type ConsortiumState, type Market } from "../../core/consortium";
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
const MAX_AGENCIES = 4;
// Сід кидків браку береться тут, на екрані: ядро власного рандому не має, тож кожна нова гра отримує свій.
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

const button = {
  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 15,
} as const;

export function ConsortiumScreen() {
  const [state, setState] = useState<ConsortiumState | null>(null);
  const dispatch = (action: ConsortiumAction) => setState((s) => (s ? stepConsortium(s, action) : s));

  if (!state) return <Setup onStart={(chosen) => setState(newConsortium(BASE, MARKET, chosen, undefined, newSeed()))} />;
  if (state.result) return <Results state={state} onRestart={() => setState(null)} />;
  return <Turn state={state} dispatch={dispatch} />;
}

function Setup({ onStart }: { onStart: (agencies: AgencyProfile[]) => void }) {
  const [chosen, setChosen] = useState<string[]>(AGENCIES.map((a) => a.id));
  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < MAX_AGENCIES ? [...c, id] : c));
  const picked = AGENCIES.filter((a) => chosen.includes(a.id));

  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 20, display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>{t("ui.setup.title", { max: MAX_AGENCIES })}</h2>
      <p style={{ color: C.dim, margin: 0 }}>{t("ui.setup.hint")}</p>
      {AGENCIES.map((a) => (
        <label key={a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={chosen.includes(a.id)} onChange={() => toggle(a.id)} />
          <span>
            <strong>{t(a.nameKey)}</strong>
            <div style={{ color: C.dim, fontSize: 13 }}>{t(a.descriptionKey)}</div>
          </span>
        </label>
      ))}
      <div>
        <button style={{ ...button, borderColor: C.accent }} disabled={picked.length === 0} onClick={() => onStart(picked)}>
          {t("ui.setup.start")}
        </button>
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
