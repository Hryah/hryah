import { useState } from "react";
import { programProgress, SCENARIOS, type ConsortiumState } from "../../core/consortium";
import { causeChains } from "../../core/debrief";
import { describeEntry } from "../design/cause";
import { fmt, t } from "../text";

// Стан кампанії над ходом: вікно, рахунок агенцій, прогрес наукової програми й підсумок минулого вікна.
// Лише показує стан ядра.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", bad: "#ff5c7a", accent: "#5ca8ff", gold: "#ffd166" };

export function CampaignPanel({ state, myAgencyIds }: { state: ConsortiumState; myAgencyIds: string[] }) {
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
    <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 10 }} data-testid="campaign-panel">
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
        <strong style={{ fontSize: 18 }}>{t("ui.campaign.window", { n: campaign.round + 1, total: campaign.config.rounds })}</strong>
        {!state.result && <span style={{ color: C.accent }}>{t("ui.campaign.windowLeft", { n: Math.max(0, windowLeft) })}</span>}
      </div>

      <div>
        <div style={{ color: C.dim, fontSize: 13, marginBottom: 4 }}>
          {t("ui.campaign.program", { percent: fmt(progress * 100, 1) })}
        </div>
        <div style={{ height: 10, borderRadius: 5, background: C.line, overflow: "hidden" }}>
          <div style={{ width: `${progress * 100}%`, height: "100%", background: C.ok }} />
        </div>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
        <thead>
          <tr style={{ color: C.dim, textAlign: "left", fontSize: 12 }}>
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
            const mine = myAgencyIds.includes(e.agency.id);
            return (
              <tr key={e.agency.id} style={{ borderTop: `1px solid ${C.line}`, color: mine ? C.gold : "inherit" }}>
                <td style={{ padding: "4px 0" }}>
                  {t(e.agency.nameKey)}{a.knowsConditions ? "" : ` · ${t("ui.campaign.unknownConditions")}`}
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
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8, display: "grid", gap: 6 }}>
          <button
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0, textAlign: "left", fontWeight: 700 }}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "▾" : "▸"} {t("ui.campaign.lastWindow", { n: last.round + 1 })}
          </button>
          {open && last.agencies.map((r) => {
            const run = last.runs.find((x) => x.agencyId === r.agencyId);
            const mine = myAgencyIds.includes(r.agencyId);
            const chains = mine && run ? causeChains(run.log) : [];
            return (
              <div key={r.agencyId} style={{ fontSize: 13 }}>
                <div style={{ color: r.launched ? "inherit" : C.dim }}>
                  {nameOf(r.agencyId)}:{" "}
                  {r.launched
                    ? t("ui.campaign.roundLine", {
                        mb: fmt(run?.outcome.deliveredMb ?? 0, 0), value: fmt(r.valuePts, 1), payout: fmt(r.payoutMUsd), grant: fmt(r.grantMUsd), research: r.researchPts,
                      })
                    : t("ui.campaign.roundMissed", { grant: fmt(r.grantMUsd), research: r.researchPts })}
                </div>
                {mine && r.launched && r.optimalPts > 0 && (
                  <div style={{ color: C.dim, marginLeft: 16 }}>
                    {t("ui.campaign.optimal", { optimal: fmt(r.optimalPts, 1), percent: fmt(Math.min(999, (r.valuePts / r.optimalPts) * 100), 0) })}
                  </div>
                )}
                {chains.map((chain) => {
                  // Події ховаємо як шум, але якщо причина лише подія, показуємо її, щоб відмова не лишилась без пояснення.
                  const real = chain.causes.filter((c) => c.kind !== "event");
                  const shown = real.length === 0 ? chain.causes : real;
                  return (
                  <div key={chain.failure.id} style={{ marginLeft: 16 }}>
                    <div style={{ color: C.bad }}>🟥 {describeEntry(chain.failure, state.base)}</div>
                    {shown.map((cause) => (
                      <div key={cause.id} style={{ color: C.dim, marginLeft: 16 }}>↳ {describeEntry(cause, state.base)}</div>
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
  const ranked = [...state.agencies].sort((a, b) => (b.account?.programPts ?? 0) - (a.account?.programPts ?? 0));
  const top = ranked[0];
  const progress = programProgress(state);
  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 20, display: "grid", gap: 8 }} data-testid="campaign-standings">
      <h2 style={{ margin: 0 }}>{t(progress >= 1 ? "ui.campaign.programDone" : "ui.campaign.programEnded", { percent: fmt(progress * 100, 1) })}</h2>
      {top && <div style={{ color: C.gold }}>🏆 {t("ui.campaign.leader", { agency: t(top.agency.nameKey), points: fmt(top.account?.programPts ?? 0, 1) })}</div>}
      {(() => {
        const key = state.campaign.scenarioId ? SCENARIOS[state.campaign.scenarioId]?.def.analogKey : undefined;
        return key ? <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.brief.analog", { analog: t(key) })}</div> : null;
      })()}
      {ranked.map((e, i) => (
        <div key={e.agency.id} style={{ color: C.dim }}>
          {i + 1}. {t(e.agency.nameKey)} · {fmt(e.account?.programPts ?? 0, 1)} · {fmt(e.account?.fundsMUsd ?? 0)} M$
        </div>
      ))}
    </div>
  );
}
