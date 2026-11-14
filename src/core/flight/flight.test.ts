import { describe, expect, it } from "vitest";
import type { FlightInput } from "../contracts";
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION, stubDesign } from "../stubs";
import {
  ALL_GRAB_HANDLES,
  buildOctagonWallsFromChamfer,
  computeBallisticTrajectoryWithBounces,
  computeSlingshotLaunch,
  computeTrajectoryPreview,
  flightPhase,
  type FlightState,
  getActiveCircleObstacles,
  getActiveHandles,
  getActiveWalls,
  LS_SLOT_POS,
  LS_TRASH_POS,
  STATION_LEVEL_CONFIG,
  stepZeroGPhysics,
} from "./index";

function makeInput(overrides?: Partial<typeof SAMPLE_DESIGN>): FlightInput {
  const design = { ...SAMPLE_DESIGN, ...overrides };
  const d = stubDesign({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, design);
  return {
    mission: SAMPLE_MISSION,
    spec: d.result,
    log: d.log,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("flightPhase — RoomCamera, Octagon LevelBlueprint & 2D Zero-G Platformer", () => {
  it("не мутує вхідний стан і стан повністю серіалізується в JSON без undefined", () => {
    const input = makeInput();
    const s0 = deepFreeze(flightPhase.init(input, 42));
    expect(JSON.parse(JSON.stringify(s0))).toEqual(s0);
    expect(s0.activeModuleId).toBe("MOD_HABITAT");

    const s1 = deepFreeze(
      flightPhase.step(s0, { type: "slingshot_start", screenX: 400, screenY: 300 }),
    );
    const s2 = deepFreeze(
      flightPhase.step(s1, { type: "slingshot_move", screenX: 260, screenY: 300 }),
    );
    const s3 = deepFreeze(flightPhase.step(s2, { type: "slingshot_release" }));
    const s4 = deepFreeze(flightPhase.step(s3, { type: "tick", dtS: 0.25 }));

    expect(JSON.parse(JSON.stringify(s4))).toEqual(s4);
    expect(s4.astronaut.pos.x).toBeGreaterThan(s0.astronaut.pos.x);
  });

  it("детермінована за сідом", () => {
    const input = makeInput();
    const run = (seed: number) => {
      let s = flightPhase.init(input, seed);
      s = flightPhase.step(s, { type: "open_terminal", terminalId: "DOCKING_1" });
      for (let i = 0; i < 8; i++) {
        s = flightPhase.step(s, { type: "tick", dtS: 0.5 });
      }
      return s;
    };
    expect(run(19)).toEqual(run(19));
  });

  it("генератор восьмикутних стін buildOctagonWallsFromChamfer вирізає двері-шлюзи та закриває заблоковані порти", () => {
    const hub = STATION_LEVEL_CONFIG.find((m) => m.id === "MOD_INTERSECTION")!;
    const wallsWave0 = buildOctagonWallsFromChamfer(hub, 0);
    const sealsWave0 = wallsWave0.filter((w) => w.isDockingSeal !== null);
    // У хабі 3 закритих шлюзи на старті (NORTH, EAST, SOUTH), а LEFT до MOD_HABITAT відкритий
    expect(sealsWave0).toHaveLength(3);

    const wallsWave3 = buildOctagonWallsFromChamfer(hub, 3);
    const sealsWave3 = wallsWave3.filter((w) => w.isDockingSeal !== null);
    expect(sealsWave3).toHaveLength(0);
  });

  it("перехід між модулями через шлюз змінює activeModuleId без втрати вектора швидкості", () => {
    const input = makeInput();
    let state = flightPhase.init(input, 1);
    expect(state.activeModuleId).toBe("MOD_HABITAT");

    // Розміщуємо космонавта перед відкритим шлюзом DOOR_TO_HUB (x = 920, y = 240) зі швидкістю вправо
    state = {
      ...state,
      astronaut: {
        ...state.astronaut,
        pos: { x: 890, y: 240 },
        vel: { vx: 400, vy: 0 },
        state: "FLYING",
        anchoredHandleId: null,
      },
    };

    state = flightPhase.step(state, { type: "tick", dtS: 0.15 });
    expect(state.astronaut.pos.x).toBeGreaterThan(920);
    expect(state.activeModuleId).toBe("MOD_INTERSECTION");
    expect(state.astronaut.vel.vx).toBeGreaterThan(350);
  });

  it("математика рогатки: L_max = 180px, V_max = 650px/s, степінь 1.2 та 10 точок траєкторії", () => {
    const fullPull = computeSlingshotLaunch({ x: 300, y: 300 }, { x: 100, y: 300 });
    expect(Math.round(fullPull.vx)).toBe(650);
    expect(fullPull.vy).toBe(0);
    expect(fullPull.pullRatio).toBe(1);

    const halfPull = computeSlingshotLaunch({ x: 300, y: 300 }, { x: 210, y: 300 });
    const expectedHalf = Math.pow(0.5, 1.2) * 650;
    expect(halfPull.vx).toBeCloseTo(expectedHalf, 2);

    const preview = computeTrajectoryPreview({ x: 0, y: 0 }, { vx: 500, vy: 0 });
    expect(preview).toHaveLength(10);
    expect(preview[0]).toEqual({ x: 20, y: 0 });
    expect(preview[9]).toEqual({ x: 200, y: 0 });
  });

  it("фізика польоту: удар об стіну на швидкості > 480 px/s викликає STUNNED на 0.8с та пружний рикошет", () => {
    const input = makeInput();
    const s0 = flightPhase.init(input, 1);
    const activeWalls = getActiveWalls(s0.unlockedModuleIds, s0.openedSeals);
    const circleObs = getActiveCircleObstacles(s0.unlockedModuleIds);

    // Запускаємо космонавта прямо в ліву стіну MOD_HABITAT (x = 0) зі швидкістю 600 px/s
    const fastAstro = {
      ...s0.astronaut,
      pos: { x: 45, y: 240 },
      vel: { vx: -600, vy: 0 },
      state: "FLYING" as const,
      anchoredHandleId: null,
    };

    const out = stepZeroGPhysics(fastAstro, 0.1, activeWalls, [], circleObs);
    expect(out.wallImpactSpeedPxS).toBeGreaterThan(480);
    expect(out.astronaut.state).toBe("STUNNED");
    expect(out.astronaut.stunTimer).toBeGreaterThan(0.7);
    expect(out.astronaut.vel.vx).toBeGreaterThan(0);
  });

  it("захват ручок-капсуль: безпечний захват <= 420 px/s, зрив > 550 px/s без Space, успішний захват із Space", () => {
    const input = makeInput();
    const s0 = flightPhase.init(input, 1);
    const targetHandle = ALL_GRAB_HANDLES.find((h) => h.id === "H_TOP_1")!;
    const hx = (targetHandle.ax + targetHandle.bx) * 0.5;
    const hy = targetHandle.ay;

    const slowAstro = {
      ...s0.astronaut,
      pos: { x: hx - 20, y: hy },
      vel: { vx: 300, vy: 0 },
      state: "FLYING" as const,
      anchoredHandleId: null,
      activeGrabHeld: false,
    };
    const slowOut = stepZeroGPhysics(slowAstro, 0.08, [], [targetHandle]);
    expect(slowOut.astronaut.state).toBe("ANCHORED");
    expect(slowOut.astronaut.anchoredHandleId).toBe(targetHandle.id);

    const fastNoGrab = {
      ...s0.astronaut,
      pos: { x: hx - 20, y: hy },
      vel: { vx: 600, vy: 0 },
      state: "FLYING" as const,
      anchoredHandleId: null,
      activeGrabHeld: false,
    };
    const slipOut = stepZeroGPhysics(fastNoGrab, 0.05, [], [targetHandle]);
    expect(slipOut.astronaut.state).toBe("FLYING");
    expect(slipOut.slippedHandleId).toBe(targetHandle.id);
    expect(slipOut.astronaut.vel.vx).toBeLessThan(600 * 0.75);

    const fastWithGrab = {
      ...fastNoGrab,
      activeGrabHeld: true,
    };
    const grabOut = stepZeroGPhysics(fastWithGrab, 0.05, [], [targetHandle]);
    expect(grabOut.astronaut.state).toBe("ANCHORED");
    expect(grabOut.astronaut.anchoredHandleId).toBe(targetHandle.id);
  });

  it("FNAF-інваріант: відкриття мінігри НЕ ставить симуляцію станції на паузу", () => {
    const input = makeInput();
    let state = flightPhase.init(input, 7);

    state = flightPhase.step(state, { type: "open_terminal", terminalId: "SOLAR" });
    expect(state.gameMode).toBe("MINIGAME_ACTIVE");

    const initialEnergy = state.energyPct;
    const initialSolarTimer = state.terminals.find((t) => t.id === "SOLAR")!.urgencyTimer;

    for (let i = 0; i < 20; i++) {
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }

    const updatedSolarTimer = state.terminals.find((t) => t.id === "SOLAR")!.urgencyTimer;
    expect(updatedSolarTimer).toBeLessThan(initialSolarTimer);
    expect(state.energyPct).toBeLessThan(initialEnergy);
  });

  it("проходить усі 3 хвилі стикування (MOD_VERTICAL_LAB -> MOD_THERMAL_BAY -> MOD_COMMAND) та 3 мініігри до VICTORY", () => {
    const input = makeInput();
    let state: FlightState = flightPhase.init(input, 11);

    expect(state.unlockedModuleIds).toEqual(["MOD_HABITAT", "MOD_INTERSECTION"]);
    expect(
      getActiveHandles(state.unlockedModuleIds).some(
        (h) => h.moduleId === "MOD_VERTICAL_LAB",
      ),
    ).toBe(false);

    // 1. SolarMinigame
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "SOLAR" });
    for (let i = 0; i < 20 && state.gameMode === "MINIGAME_ACTIVE"; i++) {
      const mg = state.activeMinigame.solar!;
      state = flightPhase.step(state, {
        type: "solar_input",
        deltaAlphaDeg: mg.sunAlphaDeg - mg.panelAlphaDeg,
        deltaBetaDeg: mg.sunBetaDeg - mg.panelBetaDeg,
        dtS: 0.2,
      });
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }
    expect(state.gameMode).toBe("STATION_ROAM");

    // 2. Хвиля 1: DOCKING_1 -> MOD_VERTICAL_LAB
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "DOCKING_1" });
    for (let i = 0; i < 65 && state.gameMode === "MINIGAME_ACTIVE"; i++) {
      const d = state.activeMinigame.docking!;
      const tx = d.offsetXPx > 2 ? -1 : d.offsetXPx < -2 ? 1 : 0;
      const ty = d.offsetYPx > 2 ? -1 : d.offsetYPx < -2 ? 1 : 0;
      state = flightPhase.step(state, { type: "docking_input", thrustX: tx, thrustY: ty });
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }
    expect(state.openedSeals).toContain("NORTH");
    expect(state.unlockedModuleIds).toContain("MOD_VERTICAL_LAB");
    expect(state.gameMode).toBe("MODULE_EXPANSION_CUTSCENE");

    for (let i = 0; i < 8; i++) {
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }
    expect(state.gameMode).toBe("STATION_ROAM");

    // 3. LifeSupportMinigame на OXYGEN у MOD_VERTICAL_LAB
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "OXYGEN" });
    state = flightPhase.step(state, {
      type: "ls_drag_filter",
      target: "RED",
      x: LS_TRASH_POS.x,
      y: LS_TRASH_POS.y,
      released: true,
    });
    state = flightPhase.step(state, {
      type: "ls_drag_filter",
      target: "GREEN",
      x: LS_SLOT_POS.x,
      y: LS_SLOT_POS.y,
      released: true,
    });
    state = flightPhase.step(state, { type: "ls_rotate_ammonia", deltaDeg: 360 });
    state = flightPhase.step(state, { type: "ls_hold_o2", held: true });
    while (
      state.gameMode === "MINIGAME_ACTIVE" &&
      state.activeMinigame.lifeSupport &&
      state.activeMinigame.lifeSupport.pressureKpa < 74
    ) {
      state = flightPhase.step(state, { type: "tick", dtS: 0.1 });
    }
    state = flightPhase.step(state, { type: "ls_hold_o2", held: false });
    expect(state.gameMode).toBe("STATION_ROAM");

    // 4. Хвиля 2: DOCKING_2 -> MOD_THERMAL_BAY
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "DOCKING_2" });
    state = flightPhase.step(state, { type: "complete_minigame_debug" });
    expect(state.openedSeals).toContain("EAST");
    expect(state.unlockedModuleIds).toContain("MOD_THERMAL_BAY");

    for (let i = 0; i < 8; i++) {
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }

    // 5. Хвиля 3: DOCKING_3 -> MOD_COMMAND -> VICTORY
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "DOCKING_3" });
    state = flightPhase.step(state, { type: "complete_minigame_debug" });
    expect(state.openedSeals).toContain("SOUTH");
    expect(state.unlockedModuleIds).toContain("MOD_COMMAND");
    expect(state.gameMode).toBe("VICTORY");

    state = flightPhase.step(state, { type: "complete_phase" });
    expect(flightPhase.isDone(state)).toBe(true);

    const finished = flightPhase.finish(state);
    expect(finished.result.orbit.altKm).toBe(SAMPLE_DESIGN.altKm);
    expect(finished.result.damage).toEqual([]);
  });

  it("записує відмови з непорожнім causedBy при простроченні таймера термінала", () => {
    const input = makeInput({
      modules: { ...SAMPLE_DESIGN.modules, solar: "sol-s", battery: "bat-s" },
    });
    let state = flightPhase.init(input, 5);

    for (let i = 0; i < 220; i++) {
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }

    const failures = state.log.filter((e) => e.kind === "failure");
    expect(failures.length).toBeGreaterThan(0);
    for (const f of failures) {
      expect(f.causedBy).toBeDefined();
      expect(f.causedBy!.length).toBeGreaterThan(0);
    }
  });

  it("передбачає рикошетну траєкторію computeBallisticTrajectoryWithBounces, Target Lock на поручні та підтримує ковзання slide_along_handle", () => {
    const input = makeInput();
    let state = flightPhase.init(input, 21);

    // Перевіряємо ковзання вздовж поручня H_START (вертикальний поручень x=48, y=190..290)
    const startY = state.astronaut.pos.y;
    state = flightPhase.step(state, {
      type: "slide_along_handle",
      dirX: 0,
      dirY: 1,
      dtS: 0.1,
    });
    expect(state.astronaut.pos.y).toBeGreaterThan(startY);
    expect(state.astronaut.pos.x).toBe(48);

    // Перевіряємо прогноз рикошетної траєкторії та захоплення цільового поручня H_MID_1
    const activeWalls = getActiveWalls(state.unlockedModuleIds, state.openedSeals);
    const activeHandles = getActiveHandles(state.unlockedModuleIds);
    const circleObs = getActiveCircleObstacles(state.unlockedModuleIds);

    // 1. Пряме наведення на верхній поручень H_TOP_1 (x=210..290, y=54)
    const lockTop = computeBallisticTrajectoryWithBounces(
      { x: 48, y: 240 },
      { vx: 300, vy: -275 },
      state.astronaut.radius,
      activeWalls,
      activeHandles,
      circleObs,
      "H_START",
    );
    expect(lockTop.targetHandleId).toBe("H_TOP_1");
    expect(lockTop.targetPoint).not.toBeNull();
    expect(lockTop.requiresActiveGrab).toBe(false);

    // 2. Постріл прямо в центральну колону COL_HAB_CENTER (x=420, y=240) фіксує точку рикошету
    const bouncePreview = computeBallisticTrajectoryWithBounces(
      { x: 48, y: 240 },
      { vx: 380, vy: 0 },
      state.astronaut.radius,
      activeWalls,
      activeHandles,
      circleObs,
      "H_START",
    );
    expect(bouncePreview.bouncePoints.length).toBeGreaterThan(0);
    expect(bouncePreview.targetHandleId).toBe("H_START");
  });
});
