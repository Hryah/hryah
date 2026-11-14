// Орбіта: період, тінь, час життя. Чисті функції без стану.

import type { Body, OrbitInfo } from '../contracts';
import { eclipseFraction, orbitalPeriodS } from '../physics';

export function orbitInfo(body: Body, altKm: number): OrbitInfo {
  return { altKm, periodS: orbitalPeriodS(body, altKm), eclipseFraction: eclipseFraction(body, altKm) };
}

// Скільки витків проживе апарат на цій висоті, перш ніж атмосфера його пригальмує.
// Умовна модель (квадратична від висоти над 150 км), її має перевірити той, хто веде фізику.
// Нижче 150 км апарат живе один виток. Росте швидко: на 400 км це 25 витків, на 500 км 49.
export const DECAY_FLOOR_KM = 150;
export const DECAY_SCALE_KM = 50;

export function lifetimeOrbits(altKm: number): number {
  const above = Math.max(0, altKm - DECAY_FLOOR_KM) / DECAY_SCALE_KM;
  return Math.max(1, Math.round(above * above));
}
