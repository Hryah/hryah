import type { ConsoleKind } from '../generator/build-ship-and-consoles';

export type CrewGravityMode = 'mag-boots' | 'zero-g';

export type CrewPhaseStage =
  | 'idle'
  | 'turn'
  | 'push_off'
  | 'moving'
  | 'grab_handle'
  | 'working'
  | 'switching'
  | 'reaction';

export interface CrewChoreographyState {
  gravityMode: CrewGravityMode;
  stage: CrewPhaseStage;
  currentX: number;
  targetX: number;
  facingYawRad: number;
  activeConsole: ConsoleKind;
  targetConsole: ConsoleKind;
  activeClip: string;
  consoleClip: string;
  shipClip: string | null;
  stageElapsedS: number;
  lastOutcome: 'success' | 'error';
  hatchOpen: boolean;
  dockingStatus: 'standby' | 'approaching' | 'aligned' | 'latched' | 'docked' | 'aborted';
  satelliteSeparated: boolean;
  shipSolarAngleDeg: number;
  shipHeaterOn: boolean;
  shipOxygenPercent: number;
}

export const CONSOLE_ANCHOR_X: Record<ConsoleKind, number> = {
  power: -2.1,
  thermal: -1.05,
  oxygen: 0.0,
  docking: 1.05,
  separation: 2.1,
};

export function createInitialCrewState(): CrewChoreographyState {
  return {
    gravityMode: 'mag-boots',
    stage: 'idle',
    currentX: 0.0,
    targetX: 0.0,
    facingYawRad: Math.PI,
    activeConsole: 'oxygen',
    targetConsole: 'oxygen',
    activeClip: 'idle',
    consoleClip: 'idle',
    shipClip: null,
    stageElapsedS: 0,
    lastOutcome: 'success',
    hatchOpen: false,
    dockingStatus: 'standby',
    satelliteSeparated: false,
    shipSolarAngleDeg: 25,
    shipHeaterOn: true,
    shipOxygenPercent: 98,
  };
}

/**
 * Safely interrupts any current action and starts moving/working on the requested console task.
 */
export function commandCrewToConsole(
  state: CrewChoreographyState,
  targetConsole: ConsoleKind,
  outcome: 'success' | 'error' = 'success',
): CrewChoreographyState {
  const destX = CONSOLE_ANCHOR_X[targetConsole];
  const dist = Math.abs(destX - state.currentX);

  // If already at the target console anchor, transition straight to switching/working
  if (dist < 0.06) {
    return {
      ...state,
      targetConsole,
      activeConsole: targetConsole,
      targetX: destX,
      facingYawRad: Math.PI,
      stage: 'switching',
      stageElapsedS: 0,
      lastOutcome: outcome,
      activeClip: 'switch_on',
      consoleClip: targetConsole === 'docking' || targetConsole === 'separation' ? 'confirm' : 'switch_on',
    };
  }

  const goingRight = destX > state.currentX;
  const turnClip = goingRight ? 'turn_right' : 'turn_left';
  const nextStage: CrewPhaseStage = state.gravityMode === 'zero-g' ? 'push_off' : 'turn';
  const nextClip = state.gravityMode === 'zero-g' ? 'push_off' : turnClip;

  return {
    ...state,
    targetConsole,
    targetX: destX,
    stage: nextStage,
    stageElapsedS: 0,
    lastOutcome: outcome,
    facingYawRad: goingRight ? Math.PI * 0.5 : -Math.PI * 0.5,
    activeClip: nextClip,
    consoleClip: 'idle',
  };
}

export function toggleCrewGravityMode(state: CrewChoreographyState): CrewChoreographyState {
  const nextMode: CrewGravityMode = state.gravityMode === 'mag-boots' ? 'zero-g' : 'mag-boots';
  const idleClip = nextMode === 'zero-g' ? 'float_idle' : 'idle';
  const moveClip = nextMode === 'zero-g' ? 'float_move' : 'run';
  return {
    ...state,
    gravityMode: nextMode,
    activeClip: state.stage === 'moving' ? moveClip : state.stage === 'idle' ? idleClip : state.activeClip,
  };
}

export function stepCrewChoreography(
  state: CrewChoreographyState,
  dtS: number,
): CrewChoreographyState {
  if (dtS <= 0 || state.stage === 'idle') return state;

  const next = { ...state, stageElapsedS: state.stageElapsedS + dtS };
  const idleClip = next.gravityMode === 'zero-g' ? 'float_idle' : 'idle';

  switch (next.stage) {
    case 'turn': {
      if (next.stageElapsedS >= 0.45) {
        next.stage = 'moving';
        next.stageElapsedS = 0;
        next.activeClip = next.gravityMode === 'zero-g' ? 'float_move' : 'run';
      }
      return next;
    }
    case 'push_off': {
      if (next.stageElapsedS >= 0.55) {
        next.stage = 'moving';
        next.stageElapsedS = 0;
        next.activeClip = 'float_move';
      }
      return next;
    }
    case 'moving': {
      const speedMs = next.gravityMode === 'zero-g' ? 1.65 : 1.85;
      const diff = next.targetX - next.currentX;
      const stepDist = speedMs * dtS;
      if (Math.abs(diff) <= stepDist) {
        next.currentX = next.targetX;
        next.activeConsole = next.targetConsole;
        next.facingYawRad = Math.PI;
        next.stageElapsedS = 0;
        if (next.gravityMode === 'zero-g') {
          next.stage = 'grab_handle';
          next.activeClip = 'grab_handle';
        } else {
          next.stage = 'switching';
          next.activeClip = 'switch_on';
          next.consoleClip =
            next.activeConsole === 'docking' || next.activeConsole === 'separation'
              ? 'confirm'
              : 'switch_on';
        }
      } else {
        next.currentX += Math.sign(diff) * stepDist;
      }
      return next;
    }
    case 'grab_handle': {
      if (next.stageElapsedS >= 0.65) {
        next.stage = 'switching';
        next.stageElapsedS = 0;
        next.activeClip = 'switch_on';
        next.consoleClip =
          next.activeConsole === 'docking' || next.activeConsole === 'separation'
            ? 'confirm'
            : 'switch_on';
      }
      return next;
    }
    case 'switching': {
      if (next.stageElapsedS >= 0.95) {
        next.stage = 'working';
        next.stageElapsedS = 0;
        next.activeClip = 'task_work';
        next.consoleClip = 'work_cycle';

        // Trigger the corresponding ship equipment consequence
        if (next.activeConsole === 'power') {
          next.shipSolarAngleDeg = (next.shipSolarAngleDeg + 35) % 90;
        } else if (next.activeConsole === 'thermal') {
          next.shipHeaterOn = !next.shipHeaterOn;
        } else if (next.activeConsole === 'oxygen') {
          next.shipOxygenPercent = 100;
        } else if (next.activeConsole === 'docking') {
          next.dockingStatus = 'latched';
          next.shipClip = 'docking_latch';
        } else if (next.activeConsole === 'separation') {
          next.satelliteSeparated = true;
          next.shipClip = 'satellite_depart';
        }
      }
      return next;
    }
    case 'working': {
      if (next.stageElapsedS >= 1.4) {
        next.stage = 'reaction';
        next.stageElapsedS = 0;
        next.activeClip = next.lastOutcome === 'success' ? 'task_success' : 'task_error';
        next.consoleClip = 'idle';
        if (next.activeConsole === 'docking' && next.dockingStatus === 'latched') {
          next.dockingStatus = 'docked';
          next.shipClip = 'docking_docked';
        }
      }
      return next;
    }
    case 'reaction': {
      if (next.stageElapsedS >= 1.0) {
        next.stage = 'idle';
        next.stageElapsedS = 0;
        next.activeClip = idleClip;
        next.consoleClip = 'idle';
      }
      return next;
    }
    default:
      return next;
  }
}
