import { useState } from "react";
import type { AgencyEntry, ConsortiumAction } from "../../core/consortium";
import {
  depositsOf,
  expectedQuality,
  IMPORT_DEPOSIT,
  isReadyBatch,
  knownFlaws,
  MATERIALS,
  planBatch,
  workshopCapacity,
  workshopLoad,
  type FactoryOrder,
  type WorkshopId,
} from "../../core/factory";
import { fmt, t } from "../text";

// Фабрика-граф: сировина → переробка → обробка → модуль. Три колонки — стадії з варіантами (①②③),
// під ними панель «маршрут»: що обрано, у який модуль перетворюємо, очікувана якість, ціна й кнопка замовлення.
// Екран лише показує план із ядра (planBatch / expectedQuality) і шле дію; правила рахує core/factory.

const ARROW = (
  <div className="mc-conveyor-arrow" aria-hidden="true">
    →
  </div>
);

export function FactoryPanel({
  entry,
  turn,
  dispatch,
}: {
  entry: AgencyEntry;
  turn: number;
  dispatch: (a: ConsortiumAction) => void;
}) {
  // У вантажному рейсі лінії оптичного скла немає сенсу: слот приладу там — контейнер.
  const lineIds = Object.keys(MATERIALS.lines).filter(
    (id) => !(entry.design.input.mission.kind === "cargo" && MATERIALS.lines[id]!.slot === "instrument"),
  );
  const [lineId, setLineId] = useState(lineIds[0]!);
  const line = MATERIALS.lines[lineId]!;
  const deposits = depositsOf(entry.agency.id, lineId);
  const [depositId, setDepositId] = useState<string>(deposits[0]!);
  const stage0 = Object.keys(line.stages[0]);
  const stage1 = Object.keys(line.stages[1]);
  const [steps, setSteps] = useState<[string, string]>([stage0[0]!, stage1[0]!]);
  const bases = entry.design.input.catalog.modules.filter(
    (m) => m.slot === line.slot && !m.id.startsWith("fab-") && !m.id.startsWith("custom-"),
  );
  const [baseId, setBaseId] = useState<string>(bases[0]?.id ?? "");
  const factory = entry.factory;
  if (!factory || !entry.account) return null;

  // Стан форми прив'язаний до лінії: при зміні лінії обираємо її перші варіанти.
  const pickLine = (id: string) => {
    const l = MATERIALS.lines[id]!;
    setLineId(id);
    setDepositId(depositsOf(entry.agency.id, id)[0]!);
    setSteps([Object.keys(l.stages[0])[0]!, Object.keys(l.stages[1])[0]!]);
    setBaseId(
      entry.design.input.catalog.modules.find((m) => m.slot === l.slot && !m.id.startsWith("fab-") && !m.id.startsWith("custom-"))
        ?.id ?? "",
    );
  };
  const safeDeposit = deposits.includes(depositId) ? depositId : deposits[0]!;
  // Обраний модуль міг зникнути з каталогу (зрив постачальника): тоді беремо перший доступний.
  const safeBaseId = bases.some((m) => m.id === baseId) ? baseId : bases[0]?.id ?? "";
  const order: FactoryOrder = { line: lineId, depositId: safeDeposit, steps, baseModuleId: safeBaseId };
  const plan = planBatch(entry.agency, factory, order, turn, entry.design.input.catalog.modules);
  const expected = expectedQuality(entry.agency, factory, order, turn);
  const known = knownFlaws(factory, lineId, safeDeposit, turn);
  const analyzedKey = `${lineId}:${safeDeposit}`;
  const canAnalyze =
    safeDeposit !== IMPORT_DEPOSIT &&
    !factory.analyzed.includes(analyzedKey) &&
    entry.actionsLeft > 0 &&
    !entry.launch &&
    entry.account.fundsMUsd >= MATERIALS.analyzeCostMUsd;
  const affordable = plan.batch !== undefined && entry.account.fundsMUsd >= plan.batch.costMUsd;
  const canOrder = plan.ok && affordable && entry.actionsLeft > 0 && !entry.launch;
  const cured = new Set([...(line.stages[0][steps[0]]?.cures ?? []), ...(line.stages[1][steps[1]]?.cures ?? [])]);
  // Відомі вади обраної сировини, які обраний маршрут не лікує.
  const uncured = known.filter((f) => !cured.has(f));

  const stageColumn = (index: 0 | 1, ids: string[]) => (
    <div className="mc-conveyor-stage">
      <div className="mc-label">{index === 0 ? "②" : "③"} {t(index === 0 ? "ui.factory.refine" : "ui.factory.finish")}</div>
      {ids.map((id) => {
        const o = line.stages[index][id]!;
        const selected = steps[index] === id;
        const load = workshopLoad(factory, o.workshop, turn);
        const cap = workshopCapacity(entry.agency, o.workshop);
        return (
          <button
            key={id}
            type="button"
            className={`mc-stage-option ${selected ? "is-selected" : ""}`}
            onClick={() => setSteps((s) => (index === 0 ? [id, s[1]] : [s[0], id]))}
          >
            <strong>{t(o.nameKey)}</strong>
            <span style={{ color: "var(--c-text-muted)" }}>{t(o.hintKey)}</span>
            <span>
              {o.cures.length > 0 ? (
                o.cures.map((f) => (
                  <span
                    key={f}
                    style={{
                      color: known.includes(f) ? "var(--c-status-ok)" : "var(--c-text-dim)",
                      marginRight: 6,
                    }}
                  >
                    ✚ {t(line.flaws[f]!.nameKey)}
                  </span>
                ))
              ) : (
                <span style={{ color: "var(--c-text-dim)" }}>{t("ui.factory.curesNothing")}</span>
              )}
            </span>
            <span className="mc-tabular" style={{ color: load >= cap ? "var(--c-status-bad)" : "var(--c-text-dim)" }}>
              {t(MATERIALS.workshops[o.workshop].nameKey)} {load}/{cap} · {t("ui.factory.turns", { n: o.turns })} ·{" "}
              {fmt(o.costMUsd)} M$
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="mc-panel" style={{ display: "grid", gap: 12 }} data-testid="factory-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 16 }}>🏭 {t("ui.factory.title")}</strong>
        <span className="mc-label">{t("ui.console.conveyorLabel")}</span>
      </div>
      <div style={{ color: "var(--c-text-muted)", fontSize: 13 }}>{t("ui.factory.hint")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {lineIds.map((id) => (
          <button
            key={id}
            type="button"
            className={`mc-btn mc-btn-sm ${id === lineId ? "mc-btn-selected" : ""}`}
            onClick={() => pickLine(id)}
          >
            {t(MATERIALS.lines[id]!.nameKey)}
          </button>
        ))}
      </div>

      <div className="mc-conveyor">
        <div className="mc-conveyor-stage">
          <div className="mc-label">① {t("ui.factory.raw")}</div>
          {deposits.map((id) => {
            const dep = line.deposits[id]!;
            const flaws = knownFlaws(factory, lineId, id, turn);
            const hiddenLeft = dep.hidden.some((f) => !flaws.includes(f));
            return (
              <button
                key={id}
                type="button"
                className={`mc-stage-option ${safeDeposit === id ? "is-selected" : ""}`}
                onClick={() => setDepositId(id)}
              >
                <strong>{t(dep.nameKey)}</strong>
                <span>
                  {flaws.length === 0 && !hiddenLeft ? (
                    <span style={{ color: "var(--c-status-ok)" }}>{t("ui.factory.pure")}</span>
                  ) : (
                    flaws.map((f) => (
                      <span
                        key={f}
                        style={{
                          color: cured.has(f) && safeDeposit === id ? "var(--c-status-ok)" : "var(--c-orange)",
                          marginRight: 6,
                        }}
                      >
                        ⚠ {t(line.flaws[f]!.nameKey)}
                      </span>
                    ))
                  )}
                  {hiddenLeft && <span style={{ color: "var(--c-text-dim)" }}>{t("ui.factory.hiddenFlaw")}</span>}
                </span>
                <span className="mc-tabular" style={{ color: "var(--c-text-dim)" }}>
                  {fmt(dep.costMUsd)} M$
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="mc-btn mc-btn-sm"
            disabled={!canAnalyze}
            onClick={() => dispatch({ type: "analyze", line: lineId, depositId: safeDeposit })}
          >
            🔍 {t("ui.factory.analyze", { cost: fmt(MATERIALS.analyzeCostMUsd) })}
          </button>
        </div>
        {ARROW}
        {stageColumn(0, stage0)}
        {ARROW}
        {stageColumn(1, stage1)}
      </div>

      <div className="mc-route" data-testid="factory-route">
        <div className="mc-route-path">
          <span className="mc-label">{t("ui.factory.route")}</span>
          <span className="mc-route-step">{t(line.deposits[safeDeposit]!.nameKey)}</span>
          <span aria-hidden="true">→</span>
          <span className="mc-route-step">{t(line.stages[0][steps[0]]!.nameKey)}</span>
          <span aria-hidden="true">→</span>
          <span className="mc-route-step">{t(line.stages[1][steps[1]]!.nameKey)}</span>
          <span aria-hidden="true">→</span>
          <select
            className="mc-select"
            value={safeBaseId}
            onChange={(e) => setBaseId(e.target.value)}
            aria-label={t("ui.factory.product")}
          >
            {bases.map((m) => (
              <option key={m.id} value={m.id}>
                {t(m.nameKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="mc-route-result">
          <div className="mc-tabular" style={{ display: "grid", gap: 3, fontSize: 13 }}>
            {plan.batch && (
              <>
                <span style={{ color: (expected ?? 0) >= 0.8 ? "var(--c-status-ok)" : "var(--c-orange)", fontWeight: 700, fontSize: 16 }}>
                  {t("ui.factory.expected", { q: fmt((expected ?? 0) * 100, 0) })}
                </span>
                <span style={{ color: "var(--c-text-muted)" }}>
                  {t("ui.factory.cost", { cost: fmt(plan.batch.costMUsd), turns: plan.batch.readyTurn - turn })}
                </span>
              </>
            )}
            {uncured.length > 0 && (
              <span style={{ color: "var(--c-orange)" }}>
                ⚠ {t("ui.factory.left", { flaws: uncured.map((f) => t(line.flaws[f]!.nameKey)).join(", ") })}
              </span>
            )}
            {!plan.ok && plan.reason === "workshop" && (
              <span style={{ color: "var(--c-status-bad)" }}>{t("ui.factory.busy")}</span>
            )}
          </div>
          <button
            type="button"
            className={`mc-btn ${canOrder ? "mc-btn-primary" : ""}`}
            disabled={!canOrder}
            onClick={() => dispatch({ type: "factory", order })}
          >
            {t("ui.factory.order")}
          </button>
        </div>
      </div>

      {factory.batches.length > 0 && (
        <div style={{ borderTop: "1px solid var(--c-border-soft)", paddingTop: 8, display: "grid", gap: 4, fontSize: 13 }}>
          {factory.batches.map((b) => {
            const ready = isReadyBatch(b, turn);
            const l = MATERIALS.lines[b.line]!;
            return (
              <div key={b.id} className="mc-tabular">
                {ready ? "✅" : "⏳"} {t(b.module.nameKey)} · {t(l.deposits[b.depositId]!.nameKey)} →{" "}
                {ready ? (
                  <span style={{ color: b.quality >= 0.8 ? "var(--c-status-ok)" : "var(--c-orange)" }}>
                    {t("ui.factory.quality", { q: fmt(b.quality * 100, 0) })}
                    {b.uncured.length > 0 &&
                      ` · ${t("ui.factory.left", { flaws: b.uncured.map((f) => t(l.flaws[f]!.nameKey)).join(", ") })}`}
                  </span>
                ) : (
                  <span style={{ color: "var(--c-text-dim)" }}>{t("ui.factory.inTurns", { n: b.readyTurn - turn })}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", color: "var(--c-text-dim)", fontSize: 12 }}>
        {(Object.keys(MATERIALS.workshops) as WorkshopId[]).map((ws) => (
          <span key={ws} className="mc-stat-pill">
            {t(MATERIALS.workshops[ws].nameKey)}: {workshopLoad(factory, ws, turn)}/{workshopCapacity(entry.agency, ws)}
          </span>
        ))}
      </div>
    </div>
  );
}
