import { useState } from "react";
import { programProgress, type ConsortiumState } from "../../core/consortium";
import { fmt, t } from "../text";
import { BriefingPanel } from "./BriefingPanel";
import { load, save } from "../../storage";
import { PhaseCard, useCardsEnabled, type SummaryRow } from "./PhaseCard";

// Вікно на початку кожного вікна запуску для агенції гравця: підсумок минулого вікна, брифінг і що робити в проєктуванні.
// Показується один раз на агенцію й вікно; «бачене» зберігається (storage.ts), тож оновлення сторінки його не повторює.

const SEEN_KEY = "phaseCardsSeen";
const SEEN_LIMIT = 64;
const seenList = (): string[] => {
  const v = load<unknown>(SEEN_KEY);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
};
const markSeen = (key: string) => save(SEEN_KEY, [...seenList().filter((k) => k !== key), key].slice(-SEEN_LIMIT));

export function WindowCard({ state, agencyId }: { state: ConsortiumState; agencyId: string }) {
  const campaign = state.campaign;
  const entry = state.agencies.find((e) => e.agency.id === agencyId);
  const key = campaign ? `${state.seed}:${agencyId}:${campaign.round}` : "";
  const [, rerender] = useState(0);
  const on = useCardsEnabled();
  if (!campaign || !entry?.account || entry.launch || !on || seenList().includes(key)) return null;
  const last = campaign.rounds[campaign.rounds.length - 1];
  const mine = last?.agencies.find((a) => a.agencyId === agencyId);
  const summary: SummaryRow[] = [];
  if (last && mine) {
    summary.push(
      { label: t("ui.card.row.lastWindow", { n: last.round + 1 }), value: t(mine.launched ? "ui.card.launched" : "ui.card.skipped"), tone: mine.launched ? "ok" : "gold" },
      { label: t("ui.card.row.contribution"), value: fmt(mine.valuePts, 1) },
      { label: t("ui.card.row.payout"), value: `${fmt(mine.payoutMUsd + mine.grantMUsd)} M$` },
    );
  }
  // Гроші й очки досліджень уже є в брифінгу нижче.
  summary.push({ label: t("ui.card.row.program"), value: `${fmt(programProgress(state) * 100, 1)}%` });
  const turns = Math.max(0, state.deadlineTurn - state.turn + 1);
  return (
    <PhaseCard
      id="window" step={{ n: 1, total: 4 }} summary={summary} vars={{ turns }}
      title={t("ui.card.window.title", { n: campaign.round + 1, total: campaign.config.rounds, agency: t(entry.agency.nameKey) })}
      extra={<BriefingPanel state={state} agencyId={agencyId} />}
      onContinue={() => { markSeen(key); rerender((n) => n + 1); }}
    />
  );
}
