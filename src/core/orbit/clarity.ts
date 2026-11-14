import type { CauseEntry } from '../contracts';
import { orbitView, type OrbitState, type ToggleId } from './phase';

export type SystemReason = 'ready' | 'commandOff' | 'safeMode' | 'cold' | 'damage'
  | 'noWindow' | 'noData' | 'ended' | 'powerFailure';

export interface SystemPlan {
  commandOn: boolean;
  effectiveOn: boolean;
  reason: SystemReason;
  operationS: number;
  forcedBySafe: boolean;
}

// In this turn-based phase, operation means work scheduled in the upcoming orbit,
// not continuous activity between button presses.
export function orbitClarity(state: OrbitState) {
  const view = orbitView(state);
  const forecast = view.forecast;
  const plan = (id: ToggleId): SystemPlan => {
    const commandOn = state.toggles[id];
    const forcedBySafe = state.status === 'active' && id === 'heater' && state.toggles.safeMode;
    const operationS = id === 'camera' ? forecast.cost.cameraS
      : id === 'transmitter' ? forecast.cost.transmitterS
      : id === 'heater' ? forecast.cost.heaterS : state.toggles.safeMode ? forecast.cost.elapsedS : 0;
    let reason: SystemReason = 'ready';
    if (state.status !== 'active') reason = 'ended';
    else if (!commandOn && !forcedBySafe) reason = 'commandOff';
    else if ((id === 'camera' || id === 'transmitter') && state.toggles.safeMode) reason = 'safeMode';
    else if ((id === 'camera' && view.instrumentRateMbps <= 0)
      || (id === 'transmitter' && view.downlinkMbps <= 0)
      || (id === 'heater' && view.heaterFactor <= 0)) reason = 'damage';
    else if (id === 'camera' && state.coldStress >= 2) reason = 'cold';
    else if ((id === 'camera' && view.imagingS <= 0)
      || (id === 'transmitter' && view.passS <= 0)
      || (id === 'heater' && view.shadowS <= 0)) reason = 'noWindow';
    else if (operationS <= 0 && forecast.powerFailure) reason = 'powerFailure';
    else if (id === 'transmitter' && operationS <= 0) reason = 'noData';
    return { commandOn, effectiveOn: reason === 'ready', reason, operationS, forcedBySafe };
  };
  const systems: Record<ToggleId, SystemPlan> = {
    camera: plan('camera'), transmitter: plan('transmitter'), heater: plan('heater'), safeMode: plan('safeMode'),
  };
  const risks: string[] = [];
  if (state.status === 'active') {
    if (forecast.powerFailure) risks.push('clarity.risk.power');
    if (forecast.lostMb > 0) risks.push('clarity.risk.overflow');
    if (forecast.nextState.coldStress >= 2) risks.push('clarity.risk.cold');
    else if (forecast.nextState.coldStress > state.coldStress) risks.push('clarity.risk.cooling');
    if (forecast.storm) risks.push('ui.stormWarning');
    else if (view.stormInOrbits !== null && view.stormInOrbits <= 2) risks.push('ui.stormSoon');
    if (!view.orbitOk) risks.push('clarity.risk.orbit');
    if (!view.resolutionOk) risks.push('clarity.risk.resolution');
  }
  return { view, systems, risks };
}

export interface OrbitProblem {
  failure: CauseEntry;
  paths: CauseEntry[][];
}

// Follow each real causedBy edge separately: sibling causes are not a sequence.
export function orbitDebrief(state: OrbitState): OrbitProblem[] {
  const entries = [...state.input.log, ...state.log];
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const trace = (entry: CauseEntry, seen: string[]): CauseEntry[][] => {
    const parents = (entry.causedBy ?? []).flatMap(id => {
      const parent = byId.get(id);
      return parent && !seen.includes(id) ? [parent] : [];
    });
    if (parents.length === 0 || entry.kind === 'decision') return [[entry]];
    return parents.flatMap(parent => trace(parent, [...seen, parent.id]).map(path => [entry, ...path]));
  };
  return state.log.filter(entry => entry.kind === 'failure').map(failure => {
    const paths: CauseEntry[][] = [];
    for (const path of trace(failure, [failure.id])) {
      const index = paths.findIndex(existing => existing.at(-1)?.id === path.at(-1)?.id);
      // One representative path per decision/context; keep the intermediate cause.
      if (index < 0) paths.push(path);
      else if (path.length > (paths[index]?.length ?? 0)) paths[index] = path;
    }
    return { failure, paths };
  });
}
