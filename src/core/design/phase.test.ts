import { describe, expect, it } from "vitest";
import type { DesignInput } from "../contracts";
import { availableActions, newGame, step, type GameAction, type GameState } from "../game";
import texts from "../../data/texts.en.json";
import { buildSpec } from "../model";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../stubs";
import { designPhase, launchBlockers, type DesignAction, type DesignState } from "./phase";

const input: DesignInput = { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG };
const start = (): DesignState => designPhase.init(input, 1);
const run = (state: DesignState, ...actions: DesignAction[]) => actions.reduce(designPhase.step, state);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("частина 1: старт", () => {
  it("стартовий проєкт — середні модулі, найменший носій, найнижча орбіта", () => {
    const { design } = start();
    expect(design.modules).toEqual({
      engine: "eng-chem", solar: "sol-m", battery: "bat-m", antenna: "ant-m", instrument: "cam-m",
    });
    expect(design.launcherId).toBe("small");
    expect(design.altKm).toBe(SAMPLE_MISSION.altRangeKm[0]);
  });

  it("зі стартового проєкту можна запускатись", () => {
    expect(launchBlockers(start())).toEqual([]);
  });

  it("каталог без модулів у слоті — зрозуміла помилка", () => {
    const empty = { ...input, catalog: { modules: SAMPLE_CATALOG.modules.filter((m) => m.slot !== "solar") } };
    expect(() => designPhase.init(empty, 1)).toThrow(/solar/);
  });
});

describe("частина 1: дії", () => {
  it("setModule міняє модуль у слоті", () => {
    const s = run(start(), { type: "setModule", slot: "battery", moduleId: "bat-l" });
    expect(s.design.modules.battery).toBe("bat-l");
  });

  it("setModule ігнорує невідомий модуль і модуль з чужого слота", () => {
    const s = start();
    expect(run(s, { type: "setModule", slot: "battery", moduleId: "nope" })).toBe(s);
    expect(run(s, { type: "setModule", slot: "battery", moduleId: "cam-l" })).toBe(s);
  });

  it("setFuel не опускається нижче нуля і не перевищує найбільший носій", () => {
    expect(run(start(), { type: "setFuel", fuelKg: -5 }).design.fuelKg).toBe(0);
    expect(run(start(), { type: "setFuel", fuelKg: 9999 }).design.fuelKg).toBe(400);
  });

  it("setFuel і setAlt ігнорують не-числа", () => {
    const s = start();
    expect(run(s, { type: "setFuel", fuelKg: NaN })).toBe(s);
    expect(run(s, { type: "setAlt", altKm: Infinity })).toBe(s);
  });

  it("setAlt тримається в межах місії", () => {
    const [lo, hi] = SAMPLE_MISSION.altRangeKm;
    expect(run(start(), { type: "setAlt", altKm: 1 }).design.altKm).toBe(lo);
    expect(run(start(), { type: "setAlt", altKm: 99999 }).design.altKm).toBe(hi);
  });

  it("setLauncher ігнорує невідомий носій", () => {
    const s = start();
    expect(run(s, { type: "setLauncher", launcherId: "nope" })).toBe(s);
    expect(run(s, { type: "setLauncher", launcherId: "heavy" }).design.launcherId).toBe("heavy");
  });
});

describe("частина 1: запуск", () => {
  it("confirm завершує частину й заморожує проєкт", () => {
    const done = run(start(), { type: "confirm" });
    expect(designPhase.isDone(done)).toBe(true);
    expect(run(done, { type: "setFuel", fuelKg: 1 })).toBe(done);
  });

  it("з перевантаженим носієм запуск заблоковано (mass)", () => {
    const heavy = run(start(), { type: "setFuel", fuelKg: 100 });
    expect(launchBlockers(heavy)).toEqual(["mass"]);
    expect(designPhase.isDone(run(heavy, { type: "confirm" }))).toBe(false);
  });

  it("з вичерпаним бюджетом запуск заблоковано (budget)", () => {
    const pricey = run(
      start(),
      { type: "setModule", slot: "instrument", moduleId: "cam-l" },
      { type: "setLauncher", launcherId: "heavy" },
      { type: "setModule", slot: "engine", moduleId: "eng-ion" },
      { type: "setModule", slot: "antenna", moduleId: "ant-l" },
    );
    expect(launchBlockers(pricey)).toContain("budget");
    expect(designPhase.isDone(run(pricey, { type: "confirm" }))).toBe(false);
  });

  it("м'який червоний запас не блокує запуск, але потрапляє в журнал із причинами", () => {
    const weak = run(start(), { type: "setModule", slot: "battery", moduleId: "bat-s" });
    expect(launchBlockers(weak)).toEqual([]);
    const done = run(weak, { type: "confirm" });
    expect(designPhase.isDone(done)).toBe(true);

    const { log } = designPhase.finish(done);
    const warning = log.find((e) => e.id === "design:margin-energy");
    expect(warning).toMatchObject({ kind: "warning", system: "power" });
    expect(warning?.causedBy).toContain("design:battery");
  });
});

describe("частина 1: результат", () => {
  it("spec збігається з buildSpec для того самого проєкту", () => {
    const s = run(start(), { type: "setFuel", fuelKg: 20 }, { type: "setModule", slot: "solar", moduleId: "sol-l" });
    expect(designPhase.finish(s).result).toEqual(buildSpec(input, s.design).result);
  });

  it("журнал має фіксовані id рішень і всі id унікальні", () => {
    const { log } = designPhase.finish(start());
    const ids = log.map((e) => e.id);
    for (const id of ["engine", "solar", "battery", "antenna", "instrument", "fuel", "altitude", "launcher"]) {
      expect(ids).toContain(`design:${id}`);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("кожен запис журналу з причинами посилається на існуючі записи", () => {
    const weak = run(start(), { type: "setModule", slot: "battery", moduleId: "bat-s" }, { type: "setFuel", fuelKg: 0 });
    const { log } = designPhase.finish(weak);
    const ids = new Set(log.map((e) => e.id));
    for (const entry of log) for (const cause of entry.causedBy ?? []) expect(ids.has(cause)).toBe(true);
  });

  it("кожна відмова в журналі має причину", () => {
    const { log } = designPhase.finish(run(start(), { type: "setFuel", fuelKg: 0 }));
    for (const entry of log.filter((e) => e.kind === "failure")) expect(entry.causedBy?.length).toBeGreaterThan(0);
  });
});

describe("частина 1: чистота", () => {
  it("step не мутує вхідний стан", () => {
    const frozen = deepFreeze(start());
    const actions: DesignAction[] = [
      { type: "setModule", slot: "engine", moduleId: "eng-ion" },
      { type: "setFuel", fuelKg: 30 },
      { type: "setAlt", altKm: 700 },
      { type: "setLauncher", launcherId: "heavy" },
      { type: "confirm" },
    ];
    for (const action of actions) expect(() => designPhase.step(frozen, action)).not.toThrow();
  });

  it("стан переживає JSON на кожному кроці", () => {
    let s = start();
    for (const action of [
      { type: "setModule", slot: "solar", moduleId: "sol-l" },
      { type: "setFuel", fuelKg: 18 },
      { type: "confirm" },
    ] as DesignAction[]) {
      s = designPhase.step(s, action);
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
  });

  it("детермінована: однакові дії дають однаковий результат", () => {
    const play = () => run(start(), { type: "setFuel", fuelKg: 16 }, { type: "setAlt", altKm: 450 }, { type: "confirm" });
    expect(designPhase.finish(play())).toEqual(designPhase.finish(play()));
  });
});

describe("частина 1: дебаг-дії", () => {
  it("остання дія — запуск (на цьому тримається бот)", () => {
    const actions = designPhase.debugActions?.(start()) ?? [];
    expect(actions[actions.length - 1]?.action).toEqual({ type: "confirm" });
  });

  it("кожна дія з debugActions проходить step без помилок", () => {
    const s = start();
    for (const a of designPhase.debugActions?.(s) ?? []) expect(() => designPhase.step(s, a.action)).not.toThrow();
  });

  it("заблокований запуск видно в підписі кнопки", () => {
    const heavy = run(start(), { type: "setFuel", fuelKg: 100 });
    const actions = designPhase.debugActions?.(heavy) ?? [];
    expect(actions[actions.length - 1]?.label).toContain("mass");
  });
});

describe("частина 1 у складі гри", () => {
  const act = (action: DesignAction): GameAction => ({ phase: "design", action });

  // Тисне «далі» в заглушках польоту й орбіти, поки гра не дійде до розбору.
  function playOut(state: GameState): GameState {
    for (let i = 0; i < 20 && state.phase !== "debrief"; i++) {
      const actions = availableActions(state);
      state = step(state, actions[actions.length - 1]!.action);
    }
    return state;
  }

  it("стартовий проєкт проходить гру до перемоги", () => {
    const end = playOut(step(newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 1), act({ type: "confirm" })));
    expect(end.phase === "debrief" && end.record.outcome.success).toBe(true);
  });

  it("мала батарея: розбір веде від провалу на орбіті до рішення на Землі", () => {
    const g = newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 1);
    const end = playOut(step(step(g, act({ type: "setModule", slot: "battery", moduleId: "bat-s" })), act({ type: "confirm" })));
    if (end.phase !== "debrief") throw new Error("гра не дійшла до розбору");

    const { log } = end.record;
    const ids = new Set(log.map((e) => e.id));
    const failure = log.find((e) => e.id === "orbit:battery-dead");
    expect(failure).toBeDefined();
    for (const cause of failure?.causedBy ?? []) expect(ids.has(cause)).toBe(true);
    expect(ids.has("design:margin-energy")).toBe(true);
  });

  it("з заблокованим запуском гра лишається в проєктуванні", () => {
    const g = step(newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 1), act({ type: "setFuel", fuelKg: 100 }));
    expect(step(g, act({ type: "confirm" })).phase).toBe("design");
  });
});

describe("частина 1: дії без ефекту", () => {
  it("setFuel і setAlt на межі не створюють новий стан", () => {
    const [lo] = SAMPLE_MISSION.altRangeKm;
    const atZero = run(start(), { type: "setFuel", fuelKg: 0 });
    expect(run(atZero, { type: "setFuel", fuelKg: -2 })).toBe(atZero);
    const s = start();
    expect(run(s, { type: "setAlt", altKm: lo - 50 })).toBe(s);
  });
});

describe("частина 1: повторний вибір того самого", () => {
  it("setModule і setLauncher з поточним значенням не створюють новий стан", () => {
    const s = start();
    expect(run(s, { type: "setModule", slot: "engine", moduleId: s.design.modules.engine })).toBe(s);
    expect(run(s, { type: "setLauncher", launcherId: s.design.launcherId })).toBe(s);
  });

  it("причини dv включають пальне й усі модулі, без повторів", () => {
    const { log } = designPhase.finish(run(start(), { type: "setFuel", fuelKg: 0 }));
    const warning = log.find((e) => e.id === "design:margin-dv");
    expect(warning?.causedBy).toEqual(expect.arrayContaining(["design:fuel", "design:engine", "design:instrument"]));
    expect(new Set(warning?.causedBy).size).toBe(warning?.causedBy?.length);
  });
});

describe("частина 1: тексти", () => {
  const known = new Set(Object.keys(texts));

  it("усі messageKey журналу є в texts.en.json, навіть за найгіршого проєкту", () => {
    const worst = run(
      start(),
      { type: "setModule", slot: "battery", moduleId: "bat-s" },
      { type: "setModule", slot: "antenna", moduleId: "ant-s" },
      { type: "setModule", slot: "instrument", moduleId: "cam-l" },
      { type: "setFuel", fuelKg: 0 },
    );
    for (const entry of designPhase.finish(worst).log) expect(known.has(entry.messageKey)).toBe(true);
  });

  it("назви модулів, носіїв і місії з даних мають тексти", () => {
    const keys = [
      ...SAMPLE_CATALOG.modules.map((m) => m.nameKey),
      ...SAMPLE_MISSION.launchers.map((l) => l.nameKey),
      SAMPLE_MISSION.titleKey,
      SAMPLE_MISSION.briefKey,
    ];
    for (const key of keys) expect(known.has(key), key).toBe(true);
  });
});
