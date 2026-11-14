// Енергобаланс витка: тривалість відрізків, навантаження в кожному й потреба батареї.
// Це єдине місце, де записано, що відбувається протягом витка. Його читають і частина 1 (запас energy),
// і орбітальна фаза, тож прогноз і реальність збігаються за побудовою.
//
// Виток складається з п'яти відрізків у такому порядку:
//   sunIdle   сонце, нічого не робимо: лише база
//   imaging   вікно зйомки (завжди на сонці): база і, якщо камера ввімкнена, прилад
//   transmit  передача (на сонці): база і передавач, поки буфер не спорожніє або вікно не скінчиться
//   passRest  решта вікна зв'язку: лише база
//   shadow    тінь: генерації нема, база і, якщо обігрів ввімкнений, обігрів
// Обігрів споживає лише в тіні: на сонці його тумблер нічого не коштує.

import type { Mission, OrbitInfo, SpacecraftSpec } from '../contracts';
import { downlinkMb } from './power';

export type SegmentKind = 'sunIdle' | 'imaging' | 'transmit' | 'passRest' | 'shadow';

export interface ActiveSystems {
  camera: boolean;
  transmitter: boolean;
  heater: boolean;
}

export type EnergySpec = Pick<SpacecraftSpec,
  'panelPowerW' | 'baseLoadW' | 'instrumentW' | 'transmitterW' | 'heaterW' | 'instrumentRateMbps' | 'downlinkMbps' | 'bufferMb'>;

export interface OrbitTiming {
  shadowS: number;
  sunlightS: number;
  imagingS: number;
  passS: number;
  idleSunS: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Тривалість відрізків. Зйомка й зв'язок стискаються до наявного сонця.
export function orbitTiming(orbit: OrbitInfo, mission: Pick<Mission, 'imagingSPerOrbit' | 'passSPerOrbit'>): OrbitTiming {
  const shadowS = orbit.periodS * clamp(orbit.eclipseFraction, 0, 1);
  const sunlightS = orbit.periodS - shadowS;
  const imagingS = Math.min(Math.max(0, mission.imagingSPerOrbit), sunlightS);
  const passS = Math.min(Math.max(0, mission.passSPerOrbit), sunlightS - imagingS);
  return { shadowS, sunlightS, imagingS, passS, idleSunS: sunlightS - imagingS - passS };
}

// Споживання відрізка, Вт.
export function segmentLoadW(spec: Pick<EnergySpec, 'baseLoadW' | 'instrumentW' | 'transmitterW' | 'heaterW'>, kind: SegmentKind, on: ActiveSystems): number {
  switch (kind) {
    case 'imaging': return spec.baseLoadW + (on.camera ? spec.instrumentW : 0);
    case 'transmit': return spec.baseLoadW + spec.transmitterW;
    case 'shadow': return spec.baseLoadW + (on.heater ? spec.heaterW : 0);
    default: return spec.baseLoadW;
  }
}

// Скільки секунд триває передача: поки вистачає вікна й даних у буфері.
export function transmitSeconds(passS: number, bufferMb: number, linkMbps: number, transmitterOn: boolean): number {
  return transmitterOn && linkMbps > 0 ? Math.min(passS, bufferMb / linkMbps) : 0;
}

// Скільки Вт·год батарея має вміти віддати за місію: найбільша просадка заряду від досягнутого піку.
// Апарат стартує з повною батареєю, тож це і є потрібна ємність. Тумблери за замовчуванням: усе ввімкнено.
// Бурі й пошкодження сюди не входять: це випадкові події, їх накладає орбітальна фаза.
export function orbitEnergyNeedWh(
  spec: EnergySpec, orbit: OrbitInfo, mission: Pick<Mission, 'imagingSPerOrbit' | 'passSPerOrbit' | 'durationOrbits'>,
  on: ActiveSystems = { camera: true, transmitter: true, heater: true },
): number {
  const t = orbitTiming(orbit, mission);
  let cumWh = 0;
  let peakWh = 0;
  let worstWh = 0;
  let bufferMb = 0;

  const run = (durationS: number, generationW: number, loadW: number) => {
    cumWh += ((generationW - loadW) * durationS) / 3600;
    peakWh = Math.max(peakWh, cumWh);
    worstWh = Math.max(worstWh, peakWh - cumWh);
  };

  for (let i = 0; i < Math.max(1, mission.durationOrbits); i++) {
    run(t.idleSunS, spec.panelPowerW, segmentLoadW(spec, 'sunIdle', on));
    run(t.imagingS, spec.panelPowerW, segmentLoadW(spec, 'imaging', on));
    if (on.camera) bufferMb = Math.min(spec.bufferMb, bufferMb + spec.instrumentRateMbps * t.imagingS);
    const transmitS = transmitSeconds(t.passS, bufferMb, spec.downlinkMbps, on.transmitter);
    bufferMb -= downlinkMb(bufferMb, spec.downlinkMbps, 0, transmitS, true);
    run(transmitS, spec.panelPowerW, segmentLoadW(spec, 'transmit', on));
    run(t.passS - transmitS, spec.panelPowerW, segmentLoadW(spec, 'passRest', on));
    run(t.shadowS, 0, segmentLoadW(spec, 'shadow', on));
  }
  return worstWh;
}
