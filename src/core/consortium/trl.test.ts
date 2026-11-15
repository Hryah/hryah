import { describe, expect, it } from "vitest";
import type { Design } from "../contracts";
import { baseTrl, failureChance, qualifyCostMUsd, rollTrlFailures, TRL, trlOf } from "./trl";

const design = (over: Partial<Design["modules"]> = {}): Design => ({
  modules: { engine: "eng-chem", solar: "sol-m", battery: "bat-m", antenna: "ant-m", instrument: "cam-m", ...over },
  fuelKg: 12, altKm: 500, launcherId: "medium",
});

describe("TRL", () => {
  it("перевірені модулі без ризику; нові, власні й фабричні — з ризиком", () => {
    expect(baseTrl("eng-chem")).toBe(9);
    expect(failureChance(9)).toBe(0);
    expect(baseTrl("ant-laser")).toBe(4);
    expect(baseTrl("custom-instrument-borealis")).toBe(TRL.custom);
    expect(baseTrl("fab-ant-laser-borealis-1", ["ant-laser", "ant-l"])).toBe(4 - TRL.fabPenalty);
    expect(baseTrl("fab-cam-m-borealis-2", ["cam-m"])).toBe(9 - TRL.fabPenalty);
  });

  it("досвід підвищує TRL до 9 і знижує ризик", () => {
    expect(trlOf("ant-laser", { "ant-laser": 2 })).toBe(6);
    expect(trlOf("ant-laser", { "ant-laser": 20 })).toBe(9);
    expect(failureChance(trlOf("ant-laser", { "ant-laser": 2 }))).toBeLessThan(failureChance(4));
  });

  it("перевірений апарат не відмовляє; кидок детермінований; відмова має причину в журналі", () => {
    expect(rollTrlFailures(1, "a", 0, design(), {}, []).damage).toEqual([]);
    const risky = design({ antenna: "ant-laser", battery: "bat-ss", solar: "sol-roll", engine: "eng-hall" });
    const a = rollTrlFailures(7, "a", 0, risky, {}, []);
    expect(rollTrlFailures(7, "a", 0, risky, {}, [])).toEqual(a);
    let failures = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = rollTrlFailures(seed, "a", 0, risky, {}, []);
      failures += r.damage.length;
      for (const e of r.log) {
        expect(e.kind).toBe("failure");
        expect(e.causedBy?.length).toBeGreaterThan(0);
      }
    }
    // 4 ризиковані модулі × 200 кидків, очікувано ~25–30% відмов на кожен.
    expect(failures / 800).toBeGreaterThan(0.15);
    expect(failures / 800).toBeLessThan(0.45);
  });

  it("ціна випробувань росте з ціною модуля", () => {
    expect(qualifyCostMUsd(14)).toBeGreaterThan(qualifyCostMUsd(1));
  });
});
