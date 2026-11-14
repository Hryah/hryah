import type { CauseEntry } from '../../contracts';

export type RoomFacing = 'front' | 'back' | 'left' | 'right';

export interface RoomPoint {
  xM: number;
  zM: number;
}

export interface RoomObstacle extends RoomPoint {
  id: string;
  kind: 'console' | 'cargo';
  widthM: number;
  depthM: number;
  heightM: number;
}

export interface RoomBlueprint {
  id: string;
  bounds: { minXM: number; maxXM: number; minZM: number; maxZM: number };
  player: {
    radiusM: number;
    speedMs: number;
    spawn: RoomPoint;
    maxMoveDtS: number;
    maxStepDistanceM: number;
  };
  obstacles: RoomObstacle[];
  console: {
    id: string;
    interaction: RoomPoint & { radiusM: number };
    initialAngleDeg: number;
    targetAngleDeg: number;
    minAngleDeg: number;
    maxAngleDeg: number;
    toleranceDeg: number;
  };
}

export interface RoomInput {
  log: CauseEntry[];
}

export interface RoomState {
  input: RoomInput;
  rngState: number;
  tS: number;
  nextLogSeq: number;
  player: RoomPoint & { facing: RoomFacing; moving: boolean };
  console: {
    open: boolean;
    completed: boolean;
    panelAngleDeg: number;
    targetAngleDeg: number;
    efficiencyPct: number;
    feedback: 'none' | 'rejected' | 'completed';
  };
  log: CauseEntry[];
}

export type RoomAction =
  | { type: 'move'; x: number; z: number; dtS: number; facing?: RoomFacing }
  | { type: 'stop' }
  | { type: 'interact' }
  | { type: 'set_panel_angle'; angleDeg: number }
  | { type: 'apply_panel_angle' }
  | { type: 'close_console' };

export interface RoomResult {
  completed: boolean;
  solarEfficiencyPct: number;
}
