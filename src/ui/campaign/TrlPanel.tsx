import { failureChance, qualifyCostMUsd, trlOf, type AgencyEntry, type ConsortiumAction } from "../../core/consortium";
import { SLOTS } from "../../core/design";
import { fmt, t } from "../text";

// Зрілість технологій поточного проєкту: TRL кожного модуля, ризик відмови після запуску, наземні випробування.

export function TrlPanel({ entry, dispatch }: { entry: AgencyEntry; dispatch: (a: ConsortiumAction) => void }) {
  const account = entry.account;
  if (!account) return null;
  const catalog = entry.design.input.catalog.modules;
  const ids = catalog.map((m) => m.id);
  return (
    <div className="mc-panel" style={{ display: "grid", gap: 10 }} data-testid="trl-panel">
      <strong style={{ fontSize: 16 }}>🧯 {t("ui.trl.title")}</strong>
      <div style={{ color: "var(--c-text-muted)", fontSize: 13 }}>{t("ui.trl.hint")}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {SLOTS.map((slot) => {
          const id = entry.design.design.modules[slot];
          const module = catalog.find((m) => m.id === id);
          if (!module) return null;
          const trl = trlOf(id, account.trlGain ?? {}, ids);
          const risk = failureChance(trl);
          const cost = qualifyCostMUsd(module.costMUsd);
          const can =
            trl < 9 &&
            entry.actionsLeft > 0 &&
            !entry.touched.includes(`qualify:${id}`) &&
            account.fundsMUsd >= cost &&
            !entry.launch;
          const color = risk === 0 ? "var(--c-status-ok)" : risk >= 0.2 ? "var(--c-status-bad)" : "var(--c-status-warn)";
          return (
            <div
              key={slot}
              className="mc-stepper-box"
              style={{ flexWrap: "wrap" }}
            >
              <span className="mc-tabular" style={{ color, fontSize: 13, fontWeight: 600 }}>
                {t("ui.trl.row", { module: t(module.nameKey), trl, risk: fmt(risk * 100, 0) })}
              </span>
              {trl < 9 && (
                <button
                  type="button"
                  className="mc-btn mc-btn-sm"
                  disabled={!can}
                  onClick={() => dispatch({ type: "qualify", moduleId: id })}
                >
                  {t("ui.trl.qualify", { cost: fmt(cost) })}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
