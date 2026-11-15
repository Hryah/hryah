import { useState } from "react";
import type { AgencyEntry, ConsortiumAction } from "../../core/consortium";
import {
  depositsOf, expectedQuality, IMPORT_DEPOSIT, isReadyBatch, knownFlaws, MATERIALS, planBatch, workshopCapacity, workshopLoad,
  type FactoryOrder, type WorkshopId,
} from "../../core/factory";
import { fmt, t } from "../text";

// Фабрика-граф: сировина → переробка → обробка → модуль. Колонки — стадії, картки — варіанти.
// Екран лише показує план із ядра (planBatch / expectedQuality) і шле дію; правила рахує core/factory.

const C = { panel: "#141829", card: "#1b2036", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", bad: "#ff5c7a", accent: "#5ca8ff", gold: "#ffd166" };
const button = {
  padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 13,
} as const;
const card = (selected: boolean) => ({
  background: C.card, border: `1px solid ${selected ? C.accent : C.line}`, borderRadius: 8, padding: 8,
  cursor: "pointer", textAlign: "left" as const, color: "inherit", fontSize: 13, display: "grid", gap: 4,
});
const ARROW = <div style={{ alignSelf: "center", color: C.dim, fontSize: 18 }}>→</div>;

export function FactoryPanel({ entry, turn, dispatch }: { entry: AgencyEntry; turn: number; dispatch: (a: ConsortiumAction) => void }) {
  // У вантажному рейсі лінії оптичного скла немає сенсу: слот приладу там — контейнер.
  const lineIds = Object.keys(MATERIALS.lines).filter((id) => !(entry.design.input.mission.kind === "cargo" && MATERIALS.lines[id]!.slot === "instrument"));
  const [lineId, setLineId] = useState(lineIds[0]!);
  const line = MATERIALS.lines[lineId]!;
  const deposits = depositsOf(entry.agency.id, lineId);
  const [depositId, setDepositId] = useState<string>(deposits[0]!);
  const stage0 = Object.keys(line.stages[0]);
  const stage1 = Object.keys(line.stages[1]);
  const [steps, setSteps] = useState<[string, string]>([stage0[0]!, stage1[0]!]);
  const bases = entry.design.input.catalog.modules.filter((m) => m.slot === line.slot && !m.id.startsWith("fab-") && !m.id.startsWith("custom-"));
  const [baseId, setBaseId] = useState<string>(bases[0]?.id ?? "");
  const factory = entry.factory;
  if (!factory || !entry.account) return null;

  // Стан форми прив'язаний до лінії: при зміні лінії обираємо її перші варіанти.
  const pickLine = (id: string) => {
    const l = MATERIALS.lines[id]!;
    setLineId(id);
    setDepositId(depositsOf(entry.agency.id, id)[0]!);
    setSteps([Object.keys(l.stages[0])[0]!, Object.keys(l.stages[1])[0]!]);
    setBaseId(entry.design.input.catalog.modules.find((m) => m.slot === l.slot && !m.id.startsWith("fab-") && !m.id.startsWith("custom-"))?.id ?? "");
  };
  const safeDeposit = deposits.includes(depositId) ? depositId : deposits[0]!;
  // Обраний модуль міг зникнути з каталогу (зрив постачальника): тоді беремо перший доступний.
  const safeBaseId = bases.some((m) => m.id === baseId) ? baseId : bases[0]?.id ?? "";
  const order: FactoryOrder = { line: lineId, depositId: safeDeposit, steps, baseModuleId: safeBaseId };
  const plan = planBatch(entry.agency, factory, order, turn, entry.design.input.catalog.modules);
  const expected = expectedQuality(entry.agency, factory, order, turn);
  const known = knownFlaws(factory, lineId, safeDeposit, turn);
  const analyzedKey = `${lineId}:${safeDeposit}`;
  const canAnalyze = safeDeposit !== IMPORT_DEPOSIT && !factory.analyzed.includes(analyzedKey) && entry.actionsLeft > 0 && !entry.launch
    && entry.account.fundsMUsd >= MATERIALS.analyzeCostMUsd;
  const affordable = plan.batch !== undefined && entry.account.fundsMUsd >= plan.batch.costMUsd;
  const canOrder = plan.ok && affordable && entry.actionsLeft > 0 && !entry.launch;
  const cured = new Set([...(line.stages[0][steps[0]]?.cures ?? []), ...(line.stages[1][steps[1]]?.cures ?? [])]);

  const stageColumn = (index: 0 | 1, ids: string[]) => (
    <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
      <div style={{ color: C.dim, fontSize: 12 }}>{t(index === 0 ? "ui.factory.refine" : "ui.factory.finish")}</div>
      {ids.map((id) => {
        const o = line.stages[index][id]!;
        const selected = steps[index] === id;
        const load = workshopLoad(factory, o.workshop, turn);
        const cap = workshopCapacity(entry.agency, o.workshop);
        return (
          <button key={id} style={card(selected)} onClick={() => setSteps((s) => (index === 0 ? [id, s[1]] : [s[0], id]))}>
            <strong>{t(o.nameKey)}</strong>
            <span style={{ color: C.dim }}>{t(o.hintKey)}</span>
            <span>
              {o.cures.length > 0
                ? o.cures.map((f) => <span key={f} style={{ color: known.includes(f) ? C.ok : C.dim, marginRight: 6 }}>✚ {t(line.flaws[f]!.nameKey)}</span>)
                : <span style={{ color: C.dim }}>{t("ui.factory.curesNothing")}</span>}
            </span>
            <span style={{ color: load >= cap ? C.bad : C.dim }}>
              {t(MATERIALS.workshops[o.workshop].nameKey)} {load}/{cap} · {t("ui.factory.turns", { n: o.turns })} · {fmt(o.costMUsd)} M$
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 10 }} data-testid="factory-panel">
      <strong>🏭 {t("ui.factory.title")}</strong>
      <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.factory.hint")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {lineIds.map((id) => (
          <button key={id} style={{ ...button, borderColor: id === lineId ? C.accent : C.line }} onClick={() => pickLine(id)}>
            {t(MATERIALS.lines[id]!.nameKey)}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr auto 1fr", gap: 8, overflowX: "auto" }}>
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          <div style={{ color: C.dim, fontSize: 12 }}>{t("ui.factory.raw")}</div>
          {deposits.map((id) => {
            const dep = line.deposits[id]!;
            const flaws = knownFlaws(factory, lineId, id, turn);
            const hiddenLeft = dep.hidden.some((f) => !flaws.includes(f));
            return (
              <button key={id} style={card(safeDeposit === id)} onClick={() => setDepositId(id)}>
                <strong>{t(dep.nameKey)}</strong>
                <span>
                  {flaws.length === 0 && !hiddenLeft
                    ? <span style={{ color: C.ok }}>{t("ui.factory.pure")}</span>
                    : flaws.map((f) => <span key={f} style={{ color: cured.has(f) && safeDeposit === id ? C.ok : C.gold, marginRight: 6 }}>⚠ {t(line.flaws[f]!.nameKey)}</span>)}
                  {hiddenLeft && <span style={{ color: C.dim }}>{t("ui.factory.hiddenFlaw")}</span>}
                </span>
                <span style={{ color: C.dim }}>{fmt(dep.costMUsd)} M$</span>
              </button>
            );
          })}
          <button style={{ ...button, opacity: canAnalyze ? 1 : 0.5 }} disabled={!canAnalyze}
            onClick={() => dispatch({ type: "analyze", line: lineId, depositId: safeDeposit })}>
            🔍 {t("ui.factory.analyze", { cost: fmt(MATERIALS.analyzeCostMUsd) })}
          </button>
        </div>
        {ARROW}
        {stageColumn(0, stage0)}
        {ARROW}
        {stageColumn(1, stage1)}
        {ARROW}
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          <div style={{ color: C.dim, fontSize: 12 }}>{t("ui.factory.product")}</div>
          <select value={safeBaseId} onChange={(e) => setBaseId(e.target.value)} aria-label={t("ui.factory.product")}>
            {bases.map((m) => <option key={m.id} value={m.id}>{t(m.nameKey)}</option>)}
          </select>
          {plan.batch && (
            <div style={{ fontSize: 13, display: "grid", gap: 2 }}>
              <span>{t("ui.factory.expected", { q: fmt((expected ?? 0) * 100, 0) })}</span>
              <span style={{ color: C.dim }}>{t("ui.factory.cost", { cost: fmt(plan.batch.costMUsd), turns: plan.batch.readyTurn - turn })}</span>
            </div>
          )}
          {!plan.ok && plan.reason === "workshop" && <span style={{ color: C.bad, fontSize: 13 }}>{t("ui.factory.busy")}</span>}
          <button style={{ ...button, borderColor: canOrder ? C.ok : C.line, opacity: canOrder ? 1 : 0.5 }} disabled={!canOrder}
            onClick={() => dispatch({ type: "factory", order })}>
            {t("ui.factory.order")}
          </button>
        </div>
      </div>

      {factory.batches.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8, display: "grid", gap: 4, fontSize: 13 }}>
          {factory.batches.map((b) => {
            const ready = isReadyBatch(b, turn);
            const l = MATERIALS.lines[b.line]!;
            return (
              <div key={b.id}>
                {ready ? "✅" : "⏳"} {t(b.module.nameKey)} · {t(l.deposits[b.depositId]!.nameKey)} →{" "}
                {ready
                  ? <span style={{ color: b.quality >= 0.8 ? C.ok : C.gold }}>
                      {t("ui.factory.quality", { q: fmt(b.quality * 100, 0) })}
                      {b.uncured.length > 0 && ` · ${t("ui.factory.left", { flaws: b.uncured.map((f) => t(l.flaws[f]!.nameKey)).join(", ") })}`}
                    </span>
                  : <span style={{ color: C.dim }}>{t("ui.factory.inTurns", { n: b.readyTurn - turn })}</span>}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", color: C.dim, fontSize: 12 }}>
        {(Object.keys(MATERIALS.workshops) as WorkshopId[]).map((ws) => (
          <span key={ws}>{t(MATERIALS.workshops[ws].nameKey)}: {workshopLoad(factory, ws, turn)}/{workshopCapacity(entry.agency, ws)}</span>
        ))}
      </div>
    </div>
  );
}
