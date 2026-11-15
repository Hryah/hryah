import { describe, expect, it } from "vitest";
import { causeChains, danglingCauses } from "./debrief";
import type { Mission } from "./contracts";
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION, runStubGame, stubDesign, stubFlight, stubOrbit } from "./stubs";
import { stubOrbitPhase } from "./stub-phases";
import texts from "../data/texts.en.json";

const withModule = (slot: "battery" | "instrument", id: string) => ({
  ...SAMPLE_DESIGN,
  modules: { ...SAMPLE_DESIGN.modules, [slot]: id },
});

function orbitFor(mission: Mission) {
  const design = stubDesign({ mission, catalog: SAMPLE_CATALOG });
  const flight = stubFlight({ mission, spec: design.result, log: design.log });
  const previousLog = [...design.log, ...flight.log];
  const orbit = stubOrbit({ mission, spec: design.result, flight: flight.result, log: previousLog });
  return { design, orbit, log: [...previousLog, ...orbit.log] };
}

describe("заглушка орбіти: вимоги місії та причини провалу", () => {
  it("пояснює нестачу даних за справної батареї", () => {
    const mission = { ...SAMPLE_MISSION, requiredDataMb: 100000 };
    const { orbit, log } = orbitFor(mission);
    expect(orbit.result.survivedOrbits).toBe(mission.durationOrbits);
    expect(orbit.result.deliveredMb).toBeLessThan(mission.requiredDataMb);
    expect(orbit.result.success).toBe(false);
    expect(orbit.log).toEqual([expect.objectContaining({
      id: "orbit:insufficient-data", kind: "failure", messageKey: "orbit.insufficientData",
      causedBy: ["design:instrument", "design:antenna"],
    })]);
    expect(danglingCauses(log)).toEqual([]);
  });

  it("відхиляє нечіткі знімки, навіть якщо даних достатньо", () => {
    const mission = { ...SAMPLE_MISSION, requiredResolutionM: 1 };
    const { design, orbit, log } = orbitFor(mission);
    expect(design.result.resolutionM).toBeGreaterThan(mission.requiredResolutionM);
    expect(orbit.result.deliveredMb).toBeGreaterThanOrEqual(mission.requiredDataMb);
    expect(orbit.result.success).toBe(false);
    expect(orbit.log).toEqual([expect.objectContaining({
      id: "orbit:insufficient-resolution", kind: "failure", messageKey: "orbit.insufficientResolution",
      causedBy: ["design:instrument"],
    })]);
    expect(danglingCauses(log)).toEqual([]);
  });

  it("приймає рівність на обох межах вимог", () => {
    const baseline = orbitFor(SAMPLE_MISSION);
    const { orbit } = orbitFor({
      ...SAMPLE_MISSION,
      requiredDataMb: baseline.orbit.result.deliveredMb,
      requiredResolutionM: baseline.design.result.resolutionM,
    });
    expect(orbit.result.success).toBe(true);
    expect(orbit.log).toEqual([]);
  });

  it("кожна відмова має унікальний id, наявні причини й англійський текст", () => {
    const { orbit, log } = orbitFor({ ...SAMPLE_MISSION, requiredDataMb: 100000, requiredResolutionM: 1 });
    expect(orbit.log).toHaveLength(2);
    expect(new Set(log.map((entry) => entry.id)).size).toBe(log.length);
    expect(danglingCauses(log)).toEqual([]);
    for (const entry of log) {
      if (entry.kind === "failure") expect(entry.causedBy?.length).toBeGreaterThan(0);
      expect(Object.keys(texts)).toContain(entry.messageKey);
    }
    expect(JSON.parse(JSON.stringify(orbit))).toEqual(orbit);
  });
});

describe("заглушки: наскрізний прохід", () => {
  it("базовий проєкт: усі запаси зелені, місія успішна", () => {
    const run = runStubGame(1);
    expect(run.spec.margins.filter((m) => !m.ok)).toEqual([]);
    expect(run.outcome.success).toBe(true);
  });

  it("доміно: велика камера ламає двигун, зв'язок і масу", () => {
    const run = runStubGame(1, withModule("instrument", "cam-l"));
    const failed = run.spec.margins.filter((m) => !m.ok).map((m) => m.id);
    expect(failed).toEqual(expect.arrayContaining(["dv", "link", "mass"]));
    const science = run.spec.margins.find((m) => m.id === "science");
    expect(science?.ok).toBe(true);
  });

  it("мала батарея: місія провалена, і розбір веде до рішення про батарею", () => {
    const run = runStubGame(1, withModule("battery", "bat-s"));
    expect(run.outcome.success).toBe(false);
    const chains = causeChains(run.log);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.causes.map((c) => c.id)).toContain("design:battery");
  });

  it("журнал причин не посилається на неіснуючі записи", () => {
    for (const design of [SAMPLE_DESIGN, withModule("instrument", "cam-l"), withModule("battery", "bat-s")]) {
      expect(danglingCauses(runStubGame(1, design).log)).toEqual([]);
    }
  });

  it("запис забігу серіалізується в JSON без втрат", () => {
    const run = runStubGame(1);
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });
});


describe("межі висоти орбітальної заглушки", () => {
  it("зараховує межі діапазону з допуском 5% знизу (як справжня орбіта) та пояснює провал поза ними", () => {
    const design = stubDesign({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG });
    const flight = stubFlight({ mission: SAMPLE_MISSION, spec: design.result, log: design.log });
    for (const [altKm, success] of [[200, false], [379.999, false], [380, true], [399.999, true], [400, true], [800, true], [800.001, false]] as const) {
      const input = { mission: SAMPLE_MISSION, spec: design.result,
        flight: { ...flight.result, orbit: { ...flight.result.orbit, altKm } }, log: design.log };
      const initial = stubOrbitPhase.init(input, 42);
      const before = JSON.stringify(initial);
      const next = stubOrbitPhase.step(initial, { type: "continue" });
      expect(JSON.stringify(initial)).toBe(before);
      expect(stubOrbitPhase.step(initial, { type: "continue" })).toEqual(next);
      expect(JSON.parse(JSON.stringify(next))).toEqual(next);
      const output = stubOrbitPhase.finish(next);
      expect(output.result.success).toBe(success);
      expect(JSON.parse(JSON.stringify(output))).toEqual(output);
      if (!success) {
        expect(output.log).toContainEqual(expect.objectContaining({ id: "orbit:invalid-altitude", causedBy: ["design:engine"] }));
        expect(danglingCauses([...input.log, ...output.log])).toEqual([]);
        expect(Object.keys(texts)).toContain("orbit.invalidAltitude");
      }
    }
  });

  it("пов'язує низьку орбіту з реальною відмовою польоту", () => {
    const run = runStubGame(42, { ...SAMPLE_DESIGN, fuelKg: 0 });
    const failure = run.log.find((entry) => entry.id === "orbit:invalid-altitude");
    expect(run.flight.orbit.altKm).toBe(200);
    expect(run.outcome.success).toBe(false);
    expect(failure?.causedBy).toEqual(["flight:low-orbit"]);
    expect(danglingCauses(run.log)).toEqual([]);
  });
});
