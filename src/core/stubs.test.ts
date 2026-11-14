import { describe, expect, it } from "vitest";
import { causeChains, danglingCauses } from "./debrief";
import type { Mission } from "./contracts";
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION, runStubGame, stubDesign, stubFlight, stubOrbit } from "./stubs";
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
