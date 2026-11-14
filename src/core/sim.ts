// sim.ts — гра без екрана: перебір усіх проєктів, щоб перевірити баланс.
// Відповідає на питання: чи місію можна пройти, і чи немає одного проєкту, який виграє завжди.

import type { Catalog, Design, MarginId, Mission, ModuleDef, SlotId } from './contracts';
import { stubDesign, stubFlight, stubOrbit } from './stubs';

export interface SweepRow {
  design: Design;
  failedMargins: MarginId[];
  launchable: boolean;   // вкладається в носій і бюджет (інакше до польоту не дійде)
  win: boolean;
  score: number;
  wetMassKg: number;
  costMUsd: number;
}

const SLOTS: SlotId[] = ['engine', 'solar', 'battery', 'antenna', 'instrument'];

function idsOf(catalog: Catalog, slot: SlotId): string[] {
  return catalog.modules.filter((m: ModuleDef) => m.slot === slot).map((m) => m.id);
}

// Усі комбінації модулів × носіїв × варіантів палива × варіантів висоти.
export function allDesigns(mission: Mission, catalog: Catalog, fuelOptionsKg: number[], altOptionsKm: number[]): Design[] {
  let partial: Record<string, string>[] = [{}];
  for (const slot of SLOTS) {
    partial = partial.flatMap((p) => idsOf(catalog, slot).map((id) => ({ ...p, [slot]: id })));
  }
  const designs: Design[] = [];
  for (const modules of partial) {
    for (const launcher of mission.launchers) {
      for (const fuelKg of fuelOptionsKg) {
        for (const altKm of altOptionsKm) {
          designs.push({ modules: modules as Record<SlotId, string>, fuelKg, altKm, launcherId: launcher.id });
        }
      }
    }
  }
  return designs;
}

// Один проєкт через усі три частини. Коли з'являться справжні частини з ботами,
// замінити тут заглушки на прогін через game.ts.
export function evaluateDesign(mission: Mission, catalog: Catalog, design: Design): SweepRow {
  const d = stubDesign({ mission, catalog }, design);
  const f = stubFlight({ mission, spec: d.result, log: d.log });
  const o = stubOrbit({ mission, spec: d.result, flight: f.result, log: [...d.log, ...f.log] });
  const failedMargins = d.result.margins.filter((m) => !m.ok).map((m) => m.id);
  const launchable = !failedMargins.includes('mass') && !failedMargins.includes('budget');
  return {
    design, failedMargins, launchable,
    win: launchable && o.result.success,
    score: launchable ? o.result.score : 0,
    wetMassKg: d.result.wetMassKg,
    costMUsd: d.result.costMUsd,
  };
}

export function sweepDesigns(
  mission: Mission, catalog: Catalog,
  fuelOptionsKg: number[] = [6, 12, 24],
  altOptionsKm: number[] = [mission.altRangeKm[0], (mission.altRangeKm[0] + mission.altRangeKm[1]) / 2, mission.altRangeKm[1]],
): SweepRow[] {
  return allDesigns(mission, catalog, fuelOptionsKg, altOptionsKm).map((design) => evaluateDesign(mission, catalog, design));
}

export interface SweepSummary {
  total: number;
  launchable: number;
  wins: number;
  // Скільки разів кожен модуль трапляється серед виграшних проєктів.
  // Модуль з нулем — зайвий; слот, де виграє лише один модуль, — без вибору.
  winsByModule: Record<string, number>;
  // Який запас найчастіше червоний: це головне «вузьке місце» місії.
  failsByMargin: Record<string, number>;
  top: SweepRow[];
}

export function summarize(rows: SweepRow[], topN = 10): SweepSummary {
  const winsByModule: Record<string, number> = {};
  const failsByMargin: Record<string, number> = {};
  for (const row of rows) {
    for (const id of row.failedMargins) failsByMargin[id] = (failsByMargin[id] ?? 0) + 1;
    if (!row.win) continue;
    for (const slot of SLOTS) {
      const id = row.design.modules[slot];
      winsByModule[id] = (winsByModule[id] ?? 0) + 1;
    }
  }
  const wins = rows.filter((r) => r.win);
  return {
    total: rows.length,
    launchable: rows.filter((r) => r.launchable).length,
    wins: wins.length,
    winsByModule,
    failsByMargin,
    top: [...wins].sort((a, b) => b.score - a.score || a.costMUsd - b.costMUsd).slice(0, topN),
  };
}
