// Нагорода консорціуму. Цінність внеску агенції = обсяг даних × якість знімка × бонус за ранній запуск.
// Пул росте від різноманітності (різні прилади й висоти), ділиться пропорційно внескам,
// а переможець, якщо значно кращий за решту, отримує бонус. Усі числа в TUNING умовні.

import type { Catalog, CargoKind, CauseEntry, Mission, MissionOutcome, SpacecraftSpec } from '../contracts';

export const TUNING = {
  qualityMin: 0.25,        // найгірша якість (знімок значно гірший за вимогу)
  qualityMax: 2,           // найкраща якість (знімок значно різкіший за вимогу)
  mbPerMUsd: 1000,         // скільки мегабіт даних коштує 1 млн $ гранту
  timeDecayPerTurn: 0.04,  // скільки цінності втрачає кожен ход очікування
  timeFloor: 0.5,          // нижче цього множник часу не падає
  altBandKm: 100,          // висоти в межах смуги вважаються однаковими
  diversityStep: 0.1,      // надбавка до пулу за кожен ще один різний апарат
  diversityMax: 0.3,       // стеля надбавки
  winnerRatio: 1.3,        // у скільки разів переможець має випередити друге місце
  winnerBonus: 1.25,       // множник виплати переможця
} as const;

export type Tuning = typeof TUNING;

export interface AgencyRun {
  agencyId: string;
  launchTurn: number;
  spec: SpacecraftSpec;
  outcome: MissionOutcome;
  log: CauseEntry[];   // журнал причин усіх частин: з нього розбір будує «чому так вийшло»
}

export interface Payout {
  agencyId: string;
  valueMUsd: number;   // внесок
  share: number;       // частка внеску 0..1
  payoutMUsd: number;  // виплата з урахуванням різноманітності й бонусу
  winner: boolean;
}

export interface Settlement {
  diversity: number;   // множник пулу ≥ 1
  poolMUsd: number;    // усього виплачено: сума виплат разом із бонусом переможця
  bonusMUsd: number;   // скільки з пулу становить бонус переможця
  payouts: Payout[];
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
// «+ 0» прибирає мінус-нуль, який JSON і тести вважають іншим числом.
const money = (x: number) => Math.round(x * 100) / 100 + 0;

// Різкість знімка проти вимоги науковців: удвічі різкіший дає ×2, удвічі гірший ×0.5.
export function qualityFactor(mission: Mission, spec: SpacecraftSpec, t: Tuning = TUNING): number {
  return clamp(mission.requiredResolutionM / spec.resolutionM, t.qualityMin, t.qualityMax);
}

export function timeFactor(launchTurn: number, t: Tuning = TUNING): number {
  return Math.max(t.timeFloor, 1 - t.timeDecayPerTurn * launchTurn);
}

export function cargoKindOf(catalog: Catalog | undefined, run: AgencyRun): CargoKind | undefined {
  const id = run.spec.design.modules.instrument;
  const m = catalog?.modules.find((x) => x.slot === 'instrument' && x.id === id);
  return m && m.slot === 'instrument' ? m.cargoKind : undefined;
}

// Цінність запуску. Зйомка: дані × якість × час. Вантаж: потреба станції в цьому типі контейнера × частка
// витків підходу, які апарат пережив, × час (порожній чи загублений рейс нічого не дає).
export function runValueMUsd(mission: Mission, run: AgencyRun, t: Tuning = TUNING, catalog?: Catalog): number {
  if (mission.kind === 'cargo') {
    const kind = cargoKindOf(catalog, run);
    const need = kind ? mission.stationNeeds?.[kind] ?? 0 : 0;
    const survived = clamp(run.outcome.survivedOrbits / Math.max(1, mission.durationOrbits), 0, 1);
    return money(need * survived * timeFactor(run.launchTurn, t));
  }
  const raw = (run.outcome.deliveredMb / t.mbPerMUsd) * qualityFactor(mission, run.spec, t) * timeFactor(run.launchTurn, t);
  return money(raw);
}

// Вантаж: кожен наступний контейнер того самого типу станції потрібен менше (три бочки води гірші за воду, їжу й запчастини).
export const CARGO_REPEAT_FACTOR = 0.5;

function runValues(mission: Mission, runs: AgencyRun[], t: Tuning, catalog?: Catalog): number[] {
  const values = runs.map((r) => runValueMUsd(mission, r, t, catalog));
  if (mission.kind !== 'cargo') return values;
  const order = runs.map((_, i) => i).sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0) || runs[a]!.launchTurn - runs[b]!.launchTurn);
  const seen = new Map<string, number>();
  const out = [...values];
  for (const i of order) {
    const kind = cargoKindOf(catalog, runs[i]!) ?? '';
    const k = seen.get(kind) ?? 0;
    out[i] = money((values[i] ?? 0) * CARGO_REPEAT_FACTOR ** k);
    seen.set(kind, k + 1);
  }
  return out;
}

// Скільки різних апаратів (прилад + смуга висоти) у консорціумі.
export function distinctDesigns(runs: AgencyRun[], t: Tuning = TUNING): number {
  const keys = runs.map((r) => `${r.spec.design.modules.instrument}@${Math.floor(r.spec.design.altKm / t.altBandKm)}`);
  return new Set(keys).size;
}

export function diversityMultiplier(runs: AgencyRun[], t: Tuning = TUNING): number {
  if (runs.length === 0) return 1;
  return 1 + Math.min(t.diversityMax, t.diversityStep * (distinctDesigns(runs, t) - 1));
}

export function settleRewards(mission: Mission, runs: AgencyRun[], t: Tuning = TUNING, catalog?: Catalog): Settlement {
  const values = runValues(mission, runs, t, catalog);
  const total = values.reduce((a, b) => a + b, 0);
  const diversity = diversityMultiplier(runs, t);
  const basePool = total * diversity;

  // Переможець є лише якщо запусків щонайменше два і перший значно випереджає другого.
  const ranked = [...values].sort((a, b) => b - a);
  const first = ranked[0] ?? 0;
  const second = ranked[1] ?? 0;
  const hasWinner = runs.length >= 2 && first > 0 && first >= t.winnerRatio * second;

  const raw = runs.map((run, i) => {
    const value = values[i] ?? 0;
    const share = total > 0 ? value / total : 0;
    const winner = hasWinner && value === first;
    return { run, value, share, winner, payout: basePool * share * (winner ? t.winnerBonus : 1) };
  });
  const paid = raw.reduce((sum, r) => sum + r.payout, 0);
  const payouts: Payout[] = raw.map((r) => ({
    agencyId: r.run.agencyId,
    valueMUsd: r.value,
    share: Math.round(r.share * 1000) / 1000,
    payoutMUsd: money(r.payout),
    winner: r.winner,
  }));
  return { diversity: money(diversity), poolMUsd: money(paid), bonusMUsd: money(Math.max(0, paid - basePool)), payouts };
}
