// Паливо й висота після маневру. Чисті функції без стану.

import type { Mission, SpacecraftSpec } from '../contracts';
import { fuelLeftKg } from '../physics';

// Скільки палива спалює маневр на dvMs. Не більше, ніж є в баках.
export function burnFuelKg(ispS: number, dryMassKg: number, fuelKg: number, dvMs: number): number {
  return fuelKg - fuelLeftKg(ispS, dryMassKg, fuelKg, dvMs);
}

// На яку висоту вистачило палива. Коли Δv достатньо, апарат виходить на задану висоту.
// Коли ні, виходить нижче пропорційно до нестачі Δv (груба, але монотонна модель).
export function reachedAltKm(mission: Mission, spec: Pick<SpacecraftSpec, 'dvMs' | 'design'>): number {
  if (spec.dvMs >= mission.dvRequiredMs) return spec.design.altKm;
  const floorKm = mission.altRangeKm[0] * 0.5;
  return floorKm + (spec.design.altKm - floorKm) * (spec.dvMs / mission.dvRequiredMs);
}
