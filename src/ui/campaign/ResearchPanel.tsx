import { RESEARCH, type AgencyEntry, type ConsortiumAction } from "../../core/consortium";
import { t } from "../text";

// Дерево досліджень активної агенції: вузли з data/research.json, ціна в очках. Дослідження не забирає дій ходу.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", accent: "#5ca8ff" };
const button = {
  padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 13,
} as const;

export function ResearchPanel({ entry, dispatch }: { entry: AgencyEntry; dispatch: (a: ConsortiumAction) => void }) {
  const account = entry.account;
  if (!account) return null;
  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 6 }} data-testid="research-panel">
      <strong>🧪 {t("ui.research.title", { pts: account.researchPts })}</strong>
      <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.research.hint")}</div>
      <div style={{ display: "grid", gap: 4 }}>
        {Object.values(RESEARCH).map((node) => {
          const done = account.unlocked.includes(node.id);
          const affordable = account.researchPts >= node.costPts;
          return (
            <div key={node.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
              {done ? (
                <span style={{ ...button, borderColor: C.ok, color: C.ok, cursor: "default" }}>✓ {t("ui.research.done")}</span>
              ) : (
                <button
                  style={{ ...button, opacity: affordable ? 1 : 0.5 }}
                  disabled={!affordable || !!entry.launch}
                  onClick={() => dispatch({ type: "research", nodeId: node.id })}
                >
                  {t("ui.research.buy", { cost: node.costPts })}
                </button>
              )}
              <span style={{ color: done ? C.dim : "inherit" }}>{t(node.nameKey)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
