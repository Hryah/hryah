import { RESEARCH, type AgencyEntry, type ConsortiumAction } from "../../core/consortium";
import { t } from "../text";

// Дерево досліджень активної агенції: вузли з data/research.json, ціна в очках. Дослідження не забирає дій ходу.

export function ResearchPanel({ entry, dispatch }: { entry: AgencyEntry; dispatch: (a: ConsortiumAction) => void }) {
  const account = entry.account;
  if (!account) return null;
  return (
    <div className="mc-panel" style={{ display: "grid", gap: 10 }} data-testid="research-panel">
      <strong style={{ fontSize: 16 }}>🧪 {t("ui.research.title", { pts: account.researchPts })}</strong>
      <div style={{ color: "var(--c-text-muted)", fontSize: 13 }}>{t("ui.research.hint")}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {Object.values(RESEARCH).map((node) => {
          const done = account.unlocked.includes(node.id);
          const affordable = account.researchPts >= node.costPts;
          return (
            <div
              key={node.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                padding: "6px 10px",
                borderRadius: 7,
                border: `1px solid ${done ? "rgba(78, 205, 196, 0.45)" : "var(--c-border-soft)"}`,
                background: done ? "rgba(21, 97, 109, 0.22)" : "rgba(0, 21, 36, 0.55)",
                fontSize: 13,
              }}
            >
              {done ? (
                <span className="mc-state-badge" style={{ border: "1px solid var(--c-status-ok)", color: "var(--c-status-ok)" }}>
                  ✓ {t("ui.research.done")}
                </span>
              ) : (
                <button
                  type="button"
                  className={`mc-btn mc-btn-sm ${affordable && !entry.launch ? "mc-btn-selected" : ""}`}
                  disabled={!affordable || !!entry.launch}
                  onClick={() => dispatch({ type: "research", nodeId: node.id })}
                >
                  {t("ui.research.buy", { cost: node.costPts })}
                </button>
              )}
              <span style={{ color: done ? "var(--c-text-dim)" : "var(--c-cream)" }}>{t(node.nameKey)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
