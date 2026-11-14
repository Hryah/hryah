// Енергія й дані на орбіті. Чисті функції без стану: ними рахують і запаси в проєкті,
// і сама орбітальна фаза, тож прогноз та реальність збігаються.

import type { SpacecraftSpec } from '../contracts';

// Пошкодження з польоту мають бути від 0 до 1; усе поза межами тримаємо в них, щоб поганий вхід не давав від'ємну генерацію.
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export type PowerSpec = Pick<SpacecraftSpec, 'panelPowerW' | 'baseLoadW' | 'instrumentW' | 'transmitterW' | 'heaterW'>;

// Стан тумблерів. У безпечному режимі камера й передавач вимкнені, базове споживання вдвічі менше.
export interface Loads {
  camera: boolean;
  transmitter: boolean;
  heater: boolean;
  safeMode: boolean;
}

// Генерація мінус споживання, Вт. Додатне значення заряджає батарею, від'ємне розряджає.
// Обігрів споживає лише в тіні (на сонці його тумблер нічого не коштує): так само рахує орбітальна фаза.
// powerDamage від 0 до 1 зменшує генерацію панелей (пошкодження з польоту).
export function netPowerW(spec: PowerSpec, loads: Loads, sunlit: boolean, powerDamage = 0): number {
  const generation = sunlit ? spec.panelPowerW * (1 - clamp01(powerDamage)) : 0;
  const consumption = loads.safeMode
    ? spec.baseLoadW / 2 + (loads.heater && !sunlit ? spec.heaterW : 0)
    : spec.baseLoadW +
      (loads.camera ? spec.instrumentW : 0) +
      (loads.transmitter ? spec.transmitterW : 0) +
      (loads.heater && !sunlit ? spec.heaterW : 0);
  return generation - consumption;
}

// Новий заряд після dtS секунд за потужності netW, у межах від 0 до ємності.
export function stepCharge(chargeWh: number, capacityWh: number, netW: number, dtS: number): number {
  return Math.min(capacityWh, Math.max(0, chargeWh + (netW * dtS) / 3600));
}

// Скільки мегабіт передано за dtS секунд. active: передавач увімкнений і є вікно зв'язку.
// commsDamage від 0 до 1 зменшує швидкість. Не більше, ніж лежить у буфері.
export function downlinkMb(bufferMb: number, downlinkMbps: number, commsDamage: number, dtS: number, active: boolean): number {
  if (!active) return 0;
  return Math.min(bufferMb, downlinkMbps * (1 - clamp01(commsDamage)) * dtS);
}
