// Аналіз балансу консорціуму: що найкраще, чого може досягти агенція, якщо запуститься на ході turn.
// Для перевірки, чи очікування справді є рішенням, а не завжди вигідним чи завжди шкідливим.

import type { DesignInput } from '../contracts';
import type { AgencyProfile } from '../design/agency';
import { allDesigns } from '../sim';
import { stubDesign, stubFlight, stubOrbit } from '../stubs';
import type { Market } from './market';
import { runValueMUsd } from './reward';
import { inputFor } from './session';

export interface TurnBest {
  turn: number;
  valueMUsd: number;   // найкращий внесок серед усіх проєктів, які можна запустити
  costMUsd: number;    // вартість того проєкту
  netMUsd: number;     // внесок мінус вартість найкращого за цим показником проєкту
  netValueMUsd: number; // внесок того проєкту, що дає найкращий чистий результат
}

// Перебирає всі проєкти агенції на кожному ході. Дорого, тому варіанти палива й орбіти скромні.
export function bestByLaunchTurn(
  base: DesignInput, market: Market, agency: AgencyProfile, maxTurn: number,
  fuelOptionsKg = [6, 12, 24], altOptionsKm = [400, 600, 800],
): TurnBest[] {
  const rows: TurnBest[] = [];
  for (let turn = 0; turn <= maxTurn; turn++) {
    const input = inputFor(base, market, agency, turn);
    let bestValue = 0;
    let bestValueCost = 0;
    let bestNet = Number.NEGATIVE_INFINITY;
    let bestNetValue = 0;
    for (const design of allDesigns(input.mission, input.catalog, fuelOptionsKg, altOptionsKm)) {
      const d = stubDesign(input, design);
      if (d.result.margins.some((m) => !m.ok && (m.id === 'mass' || m.id === 'budget'))) continue; // запустити не можна
      const f = stubFlight({ mission: input.mission, spec: d.result, log: d.log });
      const o = stubOrbit({ mission: input.mission, spec: d.result, flight: f.result, log: [...d.log, ...f.log] });
      const value = runValueMUsd(input.mission, { agencyId: agency.id, launchTurn: turn, spec: d.result, outcome: o.result, log: [] });
      const net = value - d.result.costMUsd;
      if (value > bestValue) { bestValue = value; bestValueCost = d.result.costMUsd; }
      if (net > bestNet) { bestNet = net; bestNetValue = value; }
    }
    rows.push({
      turn,
      valueMUsd: bestValue,
      costMUsd: bestValueCost,
      netMUsd: Number.isFinite(bestNet) ? Math.round(bestNet * 100) / 100 : 0,
      netValueMUsd: bestNetValue,
    });
  }
  return rows;
}
