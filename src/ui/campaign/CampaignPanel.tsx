import { useState } from "react";
import { programProgress, SCENARIOS, type ConsortiumState } from "../../core/consortium";
import { causeChains } from "../../core/debrief";
import { describeEntry } from "../design/cause";
import { fmt, t } from "../text";

// Стан кампанії над ходом: вікно, рахунок агенцій, прогрес наукової програми й підсумок минулого вікна.
// Лише показує стан ядра.

export function CampaignPanel({
  state,
  myAgencyIds,
}: {
  state: ConsortiumState;
  myAgencyIds: string[];
}) {
  const campaign = state.campaign;
  const [open, setOpen] = useState(true);
  if (!campaign) return null;
  const progress = programProgress(state);
  const last = campaign.rounds[campaign.rounds.length - 1];
  const nameOf = (id: string) => {
    const a = state.agencies.find((e) => e.agency.id === id);
    return a ? t(a.agency.nameKey) : id;
  };
  const windowLeft = state.deadlineTurn - state.turn + 1;

  return (
    <div className="mc-panel" style={{ display: "grid", gap: 12 }} data-testid="campaign-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 16, color: "var(--c-cream)" }}>
          {t("ui.campaign.window", { n: campaign.round + 1, total: campaign.config.rounds })}
        </strong>
        {!state.result && (
          <span className="mc-stat-pill is-accent mc-tabular" style={{ fontSize: 12 }}>
            {t("ui.campaign.windowLeft", { n: Math.max(0, windowLeft) })}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 5 }}>
        <div className="mc-tabular" style={{ color: "var(--c-text-muted)", fontSize: 12 }}>
          {t("ui.campaign.program", { percent: fmt(progress * 100, 1) })}
        </div>
        <div className="mc-progress-track">
          <div className="mc-progress-fill" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      </div>

      <table className="mc-table">
        <thead>
          <tr>
            <th>{t("ui.result.agency")}</th>
            <th>{t("ui.campaign.funds")}</th>
            <th>{t("ui.campaign.research")}</th>
            <th>{t("ui.campaign.contribution")}</th>
          </tr>
        </thead>
        <tbody>
          {state.agencies.map((e) => {
            const a = e.account;
            if (!a) return null;
            const highlight = myAgencyIds.includes(e.agency.id);
            return (
              <tr key={e.agency.id} className={highlight ? "is-player" : undefined}>
                <td>
                  {t(e.agency.nameKey)}
                  {a.knowsConditions ? "" : ` · ${t("ui.campaign.unknownConditions")}`}
                </td>
                <td>{fmt(a.fundsMUsd)} M$</td>
                <td>{a.researchPts}</td>
                <td>{fmt(a.programPts, 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {last && (
        <div style={{ borderTop: "1px solid var(--c-border-soft)", paddingTop: 10, display: "grid", gap: 8 }}>
          <button
            type="button"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--c-cream)",
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
              fontWeight: 700,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span>{open ? "▾" : "▸"} {t("ui.campaign.lastWindow", { n: last.round + 1 })}</span>
          </button>
          {open &&
            last.agencies.map((r) => {
              const run = last.runs.find((x) => x.agencyId === r.agencyId);
              const mine = myAgencyIds.includes(r.agencyId);
              const chains = mine && run ? causeChains(run.log) : [];
              return (
                <div key={r.agencyId} style={{ fontSize: 12, display: "grid", gap: 3 }}>
                  <div style={{ color: r.launched ? "var(--c-cream)" : "var(--c-text-dim)" }}>
                    <strong>{nameOf(r.agencyId)}</strong>:{" "}
                    {r.launched && state.base.mission.kind === "cargo"
                      ? t(run?.reachedOrbit === false ? "ui.campaign.cargoMissed" : "ui.campaign.cargoLine", {
                          value: fmt(r.valuePts, 1),
                          payout: fmt(r.payoutMUsd),
                          grant: fmt(r.grantMUsd),
                          research: r.researchPts,
                          orbits: run?.outcome.survivedOrbits ?? 0,
                          total: state.base.mission.durationOrbits,
                        })
                      : r.launched
                        ? t("ui.campaign.roundLine", {
                            mb: fmt(run?.outcome.deliveredMb ?? 0, 0),
                            value: fmt(r.valuePts, 1),
                            payout: fmt(r.payoutMUsd),
                            grant: fmt(r.grantMUsd),
                            research: r.researchPts,
                          })
                        : t("ui.campaign.roundMissed", { grant: fmt(r.grantMUsd), research: r.researchPts })}
                  </div>
                  {mine && r.launched && r.optimalPts > 0 && (
                    <div style={{ color: "var(--c-text-dim)", marginLeft: 12 }}>
                      {t("ui.campaign.optimal", {
                        optimal: fmt(r.optimalPts, 1),
                        percent: fmt(Math.min(999, (r.valuePts / r.optimalPts) * 100), 0),
                      })}
                    </div>
                  )}
                  {chains.map((chain) => {
                    const real = chain.causes.filter((c) => c.kind !== "event");
                    const shown = real.length === 0 ? chain.causes : real;
                    return (
                      <div key={chain.failure.id} style={{ marginLeft: 12 }}>
                        <div style={{ color: "var(--c-status-bad)" }}>🟥 {describeEntry(chain.failure, state.base)}</div>
                        {shown.map((cause) => (
                          <div key={cause.id} style={{ color: "var(--c-text-dim)", marginLeft: 12 }}>
                            ↳ {describeEntry(cause, state.base)}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// Підсумок кампанії: хто зробив найбільший внесок у наукову програму.
export function CampaignStandings({ state }: { state: ConsortiumState }) {
  if (!state.campaign) return null;
  const metric = (e: (typeof state.agencies)[number]) =>
    state.campaign?.config.victory === "commercial" ? e.account?.fundsMUsd ?? 0 : e.account?.programPts ?? 0;
  const winnerId = state.campaign.winner?.agencyId;
  const ranked = [...state.agencies].sort(
    (a, b) => (b.agency.id === winnerId ? 1 : 0) - (a.agency.id === winnerId ? 1 : 0) || metric(b) - metric(a),
  );
  const top = ranked[0];
  const progress = programProgress(state);
  return (
    <div className="mc-panel" style={{ display: "grid", gap: 10 }} data-testid="campaign-standings">
      <h2 style={{ margin: 0, color: "var(--c-cream)" }}>
        {t(progress >= 1 ? "ui.campaign.programDone" : "ui.campaign.programEnded", { percent: fmt(progress * 100, 1) })}
      </h2>
      {(() => {
        const w = state.campaign.winner;
        const winner = w ? state.agencies.find((e) => e.agency.id === w.agencyId) : undefined;
        if (winner && w) {
          const key =
            w.reason === "commercial"
              ? "ui.campaign.winnerCommercial"
              : w.reason === "race"
                ? "ui.campaign.winnerRace"
                : "ui.campaign.winnerProgram";
          return (
            <div style={{ color: "var(--c-orange)", fontWeight: 700 }}>
              🏆 {t(key, { agency: t(winner.agency.nameKey), funds: fmt(winner.account?.fundsMUsd ?? 0) })}
            </div>
          );
        }
        return top ? (
          <div style={{ color: "var(--c-orange)", fontWeight: 700 }}>
            🏆 {t("ui.campaign.leader", { agency: t(top.agency.nameKey), points: fmt(top.account?.programPts ?? 0, 1) })}
          </div>
        ) : null;
      })()}
      {state.campaign.scenarioId === "colony" && (
        <div style={{ color: progress >= 1 ? "var(--c-status-ok)" : "var(--c-status-bad)", fontWeight: 700 }}>
          {t(progress >= 1 ? "ui.campaign.colonySaved" : "ui.campaign.colonyLost")}
        </div>
      )}
      {(() => {
        const key = state.campaign.scenarioId ? SCENARIOS[state.campaign.scenarioId]?.def.analogKey : undefined;
        return key ? <div style={{ color: "var(--c-text-dim)", fontSize: 13 }}>{t("ui.brief.analog", { analog: t(key) })}</div> : null;
      })()}
      {ranked.map((e, i) => (
        <div key={e.agency.id} className="mc-tabular" style={{ color: "var(--c-text-muted)", fontSize: 14 }}>
          {i + 1}. {t(e.agency.nameKey)} · {fmt(e.account?.programPts ?? 0, 1)} · {fmt(e.account?.fundsMUsd ?? 0)} M$
        </div>
      ))}
    </div>
  );
}
