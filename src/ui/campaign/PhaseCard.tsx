import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { resolveAssetUrl } from "../graphics";
import { load, save } from "../../storage";
import { t } from "../text";
import "./phase-card.css";

// Інформаційне вікно між фазами кампанії: що щойно сталося, що робити далі і навіщо так роблять справжні місії.
// Один шаблон на всі переходи: текст бере з ключів `ui.card.<id>.*`, підсумок (рядки «назва — значення») передає виклик.
// Місце під ілюстрацію 3:2. Готові файли вписуємо в ART (так немає 404 і стрибка висоти, поки ілюстрацій немає).

const C = { bg: "#0b0d17", panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", accent: "#5ca8ff", gold: "#ffd166", ok: "#3ddc84", bad: "#ff5c7a" };
// v2: скидає старе «не показувати», після якого частина команди не бачила вікон узагалі.
const KEY = "phaseCards.v2";

export type PhaseCardId = "window" | "launch" | "orbit" | "orbitCargo" | "report" | "lost";
// Ілюстрації, що вже лежать у public/: додай рядок, коли художники здадуть файл (наприклад, window: "assets/cards/window.png").
const ART: Partial<Record<PhaseCardId, string>> = {};
// Варіанти без власної ілюстрації беруть найближчу.
const ART_FALLBACK: Partial<Record<PhaseCardId, PhaseCardId>> = { orbitCargo: "orbit", lost: "report" };
const artFor = (id: PhaseCardId) => ART[id] ?? ART[ART_FALLBACK[id] ?? id];

export interface SummaryRow { label: string; value: string; tone?: "ok" | "bad" | "gold" }

// Чи показувати вікна взагалі (гравець може вимкнути, вибір зберігається). Значення тримаємо й у пам'яті:
// без localStorage (приватний режим, переповнення) вимкнення все одно діє до перезавантаження.
let enabled: boolean | null = null;
export function cardsEnabled(): boolean {
  if (enabled === null) enabled = load<unknown>(KEY) !== false;
  return enabled;
}
// Спільний стан для всіх компонентів: галочка у вікні й кнопка під панеллю кампанії бачать одне й те саме.
const listeners = new Set<() => void>();
export function setCardsEnabled(on: boolean) {
  enabled = on;
  save(KEY, on);
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useCardsEnabled = () => useSyncExternalStore(subscribe, cardsEnabled, cardsEnabled);

// Повернути вікна після «не показувати» (або вимкнути їх наперед).
// className — щоб кнопка взяла стиль екрана (наприклад, пульта); без нього — власний.
export function CardsToggle({ className }: { className?: string }) {
  const on = useCardsEnabled();
  return (
    <button
      type="button" aria-pressed={on} onClick={() => setCardsEnabled(!on)} className={className}
      style={className ? undefined : { justifySelf: "start", padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent", color: on ? C.accent : C.dim, cursor: "pointer", fontSize: 13 }}
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
  // Вікно як повідомлення від персонажа (директор місії): рядок відправника з портретом над заголовком.
  sender?: { name: string; role: string };
  onContinue: () => void;
}

// Портрет директора місії (1:1, PNG з прозорістю). Вписати шлях, коли художники здадуть файл; до того — монограма.
const DIRECTOR_PORTRAIT: string | null = null;

function SenderLine({ name, role }: { name: string; role: string }) {
  const [ok, setOk] = useState(true);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: C.bg, border: `1px solid ${C.line}` }}>
      {DIRECTOR_PORTRAIT && ok ? (
        <img src={resolveAssetUrl(DIRECTOR_PORTRAIT)} alt="" width={52} height={52} onError={() => setOk(false)} style={{ borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.gold}` }} />
      ) : (
        <div aria-hidden="true" style={{ width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center", background: "#2a2140", border: `2px solid ${C.gold}`, color: C.gold, fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
          MD
        </div>
      )}
      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <div style={{ color: C.gold, fontSize: 11, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase" }}>
          <span className="phase-card-blink" aria-hidden="true">●</span> {t("ui.card.incoming")}
        </div>
        <strong style={{ fontSize: 16 }}>{name}</strong>
        <span style={{ color: C.dim, fontSize: 13 }}>{role}</span>
      </div>
    </div>
  );
}

export function PhaseCard({ id, step, title, summary, extra, vars = {}, action, busy = false, sender, onContinue }: Props) {
  const art = artFor(id);
  const [artOk, setArtOk] = useState(true);
  const [hide, setHide] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { button.current?.focus(); }, []);
  // Поки вікно відкрите, сторінка під ним не прокручується (прокручується лише саме вікно, якщо не влазить).
  useEffect(() => {
    const html = document.documentElement;
    const before = { html: html.style.overflow, body: document.body.style.overflow };
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => { html.style.overflow = before.html; document.body.style.overflow = before.body; };
  }, []);
  const go = () => {
    if (busy) return;
    if (hide) setCardsEnabled(false);
    onContinue();
  };
  const tone = (r: SummaryRow) => (r.tone === "ok" ? C.ok : r.tone === "bad" ? C.bad : r.tone === "gold" ? C.gold : "inherit");
  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby={`card-${id}`} data-testid={`phase-card-${id}`}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } }}
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(5, 6, 12, 0.78)", display: "grid", placeItems: "center", padding: 16, overscrollBehavior: "contain" }}
    >
      <div style={{
        width: "min(1040px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto", overscrollBehavior: "contain",
        background: C.panel, color: "#e8eaf3",
        border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.6)", fontFamily: "system-ui, sans-serif",
      }}>
        {art && artOk && (
          <img
            src={resolveAssetUrl(art)} alt="" onError={() => setArtOk(false)}
            style={{ display: "block", width: "100%", aspectRatio: "3 / 2", maxHeight: "34vh", objectFit: "cover", borderRadius: "14px 14px 0 0" }}
          />
        )}
        <div style={{ padding: 24, display: "grid", gap: 16 }}>
          {sender && <SenderLine name={sender.name} role={sender.role} />}
          <div>
            {step && (
              <div style={{ color: C.accent, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
                {t("ui.card.step", { n: step.n, total: step.total })} · {t(`ui.card.${id}.kicker`)}
              </div>
            )}
            <h2 id={`card-${id}`} style={{ margin: "4px 0 0", fontSize: 22 }}>{title ?? t(`ui.card.${id}.title`, vars)}</h2>
          </div>

          {/* Широке вікно: ліворуч підсумок і брифінг, праворуч «що далі» й «навіщо». На вузькому екрані — одна колонка. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 20, alignItems: "start" }}>
          {(summary.length > 0 || extra) && <div style={{ display: "grid", gap: 14 }}>
          {summary.length > 0 && (
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 16px", background: C.bg, borderRadius: 10, padding: 12, fontSize: 14 }}>
              {summary.map((r, i) => (
                <div key={i} style={{ display: "contents" }}>
                  <dt style={{ color: C.dim }}>{r.label}</dt>
                  <dd style={{ margin: 0, textAlign: "right", fontWeight: 600, color: tone(r) }}>{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {extra}
          </div>}

          <div style={{ display: "grid", gap: 14 }}>
          <section>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{t("ui.card.next")}</div>
            <p style={{ margin: "4px 0 0", lineHeight: 1.5, fontSize: 16 }}>{t(`ui.card.${id}.next`, vars)}</p>
          </section>
          <section style={{ borderLeft: `3px solid ${C.accent}`, paddingLeft: 12 }}>
            <div style={{ color: C.accent, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{t("ui.card.why")}</div>
            <p style={{ margin: "4px 0 0", lineHeight: 1.45, color: "#c9cde0" }}>{t(`ui.card.${id}.why`, vars)}</p>
          </section>
          </div>
          </div>

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
