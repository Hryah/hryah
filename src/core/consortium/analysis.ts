// Аналіз балансу консорціуму: що найкраще, чого може досягти агенція, якщо запуститься на ході turn.
// Для перевірки, чи очікування справді є рішенням, а не завжди вигідним чи завжди шкідливим.

import type { DesignInput } from '../contracts';
import type { AgencyProfile } from '../design/agency';
import { allDesigns } from '../sim';
import { stubDesign, stubFlight, stubOrbit } from '../stubs';
import type { Market } from './market';
import { runValueMUsd } from './reward';
import { applyDamage } from './damage';
import { defectDamage, SCALING, startDevelopment, type DevProject } from './develop';
import { inputFor } from './session';

export interface TurnBest {
  turn: number;
  valueMUsd: number;   // найкращий внесок серед усіх проєктів, які можна запустити
  costMUsd: number;    // вартість того проєкту
  netMUsd: number;     // внесок мінус вартість найкращого за цим показником проєкту
  netValueMUsd: number; // внесок того проєкту, що дає найкращий чистий результат
}

// Перебирає всі проєкти агенції на кожному ході. Дорого, тому варіанти палива й орбіти скромні.
// Окрім готових модулів, агенція може з ходу 0 замовити власну камеру однієї з апертур devApertures;
// вона стає доступною, коли розробка готова, а її гроші списані з бюджету. Брак враховується очікуванням:
// внесок = (1 − шанс браку) · без браку + шанс · з браком.
export function bestByLaunchTurn(
  base: DesignInput, market: Market, agency: AgencyProfile, maxTurn: number,
  fuelOptionsKg = [6, 12, 24], altOptionsKm = [400, 600, 800], devApertures: number[] = [0.2, 0.35],
): TurnBest[] {
  const plans: (DevProject | null)[] = [null, ...devApertures.map((apertureM) =>
    startDevelopment(agency, { slot: 'instrument', apertureM, inspect: false }, 0, 1))];
  const rows: TurnBest[] = [];
  for (let turn = 0; turn <= maxTurn; turn++) {
    let bestValue = 0;
    let bestValueCost = 0;
    let bestNet = Number.NEGATIVE_INFINITY;
    let bestNetValue = 0;
    for (const plan of plans) {
      const input = inputFor(base, market, agency, turn, plan ? [plan] : []);
      const valueOf = (spec: ReturnType<typeof stubDesign>['result'], log: ReturnType<typeof stubDesign>['log']) => {
        const f = stubFlight({ mission: input.mission, spec, log });
        const o = stubOrbit({ mission: input.mission, spec, flight: f.result, log: [...log, ...f.log] });
        return runValueMUsd(input.mission, { agencyId: agency.id, launchTurn: turn, spec, outcome: o.result, log: [] });
      };
      for (const design of allDesigns(input.mission, input.catalog, fuelOptionsKg, altOptionsKm)) {
        const d = stubDesign(input, design);
        if (d.result.margins.some((m) => !m.ok && (m.id === 'mass' || m.id === 'budget'))) continue; // запустити не можна
        let value = valueOf(d.result, d.log);
        if (plan && design.modules.instrument === plan.module.id) {
          const damaged = valueOf(applyDamage(d.result, defectDamageOf(plan)), d.log);
          value = (1 - plan.defectChance) * value + plan.defectChance * damaged;
        }
        const net = value - d.result.costMUsd - (plan ? plan.developmentCostMUsd : 0);
        if (value > bestValue) { bestValue = value; bestValueCost = d.result.costMUsd; }
        if (net > bestNet) { bestNet = net; bestNetValue = value; }
      }
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

// Очікуваний брак не залежить від кидка: для аналізу береться «брак є» з типовою тяжкістю.
function defectDamageOf(plan: DevProject) {
  return defectDamage({ ...plan, defect: plan.defect ?? { severity: SCALING.severityMin + SCALING.severityRange / 2 } });
}
