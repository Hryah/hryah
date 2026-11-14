import { describe, expect, it } from "vitest";
import type { AgencyRun } from "./reward";
import { CARGO_REPEAT_FACTOR, cargoKindOf, runValueMUsd, settleRewards } from "./reward";
import { SCENARIOS } from "./scenarios";

const sc = SCENARIOS.lifeline!;
const mission = sc.mission;
const catalog = sc.catalog!;

function run(agencyId: string, container: string, survivedOrbits = mission.durationOrbits): AgencyRun {
  return {
    agencyId, launchTurn: 0, log: [],
    spec: { design: { modules: { engine: "eng-chem", solar: "sol-m", battery: "bat-m", antenna: "ant-m", instrument: container }, fuelKg: 12, altKm: 400, launcherId: "medium" } } as AgencyRun["spec"],
    outcome: { success: true, deliveredMb: 0, survivedOrbits, score: 0 },
  };
}

describe("вантажна місія", () => {
  it("сценарій грає зі своїм каталогом: контейнери замість камер", () => {
    expect(mission.kind).toBe("cargo");
    expect(catalog.modules.filter((m) => m.slot === "instrument").every((m) => m.slot === "instrument" && m.cargoKind)).toBe(true);
    expect(cargoKindOf(catalog, run("a", "cargo-parts"))).toBe("parts");
  });

  it("цінність — потреба станції в цьому контейнері, частка пережитих витків", () => {
    expect(runValueMUsd(mission, run("a", "cargo-parts"), undefined, catalog)).toBe(mission.stationNeeds!.parts);
    expect(runValueMUsd(mission, run("a", "cargo-parts", mission.durationOrbits / 2), undefined, catalog)).toBe(mission.stationNeeds!.parts! / 2);
    expect(runValueMUsd(mission, run("a", "cargo-parts", 0), undefined, catalog)).toBe(0);
  });

  it("три однакові контейнери цінуються менше за різні", () => {
    const same = settleRewards(mission, [run("a", "cargo-water"), run("b", "cargo-water"), run("c", "cargo-water")], undefined, catalog);
    const mixed = settleRewards(mission, [run("a", "cargo-water"), run("b", "cargo-food"), run("c", "cargo-parts")], undefined, catalog);
    const sumSame = same.payouts.reduce((s, p) => s + p.valueMUsd, 0);
    const sumMixed = mixed.payouts.reduce((s, p) => s + p.valueMUsd, 0);
    const water = mission.stationNeeds!.water!;
    expect(sumSame).toBeCloseTo(water * (1 + CARGO_REPEAT_FACTOR + CARGO_REPEAT_FACTOR ** 2), 2);
    expect(sumMixed).toBeGreaterThan(sumSame);
  });
});
