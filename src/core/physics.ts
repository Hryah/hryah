// physics.ts — чисті формули, спільні для всіх частин. Жодного стану.

import type { Body } from './contracts';

export const G0 = 9.80665; // м/с², стандартне прискорення (переводить Isp у швидкість витікання)

// Рівняння Ціолковського: Δv = Isp · g0 · ln(m_початкова / m_кінцева)
export function deltaVMs(ispS: number, dryMassKg: number, fuelKg: number): number {
  return ispS * G0 * Math.log((dryMassKg + fuelKg) / dryMassKg);
}

// Обернена задача: скільки палива лишиться після маневру на dvMs.
export function fuelLeftKg(ispS: number, dryMassKg: number, fuelKg: number, dvMs: number): number {
  const massAfter = (dryMassKg + fuelKg) / Math.exp(dvMs / (ispS * G0));
  return Math.max(0, massAfter - dryMassKg);
}

// Третій закон Кеплера для колової орбіти: T = 2π · sqrt(a³ / μ)
export function orbitalPeriodS(body: Body, altKm: number): number {
  const a = body.radiusKm + altKm;
  return 2 * Math.PI * Math.sqrt((a * a * a) / body.muKm3S2);
}

// Частка витка в тіні для колової орбіти, коли Сонце лежить у площині орбіти (найгірший випадок):
// тінь планети — циліндр радіуса R, тож супутник у тіні на дузі 2·asin(R / a).
export function eclipseFraction(body: Body, altKm: number): number {
  return Math.asin(body.radiusKm / (body.radiusKm + altKm)) / Math.PI;
}

// Дифракційна межа: найменша деталь на поверхні = 1.22 · λ · h / D
export function groundResolutionM(wavelengthM: number, altKm: number, apertureM: number): number {
  return (1.22 * wavelengthM * altKm * 1000) / apertureM;
}

// Детермінований рандом (mulberry32). Стан — одне число, яке лежить у стані гри,
// тому step лишається чистою: повертаємо і значення 0..1, і новий стан.
export function nextRandom(rngState: number): [value: number, nextState: number] {
  const s = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}
