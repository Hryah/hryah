// Нагорода консорціуму. Цінність внеску агенції = обсяг даних × якість знімка × бонус за ранній запуск.
// Пул росте від різноманітності (різні прилади й висоти), ділиться пропорційно внескам,
// а переможець, якщо значно кращий за решту, отримує бонус. Усі числа в TUNING умовні.

import type { Mission, MissionOutcome, SpacecraftSpec } from '../contracts';

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
const money = (x: number) => Math.round(x * 100) / 100;

// Різкість знімка проти вимоги науковців: удвічі різкіший дає ×2, удвічі гірший ×0.5.
export function qualityFactor(mission: Mission, spec: SpacecraftSpec, t: Tuning = TUNING): number {
  return clamp(mission.requiredResolutionM / spec.resolutionM, t.qualityMin, t.qualityMax);
}

export function timeFactor(launchTurn: number, t: Tuning = TUNING): number {
  return Math.max(t.timeFloor, 1 - t.timeDecayPerTurn * launchTurn);
}

export function runValueMUsd(mission: Mission, run: AgencyRun, t: Tuning = TUNING): number {
  const raw = (run.outcome.deliveredMb / t.mbPerMUsd) * qualityFactor(mission, run.spec, t) * timeFactor(run.launchTurn, t);
  return money(raw);
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

export function settleRewards(mission: Mission, runs: AgencyRun[], t: Tuning = TUNING): Settlement {
  const values = runs.map((r) => runValueMUsd(mission, r, t));
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
  return { diversity: money(diversity), poolMUsd: money(paid), bonusMUsd: money(paid - basePool), payouts };
}
