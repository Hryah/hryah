import { nextRandom } from "../../physics";
import { clamp } from "../ZeroGPhysics";

export interface DockingMinigameState {
  terminalId: string;
  offsetXPx: number;
  offsetYPx: number;
  velXPxS: number;
  velYPxS: number;
  thrustX: number;
  thrustY: number;
  distanceZM: number;
  approachSpeedVzMs: number;
  turbulenceTimerS: number;
  turbulenceAxPxS2: number;
  turbulenceAyPxS2: number;
  lockRadiusPx: number;
  inLockZone: boolean;
  collisionFlashTimerS: number;
  collisionCount: number;
  completed: boolean;
}

export function createDockingMinigame(
  terminalId: string,
  rngState: number,
): { minigame: DockingMinigameState; rngState: number } {
  const [r1Val, rng1] = nextRandom(rngState);
  const [r2Val, rng2] = nextRandom(rng1);
  const angle = r1Val * Math.PI * 2;
  const dist = 38 + r2Val * 34;

  return {
    minigame: {
      terminalId,
      offsetXPx: Math.cos(angle) * dist,
      offsetYPx: Math.sin(angle) * dist,
      velXPxS: -Math.sin(angle) * 24,
      velYPxS: Math.cos(angle) * 24,
      thrustX: 0,
      thrustY: 0,
      distanceZM: 10.0,
      approachSpeedVzMs: 0.85,
      turbulenceTimerS: 0.9,
      turbulenceAxPxS2: Math.cos(angle + 1.1) * 42,
      turbulenceAyPxS2: Math.sin(angle + 1.1) * 42,
      lockRadiusPx: 25,
      inLockZone: false,
      collisionFlashTimerS: 0,
      collisionCount: 0,
      completed: false,
    },
    rngState: rng2,
  };
}

export interface DockingStepOutput {
  minigame: DockingMinigameState;
  rngState: number;
  collidedAtZeroZ: boolean;
  succeeded: boolean;
}

export function stepDockingMinigame(
  mg: DockingMinigameState,
  dtS: number,
  rngState: number,
  timeElapsedS: number,
): DockingStepOutput {
  if (mg.completed || dtS <= 0) {
    return { minigame: mg, rngState, collidedAtZeroZ: false, succeeded: mg.completed };
  }

  let nextRng = rngState;
  let turbTimer = mg.turbulenceTimerS - dtS;
  let turbAx = mg.turbulenceAxPxS2;
  let turbAy = mg.turbulenceAyPxS2;

  // Орбітальна турбулентність щосекунди додає випадковий вектор збурення + синусоїдальний дрейф
  if (turbTimer <= 0) {
    const [rAngleVal, rngA] = nextRandom(nextRng);
    const [rMagVal, rngM] = nextRandom(rngA);
    nextRng = rngM;
    const a = rAngleVal * Math.PI * 2;
    const mag = 28 + rMagVal * 44;
    turbAx = Math.cos(a) * mag;
    turbAy = Math.sin(a) * mag;
    turbTimer = 0.85 + rMagVal * 0.35;
  }

  const waveAx = Math.sin(timeElapsedS * 2.1) * 22 + Math.cos(timeElapsedS * 3.4) * 14;
  const waveAy = Math.cos(timeElapsedS * 1.8) * 22 + Math.sin(timeElapsedS * 2.9) * 14;

  // Імпульсні двигуни гравця (WASD / віртуальний джойстик) змінюють прискорення (ax, ay)
  const thrusterAccel = 210;
  const ax = mg.thrustX * thrusterAccel + turbAx + waveAx;
  const ay = mg.thrustY * thrusterAccel + turbAy + waveAy;

  const damping = Math.max(0, 1 - 1.35 * dtS);
  const velXPxS = clamp((mg.velXPxS + ax * dtS) * damping, -190, 190);
  const velYPxS = clamp((mg.velYPxS + ay * dtS) * damping, -190, 190);

  const offsetXPx = clamp(mg.offsetXPx + velXPxS * dtS, -145, 145);
  const offsetYPx = clamp(mg.offsetYPx + velYPxS * dtS, -145, 145);

  const radialErrorPx = Math.hypot(offsetXPx, offsetYPx);
  const inLockZone = radialErrorPx < mg.lockRadiusPx;

  let distanceZM = Math.max(0, mg.distanceZM - mg.approachSpeedVzMs * dtS);
  let collisionFlashTimerS = Math.max(0, mg.collisionFlashTimerS - dtS);
  let collisionCount = mg.collisionCount;
  let completed = false;
  let collidedAtZeroZ = false;

  if (distanceZM <= 0) {
    if (inLockZone) {
      distanceZM = 0;
      completed = true;
    } else {
      // Удар шлюзом: відкат дистанції на 5 м і штраф до енергії станції
      distanceZM = 5.0;
      collisionFlashTimerS = 0.9;
      collisionCount += 1;
      collidedAtZeroZ = true;
    }
  }

  return {
    minigame: {
      ...mg,
      offsetXPx,
      offsetYPx,
      velXPxS,
      velYPxS,
      distanceZM,
      turbulenceTimerS: turbTimer,
      turbulenceAxPxS2: turbAx,
      turbulenceAyPxS2: turbAy,
      inLockZone,
      collisionFlashTimerS,
      collisionCount,
      completed,
    },
    rngState: nextRng,
    collidedAtZeroZ,
    succeeded: completed,
  };
}
