// views.ts — чисті функції «стан ядра → вид»: що саме треба показати, без Three.js.
// Сцена нічого не вирішує, вона лише наближає картинку до виду. Тут немає ігрової логіки:
// усе береться з ядра готовим.
import { orbitView, type OrbitState } from '../core/orbit';

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

export interface OrbitView {
  /** Частка витка в тіні планети, 0..1. */
  eclipseFraction: number;
  /** Частка витка над наземною станцією, 0..1. */
  passFraction: number;
  /** Заряд батареї, 0..1. */
  chargeFraction: number;
  /** Передавач справді працює: під час прольоту видно промінь до станції. */
  linkActive: boolean;
  /** Камера справді знімає. */
  cameraActive: boolean;
  safeMode: boolean;
  /** Сонячна буря на поточному витку. */
  storm: boolean;
  status: 'active' | 'complete' | 'failed';
}

export function orbitSceneView(state: OrbitState): OrbitView {
  const view = orbitView(state);
  const periodS = state.input.flight.orbit.periodS;
  return {
    eclipseFraction: periodS > 0 ? clamp01(view.shadowS / periodS) : 0,
    passFraction: periodS > 0 ? clamp01(view.passS / periodS) : 0,
    chargeFraction: clamp01(view.chargePercent / 100),
    linkActive: view.activeSystems.transmitter,
    cameraActive: view.activeSystems.camera,
    safeMode: view.activeSystems.safeMode,
    storm: view.stormNext,
    status: state.status,
  };
}
