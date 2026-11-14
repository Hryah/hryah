// Ринок у часі: кращі модулі з'являються не одразу, а потім дешевшають. Звичайні модулі, яких тут немає,
// доступні з першого ходу за базовою ціною. Тому слот ніколи не лишається порожнім.

import type { DesignInput } from '../contracts';

export interface MarketEntry {
  fromTurn: number;     // з якого ходу модуль доступний
  startFactor: number;  // множник ціни на цьому ході (≥ 1)
  settleTurn: number;   // з якого ходу ціна стає базовою
}
export type Market = Record<string, MarketEntry>;

const money = (x: number) => Math.round(x * 100) / 100;

// Множник ціни на ході turn; null, якщо модуль ще недоступний.
export function priceFactor(entry: MarketEntry, turn: number): number | null {
  if (turn < entry.fromTurn) return null;
  if (turn >= entry.settleTurn) return 1;
  const progress = (turn - entry.fromTurn) / (entry.settleTurn - entry.fromTurn);
  return entry.startFactor + (1 - entry.startFactor) * progress;
}

export function checkMarket(market: Market): void {
  for (const [id, e] of Object.entries(market)) {
    if (!(e.settleTurn > e.fromTurn)) throw new Error(`${id}: settleTurn має бути більшим за fromTurn`);
    if (!(e.startFactor >= 1)) throw new Error(`${id}: startFactor має бути не меншим за 1`);
  }
}

// Чиста: вхід не змінює.
export function applyMarket(input: DesignInput, market: Market, turn: number): DesignInput {
  const modules = input.catalog.modules.flatMap((m) => {
    const entry = market[m.id];
    if (!entry) return [m];
    const factor = priceFactor(entry, turn);
    return factor === null ? [] : [{ ...m, costMUsd: money(m.costMUsd * factor) }];
  });
  return { mission: input.mission, catalog: { modules } };
}
