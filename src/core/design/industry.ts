// Індустрії: єдине джерело того, що країна вміє. Рівень кожної індустрії (0..1) разом із вагами слота
// дає здібність країни в цьому слоті, а від здібності залежать ціна імпорту, вартість і тривалість
// власної розробки та ймовірність браку. Ваги й базові числа лежать у data/industries.json.

import type { SlotId } from '../contracts';
import industriesData from '../../data/industries.json';

export type Industry = 'metallurgy' | 'electronics' | 'software' | 'chemistry' | 'optics' | 'manufacturing';
export type IndustryLevels = Record<Industry, number>;
export type SlotWeights = Record<SlotId, Partial<Record<Industry, number>>>;

export interface IndustryData {
  industries: Industry[];
  slotWeights: SlotWeights;
  buy: { importMarkup: number; domesticDiscount: number };
  develop: Partial<Record<SlotId, { baseCostMUsd: number; baseTurns: number; baseDefectChance: number }>>;
}

export const INDUSTRY_DATA = industriesData as unknown as IndustryData;

// Перевірка даних: ваги кожного слота дають 1, рівні лежать у 0..1.
export function checkIndustryData(data: IndustryData = INDUSTRY_DATA): void {
  for (const [slot, weights] of Object.entries(data.slotWeights)) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-9) throw new Error(`Ваги слота ${slot} мають давати 1, а дають ${sum}`);
    for (const industry of Object.keys(weights)) {
      if (!data.industries.includes(industry as Industry)) throw new Error(`Слот ${slot}: невідома індустрія ${industry}`);
    }
  }
}

export function checkLevels(levels: IndustryLevels, who: string, data: IndustryData = INDUSTRY_DATA): void {
  for (const industry of data.industries) {
    const level = levels[industry];
    if (!Number.isFinite(level) || level < 0 || level > 1) throw new Error(`${who}: рівень ${industry} має бути від 0 до 1, а не ${level}`);
  }
}

// Здібність країни в слоті, 0..1.
export function capability(levels: IndustryLevels, slot: SlotId, data: IndustryData = INDUSTRY_DATA): number {
  let total = 0;
  for (const [industry, weight] of Object.entries(data.slotWeights[slot])) total += weight * levels[industry as Industry];
  return total;
}

// Множник ціни готового модуля. Країна з сильною індустрією купує дешевше (власний ринок),
// зі слабкою платить націнку за імпорт. При здібності 0,5 множник дорівнює 1.
export function buyPriceFactor(levels: IndustryLevels, slot: SlotId, data: IndustryData = INDUSTRY_DATA): number {
  const c = capability(levels, slot, data);
  return c >= 0.5
    ? 1 - data.buy.domesticDiscount * ((c - 0.5) / 0.5)
    : 1 + data.buy.importMarkup * ((0.5 - c) / 0.5);
}
