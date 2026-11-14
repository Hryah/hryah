// Агенція: стартові умови гравця (країна). Профіль нічого не додає в контракти, а лише перетворює
// місію й каталог на вхід для частини 1: різний бюджет, доступні носії, ціни модулів.
// Усі цифри в src/data/agencies.json умовні, їх треба збалансувати (перебір у sim.ts це покаже).

import type { Catalog, DesignInput, Mission } from '../contracts';
import { buyPriceFactor, checkLevels, type IndustryLevels } from './industry';

export interface AgencyProfile {
  id: string;
  nameKey: string;
  descriptionKey: string;
  budgetFactor: number;                              // множник бюджету місії
  launcherCostFactor: number;                        // множник вартості кожного носія
  launcherIds?: string[];                            // які носії доступні; без поля доступні всі
  industries: IndustryLevels;                        // рівні індустрій країни, 0..1: звідси ціни, розробка, брак
  devCostFactor: number;                             // множник вартості власної розробки (організація роботи)
  devSpeedFactor: number;                            // множник тривалості розробки (менше означає швидше)
  blockedModules?: string[];                         // модулі, яких країна не може купити (санкції)
}

const money = (x: number) => Math.round(x * 100) / 100;

function checkFactor(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Множник ${name} має бути додатним числом, а не ${value}`);
}

// Чиста: вхід не змінює. Місія й каталог повертаються новими об'єктами.
// Ціна готового модуля залежить від індустрії країни у відповідному слоті (імпорт дорожчий), а заблоковані
// санкціями модулі з каталогу зникають (їх можна лише розробити самому).
export function applyAgency(input: DesignInput, agency: AgencyProfile): DesignInput {
  checkFactor('budgetFactor', agency.budgetFactor);
  checkFactor('launcherCostFactor', agency.launcherCostFactor);
  checkFactor('devCostFactor', agency.devCostFactor);
  checkFactor('devSpeedFactor', agency.devSpeedFactor);
  checkLevels(agency.industries, agency.id);

  const { mission, catalog } = input;
  const allowed = agency.launcherIds;
  const launchers = mission.launchers
    .filter((l) => !allowed || allowed.includes(l.id))
    .map((l) => ({ ...l, costMUsd: money(l.costMUsd * agency.launcherCostFactor) }));
  if (launchers.length === 0) throw new Error(`У агенції ${agency.id} немає жодного доступного носія`);

  const adjustedMission: Mission = { ...mission, budgetMUsd: money(mission.budgetMUsd * agency.budgetFactor), launchers };
  const blocked = agency.blockedModules ?? [];
  const adjustedCatalog: Catalog = {
    modules: catalog.modules
      .filter((m) => !blocked.includes(m.id))
      .map((m) => ({ ...m, costMUsd: money(m.costMUsd * buyPriceFactor(agency.industries, m.slot)) })),
  };
  return { mission: adjustedMission, catalog: adjustedCatalog };
}
