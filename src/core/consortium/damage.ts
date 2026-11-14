// Пошкодження зі спільного типу Damage застосовуються до апарата в одному місці.
// Так підміна заглушок справжніми частинами 2 і 3 не зачепить решту сесії: вони теж читають Damage з FlightResult.

import type { Damage, SpacecraftSpec } from '../contracts';

const MAX_SEVERITY = 0.9; // навіть найгірше пошкодження не вбиває систему повністю

export function applyDamage(spec: SpacecraftSpec, damage: Damage[]): SpacecraftSpec {
  let next = spec;
  for (const d of damage) {
    const keep = 1 - Math.min(MAX_SEVERITY, Math.max(0, d.severity));
    if (d.system === 'science') next = { ...next, resolutionM: next.resolutionM / keep, instrumentRateMbps: next.instrumentRateMbps * keep };
    else if (d.system === 'power') next = { ...next, panelPowerW: next.panelPowerW * keep };
    else if (d.system === 'comms') next = { ...next, downlinkMbps: next.downlinkMbps * keep };
  }
  return next;
}
