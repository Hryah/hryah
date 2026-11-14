import { describe, expect, it } from "vitest";
import { availableActions, newGame, step, type GameAction, type GameState } from "./game";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "./stubs";

const start = (seed = 1) => newGame(SAMPLE_MISSION, SAMPLE_CATALOG, seed);

// Найпростіший бот: тисне останню доступну дію (у заглушках це «далі»), поки гра не скінчиться.
function playToEnd(state: GameState, maxSteps = 100): GameState {
  for (let i = 0; i < maxSteps && state.phase !== "debrief"; i++) {
    const actions = availableActions(state);
    const last = actions[actions.length - 1];
    if (!last) throw new Error(`Частина ${state.phase} не дає жодної дії`);
    state = step(state, last.action);
  }
  return state;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("склейка частин", () => {
  it("гра починається з проєктування", () => {
    expect(start().phase).toBe("design");
  });

  it("проходить усі частини по порядку до розбору", () => {
    const seen: string[] = [];
    let state = start();
    while (state.phase !== "debrief") {
      seen.push(state.phase);
      const actions = availableActions(state);
      state = step(state, actions[actions.length - 1]!.action);
    }
    expect(seen).toEqual(["design", "flight", "orbit"]);
    expect(state.record.outcome.success).toBe(true);
  });

  it("дія для іншої частини ігнорується", () => {
    const state = start();
    const foreign: GameAction = { phase: "orbit", action: { type: "continue" } };
    expect(step(state, foreign)).toBe(state);
  });

  it("рішення гравця доходять до результату", () => {
    const small: GameAction = { phase: "design", action: { type: "setModule", slot: "battery", moduleId: "bat-s" } };
    const end = playToEnd(step(start(), small));
    expect(end.phase === "debrief" && end.record.outcome.success).toBe(false);
  });

  it("не мутує вхідний стан", () => {
    const state = deepFreeze(start());
    const confirm: GameAction = { phase: "design", action: { type: "confirm" } };
    expect(() => step(state, confirm)).not.toThrow();
    expect(state.phase).toBe("design");
  });

  it("детермінована: однаковий сід і дії дають однаковий результат", () => {
    expect(playToEnd(start(7))).toEqual(playToEnd(start(7)));
  });

  it("стан серіалізується в JSON на кожному кроці", () => {
    let state = start();
    for (let i = 0; i < 10 && state.phase !== "debrief"; i++) {
      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
      const actions = availableActions(state);
      state = step(state, actions[actions.length - 1]!.action);
    }
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("не дублює попередні записи у підсумковому журналі", () => {
    const end = playToEnd(step(start(), {
      phase: "design", action: { type: "setModule", slot: "battery", moduleId: "bat-s" },
    }));
    expect(end.phase).toBe("debrief");
    if (end.phase !== "debrief") throw new Error("Гра не дійшла до розбору");
    const ids = end.record.log.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith("design:"))).toHaveLength(5);
    expect(ids).toContain("orbit:battery-dead");
  });

  it("проходить до розбору з іншим каталогом і місією", () => {
    const mission = {
      ...SAMPLE_MISSION, id: "another-mission",
      launchers: SAMPLE_MISSION.launchers.map((launcher) => ({ ...launcher, id: `other-${launcher.id}` })),
    };
    const catalog = {
      modules: SAMPLE_CATALOG.modules.map((module) => ({ ...module, id: `other-${module.id}` })),
    };
    const end = playToEnd(newGame(mission, catalog, 42));
    expect(end.phase).toBe("debrief");
    if (end.phase !== "debrief") throw new Error("Гра не дійшла до розбору");
    expect(end.record.missionId).toBe(mission.id);
    expect(Object.values(end.record.spec.design.modules).every((id) => id.startsWith("other-"))).toBe(true);
    expect(JSON.parse(JSON.stringify(end))).toEqual(end);
  });
});
