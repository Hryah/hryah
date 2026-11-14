import { describe, expect, it } from "vitest";
import agenciesData from "../../data/agencies.json";
import texts from "../../data/texts.en.json";
import type { DesignInput } from "../contracts";
import { summarize, sweepDesigns } from "../sim";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../stubs";
import { applyAgency, type AgencyProfile } from "./agency";
import { designPhase } from "./phase";

const agencies = Object.values(agenciesData) as AgencyProfile[];
const base: DesignInput = { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG };

describe("агенції: застосування профілю", () => {
  it("не змінює вхідні дані", () => {
    const before = JSON.stringify(base);
    for (const agency of agencies) applyAgency(base, agency);
    expect(JSON.stringify(base)).toBe(before);
  });

  it("множить бюджет, ціни носіїв і модулів", () => {
    const { mission, catalog } = applyAgency(base, {
      id: "t", nameKey: "", descriptionKey: "", budgetFactor: 2, launcherCostFactor: 0.5, moduleCostFactor: { engine: 0.5 },
    });
    expect(mission.budgetMUsd).toBe(SAMPLE_MISSION.budgetMUsd * 2);
    expect(mission.launchers.map((l) => l.costMUsd)).toEqual(SAMPLE_MISSION.launchers.map((l) => l.costMUsd * 0.5));
    const engine = catalog.modules.find((m) => m.id === "eng-chem");
    expect(engine?.costMUsd).toBe(1.5);
    const solar = catalog.modules.find((m) => m.id === "sol-m");
    expect(solar?.costMUsd).toBe(2);
  });

  it("обмежує носії списком launcherIds", () => {
    const { mission } = applyAgency(base, {
      id: "t", nameKey: "", descriptionKey: "", budgetFactor: 1, launcherCostFactor: 1, launcherIds: ["small"],
    });
    expect(mission.launchers.map((l) => l.id)).toEqual(["small"]);
  });

  it("відхиляє некоректні множники й порожній набір носіїв", () => {
    const ok = { id: "t", nameKey: "", descriptionKey: "", budgetFactor: 1, launcherCostFactor: 1 };
    expect(() => applyAgency(base, { ...ok, budgetFactor: 0 })).toThrow(/budgetFactor/);
    expect(() => applyAgency(base, { ...ok, launcherCostFactor: NaN })).toThrow(/launcherCostFactor/);
    expect(() => applyAgency(base, { ...ok, moduleCostFactor: { solar: -1 } })).toThrow(/solar/);
    expect(() => applyAgency(base, { ...ok, launcherIds: ["nope"] })).toThrow(/носія/);
  });
});

describe("агенції: дані", () => {
  it("кожна агенція має тексти назви й опису", () => {
    for (const a of agencies) {
      expect(a.nameKey in texts, a.nameKey).toBe(true);
      expect(a.descriptionKey in texts, a.descriptionKey).toBe(true);
    }
  });

  it("id збігається з ключем у файлі", () => {
    for (const [key, a] of Object.entries(agenciesData)) expect(a.id).toBe(key);
  });
});

describe("агенції: баланс", () => {
  for (const agency of agencies) {
    const input = applyAgency(base, agency);
    const summary = summarize(sweepDesigns(input.mission, input.catalog));

    it(`${agency.id}: місію можна виграти, але не будь-яким проєктом`, () => {
      expect(summary.wins).toBeGreaterThan(0);
      expect(summary.wins).toBeLessThan(summary.total);
    });

    it(`${agency.id}: частина 1 стартує й запускається зі стартового проєкту`, () => {
      const start = designPhase.init(input, 1);
      expect(designPhase.isDone(designPhase.step(start, { type: "confirm" }))).toBe(true);
    });
  }

  it("агенції справді відрізняються: різна кількість виграшних проєктів", () => {
    const wins = agencies.map((a) => {
      const input = applyAgency(base, a);
      return summarize(sweepDesigns(input.mission, input.catalog)).wins;
    });
    expect(new Set(wins).size).toBeGreaterThan(1);
  });
});
