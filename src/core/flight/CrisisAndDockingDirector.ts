import type { CauseEntry, Damage, SystemId } from "../contracts";
import {
  PHYSICS_CONSTANTS,
  type TerminalNode,
  WAVE_TIMINGS,
} from "./StationBlueprint";
import { clamp } from "./ZeroGPhysics";

export interface DirectorStateSlice {
  timeElapsedS: number;
  waveClockS: number;
  dockingWaveIndex: number;
  unlockedModuleIds: string[];
  openedSeals: string[];
  terminals: TerminalNode[];
  oxygenPct: number;
  energyPct: number;
  tempC: number;
  fuelLeftKg: number;
  dvPenaltyMs: number;
  damage: Damage[];
  log: CauseEntry[];
  nextFailureSeq: number;
  crisisMultiplier: number;
  cutsceneTimerS: number;
  cutsceneTargetModuleId: string | null;
}

export interface DirectorStepResult extends DirectorStateSlice {
  triggeredGameOver: boolean;
  triggeredVictory: boolean;
  triggeredCutscene: boolean;
  screenShakeAddPx: number;
}

function addSystemDamage(
  damage: readonly Damage[],
  system: SystemId,
  deltaSeverity: number,
): Damage[] {
  const existing = damage.find((d) => d.system === system);
  if (!existing) {
    return [
      ...damage,
      { system, severity: clamp(Math.round(deltaSeverity * 100) / 100, 0, 1) },
    ];
  }
  return damage.map((d) =>
    d.system === system
      ? {
          system,
          severity: clamp(Math.round((d.severity + deltaSeverity) * 100) / 100, 0, 1),
        }
      : d,
  );
}

export function stepCrisisAndDockingDirector(
  slice: DirectorStateSlice,
  dtS: number,
  isCutscene: boolean,
): DirectorStepResult {
  if (dtS <= 0) {
    return {
      ...slice,
      triggeredGameOver: false,
      triggeredVictory: false,
      triggeredCutscene: false,
      screenShakeAddPx: 0,
    };
  }

  const timeElapsedS = slice.timeElapsedS + dtS;
  let cutsceneTimerS = slice.cutsceneTimerS;
  let cutsceneTargetModuleId = slice.cutsceneTargetModuleId;

  if (isCutscene) {
    cutsceneTimerS = Math.max(0, cutsceneTimerS - dtS);
    if (cutsceneTimerS === 0) {
      cutsceneTargetModuleId = null;
    }
    return {
      ...slice,
      timeElapsedS,
      cutsceneTimerS,
      cutsceneTargetModuleId,
      triggeredGameOver: false,
      triggeredVictory: false,
      triggeredCutscene: false,
      screenShakeAddPx: 0,
    };
  }

  const waveClockS = slice.waveClockS + dtS;
  const roundedTS = Math.round(timeElapsedS * 10) / 10;
  let dockingWaveIndex = slice.dockingWaveIndex;
  let terminals = slice.terminals.map((t) => ({ ...t }));
  let oxygenPct = slice.oxygenPct;
  let energyPct = slice.energyPct;
  let tempC = slice.tempC;
  let fuelLeftKg = slice.fuelLeftKg;
  let dvPenaltyMs = slice.dvPenaltyMs;
  let damage = [...slice.damage];
  let log = [...slice.log];
  let nextFailureSeq = slice.nextFailureSeq;
  let screenShakeAddPx = 0;

  const activateTerminal = (id: string) => {
    terminals = terminals.map((t) => {
      if (t.id !== id) return t;
      if (t.state === "WARNING" || t.state === "CRITICAL") return t;
      if (t.type === "DOCKING" && t.state === "COMPLETED") return t;
      return {
        ...t,
        state: "WARNING",
        urgencyTimer: t.maxUrgencyTimer,
      };
    });
  };

  if (waveClockS >= WAVE_TIMINGS.initialSolarWarningTimeS && dockingWaveIndex === 0) {
    const solar = terminals.find((t) => t.id === "SOLAR");
    if (solar && solar.state === "IDLE") {
      activateTerminal("SOLAR");
    }
  }

  // Хвиля 1 (0:40 — Стикування №1 у MOD_INTERSECTION)
  if (waveClockS >= WAVE_TIMINGS.wave1TimeS && dockingWaveIndex < 1) {
    dockingWaveIndex = 1;
    activateTerminal("DOCKING_1");
    screenShakeAddPx = Math.max(screenShakeAddPx, 7);
  }

  // Хвиля 2 (2:00 — Стикування №2 + Кисень у MOD_VERTICAL_LAB)
  if (
    waveClockS >= WAVE_TIMINGS.wave2TimeS &&
    dockingWaveIndex === 1 &&
    slice.unlockedModuleIds.includes("MOD_VERTICAL_LAB")
  ) {
    dockingWaveIndex = 2;
    activateTerminal("DOCKING_2");
    activateTerminal("OXYGEN");
    screenShakeAddPx = Math.max(screenShakeAddPx, 8);
  }

  // Хвиля 3 (3:30 — Фінальне Стикування №3 + подвійний збій на периферії)
  if (
    waveClockS >= WAVE_TIMINGS.wave3TimeS &&
    dockingWaveIndex === 2 &&
    slice.unlockedModuleIds.includes("MOD_THERMAL_BAY")
  ) {
    dockingWaveIndex = 3;
    activateTerminal("DOCKING_3");
    activateTerminal("SOLAR");
    activateTerminal("THERMAL");
    screenShakeAddPx = Math.max(screenShakeAddPx, 10);
  }

  let solarMalfunction = false;
  let oxygenMalfunction = false;
  let thermalMalfunction = false;

  terminals = terminals.map((t) => {
    if (t.state !== "WARNING" && t.state !== "CRITICAL") {
      return t;
    }

    if (t.type === "SOLAR") solarMalfunction = true;
    if (t.type === "OXYGEN") oxygenMalfunction = true;
    if (t.type === "THERMAL") thermalMalfunction = true;

    const nextTimer = Math.max(0, t.urgencyTimer - dtS);
    const nextState = nextTimer <= 15 ? "CRITICAL" : "WARNING";

    if (nextTimer === 0) {
      nextFailureSeq += 1;
      screenShakeAddPx = Math.max(screenShakeAddPx, 12);

      if (t.type === "SOLAR") {
        energyPct = clamp(energyPct - 20, 0, 100);
        damage = addSystemDamage(damage, "power", 0.35);
        log.push({
          id: `flight:solar-timeout-${nextFailureSeq}`,
          phase: "flight",
          tS: roundedTS,
          kind: "failure",
          system: "power",
          messageKey: "flight.failure.solarTimeout",
          params: { energyPct: Math.round(energyPct) },
          causedBy: [t.causedBy],
        });
      } else if (t.type === "THERMAL") {
        tempC = clamp(tempC + 14, 18, 85);
        energyPct = clamp(energyPct - 12, 0, 100);
        damage = addSystemDamage(damage, "thermal", 0.35);
        log.push({
          id: `flight:thermal-timeout-${nextFailureSeq}`,
          phase: "flight",
          tS: roundedTS,
          kind: "failure",
          system: "thermal",
          messageKey: "flight.failure.thermalTimeout",
          params: { tempC: Math.round(tempC) },
          causedBy: [t.causedBy],
        });
      } else if (t.type === "OXYGEN") {
        oxygenPct = clamp(oxygenPct - 22, 0, 100);
        damage = addSystemDamage(damage, "power", 0.25);
        log.push({
          id: `flight:oxygen-timeout-${nextFailureSeq}`,
          phase: "flight",
          tS: roundedTS,
          kind: "failure",
          system: "power",
          messageKey: "flight.failure.oxygenTimeout",
          params: { oxygenPct: Math.round(oxygenPct) },
          causedBy: [t.causedBy],
        });
      } else if (t.type === "DOCKING") {
        dvPenaltyMs += 95;
        fuelLeftKg = Math.max(0, fuelLeftKg - 3);
        energyPct = clamp(energyPct - 15, 0, 100);
        damage = addSystemDamage(damage, "propulsion", 0.3);
        log.push({
          id: `flight:docking-timeout-${nextFailureSeq}`,
          phase: "flight",
          tS: roundedTS,
          kind: "failure",
          system: "propulsion",
          messageKey: "flight.failure.dockingTimeout",
          params: { terminalId: t.id, dvPenaltyMs },
          causedBy: [t.causedBy],
        });
      }

      return {
        ...t,
        state: "CRITICAL",
        urgencyTimer: Math.max(18, Math.round(t.maxUrgencyTimer * 0.65)),
      };
    }

    return {
      ...t,
      state: nextState,
      urgencyTimer: nextTimer,
    };
  });

  const mult = slice.crisisMultiplier;
  if (solarMalfunction) {
    energyPct = clamp(energyPct - 1.35 * mult * dtS, 0, 100);
  } else {
    energyPct = clamp(energyPct + 0.9 * dtS, 0, 100);
  }

  if (thermalMalfunction) {
    tempC = clamp(tempC + 0.85 * mult * dtS, 18, 85);
    if (tempC > 42) {
      energyPct = clamp(energyPct - 0.55 * dtS, 0, 100);
    }
  } else {
    tempC = clamp(tempC - 1.1 * dtS, 21, 85);
  }

  if (oxygenMalfunction) {
    oxygenPct = clamp(oxygenPct - 1.45 * mult * dtS, 0, 100);
  } else {
    const netO2Rate = slice.unlockedModuleIds.includes("MOD_VERTICAL_LAB") ? 0.55 : -0.12;
    oxygenPct = clamp(oxygenPct + netO2Rate * dtS, 0, 100);
  }

  const triggeredGameOver = oxygenPct <= 0 || energyPct <= 0;

  return {
    ...slice,
    timeElapsedS,
    waveClockS,
    dockingWaveIndex,
    terminals,
    oxygenPct,
    energyPct,
    tempC,
    fuelLeftKg,
    dvPenaltyMs,
    damage,
    log,
    nextFailureSeq,
    cutsceneTimerS,
    cutsceneTargetModuleId,
    triggeredGameOver,
    triggeredVictory: false,
    triggeredCutscene: false,
    screenShakeAddPx,
  };
}

export function resolveTerminalSuccess(
  slice: DirectorStateSlice,
  terminalId: string,
): DirectorStepResult {
  const target = slice.terminals.find((t) => t.id === terminalId);
  if (!target) {
    return {
      ...slice,
      triggeredGameOver: false,
      triggeredVictory: false,
      triggeredCutscene: false,
      screenShakeAddPx: 0,
    };
  }

  const roundedTS = Math.round(slice.timeElapsedS * 10) / 10;
  let unlockedModuleIds = [...slice.unlockedModuleIds];
  let openedSeals = [...slice.openedSeals];
  let waveClockS = slice.waveClockS;
  let oxygenPct = slice.oxygenPct;
  let energyPct = slice.energyPct;
  let tempC = slice.tempC;
  let log = [...slice.log];
  let cutsceneTimerS = slice.cutsceneTimerS;
  let cutsceneTargetModuleId = slice.cutsceneTargetModuleId;
  let triggeredVictory = false;
  let triggeredCutscene = false;

  const terminals = slice.terminals.map((t) =>
    t.id === terminalId
      ? {
          ...t,
          state: (t.type === "DOCKING" ? "COMPLETED" : "IDLE") as TerminalNode["state"],
          urgencyTimer: t.maxUrgencyTimer,
        }
      : t,
  );

  if (target.type === "SOLAR") {
    energyPct = clamp(energyPct + 28, 0, 100);
    log.push({
      id: `flight:event-solar-${Math.round(slice.timeElapsedS * 10)}`,
      phase: "flight",
      tS: roundedTS,
      kind: "event",
      system: "power",
      messageKey: "flight.event.solarRepaired",
      params: { energyPct: Math.round(energyPct) },
      causedBy: [target.causedBy],
    });
    if (slice.dockingWaveIndex === 0 && waveClockS < WAVE_TIMINGS.wave1TimeS - 6) {
      waveClockS = WAVE_TIMINGS.wave1TimeS - 6;
    }
  } else if (target.type === "THERMAL") {
    tempC = 21;
    energyPct = clamp(energyPct + 12, 0, 100);
    log.push({
      id: `flight:event-thermal-${Math.round(slice.timeElapsedS * 10)}`,
      phase: "flight",
      tS: roundedTS,
      kind: "event",
      system: "thermal",
      messageKey: "flight.event.thermalRepaired",
      params: { tempC },
      causedBy: [target.causedBy],
    });
  } else if (target.type === "OXYGEN") {
    oxygenPct = clamp(oxygenPct + 32, 0, 100);
    log.push({
      id: `flight:event-oxygen-${Math.round(slice.timeElapsedS * 10)}`,
      phase: "flight",
      tS: roundedTS,
      kind: "event",
      system: "power",
      messageKey: "flight.event.oxygenRepaired",
      params: { oxygenPct: Math.round(oxygenPct) },
      causedBy: [target.causedBy],
    });
  } else if (target.type === "DOCKING") {
    if (target.unlocksSeal && !openedSeals.includes(target.unlocksSeal)) {
      openedSeals.push(target.unlocksSeal);
    }
    if (target.unlocksModuleId && !unlockedModuleIds.includes(target.unlocksModuleId)) {
      unlockedModuleIds.push(target.unlocksModuleId);
    }

    if (target.id === "DOCKING_1") {
      cutsceneTimerS = PHYSICS_CONSTANTS.cutsceneDurationS;
      cutsceneTargetModuleId = "MOD_VERTICAL_LAB";
      triggeredCutscene = true;
      if (waveClockS < WAVE_TIMINGS.wave2TimeS - 16) {
        waveClockS = WAVE_TIMINGS.wave2TimeS - 16;
      }
      log.push({
        id: "flight:event-docking-1",
        phase: "flight",
        tS: roundedTS,
        kind: "event",
        system: "structure",
        messageKey: "flight.event.docking1Success",
        causedBy: ["design:engine"],
      });
    } else if (target.id === "DOCKING_2") {
      cutsceneTimerS = PHYSICS_CONSTANTS.cutsceneDurationS;
      cutsceneTargetModuleId = "MOD_THERMAL_BAY";
      triggeredCutscene = true;
      if (waveClockS < WAVE_TIMINGS.wave3TimeS - 16) {
        waveClockS = WAVE_TIMINGS.wave3TimeS - 16;
      }
      log.push({
        id: "flight:event-docking-2",
        phase: "flight",
        tS: roundedTS,
        kind: "event",
        system: "structure",
        messageKey: "flight.event.docking2Success",
        causedBy: ["design:engine"],
      });
    } else if (target.id === "DOCKING_3") {
      triggeredVictory = true;
      log.push({
        id: "flight:event-docking-3",
        phase: "flight",
        tS: roundedTS,
        kind: "event",
        system: "structure",
        messageKey: "flight.event.docking3Success",
        causedBy: ["design:engine"],
      });
    }
  }

  return {
    ...slice,
    waveClockS,
    unlockedModuleIds,
    openedSeals,
    terminals,
    oxygenPct,
    energyPct,
    tempC,
    log,
    cutsceneTimerS,
    cutsceneTargetModuleId,
    triggeredGameOver: false,
    triggeredVictory,
    triggeredCutscene,
    screenShakeAddPx: target.type === "DOCKING" ? 9 : 3,
  };
}
