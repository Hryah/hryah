import { failureChance, qualifyCostMUsd, trlOf, type AgencyEntry, type ConsortiumAction } from "../../core/consortium";
import { SLOTS } from "../../core/design";
import { fmt, t } from "../text";

// Зрілість технологій поточного проєкту: TRL кожного модуля, ризик відмови після запуску, наземні випробування.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", bad: "#ff5c7a", gold: "#ffd166" };
const button = {
  padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 13,
} as const;

export function TrlPanel({ entry, dispatch }: { entry: AgencyEntry; dispatch: (a: ConsortiumAction) => void }) {
  const account = entry.account;
  if (!account) return null;
  const catalog = entry.design.input.catalog.modules;
  const ids = catalog.map((m) => m.id);
  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 6 }} data-testid="trl-panel">
      <strong>🧯 {t("ui.trl.title")}</strong>
      <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.trl.hint")}</div>
      {SLOTS.map((slot) => {
        const id = entry.design.design.modules[slot];
        const module = catalog.find((m) => m.id === id);
        if (!module) return null;
        const trl = trlOf(id, account.trlGain ?? {}, ids);
        const risk = failureChance(trl);
        const cost = qualifyCostMUsd(module.costMUsd);
        const can = trl < 9 && entry.actionsLeft > 0 && !entry.touched.includes(`qualify:${id}`) && account.fundsMUsd > cost && !entry.launch;
        return (
          <div key={slot} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
            <span style={{ color: risk === 0 ? C.ok : risk >= 0.2 ? C.bad : C.gold }}>
              {t("ui.trl.row", { module: t(module.nameKey), trl, risk: fmt(risk * 100, 0) })}
            </span>
            {trl < 9 && (
              <button style={{ ...button, opacity: can ? 1 : 0.5 }} disabled={!can} onClick={() => dispatch({ type: "qualify", moduleId: id })}>
                {t("ui.trl.qualify", { cost: fmt(cost) })}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
