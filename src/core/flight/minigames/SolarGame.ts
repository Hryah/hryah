import { nextRandom } from "../../physics";
import { clamp } from "../ZeroGPhysics";

export interface SolarMinigameState {
  terminalId: string;
  sunAlphaDeg: number;
  sunBetaDeg: number;
  sunDriftAlphaDegS: number;
  sunDriftBetaDegS: number;
  panelAlphaDeg: number;
  panelBetaDeg: number;
  omegaAlphaDegS: number;
  omegaBetaDegS: number;
  maxSafeOmegaDegS: number;
  motorHeatPct: number;
  jamTimerS: number;
  powerEfficiencyPct: number;
  outputKw: number;
  holdTimerS: number;
  requiredHoldS: number;
  completed: boolean;
}

export function normalizeDeg(angleDeg: number): number {
  let a = ((angleDeg + 180) % 360 + 360) % 360 - 180;
  if (a === -180) a = 180;
  return a;
}

export function shortestAngleDiffDeg(a: number, b: number): number {
  return normalizeDeg(a - b);
}

export function computeSolarPowerEfficiency(
  sunAlphaDeg: number,
  sunBetaDeg: number,
  panelAlphaDeg: number,
  panelBetaDeg: number,
): number {
  const errAlpha = Math.abs(shortestAngleDiffDeg(sunAlphaDeg, panelAlphaDeg));
  const errBeta = Math.abs(shortestAngleDiffDeg(sunBetaDeg, panelBetaDeg));
  const combinedErr = Math.hypot(errAlpha, errBeta);
  // 0 deg error = 100%, <= 9.5 deg combined error gives > 95% efficiency
  const pct = clamp(100 - combinedErr * 0.52, 0, 100);
  return Math.round(pct * 10) / 10;
}

export function createSolarMinigame(
  terminalId: string,
  rngState: number,
): { minigame: SolarMinigameState; rngState: number } {
  const [r1Val, rng1] = nextRandom(rngState);
  const [r2Val, rng2] = nextRandom(rng1);
  const sunAlphaDeg = Math.round((r1Val * 240 - 120) * 10) / 10;
  const sunBetaDeg = Math.round((r2Val * 240 - 120) * 10) / 10;
  const panelAlphaDeg = normalizeDeg(sunAlphaDeg + (r1Val > 0.5 ? 72 : -72));
  const panelBetaDeg = normalizeDeg(sunBetaDeg + (r2Val > 0.5 ? -64 : 64));

  const powerEfficiencyPct = computeSolarPowerEfficiency(
    sunAlphaDeg,
    sunBetaDeg,
    panelAlphaDeg,
    panelBetaDeg,
  );

  return {
    minigame: {
      terminalId,
      sunAlphaDeg,
      sunBetaDeg,
      sunDriftAlphaDegS: r1Val > 0.5 ? 3.2 : -3.2,
      sunDriftBetaDegS: r2Val > 0.5 ? -2.6 : 2.6,
      panelAlphaDeg,
      panelBetaDeg,
      omegaAlphaDegS: 0,
      omegaBetaDegS: 0,
      maxSafeOmegaDegS: 92,
      motorHeatPct: 12,
      jamTimerS: 0,
      powerEfficiencyPct,
      outputKw: Math.round(powerEfficiencyPct * 0.24 * 10) / 10,
      holdTimerS: 0,
      requiredHoldS: 3.0,
      completed: false,
    },
    rngState: rng2,
  };
}

export function applySolarWheelDelta(
  mg: SolarMinigameState,
  deltaAlphaDeg: number,
  deltaBetaDeg: number,
  dtS: number,
): SolarMinigameState {
  if (mg.completed || mg.jamTimerS > 0) {
    return {
      ...mg,
      omegaAlphaDegS: 0,
      omegaBetaDegS: 0,
    };
  }

  const safeDt = Math.max(0.016, dtS);
  const omegaAlphaDegS = deltaAlphaDeg / safeDt;
  const omegaBetaDegS = deltaBetaDeg / safeDt;

  const panelAlphaDeg = normalizeDeg(mg.panelAlphaDeg + deltaAlphaDeg);
  const panelBetaDeg = normalizeDeg(mg.panelBetaDeg + deltaBetaDeg);
  const powerEfficiencyPct = computeSolarPowerEfficiency(
    mg.sunAlphaDeg,
    mg.sunBetaDeg,
    panelAlphaDeg,
    panelBetaDeg,
  );

  return {
    ...mg,
    panelAlphaDeg,
    panelBetaDeg,
    omegaAlphaDegS,
    omegaBetaDegS,
    powerEfficiencyPct,
    outputKw: Math.round(powerEfficiencyPct * 0.24 * 10) / 10,
  };
}

export function stepSolarMinigame(
  mg: SolarMinigameState,
  dtS: number,
): { minigame: SolarMinigameState; succeeded: boolean } {
  if (mg.completed || dtS <= 0) {
    return { minigame: mg, succeeded: mg.completed };
  }

  // Сонце повільно зміщується
  const sunAlphaDeg = normalizeDeg(mg.sunAlphaDeg + mg.sunDriftAlphaDegS * dtS);
  const sunBetaDeg = normalizeDeg(mg.sunBetaDeg + mg.sunDriftBetaDegS * dtS);

  let jamTimerS = Math.max(0, mg.jamTimerS - dtS);
  let motorHeatPct = mg.motorHeatPct;
  let panelAlphaDeg = mg.panelAlphaDeg;
  let panelBetaDeg = mg.panelBetaDeg;

  const omegaMag = Math.hypot(mg.omegaAlphaDegS, mg.omegaBetaDegS);

  if (jamTimerS > 0) {
    // Поки редуктор заклинило, мотор повільно остигає
    motorHeatPct = clamp(motorHeatPct - 24 * dtS, 0, 100);
  } else {
    if (omegaMag > mg.maxSafeOmegaDegS) {
      const excess = omegaMag - mg.maxSafeOmegaDegS;
      motorHeatPct = clamp(motorHeatPct + (38 + excess * 0.45) * dtS, 0, 100);
      if (motorHeatPct >= 100) {
        // При 100% перегріву клинить редуктор на 3 секунди
        jamTimerS = 3.0;
      }
    } else {
      motorHeatPct = clamp(motorHeatPct - 18 * dtS, 0, 100);
    }
  }

  // Плавне загасання миттєвої кутової швидкості між кадрами вводу
  const omegaDecay = Math.max(0, 1 - 6.5 * dtS);
  const omegaAlphaDegS = jamTimerS > 0 ? 0 : mg.omegaAlphaDegS * omegaDecay;
  const omegaBetaDegS = jamTimerS > 0 ? 0 : mg.omegaBetaDegS * omegaDecay;

  const powerEfficiencyPct = computeSolarPowerEfficiency(
    sunAlphaDeg,
    sunBetaDeg,
    panelAlphaDeg,
    panelBetaDeg,
  );
  const outputKw = Math.round(powerEfficiencyPct * 0.24 * 10) / 10;

  let holdTimerS = mg.holdTimerS;
  if (powerEfficiencyPct >= 95.0) {
    holdTimerS = Math.min(mg.requiredHoldS, holdTimerS + dtS);
  } else {
    holdTimerS = Math.max(0, holdTimerS - dtS * 0.5);
  }

  const completed = holdTimerS >= mg.requiredHoldS;

  return {
    minigame: {
      ...mg,
      sunAlphaDeg,
      sunBetaDeg,
      panelAlphaDeg,
      panelBetaDeg,
      omegaAlphaDegS,
      omegaBetaDegS,
      motorHeatPct,
      jamTimerS,
      powerEfficiencyPct,
      outputKw,
      holdTimerS,
      completed,
    },
    succeeded: completed,
  };
}
