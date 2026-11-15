import { agencyAfterEvents, failureChance, reputationGrantFactor, SCENARIOS, trlOf, type ConsortiumState } from "../../core/consortium";
import { designPhase, SLOTS } from "../../core/design";
import { fmt, t } from "../text";

// Брифінг керівника місії (рамка «інтерн в агенції», пропозиція Олексія): перед кожним вікном коротко, що відомо,
// що змінилось і на що звернути увагу. Лише читає стан ядра.

type BriefTone = "default" | "news" | "warn" | "danger" | "muted";

interface BriefLine {
  readonly text: string;
  readonly tone?: BriefTone;
}

const TONE_CLASS: Record<BriefTone, string> = {
  default: "",
  news: " is-news",
  warn: " is-warn",
  danger: " is-danger",
  muted: "",
};

const TONE_ICON: Record<BriefTone, string> = {
  default: "●",
  news: "◆",
  warn: "▲",
  danger: "■",
  muted: "○",
};

// testId відрізняє копію брифінгу у вікні старту від панелі на сторінці.
export function BriefingPanel({ state, agencyId, testId = "briefing" }: { state: ConsortiumState; agencyId: string; testId?: string }) {
  const campaign = state.campaign;
  const entry = state.agencies.find((e) => e.agency.id === agencyId);
  const account = entry?.account;
  if (!campaign || !entry || !account) return null;
  const scenario = campaign.scenarioId ? SCENARIOS[campaign.scenarioId] : undefined;
  const lines: BriefLine[] = [];

  const event = (campaign.events ?? []).find((e) => e.round === campaign.round);
  if (event) {
    const moduleName = (id?: string) => {
      const m = state.base.catalog.modules.find((x) => x.id === id);
      return m ? t(m.nameKey) : id ?? "";
    };
    const agencyName = (id?: string) => {
      const a = state.agencies.find((x) => x.agency.id === id);
      return a ? t(a.agency.nameKey) : id ?? "";
    };
    lines.push({
      text: t(`ui.event.${event.kind}`, {
        module: moduleName(event.moduleId),
        agency: agencyName(event.agencyId),
        percent: Math.round((1 - (event.priceFactor ?? 1)) * 100),
        grant: event.grantMUsd ?? 0,
      }),
      tone: "news",
    });
  }
  if (campaign.round === 0 && scenario) {
    lines.push({ text: t("ui.brief.intro", { scenario: t(scenario.def.titleKey), brief: t(scenario.def.briefKey) }) });
  }
  const target = campaign.config.victoryTarget ?? 0;
  if (campaign.config.victory === "commercial") lines.push({ text: t("ui.brief.victoryCommercial", { target }), tone: "news" });
  if (campaign.config.victory === "race") lines.push({ text: t("ui.brief.victoryRace", { target }), tone: "news" });
  lines.push({
    text: t(account.knowsConditions ? "ui.brief.known" : "ui.brief.unknown"),
    tone: account.knowsConditions ? "default" : "warn",
  });
  lines.push({
    text: t("ui.brief.window", {
      n: campaign.round + 1,
      total: campaign.config.rounds,
      turns: Math.max(0, state.deadlineTurn - state.turn + 1),
    }),
  });
  lines.push({ text: t("ui.brief.funds", { funds: fmt(account.fundsMUsd), research: account.researchPts }) });
  if ((account.reputation ?? 0) !== 0) {
    const rep = account.reputation ?? 0;
    const pct = Math.round((reputationGrantFactor(rep) - 1) * 100);
    lines.push({
      text: t("ui.brief.reputation", { rep: rep > 0 ? `+${rep}` : rep, percent: pct > 0 ? `+${pct}` : pct }),
      tone: rep > 0 ? "news" : "danger",
    });
  }
  if ((campaign.config.gapTurns ?? 0) > 0 && campaign.round + 1 < campaign.config.rounds) {
    lines.push({ text: t("ui.brief.gap", { gap: campaign.config.gapTurns ?? 0 }) });
  }
  if (account.missedInRow >= 1) lines.push({ text: t("ui.brief.missed"), tone: "danger" });

  const available = new Set(entry.design.input.catalog.modules.map((m) => m.id));
  const blocked = agencyAfterEvents(entry.agency, campaign.events ?? []).blockedModules ?? [];
  const lead = entry.agency.marketLeadTurns ?? 0;
  const soon = state.base.catalog.modules.filter(
    (m) => !available.has(m.id) && (state.market[m.id]?.fromTurn ?? 0) - lead > state.turn && !blocked.includes(m.id),
  ).length;
  if (soon > 0) lines.push({ text: t("ui.brief.upcoming", { n: soon }) });

  const ids = entry.design.input.catalog.modules.map((m) => m.id);
  const risky = SLOTS.some((slot) => failureChance(trlOf(entry.design.design.modules[slot], account.trlGain ?? {}, ids)) > 0);
  if (risky) lines.push({ text: t("ui.brief.risk"), tone: "warn" });

  const last = campaign.rounds[campaign.rounds.length - 1]?.agencies.find((a) => a.agencyId === agencyId);
  if (last && last.launched && last.optimalPts > 0) {
    lines.push({
      text: t("ui.brief.lastResult", {
        value: fmt(last.valuePts, 1),
        optimal: fmt(last.optimalPts, 1),
        percent: fmt(Math.min(999, (last.valuePts / last.optimalPts) * 100), 0),
      }),
    });
  }
  // Поради за червоними запасами: у навчальному сценарії завжди, в інших — коли щось червоне.
  if (!entry.launch) {
    const red = designPhase
      .finish(entry.design)
      .result.margins.filter((m) => !m.ok && !(m.id === "science" && entry.design.input.mission.kind === "cargo"));
    if (red.length > 0 || scenario?.def.tutorial) {
      lines.push({ text: t("ui.advice.title"), tone: red.length > 0 ? "warn" : "news" });
      if (red.length === 0) lines.push({ text: `✓ ${t("ui.advice.allGood")}`, tone: "news" });
      for (const m of red) lines.push({ text: t(`ui.advice.${m.id}`), tone: "danger" });
    }
  }
  if (scenario?.def.analogKey) lines.push({ text: t("ui.brief.analog", { analog: t(scenario.def.analogKey) }), tone: "muted" });

  return (
    <details open className="mc-panel mc-details" data-testid={testId}>
      <summary aria-label={`${t("ui.brief.title")} (${t("ui.console.toggleSection")})`}>
        <span>📋 {t("ui.brief.title")}</span>
        <span className="mc-details-chevron" aria-hidden="true">▸</span>
      </summary>
      <div className="mc-brief-list">
        {lines.map((l, i) => {
          const tone = l.tone ?? "default";
          const iconColor =
            tone === "danger"
              ? "var(--c-status-bad)"
              : tone === "warn"
                ? "var(--c-orange)"
                : tone === "news"
                  ? "var(--c-status-ok)"
                  : "var(--c-teal)";
          return (
            <div key={i} className={`mc-brief-item${TONE_CLASS[tone]}`}>
              <span className="mc-brief-icon" aria-hidden="true" style={{ color: iconColor }}>
                {TONE_ICON[tone]}
              </span>
              <span style={tone === "muted" ? { color: "var(--c-text-dim)" } : undefined}>{l.text}</span>
            </div>
          );
        })}
      </div>
    </details>
  );
}
