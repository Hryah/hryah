import { describe, expect, it } from "vitest";
import type { DesignInput, Phase } from "./contracts";
import { stubDesignPhase, stubFlightPhase, stubOrbitPhase } from "./stub-phases";
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION, stubDesign, stubFlight } from "./stubs";

const input: DesignInput = { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function lifecycle<In, State, Action, Out>(phase: Phase<In, State, Action, Out>, phaseInput: In, actions: Action[]) {
  let state = phase.init(deepFreeze(phaseInput), 7);
  let replay = phase.init(phaseInput, 7);
  expect(phase.isDone(state)).toBe(false);
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  for (const action of actions) {
    const before = JSON.stringify(state);
    const next = phase.step(deepFreeze(state), action);
    replay = phase.step(JSON.parse(JSON.stringify(replay)), action);
    expect(JSON.stringify(state)).toBe(before);
    expect(next).toEqual(replay);
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
    state = next;
  }
  expect(phase.isDone(state)).toBe(true);
  const finished = phase.finish(deepFreeze(state));
  expect(finished).toEqual(phase.finish(replay));
  expect(JSON.parse(JSON.stringify(finished))).toEqual(finished);
  return finished;
}

describe("заглушки фаз", () => {
  it("проєктування: чисті кроки, повтор за сідом, JSON і finish після init → isDone", () => {
    const finished = lifecycle(stubDesignPhase, input, [
      { type: "setModule", slot: "battery", moduleId: "bat-l" },
      { type: "setFuel", fuelKg: 14 },
      { type: "confirm" },
    ]);
    expect(finished.result.design.modules.battery).toBe("bat-l");
    expect(finished.result.fuelKg).toBe(14);
    expect(finished.log.every((entry) => entry.phase === "design")).toBe(true);
  });

  it("політ: чистий життєвий цикл і лише нові записи у finish", () => {
    const design = stubDesign(input, { ...SAMPLE_DESIGN, fuelKg: 0 });
    const finished = lifecycle(stubFlightPhase, {
      mission: SAMPLE_MISSION, spec: design.result, log: design.log,
    }, [{ type: "continue" }]);
    expect(finished.log).toHaveLength(1);
    expect(finished.log[0]?.id).toBe("flight:low-orbit");
    expect(finished.log.every((entry) => entry.phase === "flight")).toBe(true);
  });

  it("орбіта: чистий життєвий цикл і лише нові записи у finish", () => {
    const design = stubDesign(input, {
      ...SAMPLE_DESIGN, modules: { ...SAMPLE_DESIGN.modules, battery: "bat-s" },
    });
    const flight = stubFlight({ mission: SAMPLE_MISSION, spec: design.result, log: design.log });
    const finished = lifecycle(stubOrbitPhase, {
      mission: SAMPLE_MISSION, spec: design.result, flight: flight.result, log: [...design.log, ...flight.log],
    }, [{ type: "continue" }]);
    expect(finished.result.success).toBe(false);
    expect(finished.log).toHaveLength(1);
    expect(finished.log[0]?.id).toBe("orbit:battery-dead");
    expect(finished.log.every((entry) => entry.phase === "orbit")).toBe(true);
  });

  it("зберігає демонстраційний проєкт і не ділить його між станами", () => {
    const first = stubDesignPhase.init(input, 1);
    const second = stubDesignPhase.init(input, 2);
    expect(first.design).toEqual(SAMPLE_DESIGN);
    expect(first.design).not.toBe(SAMPLE_DESIGN);
    expect(first.design.modules).not.toBe(second.design.modules);
  });

  it("вибирає модулі й носій із входу та обмежує висоту місією", () => {
    const other: DesignInput = {
      catalog: { modules: SAMPLE_CATALOG.modules.map((module) => ({ ...module, id: `other-${module.id}` })) },
      mission: {
        ...SAMPLE_MISSION, altRangeKm: [900, 1000],
        launchers: [{ id: "other-launcher", nameKey: "launcher.other", maxPayloadKg: 300, costMUsd: 10 }],
      },
    };
    const state = stubDesignPhase.init(deepFreeze(other), 1);
    for (const module of other.catalog.modules) {
      expect(other.catalog.modules.some((m) => m.slot === module.slot && m.id === state.design.modules[module.slot])).toBe(true);
    }
    expect(state.design.launcherId).toBe("other-launcher");
    expect(state.design.altKm).toBe(900);
    expect(stubDesignPhase.finish(state)).toEqual(stubDesign(other));
    expect(stubDesignPhase.debugActions?.(state).some((entry) => entry.action.type === "confirm")).toBe(true);
  });

  it("обмежує висоту також верхньою межею", () => {
    const state = stubDesignPhase.init({ ...input, mission: { ...SAMPLE_MISSION, altRangeKm: [200, 300] } }, 1);
    expect(state.design.altKm).toBe(300);
  });

  it("паливо не йде нижче нуля", () => {
    const state = stubDesignPhase.step(stubDesignPhase.init(input, 1), { type: "setFuel", fuelKg: -100 });
    expect(state.design.fuelKg).toBe(0);
  });

  it("одразу пояснює відсутній слот або носій у неповних даних", () => {
    expect(() => stubDesignPhase.init({
      ...input, catalog: { modules: SAMPLE_CATALOG.modules.filter((module) => module.slot !== "engine") },
    }, 1)).toThrow("engine");
    expect(() => stubDesignPhase.init({
      ...input, mission: { ...SAMPLE_MISSION, launchers: [] },
    }, 1)).toThrow("носія");
  });
});
