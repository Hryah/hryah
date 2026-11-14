// Агенція: стартові умови гравця (країна). Профіль нічого не додає в контракти, а лише перетворює
// місію й каталог на вхід для частини 1: різний бюджет, доступні носії, ціни модулів.
// Усі цифри в src/data/agencies.json умовні, їх треба збалансувати (перебір у sim.ts це покаже).

import type { Catalog, DesignInput, Mission, SlotId } from '../contracts';

export interface AgencyProfile {
  id: string;
  nameKey: string;
  descriptionKey: string;
  budgetFactor: number;                              // множник бюджету місії
  launcherCostFactor: number;                        // множник вартості кожного носія
  launcherIds?: string[];                            // які носії доступні; без поля доступні всі
  moduleCostFactor?: Partial<Record<SlotId, number>>; // множник вартості модулів за слотом
}

const money = (x: number) => Math.round(x * 100) / 100;

function checkFactor(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Множник ${name} має бути додатним числом, а не ${value}`);
}

// Чиста: вхід не змінює. Місія й каталог повертаються новими об'єктами.
export function applyAgency(input: DesignInput, agency: AgencyProfile): DesignInput {
  checkFactor('budgetFactor', agency.budgetFactor);
  checkFactor('launcherCostFactor', agency.launcherCostFactor);
  for (const [slot, factor] of Object.entries(agency.moduleCostFactor ?? {})) checkFactor(`moduleCostFactor.${slot}`, factor);

  const { mission, catalog } = input;
  const allowed = agency.launcherIds;
  const launchers = mission.launchers
    .filter((l) => !allowed || allowed.includes(l.id))
    .map((l) => ({ ...l, costMUsd: money(l.costMUsd * agency.launcherCostFactor) }));
  if (launchers.length === 0) throw new Error(`У агенції ${agency.id} немає жодного доступного носія`);

  const adjustedMission: Mission = { ...mission, budgetMUsd: money(mission.budgetMUsd * agency.budgetFactor), launchers };
  const adjustedCatalog: Catalog = {
    modules: catalog.modules.map((m) => {
      const factor = agency.moduleCostFactor?.[m.slot];
      return factor === undefined ? m : { ...m, costMUsd: money(m.costMUsd * factor) };
    }),
  };
  return { mission: adjustedMission, catalog: adjustedCatalog };
}
