// Власна розробка модуля: агенція замовляє камеру під свою місію замість готової з каталогу.
// Реалізований лише слот instrument; решта слотів додається тим самим способом (ваги й базові числа
// в data/industries.json, параметрична функція нижче).
//
// Чому спеціалізоване може бути краще за готове: апертуру можна обрати точно під вимогу, а не з трьох
// кроків каталогу, і серійна ціна нижча (без націнки). За це платиш розробкою (гроші й ходи), а
// головне ризиком браку у виробництві, як із дзеркалом Hubble. Брак видно лише після запуску,
// якщо не замовити перевірку.

import type { CauseEntry, Damage, InstrumentDef } from '../contracts';
import type { AgencyProfile } from '../design/agency';
import { capability, INDUSTRY_DATA } from '../design/industry';
import { rolls } from './seed';

export const REFERENCE_APERTURE_M = 0.1;
export const MIN_APERTURE_M = 0.1;
export const MAX_APERTURE_M = 0.5;

// Як параметри камери зростають з апертурою. Показники підігнані під каталог: cam-s 0,1 м, cam-m 0,2 м, cam-l 0,4 м.
export const SCALING = {
  mass: { base: 5, exponent: 1.95, specialized: 0.85 },
  dataRate: { base: 2, exponent: 1.95, specialized: 1.1 },
  power: { base: 10, exponent: 1.3, specialized: 0.9 },
  catalogCost: { base: 3, exponent: 1.5 },
  specializedCostFactor: 0.7,   // серійна ціна власної камери порівняно з каталожною кривою
  devCostExponent: 1.5,         // вартість розробки росте швидше за апертуру
  devTurnsExponent: 0.5,        // а тривалість повільніше
  inspectCostFraction: 0.2,     // перевірка коштує частку вартості розробки
  inspectExtraTurns: 1,
  inspectDefectFactor: 0.2,     // після перевірки шанс браку лишається п'ятою частиною
  complexityPerReference: 0.5,  // складність: +50% до шансу браку на кожні 0,1 м понад еталон
  severityMin: 0.25,
  severityRange: 0.45,
} as const;

const wavelengthM = 550e-9;
const ratio = (apertureM: number) => apertureM / REFERENCE_APERTURE_M;

export interface DevOrder {
  slot: 'instrument';
  apertureM: number;
  inspect: boolean;
}

export interface Defect {
  severity: number; // 0..1, частка втраченої якості
}

export interface DevProject extends DevOrder {
  id: string;
  agencyId: string;
  startTurn: number;
  readyTurn: number;
  developmentCostMUsd: number; // платиться з бюджету агенції
  defectChance: number;
  module: InstrumentDef;       // готовий модуль із номінальними параметрами
  defect: Defect | null;       // кинуто наперед від сіду, видно лише після запуску (або перевірки)
}

export function developmentCostMUsd(agency: AgencyProfile, order: DevOrder): number {
  const base = INDUSTRY_DATA.develop[order.slot]?.baseCostMUsd ?? 0;
  const c = capability(agency.industries, order.slot);
  const research = base * (1.6 - c) * ratio(order.apertureM) ** SCALING.devCostExponent * agency.devCostFactor;
  const total = research * (1 + (order.inspect ? SCALING.inspectCostFraction : 0));
  return Math.round(total * 100) / 100;
}

export function developmentTurns(agency: AgencyProfile, order: DevOrder): number {
  const base = INDUSTRY_DATA.develop[order.slot]?.baseTurns ?? 1;
  const c = capability(agency.industries, order.slot);
  const turns = Math.ceil(base * (1.5 - c) * agency.devSpeedFactor * ratio(order.apertureM) ** SCALING.devTurnsExponent);
  return Math.max(1, turns) + (order.inspect ? SCALING.inspectExtraTurns : 0);
}

export function defectChance(agency: AgencyProfile, order: DevOrder): number {
  const base = INDUSTRY_DATA.develop[order.slot]?.baseDefectChance ?? 0;
  const c = capability(agency.industries, order.slot);
  const complexity = 1 + SCALING.complexityPerReference * (ratio(order.apertureM) - 1);
  const chance = base * (1.3 - c) * complexity * (order.inspect ? SCALING.inspectDefectFactor : 1);
  return Math.min(0.9, Math.max(0, chance));
}

// Номінальна камера заданої апертури.
export function customInstrument(agencyId: string, apertureM: number): InstrumentDef {
  const r = ratio(apertureM);
  const s = SCALING;
  return {
    slot: 'instrument',
    id: `custom-instrument-${agencyId}`,
    nameKey: 'custom.instrument',
    apertureM,
    wavelengthM,
    massKg: round2(s.mass.base * r ** s.mass.exponent * s.mass.specialized),
    dataRateMbps: round2(s.dataRate.base * r ** s.dataRate.exponent * s.dataRate.specialized),
    powerW: round2(s.power.base * r ** s.power.exponent * s.power.specialized),
    costMUsd: round2(s.catalogCost.base * r ** s.catalogCost.exponent * s.specializedCostFactor),
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function checkOrder(order: DevOrder): void {
  if (!Number.isFinite(order.apertureM) || order.apertureM < MIN_APERTURE_M || order.apertureM > MAX_APERTURE_M) {
    throw new Error(`Апертура має бути від ${MIN_APERTURE_M} до ${MAX_APERTURE_M} м, а не ${order.apertureM}`);
  }
}

// Створює проєкт розробки. Брак кидається тут, від сіду сесії, агенції й параметрів замовлення, тож він не залежить
// від порядку дій інших агенцій і однаковий при повторі.
export function startDevelopment(agency: AgencyProfile, order: DevOrder, startTurn: number, seed: number): DevProject {
  checkOrder(order);
  const chance = defectChance(agency, order);
  const [hit, severityRoll] = rolls(seed, `${agency.id}|${order.slot}|${order.apertureM}|${order.inspect}`, 2) as [number, number];
  const defect = hit < chance ? { severity: round2(SCALING.severityMin + SCALING.severityRange * severityRoll) } : null;
  return {
    ...order,
    id: `${order.slot}-${agency.id}`,
    agencyId: agency.id,
    startTurn,
    readyTurn: startTurn + developmentTurns(agency, order),
    developmentCostMUsd: developmentCostMUsd(agency, order),
    defectChance: Math.round(chance * 1000) / 1000,
    module: customInstrument(agency.id, order.apertureM),
    defect,
  };
}

export const isReady = (project: DevProject, turn: number): boolean => turn >= project.readyTurn;

// Брак як пошкодження зі спільного типу: його читає й заглушка, і майбутні справжні частини.
export function defectDamage(project: DevProject): Damage[] {
  return project.defect ? [{ system: 'science', severity: project.defect.severity }] : [];
}

// Записи журналу: рішення про розробку і, якщо брак був, відмова з причиною.
export function developmentLog(project: DevProject): CauseEntry[] {
  const decision: CauseEntry = {
    id: `design:develop-${project.slot}`, phase: 'design', tS: 0, kind: 'decision', system: 'science',
    messageKey: 'design.developed',
    params: { apertureM: project.apertureM, costMUsd: project.developmentCostMUsd, turns: project.readyTurn - project.startTurn },
  };
  if (!project.defect) return [decision];
  const blurPercent = Math.round((1 / (1 - project.defect.severity) - 1) * 100);
  return [decision, {
    id: `design:defect-${project.slot}`, phase: 'design', tS: 0, kind: 'failure', system: 'science',
    messageKey: project.inspect ? 'design.defectInspected' : 'design.defect',
    params: { blurPercent, chancePercent: Math.round(project.defectChance * 100) },
    causedBy: [decision.id],
  }];
}
