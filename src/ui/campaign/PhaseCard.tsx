import { useEffect, useRef, useState, type ReactNode } from "react";
import { resolveAssetUrl } from "../graphics";
import { load, save } from "../../storage";
import { t } from "../text";

// Інформаційне вікно між фазами кампанії: що щойно сталося, що робити далі і навіщо так роблять справжні місії.
// Один шаблон на всі переходи: текст бере з ключів `ui.card.<id>.*`, підсумок (рядки «назва — значення») передає виклик.
// Місце під ілюстрацію 3:2. Готові файли вписуємо в ART (так немає 404 і стрибка висоти, поки ілюстрацій немає).

const C = { bg: "#0b0d17", panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", accent: "#5ca8ff", gold: "#ffd166", ok: "#3ddc84", bad: "#ff5c7a" };
const KEY = "phaseCards";

export type PhaseCardId = "window" | "launch" | "orbit" | "orbitCargo" | "report" | "lost";
// Ілюстрації, що вже лежать у public/: додай рядок, коли художники здадуть файл (наприклад, window: "assets/cards/window.png").
const ART: Partial<Record<PhaseCardId, string>> = {};
// Варіанти без власної ілюстрації беруть найближчу.
const ART_FALLBACK: Partial<Record<PhaseCardId, PhaseCardId>> = { orbitCargo: "orbit", lost: "report" };
const artFor = (id: PhaseCardId) => ART[id] ?? ART[ART_FALLBACK[id] ?? id];

export interface SummaryRow { label: string; value: string; tone?: "ok" | "bad" | "gold" }

// Чи показувати вікна взагалі (гравець може вимкнути, вибір зберігається).
export function cardsEnabled(): boolean {
  return load<unknown>(KEY) !== false;
}

// Повернути вікна після «не показувати» (або вимкнути їх наперед).
export function CardsToggle() {
  const [on, setOn] = useState(cardsEnabled);
  return (
    <button
      type="button" aria-pressed={on} onClick={() => { save(KEY, !on); setOn(!on); }}
      style={{ justifySelf: "start", padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent", color: on ? C.accent : C.dim, cursor: "pointer", fontSize: 13 }}
    >
      {t(on ? "ui.card.toggleOn" : "ui.card.toggleOff")}
    </button>
  );
}

interface Props {
  id: PhaseCardId;
  step?: { n: number; total: number };
  title?: string;           // замість `ui.card.<id>.title`, якщо потрібні параметри
  summary: SummaryRow[];
  extra?: ReactNode;        // наприклад, рядки брифінгу
  vars?: Record<string, string | number>;
  action?: string;          // підпис кнопки; за замовчуванням «Далі»
  busy?: boolean;
  onContinue: () => void;
}

export function PhaseCard({ id, step, title, summary, extra, vars = {}, action, busy = false, onContinue }: Props) {
  const art = artFor(id);
  const [artOk, setArtOk] = useState(true);
  const [hide, setHide] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { button.current?.focus(); }, []);
  const go = () => {
    if (busy) return;
    if (hide) save(KEY, false);
    onContinue();
  };
  const tone = (r: SummaryRow) => (r.tone === "ok" ? C.ok : r.tone === "bad" ? C.bad : r.tone === "gold" ? C.gold : "inherit");
  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby={`card-${id}`} data-testid={`phase-card-${id}`}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } }}
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(5, 6, 12, 0.78)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <div style={{
        width: "min(560px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: C.panel, color: "#e8eaf3",
        border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.6)", fontFamily: "system-ui, sans-serif",
      }}>
        {art && artOk && (
          <img
            src={resolveAssetUrl(art)} alt="" onError={() => setArtOk(false)}
            style={{ display: "block", width: "100%", aspectRatio: "3 / 2", objectFit: "cover", borderRadius: "14px 14px 0 0" }}
          />
        )}
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div>
            {step && (
              <div style={{ color: C.accent, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
                {t("ui.card.step", { n: step.n, total: step.total })} · {t(`ui.card.${id}.kicker`)}
              </div>
            )}
            <h2 id={`card-${id}`} style={{ margin: "4px 0 0", fontSize: 22 }}>{title ?? t(`ui.card.${id}.title`, vars)}</h2>
          </div>

          {summary.length > 0 && (
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 16px", background: C.bg, borderRadius: 10, padding: 12, fontSize: 14 }}>
              {summary.map((r) => (
                <div key={r.label} style={{ display: "contents" }}>
                  <dt style={{ color: C.dim }}>{r.label}</dt>
                  <dd style={{ margin: 0, textAlign: "right", fontWeight: 600, color: tone(r) }}>{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {extra}

          <section>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{t("ui.card.next")}</div>
            <p style={{ margin: "4px 0 0", lineHeight: 1.45 }}>{t(`ui.card.${id}.next`, vars)}</p>
          </section>
          <section style={{ borderLeft: `3px solid ${C.accent}`, paddingLeft: 12 }}>
            <div style={{ color: C.accent, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{t("ui.card.why")}</div>
            <p style={{ margin: "4px 0 0", lineHeight: 1.45, color: "#c9cde0" }}>{t(`ui.card.${id}.why`, vars)}</p>
          </section>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label style={{ color: C.dim, fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
              {t("ui.card.hide")}
            </label>
            <button
              ref={button} type="button" disabled={busy} onClick={go}
              style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accent, color: C.bg, fontWeight: 700, fontSize: 15, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
            >
              {action ?? t("ui.card.continue")} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
