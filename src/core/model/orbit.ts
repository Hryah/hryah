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

// Модель опору атмосфери є лише для Землі. Для інших тіл вона не відома, тож апарат вважаємо таким, що не гальмує.
export const EARTH_NAME = 'Earth';
export const NO_DRAG_LIFETIME_ORBITS = 1_000_000;

export function lifetimeOrbits(altKm: number, body: Pick<Body, 'name'> = { name: EARTH_NAME }): number {
  if (body.name !== EARTH_NAME) return NO_DRAG_LIFETIME_ORBITS;
  const above = Math.max(0, altKm - DECAY_FLOOR_KM) / DECAY_SCALE_KM;
  return Math.max(1, Math.round(above * above));
}
