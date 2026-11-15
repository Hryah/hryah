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
import rules from '../../data/orbit-rules.json';
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

export interface OrbitProfile {
  cameraWindow: boolean;
  continuousPayload: boolean;
  reportLimitMb: number | null;
  expireAfterPass: boolean;
}

// Індекс витка починається з 1. Профіль не змінює тривалість жодного відрізка.
export function orbitProfile(mission: Pick<Mission, 'orbitObjective'>, orbitIndex: number): OrbitProfile {
  const objective = mission.orbitObjective;
  if (objective?.type === 'cargo') {
    return { cameraWindow: false, continuousPayload: true,
      reportLimitMb: objective.telemetryReportMb, expireAfterPass: true };
  }
  const cameraWindow = objective?.type !== 'flyby'
    || (orbitIndex >= objective.imagingOrbits[0] && orbitIndex <= objective.imagingOrbits[1]);
  return { cameraWindow, continuousPayload: false, reportLimitMb: null, expireAfterPass: false };
}

// Швидкість уже враховує доступність/пошкодження приладу. Звіт не залежить від команди камери.
export function orbitGeneratedMb(profile: OrbitProfile, rateMbps: number, elapsedS: number, cameraOn: boolean): number {
  if (rateMbps <= 0 || elapsedS <= 0) return 0;
  if (profile.reportLimitMb !== null) return Math.min(profile.reportLimitMb, rateMbps * elapsedS);
  return cameraOn && profile.cameraWindow ? rateMbps * elapsedS : 0;
}

// Тривалість відрізків. Зйомка й зв'язок стискаються до наявного сонця.
export function orbitTiming(orbit: OrbitInfo, mission: Pick<Mission, 'imagingSPerOrbit' | 'passSPerOrbit'>): OrbitTiming {
  const shadowS = orbit.periodS * Math.min(1, Math.max(0, orbit.eclipseFraction));
  const sunlightS = orbit.periodS - shadowS;
  const imagingS = Math.min(Math.max(0, mission.imagingSPerOrbit), sunlightS);
  const passS = Math.min(Math.max(0, mission.passSPerOrbit), sunlightS - imagingS);
  return { shadowS, sunlightS, imagingS, passS, idleSunS: sunlightS - imagingS - passS };
}

// Споживання відрізка, Вт.
export function segmentLoadW(
  spec: Pick<EnergySpec, 'baseLoadW' | 'instrumentW' | 'transmitterW' | 'heaterW'>,
  kind: SegmentKind, on: ActiveSystems, profile?: OrbitProfile,
): number {
  const baseW = spec.baseLoadW + (profile?.continuousPayload ? spec.instrumentW : 0);
  switch (kind) {
    case 'imaging': return baseW + (on.camera && !profile?.continuousPayload && (profile?.cameraWindow ?? true) ? spec.instrumentW : 0);
    case 'transmit': return baseW + (on.transmitter ? spec.transmitterW : 0);
    case 'shadow': return baseW + (on.heater ? spec.heaterW : 0);
    default: return baseW;
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
  spec: EnergySpec, orbit: OrbitInfo,
  mission: Pick<Mission, 'imagingSPerOrbit' | 'passSPerOrbit' | 'durationOrbits' | 'orbitObjective'>,
  on: ActiveSystems = { camera: true, transmitter: true, heater: true },
): number {
  const t = orbitTiming(orbit, mission);
  let cumWh = 0;
  let peakWh = 0;
  let worstWh = 0;
  let bufferMb = 0;
  let coldStress = 0;

  const run = (durationS: number, generationW: number, loadW: number) => {
    cumWh += ((generationW - loadW) * durationS) / 3600;
    peakWh = Math.max(peakWh, cumWh);
    worstWh = Math.max(worstWh, peakWh - cumWh);
  };

  for (let i = 0; i < Math.max(0, mission.durationOrbits); i++) {
    const profile = orbitProfile(mission, i + 1);
    const available = !mission.orbitObjective || coldStress < rules.cold.lockStress;
    const active = mission.orbitObjective
      ? { ...on, camera: on.camera && available && spec.instrumentRateMbps > 0 && profile.cameraWindow }
      : on;
    run(t.idleSunS, spec.panelPowerW, segmentLoadW(spec, 'sunIdle', active, profile));
    run(t.imagingS, spec.panelPowerW, segmentLoadW(spec, 'imaging', active, profile));
    const producedMb = orbitGeneratedMb(profile, available ? spec.instrumentRateMbps : 0, t.imagingS, active.camera);
    bufferMb = Math.min(spec.bufferMb, bufferMb + producedMb);
    const transmitS = transmitSeconds(t.passS, bufferMb, spec.downlinkMbps, active.transmitter);
    bufferMb -= downlinkMb(bufferMb, spec.downlinkMbps, 0, transmitS, true);
    run(transmitS, spec.panelPowerW, segmentLoadW(spec, 'transmit', active, profile));
    run(t.passS - transmitS, spec.panelPowerW, segmentLoadW(spec, 'passRest', active, profile));
    if (profile.expireAfterPass) bufferMb = 0;
    run(t.shadowS, 0, segmentLoadW(spec, 'shadow', active, profile));
    if (mission.orbitObjective && t.shadowS > 0) {
      coldStress = Math.min(rules.cold.maximumStress,
        Math.max(0, coldStress + (active.heater ? -1 : rules.cold.unheatedGain)));
    }
  }
  return worstWh;
}
