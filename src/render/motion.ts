// motion.ts — чисті функції руху. Сцена нічого не «телепортує»: кожне значення
// щокадру наближається до цілі, тож картинка плавна за будь-якої частоти кадрів.

const TAU = Math.PI * 2;

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * Плавне наближення до цілі. `rate` — швидкість у 1/с: за 1/rate секунд лишається ~37% відстані.
 * Не залежить від частоти кадрів: два кроки по dt/2 дають те саме, що один по dt.
 */
export function approach(current: number, target: number, rate: number, dtS: number): number {
  if (!(dtS > 0) || !(rate > 0)) return current;
  return target + (current - target) * Math.exp(-rate * dtS);
}

/** Кут у межах [0, 2π). */
export const wrapAngle = (rad: number): number => ((rad % TAU) + TAU) % TAU;

/** Найкоротша різниця кутів b − a в межах (−π, π]. */
export function angleDelta(a: number, b: number): number {
  const d = wrapAngle(b - a);
  return d > Math.PI ? d - TAU : d;
}

/** Як approach, але для кутів: іде найкоротшою дугою. */
export const approachAngle = (current: number, target: number, rate: number, dtS: number): number =>
  wrapAngle(approach(current, current + angleDelta(current, target), rate, dtS));

/** Пульсація 0..1 з періодом periodS (синус, у нулі часу дорівнює 0.5). */
export const pulse = (timeS: number, periodS: number, phase = 0): number =>
  periodS > 0 ? 0.5 + 0.5 * Math.sin((timeS / periodS) * TAU + phase) : 0;

/** Кут рівномірного руху по колу: один оберт за periodS. */
export const orbitAngle = (timeS: number, periodS: number, startRad = 0): number =>
  periodS > 0 ? wrapAngle(startRad + (timeS / periodS) * TAU) : wrapAngle(startRad);

/** Точка на колі в площині XZ (вісь Y угору). Кут 0 — напрям +X, росте проти годинникової, якщо дивитись згори. */
export const onCircle = (angleRad: number, radius: number): { x: number; z: number } =>
  ({ x: Math.cos(angleRad) * radius, z: -Math.sin(angleRad) * radius });

/** Чи лежить кут у дузі з центром centerRad і повною шириною widthRad. */
export const inArc = (angleRad: number, centerRad: number, widthRad: number): boolean =>
  Math.abs(angleDelta(centerRad, angleRad)) <= widthRad / 2;
