import { useMemo, useState } from "react";
import type { CauseEntry, Margin, SpacecraftSpec } from "../../core/contracts";
import { causeChains } from "../../core/debrief";
import { availableActions, newGame, phaseState, preview, step, type GameAction, type GameState } from "../../core/game";
import { summarize, sweepDesigns, type SweepSummary } from "../../core/sim";
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION } from "../../core/stubs";
import { SpacecraftViewport, type ViewportContext } from "../graphics";

// Дебаг-екран: грати в будь-яку частину без справжнього інтерфейсу.
// Працює з усім, що реалізує Phase і віддає debugActions. Логіки гри тут немає:
// екран лише показує стан і шле дії в core/game.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", bad: "#ff5c7a", accent: "#5ca8ff" };
const SERIES_COLORS = ["#5ca8ff", "#ffa23d", "#3ddc84", "#ff5c7a", "#c58cff", "#ffe066"];

const panel = { background: C.panel, borderRadius: 12, padding: 16 } as const;
const button = {
  padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 13,
} as const;

// Усі числові поля об'єкта як «шлях → значення». Вхідні дані частини (input) і масиви пропускаємо.
function numericLeaves(value: unknown, prefix: string, out: Record<string, number>, depth = 0): void {
  if (typeof value === "number") out[prefix] = value;
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "input") continue;
    numericLeaves(child, prefix ? `${prefix}.${key}` : key, out, depth + 1);
  }
}

function snapshot(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  numericLeaves(phaseState(state), "state", out);
  numericLeaves(preview(state), "result", out);
  return out;
}

function hasMargins(value: unknown): value is { margins: Margin[] } {
  return !!value && typeof value === "object" && Array.isArray((value as { margins?: unknown }).margins);
}

export function DebugScreen() {
  const [seed, setSeed] = useState(1);
  const [history, setHistory] = useState<GameState[]>(() => [newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 1)]);
  const [plotted, setPlotted] = useState<string[]>([]);
  const [sweep, setSweep] = useState<SweepSummary | null>(null);

  const state = history[history.length - 1]!;
  const actions = availableActions(state);
  const result = preview(state);
  const snapshots = useMemo(() => history.map(snapshot), [history]);
  const keys = Object.keys(snapshots[snapshots.length - 1] ?? {});

  const dispatch = (action: GameAction) => setHistory((h) => [...h, step(h[h.length - 1]!, action)]);
  const restart = (nextSeed: number) => {
    setSeed(nextSeed);
    setHistory([newGame(SAMPLE_MISSION, SAMPLE_CATALOG, nextSeed)]);
  };
  const undo = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  const togglePlot = (key: string) =>
    setPlotted((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  // Кнопки дій, згруповані за заголовком.
  const groups: Record<string, typeof actions> = {};
  for (const a of actions) (groups[a.group] ??= []).push(a);

  const activeSpec: SpacecraftSpec | undefined =
    state.phase === "design"
      ? (result as SpacecraftSpec | undefined)
      : state.phase === "debrief"
        ? state.record.spec
        : state.spec;

  const viewportCtx: ViewportContext = {
    phase: state.phase,
    mission: SAMPLE_MISSION,
    design: activeSpec?.design ?? SAMPLE_DESIGN,
    spec: activeSpec,
    flight:
      state.phase === "orbit"
        ? state.flightResult
        : state.phase === "debrief"
          ? state.record.flight
          : undefined,
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 1.2fr)", gap: 16 }}>
      <section style={panel}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 18 }}>Частина: {state.phase}</strong>
          <span style={{ color: C.dim }}>крок {history.length - 1}</span>
          <span style={{ flex: 1 }} />
          <button style={button} onClick={undo}>← Назад</button>
          <label style={{ color: C.dim, fontSize: 13 }}>
            сід{" "}
            <input
              type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))}
              style={{ width: 56, background: "transparent", color: "inherit", border: `1px solid ${C.line}`, borderRadius: 6, padding: 4 }}
            />
          </label>
          <button style={button} onClick={() => restart(seed)}>Нова гра</button>
        </div>

        {Object.entries(groups).map(([group, list]) => (
          <div key={group} style={{ marginBottom: 8 }}>
            <div style={{ color: C.dim, fontSize: 12, marginBottom: 4 }}>{group}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {list.map((a, i) => (
                <button key={i} style={button} onClick={() => dispatch(a.action)}>{a.label}</button>
              ))}
            </div>
          </div>
        ))}
        {state.phase === "debrief" && <Debrief log={state.record.log} success={state.record.outcome.success} />}

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: C.dim }}>Стан частини (JSON)</summary>
          <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 320 }}>{JSON.stringify(phaseState(state), null, 2)}</pre>
        </details>
      </section>

      <section style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <SpacecraftViewport context={viewportCtx} />
        <div style={panel}>
          <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>Результат частини, якби вона закінчилась зараз</div>
          {hasMargins(result) ? <Margins margins={result.margins} /> : null}
          <details open={!hasMargins(result)}>
            <summary style={{ cursor: "pointer", color: C.dim }}>JSON</summary>
            <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 240 }}>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>

        <div style={panel}>
          <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>Графік у часі (познач поля)</div>
          <Chart snapshots={snapshots} keys={plotted} />
          <div style={{ display: "flex", gap: "4px 12px", flexWrap: "wrap", fontSize: 12, marginTop: 8 }}>
            {keys.map((key) => (
              <label key={key} style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={plotted.includes(key)} onChange={() => togglePlot(key)} /> {key}
              </label>
            ))}
          </div>
        </div>

        <div style={panel}>
          <button style={button} onClick={() => setSweep(summarize(sweepDesigns(SAMPLE_MISSION, SAMPLE_CATALOG)))}>
            Перебрати всі проєкти
          </button>
          {sweep && <Sweep summary={sweep} />}
        </div>
      </section>
    </div>
  );
}

function Margins({ margins }: { margins: Margin[] }) {
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginBottom: 8 }}>
      <tbody>
        {margins.map((m) => (
          <tr key={m.id} style={{ color: m.ok ? C.ok : C.bad }}>
            <td style={{ padding: "2px 0" }}>{m.ok ? "✓" : "✗"} {m.id}</td>
            <td style={{ textAlign: "right" }}>маю {m.have.toFixed(1)}</td>
            <td style={{ textAlign: "right" }}>треба {m.need.toFixed(1)}</td>
            <td style={{ color: C.dim, paddingLeft: 8 }}>{m.unit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Кожна лінія нормована до власного діапазону, бо одиниці різні. Праворуч останнє значення.
function Chart({ snapshots, keys }: { snapshots: Record<string, number>[]; keys: string[] }) {
  const W = 480, H = 140, PAD = 6;
  if (keys.length === 0) return <div style={{ color: C.dim, fontSize: 13 }}>Нічого не вибрано.</div>;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "#0b0d17", borderRadius: 8 }}>
        {keys.map((key, i) => {
          const points = snapshots
            .map((s, x) => ({ x, y: s[key] }))
            .filter((p): p is { x: number; y: number } => p.y !== undefined);
          if (points.length === 0) return null;
          const ys = points.map((p) => p.y);
          const lo = Math.min(...ys), hi = Math.max(...ys);
          const sx = (x: number) => PAD + (x / Math.max(1, snapshots.length - 1)) * (W - 2 * PAD);
          const sy = (y: number) => (hi === lo ? H / 2 : H - PAD - ((y - lo) / (hi - lo)) * (H - 2 * PAD));
          return (
            <polyline
              key={key} fill="none" strokeWidth={2} stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              points={points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
            />
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
        {keys.map((key, i) => {
          const last = snapshots[snapshots.length - 1]?.[key];
          return (
            <span key={key} style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
              {key}: {last === undefined ? "—" : last.toFixed(1)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Debrief({ log, success }: { log: CauseEntry[]; success: boolean }) {
  const chains = causeChains(log);
  const describe = (e: CauseEntry) => `${e.messageKey} ${e.params ? JSON.stringify(e.params) : ""}`;
  return (
    <div style={{ marginTop: 8 }}>
      <strong style={{ color: success ? C.ok : C.bad }}>{success ? "Місія успішна" : "Місія провалена"}</strong>
      {chains.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>Відмов у журналі немає.</div>}
      {chains.map((chain) => (
        <div key={chain.failure.id} style={{ fontSize: 13, marginTop: 8 }}>
          <div style={{ color: C.bad }}>✗ [{chain.failure.phase}] {describe(chain.failure)}</div>
          {chain.causes.map((cause) => (
            <div key={cause.id} style={{ color: C.dim, paddingLeft: 16 }}>← [{cause.phase}] {describe(cause)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Sweep({ summary }: { summary: SweepSummary }) {
  const pct = (n: number) => `${((100 * n) / summary.total).toFixed(0)}%`;
  const moduleIds = SAMPLE_CATALOG.modules.map((m) => m.id);
  return (
    <div style={{ fontSize: 13, marginTop: 8 }}>
      <div>
        Проєктів: {summary.total} · можна запустити: {summary.launchable} ({pct(summary.launchable)}) · виграшних:{" "}
        {summary.wins} ({pct(summary.wins)})
      </div>
      <div style={{ color: C.dim, marginTop: 8 }}>Скільки виграшних проєктів містять модуль (0 = модуль зайвий):</div>
      <div style={{ display: "flex", gap: "2px 12px", flexWrap: "wrap" }}>
        {moduleIds.map((id) => {
          const n = summary.winsByModule[id] ?? 0;
          return <span key={id} style={{ color: n === 0 ? C.bad : "inherit" }}>{id}: {n}</span>;
        })}
      </div>
      <div style={{ color: C.dim, marginTop: 8 }}>Який запас найчастіше червоний:</div>
      <div style={{ display: "flex", gap: "2px 12px", flexWrap: "wrap" }}>
        {Object.entries(summary.failsByMargin).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
          <span key={id}>{id}: {pct(n)}</span>
        ))}
      </div>
      <div style={{ color: C.dim, marginTop: 8 }}>Найкращі:</div>
      {summary.top.map((row, i) => (
        <div key={i} style={{ fontFamily: "monospace", fontSize: 12 }}>
          {row.score} · {Object.values(row.design.modules).join(" ")} · {row.design.launcherId} ·{" "}
          {row.design.fuelKg}kg · {row.design.altKm}km · ${row.costMUsd}M
        </div>
      ))}
    </div>
  );
}
