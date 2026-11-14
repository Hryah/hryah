import cabinData from "../../data/flight-cabin.json";

export type AstronautState = "ANCHORED" | "FLYING" | "STUNNED";

export type GameMode =
  | "STATION_ROAM"
  | "MINIGAME_ACTIVE"
  | "MODULE_EXPANSION_CUTSCENE"
  | "GAME_OVER"
  | "VICTORY";

export type ModuleType = "HORIZONTAL" | "VERTICAL" | "INTERSECTION" | "COMMAND";

export type TerminalType = "DOCKING" | "SOLAR" | "OXYGEN" | "THERMAL";

export type TerminalStatus = "IDLE" | "WARNING" | "CRITICAL" | "COMPLETED";

export type DockingSealId = "EAST" | "NORTH" | "SOUTH";

export interface AstronautEntity {
  pos: { x: number; y: number };
  vel: { vx: number; vy: number };
  radius: number;
  angle: number;
  angularVel: number;

  state: AstronautState;
  anchoredHandleId: string | null;
  lastHandleId: string | null;
  ignoreHandleTimer: number;
  stunTimer: number;

  slingshot: {
    isDragging: boolean;
    dragStartScreen: { x: number; y: number };
    dragCurrentScreen: { x: number; y: number };
    launchVector: { vx: number; vy: number };
  };

  thrusterCharges: number;
  activeGrabHeld: boolean;
}

export interface WallSegment {
  id: string;
  moduleId: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  normal: { nx: number; ny: number };
  isDockingSeal: string | null;
}

export interface GrabHandle {
  id: string;
  moduleId: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  grabRadius: number;
  terminalId: string | null;
}

export interface TerminalNode {
  id: string;
  moduleId: string;
  handleId: string;
  type: TerminalType;
  pos: { x: number; y: number };
  state: TerminalStatus;
  urgencyTimer: number;
  maxUrgencyTimer: number;
  labelKey: string;
  causedBy: string;
  unlocksSeal: string | null;
  unlocksModuleId: string | null;
}

export interface StationModuleBlueprint {
  id: string;
  type: ModuleType;
  labelKey: string;
  unlockedAtStart: boolean;
  requiredSeal: string | null;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  cameraCenter: { x: number; y: number };
  portholes: { x: number; y: number; radius: number }[];
  obstacles: { id: string; minX: number; minY: number; maxX: number; maxY: number }[];
}

export const PHYSICS_CONSTANTS = cabinData.physics;
export const WAVE_TIMINGS = cabinData.waves;

export const STATION_MODULES: readonly StationModuleBlueprint[] = cabinData.modules.map((m) => ({
  id: m.id,
  type: m.type as ModuleType,
  labelKey: m.labelKey,
  unlockedAtStart: m.unlockedAtStart,
  requiredSeal: ("requiredSeal" in m && typeof m.requiredSeal === "string") ? m.requiredSeal : null,
  bounds: { ...m.bounds },
  cameraCenter: { ...m.cameraCenter },
  portholes: m.portholes.map((p) => ({ ...p })),
  obstacles: m.obstacles.map((o) => ({ ...o })),
}));

export const ALL_WALL_SEGMENTS: readonly WallSegment[] = cabinData.walls.map((w) => ({
  id: w.id,
  moduleId: w.moduleId,
  ax: w.ax,
  ay: w.ay,
  bx: w.bx,
  by: w.by,
  normal: { nx: w.normal.nx, ny: w.normal.ny },
  isDockingSeal: w.isDockingSeal,
}));

export const ALL_GRAB_HANDLES: readonly GrabHandle[] = cabinData.handles.map((h) => ({
  id: h.id,
  moduleId: h.moduleId,
  ax: h.ax,
  ay: h.ay,
  bx: h.bx,
  by: h.by,
  grabRadius: h.grabRadius,
  terminalId: h.terminalId,
}));

export function createInitialTerminals(crisisMultiplier: number): TerminalNode[] {
  return cabinData.terminals.map((t) => {
    const scaledUrgency = Math.max(22, Math.round(t.baseUrgencyS / Math.max(0.75, crisisMultiplier)));
    return {
      id: t.id,
      moduleId: t.moduleId,
      handleId: t.handleId,
      type: t.type as TerminalType,
      pos: { x: t.pos.x, y: t.pos.y },
      state: "IDLE",
      urgencyTimer: scaledUrgency,
      maxUrgencyTimer: scaledUrgency,
      labelKey: t.labelKey,
      causedBy: t.causedBy,
      unlocksSeal: ("unlocksSeal" in t && typeof t.unlocksSeal === "string") ? t.unlocksSeal : null,
      unlocksModuleId: ("unlocksModuleId" in t && typeof t.unlocksModuleId === "string") ? t.unlocksModuleId : null,
    };
  });
}

export function getActiveWalls(unlockedModuleIds: readonly string[], openedSeals: readonly string[]): WallSegment[] {
  return ALL_WALL_SEGMENTS.filter((w) => {
    if (!unlockedModuleIds.includes(w.moduleId)) return false;
    if (w.isDockingSeal !== null && openedSeals.includes(w.isDockingSeal)) return false;
    return true;
  });
}

export function getActiveHandles(unlockedModuleIds: readonly string[]): GrabHandle[] {
  return ALL_GRAB_HANDLES.filter((h) => unlockedModuleIds.includes(h.moduleId));
}

export function getHandleMidpoint(handle: GrabHandle): { x: number; y: number } {
  return {
    x: (handle.ax + handle.bx) * 0.5,
    y: (handle.ay + handle.by) * 0.5,
  };
}
