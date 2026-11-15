// Готовність технології (NASA TRL 1–9). Нове не дорожче, а менш перевірене: модуль із низьким TRL може відмовити
// після запуску. Досвід агенції підвищує TRL: кожен запуск, де модуль відпрацював, і наземні випробування (дія qualify).
// Відмова — детермінований кидок від сіду кімнати, агенції, вікна й модуля, тож однаковий онлайн і за одним екраном.

import type { CauseEntry, Damage, Design, SlotId, SystemId } from '../contracts';
import trlData from '../../data/trl.json';
import { SLOTS } from '../design';
import { rolls } from './seed';

interface TrlData {
  default: number;
  custom: number;
  fabPenalty: number;
  failurePerLevel: number;
  qualifyBaseMUsd: number;
  qualifyCostFraction: number;
  modules: Record<string, number>;
}
export const TRL = trlData as unknown as TrlData;

const SLOT_SYSTEM: Record<SlotId, SystemId> = {
  engine: 'propulsion', solar: 'power', battery: 'power', antenna: 'comms', instrument: 'science',
};

// Базовий TRL модуля без досвіду агенції.
export function baseTrl(moduleId: string, knownIds: Iterable<string> = Object.keys(TRL.modules)): number {
  if (moduleId.startsWith('custom-')) return TRL.custom;
  if (moduleId.startsWith('fab-')) {
    const rest = moduleId.slice(4);
    let base: string | undefined;
    for (const k of [...knownIds, ...Object.keys(TRL.modules)]) if (rest.startsWith(`${k}-`) && (!base || k.length > base.length)) base = k;
    return Math.max(1, (base ? TRL.modules[base] ?? TRL.default : TRL.default) - TRL.fabPenalty);
  }
  return TRL.modules[moduleId] ?? TRL.default;
}

export function trlOf(moduleId: string, gain: Record<string, number> = {}, knownIds?: Iterable<string>): number {
  return Math.min(9, baseTrl(moduleId, knownIds) + (gain[moduleId] ?? 0));
}

export function failureChance(trl: number): number {
  return Math.max(0, 9 - trl) * TRL.failurePerLevel;
}

// Які модулі відмовили після запуску. Тяжкість 0,3–0,6: апарат живий, але слабший.
export function rollTrlFailures(
  seed: number, agencyId: string, round: number, design: Design, gain: Record<string, number>, knownIds: string[],
): { damage: Damage[]; log: CauseEntry[] } {
  const damage: Damage[] = [];
  const log: CauseEntry[] = [];
  for (const slot of SLOTS) {
    const id = design.modules[slot];
    const trl = trlOf(id, gain, knownIds);
    const chance = failureChance(trl);
    if (chance <= 0) continue;
    const [hit, sev] = rolls(seed, `trl|${agencyId}|${round}|${id}`, 2) as [number, number];
    if (hit >= chance) continue;
    const system = SLOT_SYSTEM[slot];
    const severity = Math.round((0.3 + 0.3 * sev) * 100) / 100;
    damage.push({ system, severity });
    log.push({
      id: `design:trl-${slot}`, phase: 'design', tS: 0, kind: 'failure', system, messageKey: `trl.failure.${slot}`,
      params: { module: id, trl, chancePercent: Math.round(chance * 100), lossPercent: Math.round(severity * 100) },
      causedBy: [`design:${slot}`],
    });
  }
  return { damage, log };
}

export function qualifyCostMUsd(moduleCostMUsd: number): number {
  return Math.round((TRL.qualifyBaseMUsd + TRL.qualifyCostFraction * moduleCostMUsd) * 100) / 100;
}
