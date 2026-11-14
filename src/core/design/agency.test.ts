import { describe, expect, it } from "vitest";
import agenciesData from "../../data/agencies.json";
import texts from "../../data/texts.en.json";
import type { DesignInput } from "../contracts";
import { summarize, sweepDesigns } from "../sim";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../stubs";
import { applyAgency, type AgencyProfile } from "./agency";
import { buyPriceFactor, capability, checkIndustryData } from "./industry";
import { designPhase } from "./phase";

const agencies = Object.values(agenciesData) as AgencyProfile[];
const base: DesignInput = { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG };

const neutral = { metallurgy: 0.5, electronics: 0.5, software: 0.5, chemistry: 0.5, optics: 0.5, manufacturing: 0.5 };
const profile = (over: Partial<AgencyProfile> = {}): AgencyProfile => ({
  id: "t", nameKey: "", descriptionKey: "", budgetFactor: 1, launcherCostFactor: 1, devCostFactor: 1, devSpeedFactor: 1,
  industries: neutral, ...over,
});

describe("агенції: застосування профілю", () => {
  it("не змінює вхідні дані", () => {
    const before = JSON.stringify(base);
    for (const agency of agencies) applyAgency(base, agency);
    expect(JSON.stringify(base)).toBe(before);
  });

  it("нейтральна країна (рівні 0,5) нічого не змінює в цінах модулів", () => {
    const { catalog } = applyAgency(base, profile());
    expect(catalog.modules.map((m) => m.costMUsd)).toEqual(SAMPLE_CATALOG.modules.map((m) => m.costMUsd));
  });

  it("множить бюджет і ціни носіїв", () => {
    const { mission } = applyAgency(base, profile({ budgetFactor: 2, launcherCostFactor: 0.5 }));
    expect(mission.budgetMUsd).toBe(SAMPLE_MISSION.budgetMUsd * 2);
    expect(mission.launchers.map((l) => l.costMUsd)).toEqual(SAMPLE_MISSION.launchers.map((l) => l.costMUsd * 0.5));
  });

  it("сильна індустрія слота дешевше купує готове, слабка платить націнку за імпорт", () => {
    const strong = applyAgency(base, profile({ industries: { ...neutral, optics: 1, electronics: 1, software: 1 } }));
    const weak = applyAgency(base, profile({ industries: { ...neutral, optics: 0, electronics: 0, software: 0 } }));
    const cost = (c: DesignInput["catalog"], id: string) => c.modules.find((m) => m.id === id)?.costMUsd ?? 0;
    expect(cost(strong.catalog, "cam-m")).toBe(7.5);
    expect(cost(weak.catalog, "cam-m")).toBe(12.5);
    expect(cost(strong.catalog, "eng-chem")).toBe(3); // двигуни від камер не залежать
  });

  it("санкції прибирають модулі з каталогу", () => {
    const { catalog } = applyAgency(base, profile({ blockedModules: ["cam-l", "ant-l"] }));
    expect(catalog.modules.some((m) => m.id === "cam-l" || m.id === "ant-l")).toBe(false);
    expect(catalog.modules.some((m) => m.id === "cam-m")).toBe(true);
  });

  it("обмежує носії списком launcherIds", () => {
    const { mission } = applyAgency(base, profile({ launcherIds: ["small"] }));
    expect(mission.launchers.map((l) => l.id)).toEqual(["small"]);
  });

  it("відхиляє некоректні множники, рівні індустрій і порожній набір носіїв", () => {
    expect(() => applyAgency(base, profile({ budgetFactor: 0 }))).toThrow(/budgetFactor/);
    expect(() => applyAgency(base, profile({ launcherCostFactor: NaN }))).toThrow(/launcherCostFactor/);
    expect(() => applyAgency(base, profile({ devSpeedFactor: -1 }))).toThrow(/devSpeedFactor/);
    expect(() => applyAgency(base, profile({ industries: { ...neutral, optics: 1.5 } }))).toThrow(/optics/);
    expect(() => applyAgency(base, profile({ launcherIds: ["nope"] }))).toThrow(/носія/);
  });
});

describe("індустрії", () => {
  it("дані індустрій коректні: ваги слотів дають 1", () => expect(() => checkIndustryData()).not.toThrow());

  it("здібність у слоті зважує рівні індустрій", () => {
    const us = (agenciesData as unknown as Record<string, AgencyProfile>).usa!.industries;
    expect(capability(us, "instrument")).toBeCloseTo(0.5 * 0.85 + 0.3 * 0.9 + 0.2 * 0.95);
    expect(capability(neutral, "engine")).toBeCloseTo(0.5);
  });

  it("множник ціни імпорту: 0,5 дає 1, 1 дає знижку, 0 дає націнку, без стрибків", () => {
    const at = (c: number) => buyPriceFactor({ ...neutral, chemistry: c, electronics: c, metallurgy: c, manufacturing: c, software: c, optics: c }, "engine");
    expect(at(0.5)).toBeCloseTo(1);
    expect(at(1)).toBeCloseTo(0.75);
    expect(at(0)).toBeCloseTo(1.25);
    expect(Math.abs(at(0.501) - at(0.499))).toBeLessThan(0.01);
  });

  it("країни мають різні сильні сторони: США не мають металургії, Китай має електроніку слабшу", () => {
    const by = agenciesData as unknown as Record<string, AgencyProfile>;
    expect(capability(by.usa!.industries, "instrument")).toBeGreaterThan(capability(by.china!.industries, "instrument"));
    expect(capability(by.china!.industries, "engine")).toBeGreaterThan(capability(by.usa!.industries, "engine"));
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
