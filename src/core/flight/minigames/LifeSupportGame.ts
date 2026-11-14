import { clamp } from "../ZeroGPhysics";

export interface LifeSupportMinigameState {
  terminalId: string;
  // Крок 1: Заміна картриджа CO2-фільтра
  redFilterPos: { x: number; y: number };
  redFilterTrashed: boolean;
  greenFilterPos: { x: number; y: number };
  greenFilterInstalled: boolean;
  // Крок 2: Поворот вентиля скидання аміаку на 360 градусів
  ammoniaValveDeg: number;
  ammoniaFlushed: boolean;
  // Крок 3: Нагнітання O2 у зелений сектор (70-85 кПа), скидання при >90 кПа
  o2ValveHeld: boolean;
  pressureKpa: number;
  pressureVelKpaS: number;
  pressureLocked: boolean;
  reliefValvePoppedTimerS: number;
  completed: boolean;
}

// Координати у локальному просторі щита (800x520)
export const LS_SLOT_POS = { x: 205, y: 215 };
export const LS_TRASH_POS = { x: 205, y: 405 };
export const LS_GREEN_START_POS = { x: 85, y: 215 };
export const LS_AMMONIA_VALVE_POS = { x: 425, y: 270 };
export const LS_MANOMETER_POS = { x: 645, y: 215 };
export const LS_O2_BUTTON_POS = { x: 645, y: 395 };

export function createLifeSupportMinigame(terminalId: string): LifeSupportMinigameState {
  return {
    terminalId,
    redFilterPos: { ...LS_SLOT_POS },
    redFilterTrashed: false,
    greenFilterPos: { ...LS_GREEN_START_POS },
    greenFilterInstalled: false,
    ammoniaValveDeg: 0,
    ammoniaFlushed: false,
    o2ValveHeld: false,
    pressureKpa: 18,
    pressureVelKpaS: 0,
    pressureLocked: false,
    reliefValvePoppedTimerS: 0,
    completed: false,
  };
}

export function updateLifeSupportFilters(
  mg: LifeSupportMinigameState,
  target: "RED" | "GREEN",
  x: number,
  y: number,
  released: boolean,
): LifeSupportMinigameState {
  if (mg.completed) return mg;

  if (target === "RED" && !mg.redFilterTrashed) {
    const pos = { x: clamp(x, 40, 360), y: clamp(y, 90, 460) };
    const distToTrash = Math.hypot(pos.x - LS_TRASH_POS.x, pos.y - LS_TRASH_POS.y);
    if (distToTrash <= 54) {
      return {
        ...mg,
        redFilterPos: { ...LS_TRASH_POS },
        redFilterTrashed: true,
      };
    }
    return {
      ...mg,
      redFilterPos: released ? { ...LS_SLOT_POS } : pos,
    };
  }

  if (target === "GREEN" && mg.redFilterTrashed && !mg.greenFilterInstalled) {
    const pos = { x: clamp(x, 40, 360), y: clamp(y, 90, 460) };
    const distToSlot = Math.hypot(pos.x - LS_SLOT_POS.x, pos.y - LS_SLOT_POS.y);
    if (distToSlot <= 52) {
      const greenFilterInstalled = true;
      const completed = greenFilterInstalled && mg.ammoniaFlushed && mg.pressureLocked;
      return {
        ...mg,
        greenFilterPos: { ...LS_SLOT_POS },
        greenFilterInstalled,
        completed,
      };
    }
    return {
      ...mg,
      greenFilterPos: released ? { ...LS_GREEN_START_POS } : pos,
    };
  }

  return mg;
}

export function rotateAmmoniaValve(
  mg: LifeSupportMinigameState,
  deltaDeg: number,
): LifeSupportMinigameState {
  if (mg.completed || mg.ammoniaFlushed) return mg;
  const ammoniaValveDeg = clamp(mg.ammoniaValveDeg + Math.abs(deltaDeg), 0, 360);
  const ammoniaFlushed = ammoniaValveDeg >= 360;
  const completed = mg.greenFilterInstalled && ammoniaFlushed && mg.pressureLocked;
  return {
    ...mg,
    ammoniaValveDeg,
    ammoniaFlushed,
    completed,
  };
}

export function setO2ValveHeld(
  mg: LifeSupportMinigameState,
  held: boolean,
): LifeSupportMinigameState {
  if (mg.completed) return mg;

  // Коли гравець відпускає клапан — перевіряємо, чи стрілка у зеленому секторі (70–85 кПа)
  if (mg.o2ValveHeld && !held) {
    const inGreenZone = mg.pressureKpa >= 70 && mg.pressureKpa <= 85;
    const pressureLocked = inGreenZone && mg.greenFilterInstalled && mg.ammoniaFlushed;
    const completed = mg.greenFilterInstalled && mg.ammoniaFlushed && pressureLocked;
    return {
      ...mg,
      o2ValveHeld: false,
      pressureVelKpaS: 0,
      pressureLocked,
      completed,
    };
  }

  if (held && mg.reliefValvePoppedTimerS <= 0 && !mg.pressureLocked) {
    return {
      ...mg,
      o2ValveHeld: true,
    };
  }

  return mg;
}

export function stepLifeSupportMinigame(
  mg: LifeSupportMinigameState,
  dtS: number,
): { minigame: LifeSupportMinigameState; succeeded: boolean } {
  if (mg.completed || dtS <= 0) {
    return { minigame: mg, succeeded: mg.completed };
  }

  let reliefValvePoppedTimerS = Math.max(0, mg.reliefValvePoppedTimerS - dtS);
  let o2ValveHeld = mg.o2ValveHeld;
  let pressureKpa = mg.pressureKpa;
  let pressureVelKpaS = mg.pressureVelKpaS;
  let pressureLocked = mg.pressureLocked;

  if (pressureLocked) {
    o2ValveHeld = false;
    pressureVelKpaS = 0;
  } else if (o2ValveHeld && reliefValvePoppedTimerS <= 0) {
    // Стрілка манометра летить вгору з прискоренням
    pressureVelKpaS = clamp(pressureVelKpaS + 68 * dtS, 18, 130);
    pressureKpa += pressureVelKpaS * dtS;

    // Якщо перетримати (>90 кПа) — спрацьовує запобіжний клапан і тиск падає в нуль
    if (pressureKpa > 90) {
      pressureKpa = 0;
      pressureVelKpaS = 0;
      o2ValveHeld = false;
      reliefValvePoppedTimerS = 1.1;
    }
  } else {
    // Повільне стравлювання тиску, якщо клапан відпущено поза зеленою зоною
    pressureVelKpaS = 0;
    if (pressureKpa > 15) {
      pressureKpa = Math.max(15, pressureKpa - 14 * dtS);
    }
  }

  const completed = mg.greenFilterInstalled && mg.ammoniaFlushed && pressureLocked;

  return {
    minigame: {
      ...mg,
      o2ValveHeld,
      pressureKpa,
      pressureVelKpaS,
      pressureLocked,
      reliefValvePoppedTimerS,
      completed,
    },
    succeeded: completed,
  };
}
