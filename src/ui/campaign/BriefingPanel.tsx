import { failureChance, SCENARIOS, trlOf, type ConsortiumState } from "../../core/consortium";
import { designPhase, SLOTS } from "../../core/design";
import { fmt, t } from "../text";

// Брифінг керівника місії (рамка «інтерн в агенції», пропозиція Олексія): перед кожним вікном коротко, що відомо,
// що змінилось і на що звернути увагу. Лише читає стан ядра.

const C = { panel: "#17203a", line: "#2a2f4a", dim: "#8a90a8", gold: "#ffd166", bad: "#ff5c7a", accent: "#5ca8ff" };

export function BriefingPanel({ state, agencyId }: { state: ConsortiumState; agencyId: string }) {
  const campaign = state.campaign;
  const entry = state.agencies.find((e) => e.agency.id === agencyId);
  const account = entry?.account;
  if (!campaign || !entry || !account) return null;
  const scenario = campaign.scenarioId ? SCENARIOS[campaign.scenarioId] : undefined;
  const lines: { text: string; color?: string }[] = [];

  const event = (campaign.events ?? []).find((e) => e.round === campaign.round);
  if (event) {
    const moduleName = (id?: string) => { const m = state.base.catalog.modules.find((x) => x.id === id); return m ? t(m.nameKey) : id ?? ""; };
    const agencyName = (id?: string) => { const a = state.agencies.find((x) => x.agency.id === id); return a ? t(a.agency.nameKey) : id ?? ""; };
    lines.push({
      text: t(`ui.event.${event.kind}`, {
        module: moduleName(event.moduleId), agency: agencyName(event.agencyId),
        percent: Math.round((1 - (event.priceFactor ?? 1)) * 100), grant: event.grantMUsd ?? 0,
      }),
      color: C.accent,
    });
  }
  if (campaign.round === 0 && scenario) {
    lines.push({ text: t("ui.brief.intro", { scenario: t(scenario.def.titleKey), brief: t(scenario.def.briefKey) }) });
  }
  const target = campaign.config.victoryTarget ?? 0;
  if (campaign.config.victory === "commercial") lines.push({ text: t("ui.brief.victoryCommercial", { target }), color: C.accent });
  if (campaign.config.victory === "race") lines.push({ text: t("ui.brief.victoryRace", { target }), color: C.accent });
  lines.push({ text: t(account.knowsConditions ? "ui.brief.known" : "ui.brief.unknown"), color: account.knowsConditions ? undefined : C.gold });
  lines.push({ text: t("ui.brief.window", { n: campaign.round + 1, total: campaign.config.rounds, turns: Math.max(0, state.deadlineTurn - state.turn + 1) }) });
  lines.push({ text: t("ui.brief.funds", { funds: fmt(account.fundsMUsd), research: account.researchPts }) });
  if ((campaign.config.gapTurns ?? 0) > 0 && campaign.round + 1 < campaign.config.rounds) {
    lines.push({ text: t("ui.brief.gap", { gap: campaign.config.gapTurns ?? 0 }) });
  }
  if (account.missedInRow >= 1) lines.push({ text: t("ui.brief.missed"), color: C.bad });

  const available = new Set(entry.design.input.catalog.modules.map((m) => m.id));
  const soon = state.base.catalog.modules.filter((m) => !available.has(m.id) && (state.market[m.id]?.fromTurn ?? 0) > state.turn && !(entry.agency.blockedModules ?? []).includes(m.id)).length;
  if (soon > 0) lines.push({ text: t("ui.brief.upcoming", { n: soon }) });

  const ids = entry.design.input.catalog.modules.map((m) => m.id);
  const risky = SLOTS.some((slot) => failureChance(trlOf(entry.design.design.modules[slot], account.trlGain ?? {}, ids)) > 0);
  if (risky) lines.push({ text: t("ui.brief.risk"), color: C.gold });

  const last = campaign.rounds[campaign.rounds.length - 1]?.agencies.find((a) => a.agencyId === agencyId);
  if (last && last.launched && last.optimalPts > 0) {
    lines.push({ text: t("ui.brief.lastResult", { value: fmt(last.valuePts, 1), optimal: fmt(last.optimalPts, 1), percent: fmt(Math.min(999, (last.valuePts / last.optimalPts) * 100), 0) }) });
  }
  // Поради за червоними запасами: у навчальному сценарії завжди, в інших — коли щось червоне.
  if (!entry.launch) {
    const red = designPhase.finish(entry.design).result.margins.filter((m) => !m.ok && !(m.id === "science" && entry.design.input.mission.kind === "cargo"));
    if (red.length > 0 || scenario?.def.tutorial) {
      lines.push({ text: t("ui.advice.title"), color: C.gold });
      if (red.length === 0) lines.push({ text: `✓ ${t("ui.advice.allGood")}` });
      for (const m of red) lines.push({ text: `• ${t(`ui.advice.${m.id}`)}` });
    }
  }
  if (scenario?.def.analogKey) lines.push({ text: t("ui.brief.analog", { analog: t(scenario.def.analogKey) }), color: C.dim });

  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 6, borderLeft: `3px solid ${C.accent}` }} data-testid="briefing">
      <strong>📋 {t("ui.brief.title")}</strong>
      {lines.map((l, i) => <div key={i} style={{ fontSize: 14, color: l.color ?? "inherit" }}>{l.text}</div>)}
    </div>
  );
}
