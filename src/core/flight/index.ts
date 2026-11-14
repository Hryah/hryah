import type {
  CauseEntry,
  Damage,
  DebugAction,
  FlightInput,
  FlightPhase,
  FlightResult,
  Margin,
} from "../contracts";
import { eclipseFraction, fuelLeftKg, orbitalPeriodS } from "../physics";
import {
  resolveTerminalSuccess,
  stepCrisisAndDockingDirector,
} from "./CrisisAndDockingDirector";
import {
  createDockingMinigame,
  type DockingMinigameState,
  stepDockingMinigame,
} from "./minigames/DockingGame";
import {
  createLifeSupportMinigame,
  type LifeSupportMinigameState,
  rotateAmmoniaValve,
  setO2ValveHeld,
  stepLifeSupportMinigame,
  updateLifeSupportFilters,
} from "./minigames/LifeSupportGame";
import {
  applySolarWheelDelta,
  createSolarMinigame,
  type SolarMinigameState,
  stepSolarMinigame,
} from "./minigames/SolarGame";
import {
  ALL_GRAB_HANDLES,
  type AstronautEntity,
  createInitialTerminals,
  findModuleForPosition,
  type GameMode,
  getActiveCircleObstacles,
  getActiveHandles,
  getActiveWalls,
  getHandleMidpoint,
  PHYSICS_CONSTANTS,
  STATION_LEVEL_CONFIG,
  type TerminalNode,
} from "./StationBlueprint";
import {
  clamp,
  computeSlingshotLaunch,
  stepZeroGPhysics,
} from "./ZeroGPhysics";

export * from "./StationBlueprint";
export * from "./ZeroGPhysics";
export * from "./CrisisAndDockingDirector";
export * from "./minigames/DockingGame";
export * from "./minigames/SolarGame";
export * from "./minigames/LifeSupportGame";

export interface ActiveMinigameContainer {
  type: "DOCKING" | "SOLAR" | "OXYGEN" | "THERMAL" | "NONE";
  terminalId: string | null;
  docking: DockingMinigameState | null;
  solar: SolarMinigameState | null;
  lifeSupport: LifeSupportMinigameState | null;
}

export interface FlightState {
  input: FlightInput;
  rngState: number;
  gameMode: GameMode;
  timeElapsedS: number;
  waveClockS: number;
  dockingWaveIndex: number;

  // Сутність космонавта (AstronautEntity) та активна кімната для RoomCameraController
  astronaut: AstronautEntity;
  activeModuleId: string;

  // Розширювана геометрія станції (StationTopology)
  unlockedModuleIds: string[];
  openedSeals: string[];
  terminals: TerminalNode[];

  // Активна ізольована мінігра
  activeMinigame: ActiveMinigameContainer;

  // Ресурси станції та параметри польоту
  oxygenPct: number;
  energyPct: number;
  tempC: number;
  fuelLeftKg: number;
  dvPenaltyMs: number;
  targetAltKm: number;
  achievedAltKm: number;
  crisisMultiplier: number;

  // Катсцена розширення станції та ефекти камери
  cutsceneTimerS: number;
  cutsceneTargetModuleId: string | null;
  screenShakePx: number;

  // Пошкодження підсистем і причинно-наслідковий журнал
  damage: Damage[];
  log: CauseEntry[];
  nextFailureSeq: number;
  phaseDone: boolean;
}

export type FlightAction =
  | { type: "tick"; dtS: number }
  | { type: "slingshot_start"; screenX: number; screenY: number }
  | { type: "slingshot_move"; screenX: number; screenY: number }
  | { type: "slingshot_release" }
  | { type: "slingshot_cancel" }
  | { type: "set_active_grab"; held: boolean }
  | { type: "fire_thruster"; dirX: number; dirY: number }
  | { type: "open_terminal"; terminalId?: string }
  | { type: "close_minigame" }
  | { type: "docking_input"; thrustX: number; thrustY: number }
  | { type: "solar_input"; deltaAlphaDeg: number; deltaBetaDeg: number; dtS: number }
  | { type: "ls_drag_filter"; target: "RED" | "GREEN"; x: number; y: number; released: boolean }
  | { type: "ls_rotate_ammonia"; deltaDeg: number }
  | { type: "ls_hold_o2"; held: boolean }
  | { type: "complete_minigame_debug" }
  | { type: "complete_phase" };

function findMargin(margins: readonly Margin[], id: Margin["id"]): Margin | undefined {
  return margins.find((m) => m.id === id);
}

function computeDesignCrisisMultiplier(input: FlightInput): number {
  let mult = 1.0;
  for (const m of input.spec.margins) {
    if (!m.ok) {
      mult += 0.25;
    } else if (m.need > 0 && m.have / m.need < 1.15) {
      mult += 0.1;
    }
  }
  return clamp(Math.round(mult * 100) / 100, 0.85, 2.0);
}

function computeBaseFlightMetrics(input: FlightInput): {
  baseAltKm: number;
  baseFuelLeftKg: number;
  initialLog: CauseEntry[];
} {
  const { mission, spec } = input;
  const targetAltKm = spec.design.altKm;
  const massMargin = findMargin(spec.margins, "mass");
  const reached = spec.dvMs >= mission.dvRequiredMs;

  let baseAltKm = reached
    ? targetAltKm
    : Math.round(
        mission.altRangeKm[0] * 0.5 +
          (targetAltKm - mission.altRangeKm[0] * 0.5) *
            (spec.dvMs / Math.max(1, mission.dvRequiredMs)),
      );

  const initialLog: CauseEntry[] = [];

  if (massMargin && !massMargin.ok) {
    const excessRatio = (massMargin.need - massMargin.have) / Math.max(1, massMargin.have);
    baseAltKm = Math.max(80, Math.round(baseAltKm * Math.max(0.5, 1 - excessRatio * 0.8)));
    initialLog.push({
      id: "flight:overweight",
      phase: "flight",
      tS: 0,
      kind: "failure",
      system: "propulsion",
      messageKey: "flight.failure.overweight",
      params: { wetMassKg: spec.wetMassKg, maxMassKg: massMargin.have },
      causedBy: ["design:engine", "design:instrument"],
    });
  }

  if (!reached) {
    initialLog.push({
      id: "flight:low-orbit",
      phase: "flight",
      tS: 0,
      kind: "failure",
      system: "propulsion",
      messageKey: "flight.failure.lowOrbit",
      params: { haveMs: Math.round(spec.dvMs), needMs: mission.dvRequiredMs },
      causedBy: ["design:engine", "design:instrument"],
    });
  }

  const baseFuelLeftKg = reached
    ? Math.round(
        fuelLeftKg(spec.ispS, spec.dryMassKg, spec.fuelKg, mission.dvRequiredMs) * 100,
      ) / 100
    : 0;

  return { baseAltKm, baseFuelLeftKg, initialLog };
}

function recomputeAchievedAltKm(input: FlightInput, dvPenaltyMs: number): number {
  const { baseAltKm } = computeBaseFlightMetrics(input);
  if (dvPenaltyMs <= 0) return baseAltKm;
  const needDvMs = Math.max(1, input.mission.dvRequiredMs);
  const effectiveDvMs = Math.max(0, input.spec.dvMs - dvPenaltyMs);
  const ratio = Math.min(1, effectiveDvMs / needDvMs);
  return Math.max(80, Math.round(baseAltKm * (0.45 + 0.55 * ratio)));
}

function emptyMinigameContainer(): ActiveMinigameContainer {
  return {
    type: "NONE",
    terminalId: null,
    docking: null,
    solar: null,
    lifeSupport: null,
  };
}

function openMinigameForTerminal(
  state: FlightState,
  terminal: TerminalNode,
): FlightState {
  if (terminal.type === "DOCKING") {
    const created = createDockingMinigame(terminal.id, state.rngState);
    return {
      ...state,
      rngState: created.rngState,
      gameMode: "MINIGAME_ACTIVE",
      activeMinigame: {
        type: "DOCKING",
        terminalId: terminal.id,
        docking: created.minigame,
        solar: null,
        lifeSupport: null,
      },
    };
  }

  if (terminal.type === "SOLAR") {
    const created = createSolarMinigame(terminal.id, state.rngState);
    return {
      ...state,
      rngState: created.rngState,
      gameMode: "MINIGAME_ACTIVE",
      activeMinigame: {
        type: "SOLAR",
        terminalId: terminal.id,
        docking: null,
        solar: created.minigame,
        lifeSupport: null,
      },
    };
  }

  const ls = createLifeSupportMinigame(terminal.id);
  return {
    ...state,
    gameMode: "MINIGAME_ACTIVE",
    activeMinigame: {
      type: terminal.type,
      terminalId: terminal.id,
      docking: null,
      solar: null,
      lifeSupport: ls,
    },
  };
}

function applyMinigameVictory(state: FlightState, terminalId: string): FlightState {
  const res = resolveTerminalSuccess(
    {
      timeElapsedS: state.timeElapsedS,
      waveClockS: state.waveClockS,
      dockingWaveIndex: state.dockingWaveIndex,
      unlockedModuleIds: state.unlockedModuleIds,
      openedSeals: state.openedSeals,
      terminals: state.terminals,
      oxygenPct: state.oxygenPct,
      energyPct: state.energyPct,
      tempC: state.tempC,
      fuelLeftKg: state.fuelLeftKg,
      dvPenaltyMs: state.dvPenaltyMs,
      damage: state.damage,
      log: state.log,
      nextFailureSeq: state.nextFailureSeq,
      crisisMultiplier: state.crisisMultiplier,
      cutsceneTimerS: state.cutsceneTimerS,
      cutsceneTargetModuleId: state.cutsceneTargetModuleId,
    },
    terminalId,
  );

  const nextMode: GameMode = res.triggeredVictory
    ? "VICTORY"
    : res.triggeredCutscene
      ? "MODULE_EXPANSION_CUTSCENE"
      : "STATION_ROAM";

  return {
    ...state,
    gameMode: nextMode,
    waveClockS: res.waveClockS,
    unlockedModuleIds: res.unlockedModuleIds,
    openedSeals: res.openedSeals,
    terminals: res.terminals,
    activeMinigame: emptyMinigameContainer(),
    oxygenPct: res.oxygenPct,
    energyPct: res.energyPct,
    tempC: res.tempC,
    cutsceneTimerS: res.cutsceneTimerS,
    cutsceneTargetModuleId: res.cutsceneTargetModuleId,
    screenShakePx: Math.min(22, state.screenShakePx + res.screenShakeAddPx),
    log: res.log,
  };
}

export const flightPhase: FlightPhase<FlightState, FlightAction> = {
  init(input: FlightInput, seed: number): FlightState {
    const startHandle = ALL_GRAB_HANDLES[0]!;
    const startPos = getHandleMidpoint(startHandle);
    const crisisMultiplier = computeDesignCrisisMultiplier(input);
    const { baseAltKm, baseFuelLeftKg, initialLog } = computeBaseFlightMetrics(input);

    const unlockedModuleIds = STATION_LEVEL_CONFIG.filter((m) => m.unlockedAtWave === 0).map(
      (m) => m.id,
    );
    const terminals = createInitialTerminals(crisisMultiplier).map((t) =>
      t.id === "SOLAR" ? { ...t, state: "WARNING" as const } : t,
    );

    const astronaut: AstronautEntity = {
      pos: { x: startPos.x, y: startPos.y },
      vel: { vx: 0, vy: 0 },
      radius: PHYSICS_CONSTANTS.playerRadiusPx,
      angle: 0,
      angularVel: 0,
      state: "ANCHORED",
      anchoredHandleId: startHandle.id,
      lastHandleId: null,
      ignoreHandleTimer: 0,
      stunTimer: 0,
      slingshot: {
        isDragging: false,
        dragStartScreen: { x: 0, y: 0 },
        dragCurrentScreen: { x: 0, y: 0 },
        launchVector: { vx: 0, vy: 0 },
      },
      thrusterCharges: PHYSICS_CONSTANTS.maxThrusterCharges,
      activeGrabHeld: false,
    };

    return {
      input,
      rngState: seed || 1,
      gameMode: "STATION_ROAM",
      timeElapsedS: 0,
      waveClockS: 0,
      dockingWaveIndex: 0,
      astronaut,
      activeModuleId: startHandle.moduleId,
      unlockedModuleIds,
      openedSeals: [],
      terminals,
      activeMinigame: emptyMinigameContainer(),
      oxygenPct: 100,
      energyPct: 100,
      tempC: 21,
      fuelLeftKg: baseFuelLeftKg,
      dvPenaltyMs: 0,
      targetAltKm: input.spec.design.altKm,
      achievedAltKm: baseAltKm,
      crisisMultiplier,
      cutsceneTimerS: 0,
      cutsceneTargetModuleId: null,
      screenShakePx: 0,
      damage: [],
      log: initialLog,
      nextFailureSeq: 0,
      phaseDone: false,
    };
  },

  step(state: FlightState, action: FlightAction): FlightState {
    if (state.phaseDone) return state;

    switch (action.type) {
      case "slingshot_start": {
        if (state.gameMode !== "STATION_ROAM" || state.astronaut.state !== "ANCHORED") {
          return state;
        }
        return {
          ...state,
          astronaut: {
            ...state.astronaut,
            slingshot: {
              isDragging: true,
              dragStartScreen: { x: action.screenX, y: action.screenY },
              dragCurrentScreen: { x: action.screenX, y: action.screenY },
              launchVector: { vx: 0, vy: 0 },
            },
          },
        };
      }

      case "slingshot_move": {
        if (
          state.gameMode !== "STATION_ROAM" ||
          state.astronaut.state !== "ANCHORED" ||
          !state.astronaut.slingshot.isDragging
        ) {
          return state;
        }
        const dragCurrentScreen = { x: action.screenX, y: action.screenY };
        const launch = computeSlingshotLaunch(
          state.astronaut.slingshot.dragStartScreen,
          dragCurrentScreen,
        );
        const launchSpeed = Math.hypot(launch.vx, launch.vy);
        const nextAngle =
          launchSpeed > 5 ? Math.atan2(launch.vy, launch.vx) : state.astronaut.angle;

        return {
          ...state,
          astronaut: {
            ...state.astronaut,
            angle: nextAngle,
            slingshot: {
              ...state.astronaut.slingshot,
              dragCurrentScreen,
              launchVector: { vx: launch.vx, vy: launch.vy },
            },
          },
        };
      }

      case "slingshot_cancel": {
        if (!state.astronaut.slingshot.isDragging) return state;
        return {
          ...state,
          astronaut: {
            ...state.astronaut,
            slingshot: {
              isDragging: false,
              dragStartScreen: { x: 0, y: 0 },
              dragCurrentScreen: { x: 0, y: 0 },
              launchVector: { vx: 0, vy: 0 },
            },
          },
        };
      }

      case "slingshot_release": {
        if (
          state.gameMode !== "STATION_ROAM" ||
          state.astronaut.state !== "ANCHORED" ||
          !state.astronaut.slingshot.isDragging
        ) {
          return state;
        }
        const lv = state.astronaut.slingshot.launchVector;
        const speed = Math.hypot(lv.vx, lv.vy);
        if (speed < 20) {
          return {
            ...state,
            astronaut: {
              ...state.astronaut,
              slingshot: {
                isDragging: false,
                dragStartScreen: { x: 0, y: 0 },
                dragCurrentScreen: { x: 0, y: 0 },
                launchVector: { vx: 0, vy: 0 },
              },
            },
          };
        }

        return {
          ...state,
          astronaut: {
            ...state.astronaut,
            vel: { vx: lv.vx, vy: lv.vy },
            angle: Math.atan2(lv.vy, lv.vx),
            angularVel: 0,
            state: "FLYING",
            lastHandleId: state.astronaut.anchoredHandleId,
            anchoredHandleId: null,
            ignoreHandleTimer: PHYSICS_CONSTANTS.ignoreHandleDurationS,
            slingshot: {
              isDragging: false,
              dragStartScreen: { x: 0, y: 0 },
              dragCurrentScreen: { x: 0, y: 0 },
              launchVector: { vx: 0, vy: 0 },
            },
          },
        };
      }

      case "set_active_grab": {
        if (state.astronaut.activeGrabHeld === action.held) return state;
        return {
          ...state,
          astronaut: {
            ...state.astronaut,
            activeGrabHeld: action.held,
          },
        };
      }

      case "fire_thruster": {
        if (
          state.gameMode !== "STATION_ROAM" ||
          state.astronaut.state === "ANCHORED" ||
          state.astronaut.thrusterCharges <= 0
        ) {
          return state;
        }
        const len = Math.hypot(action.dirX, action.dirY);
        const nx = len > 1e-4 ? action.dirX / len : Math.cos(state.astronaut.angle);
        const ny = len > 1e-4 ? action.dirY / len : Math.sin(state.astronaut.angle);
        const impulse = PHYSICS_CONSTANTS.thrusterImpulsePxS;

        return {
          ...state,
          astronaut: {
            ...state.astronaut,
            vel: {
              vx: clamp(state.astronaut.vel.vx + nx * impulse, -650, 650),
              vy: clamp(state.astronaut.vel.vy + ny * impulse, -650, 650),
            },
            angle: Math.atan2(ny, nx),
            angularVel: 0,
            state: "FLYING",
            stunTimer: 0,
            thrusterCharges: state.astronaut.thrusterCharges - 1,
          },
        };
      }

      case "open_terminal": {
        if (state.gameMode !== "STATION_ROAM") return state;

        let targetTerminal: TerminalNode | undefined;
        if (action.terminalId) {
          targetTerminal = state.terminals.find(
            (t) =>
              t.id === action.terminalId &&
              state.unlockedModuleIds.includes(t.moduleId),
          );
        } else if (state.astronaut.state === "ANCHORED" && state.astronaut.anchoredHandleId) {
          const handle = ALL_GRAB_HANDLES.find((h) => h.id === state.astronaut.anchoredHandleId);
          if (handle && handle.terminalId) {
            targetTerminal = state.terminals.find((t) => t.id === handle.terminalId);
          }
        }

        if (!targetTerminal) return state;
        return openMinigameForTerminal(state, targetTerminal);
      }

      case "close_minigame": {
        if (state.gameMode !== "MINIGAME_ACTIVE") return state;
        return {
          ...state,
          gameMode: "STATION_ROAM",
          activeMinigame: emptyMinigameContainer(),
        };
      }

      case "docking_input": {
        if (
          state.gameMode !== "MINIGAME_ACTIVE" ||
          state.activeMinigame.type !== "DOCKING" ||
          !state.activeMinigame.docking
        ) {
          return state;
        }
        return {
          ...state,
          activeMinigame: {
            ...state.activeMinigame,
            docking: {
              ...state.activeMinigame.docking,
              thrustX: clamp(action.thrustX, -1, 1),
              thrustY: clamp(action.thrustY, -1, 1),
            },
          },
        };
      }

      case "solar_input": {
        if (
          state.gameMode !== "MINIGAME_ACTIVE" ||
          state.activeMinigame.type !== "SOLAR" ||
          !state.activeMinigame.solar
        ) {
          return state;
        }
        const nextSolar = applySolarWheelDelta(
          state.activeMinigame.solar,
          action.deltaAlphaDeg,
          action.deltaBetaDeg,
          action.dtS,
        );
        return {
          ...state,
          activeMinigame: {
            ...state.activeMinigame,
            solar: nextSolar,
          },
        };
      }

      case "ls_drag_filter": {
        if (
          state.gameMode !== "MINIGAME_ACTIVE" ||
          !state.activeMinigame.lifeSupport
        ) {
          return state;
        }
        const nextLs = updateLifeSupportFilters(
          state.activeMinigame.lifeSupport,
          action.target,
          action.x,
          action.y,
          action.released,
        );
        const updated: FlightState = {
          ...state,
          activeMinigame: {
            ...state.activeMinigame,
            lifeSupport: nextLs,
          },
        };
        if (nextLs.completed && state.activeMinigame.terminalId) {
          return applyMinigameVictory(updated, state.activeMinigame.terminalId);
        }
        return updated;
      }

      case "ls_rotate_ammonia": {
        if (
          state.gameMode !== "MINIGAME_ACTIVE" ||
          !state.activeMinigame.lifeSupport
        ) {
          return state;
        }
        const nextLs = rotateAmmoniaValve(state.activeMinigame.lifeSupport, action.deltaDeg);
        const updated: FlightState = {
          ...state,
          activeMinigame: {
            ...state.activeMinigame,
            lifeSupport: nextLs,
          },
        };
        if (nextLs.completed && state.activeMinigame.terminalId) {
          return applyMinigameVictory(updated, state.activeMinigame.terminalId);
        }
        return updated;
      }

      case "ls_hold_o2": {
        if (
          state.gameMode !== "MINIGAME_ACTIVE" ||
          !state.activeMinigame.lifeSupport
        ) {
          return state;
        }
        const nextLs = setO2ValveHeld(state.activeMinigame.lifeSupport, action.held);
        const updated: FlightState = {
          ...state,
          activeMinigame: {
            ...state.activeMinigame,
            lifeSupport: nextLs,
          },
        };
        if (nextLs.completed && state.activeMinigame.terminalId) {
          return applyMinigameVictory(updated, state.activeMinigame.terminalId);
        }
        return updated;
      }

      case "complete_minigame_debug": {
        if (state.gameMode === "MINIGAME_ACTIVE" && state.activeMinigame.terminalId) {
          return applyMinigameVictory(state, state.activeMinigame.terminalId);
        }
        const activeWarning = state.terminals.find(
          (t) => t.state === "WARNING" || t.state === "CRITICAL",
        );
        if (activeWarning) {
          return applyMinigameVictory(state, activeWarning.id);
        }
        return state;
      }

      case "complete_phase": {
        return {
          ...state,
          gameMode: state.gameMode === "GAME_OVER" ? "GAME_OVER" : "VICTORY",
          phaseDone: true,
        };
      }

      case "tick": {
        if (state.gameMode === "GAME_OVER" || state.gameMode === "VICTORY") {
          return state;
        }

        const dtS = clamp(action.dtS, 0, 0.25);
        if (dtS <= 0) return state;

        // 1. Оновлюємо фізику невагомості (восьмикутні стіни + круглі колони + капсули поручнів)
        const activeWalls = getActiveWalls(state.unlockedModuleIds, state.openedSeals);
        const activeHandles = getActiveHandles(state.unlockedModuleIds);
        const circleObstacles = getActiveCircleObstacles(state.unlockedModuleIds);
        const physOut = stepZeroGPhysics(
          state.astronaut,
          dtS,
          activeWalls,
          activeHandles,
          circleObstacles,
        );

        let screenShakePx = Math.max(0, state.screenShakePx - 18 * dtS);
        if (physOut.wallImpactSpeedPxS > 160) {
          const addShake =
            physOut.wallImpactSpeedPxS > PHYSICS_CONSTANTS.highSpeedStunThresholdPxS
              ? 14
              : (physOut.wallImpactSpeedPxS / 480) * 6;
          screenShakePx = Math.min(22, screenShakePx + addShake);
        }

        // 2. Оновлюємо FNAF-режисер криз і хвиль стикування
        const isCutscene = state.gameMode === "MODULE_EXPANSION_CUTSCENE";
        const dirOut = stepCrisisAndDockingDirector(
          {
            timeElapsedS: state.timeElapsedS,
            waveClockS: state.waveClockS,
            dockingWaveIndex: state.dockingWaveIndex,
            unlockedModuleIds: state.unlockedModuleIds,
            openedSeals: state.openedSeals,
            terminals: state.terminals,
            oxygenPct: state.oxygenPct,
            energyPct: state.energyPct,
            tempC: state.tempC,
            fuelLeftKg: state.fuelLeftKg,
            dvPenaltyMs: state.dvPenaltyMs,
            damage: state.damage,
            log: state.log,
            nextFailureSeq: state.nextFailureSeq,
            crisisMultiplier: state.crisisMultiplier,
            cutsceneTimerS: state.cutsceneTimerS,
            cutsceneTargetModuleId: state.cutsceneTargetModuleId,
          },
          dtS,
          isCutscene,
        );

        screenShakePx = Math.min(22, screenShakePx + dirOut.screenShakeAddPx);

        // Визначаємо поточний активний модуль космонавта для кімнатної камери (RoomCameraController)
        const activeModuleId = findModuleForPosition(
          physOut.astronaut.pos,
          dirOut.unlockedModuleIds,
          state.activeModuleId,
        );

        let gameMode: GameMode = state.gameMode;
        if (isCutscene && dirOut.cutsceneTimerS <= 0) {
          gameMode = "STATION_ROAM";
        }
        if (dirOut.triggeredGameOver) {
          gameMode = "GAME_OVER";
        }

        let rngState = state.rngState;
        let activeMinigame = state.activeMinigame;
        let energyPct = dirOut.energyPct;
        let log = dirOut.log;
        let nextFailureSeq = dirOut.nextFailureSeq;

        // 3. Якщо відкрита мінігра — оновлюємо математику активної мінігри
        let solvedTerminalId: string | null = null;
        if (gameMode === "MINIGAME_ACTIVE" && activeMinigame.terminalId) {
          if (activeMinigame.type === "DOCKING" && activeMinigame.docking) {
            const dockOut = stepDockingMinigame(
              activeMinigame.docking,
              dtS,
              rngState,
              dirOut.timeElapsedS,
            );
            rngState = dockOut.rngState;
            activeMinigame = {
              ...activeMinigame,
              docking: dockOut.minigame,
            };
            if (dockOut.collidedAtZeroZ) {
              energyPct = clamp(energyPct - 15, 0, 100);
              screenShakePx = Math.min(22, screenShakePx + 14);
              nextFailureSeq += 1;
              log = [
                ...log,
                {
                  id: `flight:docking-collision-${nextFailureSeq}`,
                  phase: "flight",
                  tS: Math.round(dirOut.timeElapsedS * 10) / 10,
                  kind: "failure",
                  system: "propulsion",
                  messageKey: "flight.failure.dockingCollision",
                  params: { terminalId: activeMinigame.terminalId ?? "DOCKING" },
                  causedBy: ["design:engine"],
                },
              ];
              if (energyPct <= 0) {
                gameMode = "GAME_OVER";
              }
            }
            if (dockOut.succeeded) {
              solvedTerminalId = activeMinigame.terminalId;
            }
          } else if (activeMinigame.type === "SOLAR" && activeMinigame.solar) {
            const solarOut = stepSolarMinigame(activeMinigame.solar, dtS);
            activeMinigame = {
              ...activeMinigame,
              solar: solarOut.minigame,
            };
            if (solarOut.succeeded) {
              solvedTerminalId = activeMinigame.terminalId;
            }
          } else if (activeMinigame.lifeSupport) {
            const lsOut = stepLifeSupportMinigame(activeMinigame.lifeSupport, dtS);
            activeMinigame = {
              ...activeMinigame,
              lifeSupport: lsOut.minigame,
            };
            if (lsOut.succeeded) {
              solvedTerminalId = activeMinigame.terminalId;
            }
          }
        }

        const achievedAltKm = recomputeAchievedAltKm(state.input, dirOut.dvPenaltyMs);

        const nextState: FlightState = {
          ...state,
          rngState,
          gameMode,
          timeElapsedS: dirOut.timeElapsedS,
          waveClockS: dirOut.waveClockS,
          dockingWaveIndex: dirOut.dockingWaveIndex,
          astronaut: physOut.astronaut,
          activeModuleId,
          unlockedModuleIds: dirOut.unlockedModuleIds,
          openedSeals: dirOut.openedSeals,
          terminals: dirOut.terminals,
          activeMinigame,
          oxygenPct: dirOut.oxygenPct,
          energyPct,
          tempC: dirOut.tempC,
          fuelLeftKg: dirOut.fuelLeftKg,
          dvPenaltyMs: dirOut.dvPenaltyMs,
          achievedAltKm,
          cutsceneTimerS: dirOut.cutsceneTimerS,
          cutsceneTargetModuleId: dirOut.cutsceneTargetModuleId,
          screenShakePx,
          damage: dirOut.damage,
          log,
          nextFailureSeq,
        };

        if (solvedTerminalId) {
          return applyMinigameVictory(nextState, solvedTerminalId);
        }

        return nextState;
      }
    }
  },

  isDone(state: FlightState): boolean {
    return state.phaseDone;
  },

  finish(state: FlightState): { result: FlightResult; log: CauseEntry[] } {
    const body = state.input.mission.body;
    const altKm = state.achievedAltKm;
    return {
      result: {
        orbit: {
          altKm,
          periodS: orbitalPeriodS(body, altKm),
          eclipseFraction: eclipseFraction(body, altKm),
        },
        fuelLeftKg: state.fuelLeftKg,
        damage: [...state.damage],
      },
      log: [...state.log],
    };
  },

  debugActions(state: FlightState): DebugAction<FlightAction>[] {
    const actions: DebugAction<FlightAction>[] = [
      {
        label: "+1с",
        group: "Час",
        action: { type: "tick", dtS: 1 },
      },
      {
        label: "+10с",
        group: "Час",
        action: { type: "tick", dtS: 10 },
      },
    ];

    for (const t of state.terminals) {
      if (state.unlockedModuleIds.includes(t.moduleId)) {
        actions.push({
          label: `Термінал: ${t.id} (${t.state})`,
          group: "Мініігри",
          action: { type: "open_terminal", terminalId: t.id },
        });
      }
    }

    if (
      state.gameMode === "MINIGAME_ACTIVE" ||
      state.terminals.some((t) => t.state === "WARNING" || t.state === "CRITICAL")
    ) {
      actions.push({
        label: "Полагодити активний термінал",
        group: "Мініігри",
        action: { type: "complete_minigame_debug" },
      });
    }

    actions.push({
      label: "Завершити політ і розгорнути супутник →",
      group: "Відділення",
      action: { type: "complete_phase" },
    });

    return actions;
  },
};
