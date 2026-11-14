import cabinData from "../../data/flight-cabin.json";

export type AstronautState = "ANCHORED" | "FLYING" | "STUNNED";

export type GameMode =
  | "STATION_ROAM"
  | "MINIGAME_ACTIVE"
  | "MODULE_EXPANSION_CUTSCENE"
  | "GAME_OVER"
  | "VICTORY";

export type ModuleOrientation = "HORIZONTAL" | "VERTICAL" | "INTERSECTION";

export type TerminalType = "DOCKING" | "SOLAR" | "OXYGEN" | "THERMAL";

export type TerminalStatus = "IDLE" | "WARNING" | "CRITICAL" | "COMPLETED";

export interface ChamferShape {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface HandleBlueprint {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  grabRadius: number;
  visualStyle: "WALL_RAIL" | "CORNER_45" | "CENTER_RING";
  colorTheme?: string;
}

export interface ComputerBlueprint {
  id: string;
  type: TerminalType;
  linkedHandleId: string;
  mountPosition: { x: number; y: number };
  mountAngle: number;
  causedBy: string;
  baseUrgencyS: number;
  unlocksSeal: string | null;
  unlocksModuleId: string | null;
  visualPreset: {
    chassisWidth: number;
    chassisHeight: number;
    screenColor: string;
    hasAntenna?: boolean;
    hasCoolingPipes?: boolean;
    hasRadarDish?: boolean;
  };
}

export interface ObstacleBlueprint {
  id: string;
  kind: "PILLAR_CIRCLE" | "CARGO_BOX" | "AIR_LEAK_JET";
  pos: { x: number; y: number };
  radiusOrSize: { w: number; h: number };
  bounciness: number;
}

export interface DoorwayBlueprint {
  id: string;
  side: "LEFT" | "RIGHT" | "TOP" | "BOTTOM";
  offset: number;
  width: number;
  connectsToModuleId: string;
  unlockedAtDockingWave: 0 | 1 | 2 | 3;
}

export interface ModuleBlueprint {
  id: string;
  title: string;
  orientation: ModuleOrientation;
  unlockedAtWave: 0 | 1 | 2 | 3;
  worldPos: { x: number; y: number };
  size: { width: number; height: number };
  chamfer: ChamferShape;
  theme: {
    floorColor: string;
    wallThickness: number;
    gridPattern: "HEX" | "PANELS" | "TECH_RIBS";
    portholes: Array<{ x: number; y: number; r: number }>;
  };
  doors: DoorwayBlueprint[];
  handles: HandleBlueprint[];
  computers: ComputerBlueprint[];
  obstacles: ObstacleBlueprint[];
}

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
  bounciness: number;
}

export interface CircleObstacleWorld {
  id: string;
  moduleId: string;
  wx: number;
  wy: number;
  radius: number;
  bounciness: number;
}

export interface GrabHandle {
  id: string;
  moduleId: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  grabRadius: number;
  visualStyle: "WALL_RAIL" | "CORNER_45" | "CENTER_RING";
  colorTheme: string;
  terminalId: string | null;
}

export interface TerminalNode {
  id: string;
  moduleId: string;
  handleId: string;
  type: TerminalType;
  pos: { x: number; y: number };
  mountAngle: number;
  state: TerminalStatus;
  urgencyTimer: number;
  maxUrgencyTimer: number;
  causedBy: string;
  unlocksSeal: string | null;
  unlocksModuleId: string | null;
  visualPreset: ComputerBlueprint["visualPreset"];
}

export const PHYSICS_CONSTANTS = cabinData.physics;
export const WAVE_TIMINGS = cabinData.waves;

export const STATION_LEVEL_CONFIG: readonly ModuleBlueprint[] = cabinData.levelConfig.map((m) => ({
  id: m.id,
  title: m.title,
  orientation: m.orientation as ModuleOrientation,
  unlockedAtWave: m.unlockedAtWave as 0 | 1 | 2 | 3,
  worldPos: { x: m.worldPos.x, y: m.worldPos.y },
  size: { width: m.size.width, height: m.size.height },
  chamfer: { ...m.chamfer },
  theme: {
    floorColor: m.theme.floorColor,
    wallThickness: m.theme.wallThickness,
    gridPattern: m.theme.gridPattern as "HEX" | "PANELS" | "TECH_RIBS",
    portholes: m.theme.portholes.map((p) => ({ ...p })),
  },
  doors: m.doors.map((d) => ({
    id: d.id,
    side: d.side as "LEFT" | "RIGHT" | "TOP" | "BOTTOM",
    offset: d.offset,
    width: d.width,
    connectsToModuleId: d.connectsToModuleId,
    unlockedAtDockingWave: d.unlockedAtDockingWave as 0 | 1 | 2 | 3,
  })),
  obstacles: m.obstacles.map((o) => ({
    id: o.id,
    kind: o.kind as "PILLAR_CIRCLE" | "CARGO_BOX" | "AIR_LEAK_JET",
    pos: { x: o.pos.x, y: o.pos.y },
    radiusOrSize: { w: o.radiusOrSize.w, h: o.radiusOrSize.h },
    bounciness: o.bounciness,
  })),
  handles: m.handles.map((h) => ({
    id: h.id,
    start: { x: h.start.x, y: h.start.y },
    end: { x: h.end.x, y: h.end.y },
    grabRadius: h.grabRadius,
    visualStyle: h.visualStyle as "WALL_RAIL" | "CORNER_45" | "CENTER_RING",
    colorTheme: h.colorTheme,
  })),
  computers: m.computers.map((c) => ({
    id: c.id,
    type: c.type as TerminalType,
    linkedHandleId: c.linkedHandleId,
    mountPosition: { x: c.mountPosition.x, y: c.mountPosition.y },
    mountAngle: c.mountAngle,
    causedBy: c.causedBy,
    baseUrgencyS: c.baseUrgencyS,
    unlocksSeal: ("unlocksSeal" in c && typeof c.unlocksSeal === "string") ? c.unlocksSeal : null,
    unlocksModuleId:
      ("unlocksModuleId" in c && typeof c.unlocksModuleId === "string") ? c.unlocksModuleId : null,
    visualPreset: { ...c.visualPreset },
  })),
}));

/**
 * Конвертує всі ручки рівня у світові координати (World Space).
 */
export const ALL_GRAB_HANDLES: readonly GrabHandle[] = STATION_LEVEL_CONFIG.flatMap((mod) =>
  mod.handles.map((h) => {
    const linkedComp = mod.computers.find((c) => c.linkedHandleId === h.id);
    return {
      id: h.id,
      moduleId: mod.id,
      ax: mod.worldPos.x + h.start.x,
      ay: mod.worldPos.y + h.start.y,
      bx: mod.worldPos.x + h.end.x,
      by: mod.worldPos.y + h.end.y,
      grabRadius: h.grabRadius,
      visualStyle: h.visualStyle,
      colorTheme: h.colorTheme ?? "#ef4444",
      terminalId: linkedComp ? linkedComp.id : null,
    };
  }),
);

/**
 * Повертає 8 вершин восьмикутника модуля у світових координатах з урахуванням chamfer.
 */
export function getModuleOctagonPolygon(mod: ModuleBlueprint): Array<{ x: number; y: number }> {
  const wx = mod.worldPos.x;
  const wy = mod.worldPos.y;
  const w = mod.size.width;
  const h = mod.size.height;
  const c = mod.chamfer;

  return [
    { x: wx + c.topLeft, y: wy },
    { x: wx + w - c.topRight, y: wy },
    { x: wx + w, y: wy + c.topRight },
    { x: wx + w, y: wy + h - c.bottomRight },
    { x: wx + w - c.bottomRight, y: wy + h },
    { x: wx + c.bottomLeft, y: wy + h },
    { x: wx, y: wy + h - c.bottomLeft },
    { x: wx, y: wy + c.topLeft },
  ];
}

/**
 * Генератор восьмикутних стін модуля (buildOctagonWallsFromChamfer):
 * будує 8 відрізків стін з урахуванням chamfer і автоматично вирізає отвори під doors.
 */
export function buildOctagonWallsFromChamfer(
  mod: ModuleBlueprint,
  completedDockings: number,
): WallSegment[] {
  const wx = mod.worldPos.x;
  const wy = mod.worldPos.y;
  const w = mod.size.width;
  const h = mod.size.height;
  const c = mod.chamfer;
  const e = PHYSICS_CONSTANTS.wallRestitution;
  const segments: WallSegment[] = [];

  const addSideWithDoors = (
    side: "TOP" | "BOTTOM" | "LEFT" | "RIGHT",
    fixedCoord: number,
    rangeMin: number,
    rangeMax: number,
    normal: { nx: number; ny: number },
  ) => {
    const sideDoors = mod.doors
      .filter((d) => d.side === side)
      .sort((a, b) => a.offset - b.offset);

    let cursor = rangeMin;
    for (const door of sideDoors) {
      const dStart = Math.max(rangeMin, door.offset - door.width * 0.5);
      const dEnd = Math.min(rangeMax, door.offset + door.width * 0.5);

      if (dStart > cursor + 1) {
        if (side === "TOP" || side === "BOTTOM") {
          segments.push({
            id: `${mod.id}_${side}_${cursor}`,
            moduleId: mod.id,
            ax: wx + cursor,
            ay: fixedCoord,
            bx: wx + dStart,
            by: fixedCoord,
            normal,
            isDockingSeal: null,
            bounciness: e,
          });
        } else {
          segments.push({
            id: `${mod.id}_${side}_${cursor}`,
            moduleId: mod.id,
            ax: fixedCoord,
            ay: wy + cursor,
            bx: fixedCoord,
            by: wy + dStart,
            normal,
            isDockingSeal: null,
            bounciness: e,
          });
        }
      }

      // Якщо шлюз ще не відкритий стикуванням — ставимо броньовану перегородку шлюзу
      if (door.unlockedAtDockingWave > completedDockings) {
        if (side === "TOP" || side === "BOTTOM") {
          segments.push({
            id: `${mod.id}_door_${door.id}`,
            moduleId: mod.id,
            ax: wx + dStart,
            ay: fixedCoord,
            bx: wx + dEnd,
            by: fixedCoord,
            normal,
            isDockingSeal: door.id,
            bounciness: e,
          });
        } else {
          segments.push({
            id: `${mod.id}_door_${door.id}`,
            moduleId: mod.id,
            ax: fixedCoord,
            ay: wy + dStart,
            bx: fixedCoord,
            by: wy + dEnd,
            normal,
            isDockingSeal: door.id,
            bounciness: e,
          });
        }
      }

      cursor = Math.max(cursor, dEnd);
    }

    if (rangeMax > cursor + 1) {
      if (side === "TOP" || side === "BOTTOM") {
        segments.push({
          id: `${mod.id}_${side}_end`,
          moduleId: mod.id,
          ax: wx + cursor,
          ay: fixedCoord,
          bx: wx + rangeMax,
          by: fixedCoord,
          normal,
          isDockingSeal: null,
          bounciness: e,
        });
      } else {
        segments.push({
          id: `${mod.id}_${side}_end`,
          moduleId: mod.id,
          ax: fixedCoord,
          ay: wy + cursor,
          bx: fixedCoord,
          by: wy + rangeMax,
          normal,
          isDockingSeal: null,
          bounciness: e,
        });
      }
    }
  };

  // 4 прямі стіни з вирізами під двері
  addSideWithDoors("TOP", wy, c.topLeft, w - c.topRight, { nx: 0, ny: 1 });
  addSideWithDoors("BOTTOM", wy + h, c.bottomLeft, w - c.bottomRight, { nx: 0, ny: -1 });
  addSideWithDoors("LEFT", wx, c.topLeft, h - c.bottomLeft, { nx: 1, ny: 0 });
  addSideWithDoors("RIGHT", wx + w, c.topRight, h - c.bottomRight, { nx: -1, ny: 0 });

  // 4 скошені кути восьмикутника (chamfer)
  const invSqrt2 = 0.70710678;
  if (c.topLeft > 0) {
    segments.push({
      id: `${mod.id}_chamfer_tl`,
      moduleId: mod.id,
      ax: wx,
      ay: wy + c.topLeft,
      bx: wx + c.topLeft,
      by: wy,
      normal: { nx: invSqrt2, ny: invSqrt2 },
      isDockingSeal: null,
      bounciness: e,
    });
  }
  if (c.topRight > 0) {
    segments.push({
      id: `${mod.id}_chamfer_tr`,
      moduleId: mod.id,
      ax: wx + w - c.topRight,
      ay: wy,
      bx: wx + w,
      by: wy + c.topRight,
      normal: { nx: -invSqrt2, ny: invSqrt2 },
      isDockingSeal: null,
      bounciness: e,
    });
  }
  if (c.bottomRight > 0) {
    segments.push({
      id: `${mod.id}_chamfer_br`,
      moduleId: mod.id,
      ax: wx + w,
      ay: wy + h - c.bottomRight,
      bx: wx + w - c.bottomRight,
      by: wy + h,
      normal: { nx: -invSqrt2, ny: -invSqrt2 },
      isDockingSeal: null,
      bounciness: e,
    });
  }
  if (c.bottomLeft > 0) {
    segments.push({
      id: `${mod.id}_chamfer_bl`,
      moduleId: mod.id,
      ax: wx + c.bottomLeft,
      ay: wy + h,
      bx: wx,
      by: wy + h - c.bottomLeft,
      normal: { nx: invSqrt2, ny: -invSqrt2 },
      isDockingSeal: null,
      bounciness: e,
    });
  }

  // Стіни прямокутних перешкод CARGO_BOX всередині модуля
  for (const obs of mod.obstacles) {
    if (obs.kind === "CARGO_BOX") {
      const ox = wx + obs.pos.x - obs.radiusOrSize.w * 0.5;
      const oy = wy + obs.pos.y - obs.radiusOrSize.h * 0.5;
      const ow = obs.radiusOrSize.w;
      const oh = obs.radiusOrSize.h;
      segments.push(
        {
          id: `${mod.id}_${obs.id}_top`,
          moduleId: mod.id,
          ax: ox,
          ay: oy,
          bx: ox + ow,
          by: oy,
          normal: { nx: 0, ny: -1 },
          isDockingSeal: null,
          bounciness: obs.bounciness,
        },
        {
          id: `${mod.id}_${obs.id}_bot`,
          moduleId: mod.id,
          ax: ox,
          ay: oy + oh,
          bx: ox + ow,
          by: oy + oh,
          normal: { nx: 0, ny: 1 },
          isDockingSeal: null,
          bounciness: obs.bounciness,
        },
        {
          id: `${mod.id}_${obs.id}_left`,
          moduleId: mod.id,
          ax: ox,
          ay: oy,
          bx: ox,
          by: oy + oh,
          normal: { nx: -1, ny: 0 },
          isDockingSeal: null,
          bounciness: obs.bounciness,
        },
        {
          id: `${mod.id}_${obs.id}_right`,
          moduleId: mod.id,
          ax: ox + ow,
          ay: oy,
          bx: ox + ow,
          by: oy + oh,
          normal: { nx: 1, ny: 0 },
          isDockingSeal: null,
          bounciness: obs.bounciness,
        },
      );
    }
  }

  return segments;
}

export function createInitialTerminals(crisisMultiplier: number): TerminalNode[] {
  return STATION_LEVEL_CONFIG.flatMap((mod) =>
    mod.computers.map((c) => {
      const scaledUrgency = Math.max(
        22,
        Math.round(c.baseUrgencyS / Math.max(0.75, crisisMultiplier)),
      );
      return {
        id: c.id,
        moduleId: mod.id,
        handleId: c.linkedHandleId,
        type: c.type,
        pos: {
          x: mod.worldPos.x + c.mountPosition.x,
          y: mod.worldPos.y + c.mountPosition.y,
        },
        mountAngle: c.mountAngle,
        state: "IDLE",
        urgencyTimer: scaledUrgency,
        maxUrgencyTimer: scaledUrgency,
        causedBy: c.causedBy,
        unlocksSeal: c.unlocksSeal,
        unlocksModuleId: c.unlocksModuleId,
        visualPreset: { ...c.visualPreset },
      };
    }),
  );
}

export function getActiveWalls(
  unlockedModuleIds: readonly string[],
  openedSeals: readonly string[],
): WallSegment[] {
  const completedDockings = openedSeals.length;
  return STATION_LEVEL_CONFIG.filter((m) => unlockedModuleIds.includes(m.id)).flatMap((m) =>
    buildOctagonWallsFromChamfer(m, completedDockings),
  );
}

export function getActiveCircleObstacles(
  unlockedModuleIds: readonly string[],
): CircleObstacleWorld[] {
  return STATION_LEVEL_CONFIG.filter((m) => unlockedModuleIds.includes(m.id)).flatMap((m) =>
    m.obstacles
      .filter((o) => o.kind === "PILLAR_CIRCLE")
      .map((o) => ({
        id: o.id,
        moduleId: m.id,
        wx: m.worldPos.x + o.pos.x,
        wy: m.worldPos.y + o.pos.y,
        radius: o.radiusOrSize.w,
        bounciness: o.bounciness,
      })),
  );
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

/**
 * Визначає, в якому модулі зараз перебуває точка (космонавт) для кімнатної камери.
 */
export function findModuleForPosition(
  pos: { x: number; y: number },
  unlockedModuleIds: readonly string[],
  currentModuleId: string,
): string {
  for (const mod of STATION_LEVEL_CONFIG) {
    if (!unlockedModuleIds.includes(mod.id)) continue;
    const minX = mod.worldPos.x;
    const maxX = mod.worldPos.x + mod.size.width;
    const minY = mod.worldPos.y;
    const maxY = mod.worldPos.y + mod.size.height;
    if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
      return mod.id;
    }
  }
  return currentModuleId;
}
