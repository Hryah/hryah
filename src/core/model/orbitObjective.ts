import type { Mission, OrbitObjective } from '../contracts';

export function validateOrbitObjective(objective: OrbitObjective | undefined): void {
  if (objective === undefined) return;
  if (!objective || typeof objective !== 'object') throw new Error('Invalid orbit objective');
  switch (objective.type) {
    case 'imaging': return;
    case 'flyby': {
      const range = objective.imagingOrbits;
      if (!Array.isArray(range) || range.length !== 2 || !Number.isInteger(range[0])
        || !Number.isInteger(range[1]) || range[0] < 1 || range[0] > range[1]) {
        throw new Error('Invalid flyby imagingOrbits');
      }
      return;
    }
    case 'cargo':
      if (!Number.isFinite(objective.telemetryReportMb) || objective.telemetryReportMb <= 0
        || !Number.isFinite(objective.telemetryBonusMaxFraction)
        || objective.telemetryBonusMaxFraction < 0 || objective.telemetryBonusMaxFraction > 1) {
        throw new Error('Invalid cargo telemetry settings');
      }
      return;
    default: throw new Error('Unknown orbit objective');
  }
}

export function validateOrbitMission(mission: Pick<Mission, 'orbitObjective' | 'kind' | 'durationOrbits'>): void {
  const objective = mission.orbitObjective;
  validateOrbitObjective(objective);
  if (!objective) return;
  if (!Number.isInteger(mission.durationOrbits) || mission.durationOrbits <= 0) {
    throw new Error('Orbit objective requires a positive integer durationOrbits');
  }
  if (objective.type === 'cargo' ? mission.kind !== 'cargo'
    : mission.kind !== undefined && mission.kind !== 'imaging') {
    throw new Error('Orbit objective does not match mission kind');
  }
  if (objective.type === 'flyby' && objective.imagingOrbits[1] > mission.durationOrbits) {
    throw new Error('Flyby imagingOrbits exceed durationOrbits');
  }
}
