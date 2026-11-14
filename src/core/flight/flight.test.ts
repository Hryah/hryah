import { describe, expect, it } from "vitest";
import type { FlightInput } from "../contracts";
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION, stubDesign } from "../stubs";
import {
  ALL_GRAB_HANDLES,
  computeSlingshotLaunch,
  computeTrajectoryPreview,
  flightPhase,
  type FlightState,
  getActiveHandles,
  getActiveWalls,
  LS_SLOT_POS,
  LS_TRASH_POS,
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

describe("flightPhase — 2D Zero-G Platformer & Station Expansion", () => {
  it("не мутує вхідний стан і стан повністю серіалізується в JSON без undefined", () => {
    const input = makeInput();
    const s0 = deepFreeze(flightPhase.init(input, 42));
    expect(JSON.parse(JSON.stringify(s0))).toEqual(s0);

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

    // Запускаємо космонавта прямо в західну стіну Модуля 1 (x = -960) зі швидкістю 600 px/s
    const fastAstro = {
      ...s0.astronaut,
      pos: { x: -910, y: 0 },
      vel: { vx: -600, vy: 0 },
      state: "FLYING" as const,
      anchoredHandleId: null,
    };

    const out = stepZeroGPhysics(fastAstro, 0.1, activeWalls, []);
    expect(out.wallImpactSpeedPxS).toBeGreaterThan(480);
    expect(out.astronaut.state).toBe("STUNNED");
    expect(out.astronaut.stunTimer).toBeGreaterThan(0.7);
    expect(out.astronaut.vel.vx).toBeGreaterThan(0); // відбився вправо
  });

  it("захват ручок-капсуль: безпечний захват <= 420 px/s, зрив > 550 px/s без Space, успішний захват із Space", () => {
    const input = makeInput();
    const s0 = flightPhase.init(input, 1);
    const targetHandle = ALL_GRAB_HANDLES.find((h) => h.id === "h_m1_top_1")!;
    const hx = (targetHandle.ax + targetHandle.bx) * 0.5;
    const hy = targetHandle.ay;

    // 1. Повільний підліт (300 px/s <= 420 px/s) -> ANCHORED
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

    // 2. Надшвидкий проліт (600 px/s > 550 px/s) без затиснутого Space/ЛКМ -> зрив захвату
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

    // 3. Надшвидкий проліт (600 px/s) із затиснутим Space/ЛКМ (activeGrabHeld: true) -> успішний захват!
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

    // Відкриваємо мінігру сонячних панелей
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "SOLAR" });
    expect(state.gameMode).toBe("MINIGAME_ACTIVE");

    const initialEnergy = state.energyPct;
    const initialSolarTimer = state.terminals.find((t) => t.id === "SOLAR")!.urgencyTimer;

    // Тікаємо 5 секунд, поки гравець сидить у мінігрі
    state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    for (let i = 0; i < 19; i++) {
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }

    const updatedSolarTimer = state.terminals.find((t) => t.id === "SOLAR")!.urgencyTimer;
    expect(updatedSolarTimer).toBeLessThan(initialSolarTimer);
    expect(state.energyPct).toBeLessThan(initialEnergy);
  });

  it("проходить усі 3 хвилі стикування (розширення карти Модуль 3 -> Модуль 4 -> Модуль 5) та 3 мініігри до VICTORY", () => {
    const input = makeInput();
    let state: FlightState = flightPhase.init(input, 11);

    expect(state.unlockedModuleIds).toEqual(["MODULE_1", "MODULE_2"]);
    expect(getActiveHandles(state.unlockedModuleIds).some((h) => h.moduleId === "MODULE_3")).toBe(false);

    // 1. Проходимо SolarMinigame: вирівнюємо кути панелей із сонцем та тримаємо >95% 3 секунди
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "SOLAR" });
    expect(state.activeMinigame.type).toBe("SOLAR");
    for (let i = 0; i < 20 && state.gameMode === "MINIGAME_ACTIVE"; i++) {
      const mg = state.activeMinigame.solar!;
      const dAlpha = mg.sunAlphaDeg - mg.panelAlphaDeg;
      const dBeta = mg.sunBetaDeg - mg.panelBetaDeg;
      state = flightPhase.step(state, {
        type: "solar_input",
        deltaAlphaDeg: dAlpha,
        deltaBetaDeg: dBeta,
        dtS: 0.2,
      });
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }
    expect(state.gameMode).toBe("STATION_ROAM");

    // 2. Хвиля 1: Стикування №1 (DOCKING_1) -> відкриває шлюз EAST та Модуль 3 (Енергетика)
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "DOCKING_1" });
    expect(state.activeMinigame.type).toBe("DOCKING");
    for (let i = 0; i < 65 && state.gameMode === "MINIGAME_ACTIVE"; i++) {
      const d = state.activeMinigame.docking!;
      const tx = d.offsetXPx > 2 ? -1 : d.offsetXPx < -2 ? 1 : 0;
      const ty = d.offsetYPx > 2 ? -1 : d.offsetYPx < -2 ? 1 : 0;
      state = flightPhase.step(state, { type: "docking_input", thrustX: tx, thrustY: ty });
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }
    expect(state.openedSeals).toContain("EAST");
    expect(state.unlockedModuleIds).toContain("MODULE_3");
    expect(state.gameMode).toBe("MODULE_EXPANSION_CUTSCENE");

    // Завершуємо 1.5с катсцену розширення станції
    for (let i = 0; i < 8; i++) {
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }
    expect(state.gameMode).toBe("STATION_ROAM");

    // 3. Хвиля 2: Стикування №2 (DOCKING_2) -> відкриває шлюз NORTH та Модуль 4 (Вертикальний СЖЗ)
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "DOCKING_2" });
    state = flightPhase.step(state, { type: "complete_minigame_debug" });
    expect(state.openedSeals).toContain("NORTH");
    expect(state.unlockedModuleIds).toContain("MODULE_4");

    // Завершуємо катсцену
    for (let i = 0; i < 8; i++) {
      state = flightPhase.step(state, { type: "tick", dtS: 0.25 });
    }

    // 4. Проходимо LifeSupportMinigame (3 кроки руками: червоний фільтр у шлюз, зелений у паз, аміак 360°, тиск O2 у 70-85 кПа)
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "OXYGEN" });
    expect(state.activeMinigame.lifeSupport).not.toBeNull();
    state = flightPhase.step(state, {
      type: "ls_drag_filter",
      target: "RED",
      x: LS_TRASH_POS.x,
      y: LS_TRASH_POS.y,
      released: true,
    });
    expect(state.activeMinigame.lifeSupport!.redFilterTrashed).toBe(true);

    state = flightPhase.step(state, {
      type: "ls_drag_filter",
      target: "GREEN",
      x: LS_SLOT_POS.x,
      y: LS_SLOT_POS.y,
      released: true,
    });
    expect(state.activeMinigame.lifeSupport!.greenFilterInstalled).toBe(true);

    state = flightPhase.step(state, { type: "ls_rotate_ammonia", deltaDeg: 360 });
    expect(state.activeMinigame.lifeSupport!.ammoniaFlushed).toBe(true);

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

    // 5. Хвиля 3: Фінальне Стикування №3 (DOCKING_3) -> відкриває шлюз SOUTH, Модуль 5 та переводить у VICTORY
    state = flightPhase.step(state, { type: "open_terminal", terminalId: "DOCKING_3" });
    state = flightPhase.step(state, { type: "complete_minigame_debug" });
    expect(state.openedSeals).toContain("SOUTH");
    expect(state.unlockedModuleIds).toContain("MODULE_5");
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

    // Прокручуємо час, поки таймер SOLAR не вичерпається
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
});
