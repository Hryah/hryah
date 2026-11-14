import { describe, expect, it } from "vitest";
import agenciesData from "../../data/agencies.json";
import type { AgencyProfile } from "../design/agency";
import { CAMPAIGN_CATALOG } from "../consortium/scenarios";
import {
  depositsOf, emptyFactory, expectedQuality, fabBaseOf, glassDefectFactor, IMPORT_DEPOSIT, knownFlaws, MATERIALS, planBatch,
  readyModules, workshopCapacity, type FactoryOrder, type FactoryState,
} from ".";

const agencies = Object.values(agenciesData) as AgencyProfile[];
const borealis = agencies.find((a) => a.id === "borealis")!;
const catalog = CAMPAIGN_CATALOG.modules;

// Маршрут, що лікує всі вади родовища (перебір варіантів двох стадій).
function curingRoute(lineId: string, depositId: string): [string, string] | null {
  const line = MATERIALS.lines[lineId]!;
  const dep = line.deposits[depositId]!;
  const flaws = [...dep.visible, ...dep.hidden];
  for (const a of Object.keys(line.stages[0])) for (const b of Object.keys(line.stages[1])) {
    const cured = new Set([...line.stages[0][a]!.cures, ...line.stages[1][b]!.cures]);
    if (flaws.every((f) => cured.has(f))) return [a, b];
  }
  return null;
}

describe("фабрика: дані", () => {
  it("кожна лінія має слот, родовища з відомими вадами, дві стадії; вади кожного родовища можна вилікувати", () => {
    const slots = new Set<string>();
    for (const [id, line] of Object.entries(MATERIALS.lines)) {
      slots.add(line.slot);
      expect(line.deposits[IMPORT_DEPOSIT]).toBeDefined();
      for (const [did, dep] of Object.entries(line.deposits)) {
        for (const f of [...dep.visible, ...dep.hidden]) expect(line.flaws[f], `${id}/${did}/${f}`).toBeDefined();
        expect(curingRoute(id, did), `${id}/${did}`).not.toBeNull();
      }
      for (const stage of line.stages) for (const o of Object.values(stage)) expect(MATERIALS.workshops[o.workshop]).toBeDefined();
    }
    expect([...slots].sort()).toEqual(["antenna", "battery", "engine", "instrument", "solar"]);
  });

  it("родовища залежать від країни: імпорт є в усіх, власних по два, у різних країн набори відрізняються", () => {
    const sets = agencies.map((a) => depositsOf(a.id, "glass").join(","));
    for (const a of agencies) {
      const d = depositsOf(a.id, "glass");
      expect(d).toContain(IMPORT_DEPOSIT);
      expect(d).toHaveLength(MATERIALS.depositsPerAgency + 1);
    }
    expect(new Set(sets).size).toBeGreaterThan(1);
  });
});

describe("фабрика: партії", () => {
  const own = (lineId: string) => depositsOf(borealis.id, lineId).find((d) => d !== IMPORT_DEPOSIT)!;

  it("своя сировина з правильним маршрутом дає якість імпорту дешевше; без лікування якість падає", () => {
    const dep = own("alloy");
    const route = curingRoute("alloy", dep)!;
    const good = planBatch(borealis, emptyFactory(), { line: "alloy", depositId: dep, steps: route, baseModuleId: "eng-chem" }, 0, catalog).batch!;
    const imp = planBatch(borealis, emptyFactory(), { line: "alloy", depositId: IMPORT_DEPOSIT, steps: ["direct", "cast"], baseModuleId: "eng-chem" }, 0, catalog).batch!;
    const bad = planBatch(borealis, emptyFactory(), { line: "alloy", depositId: dep, steps: ["direct", "cast"], baseModuleId: "eng-chem" }, 0, catalog).batch!;
    expect(good.quality).toBe(imp.quality);
    expect(bad.quality).toBeLessThan(good.quality);
    expect(good.uncured).toEqual([]);
    expect(bad.uncured.length).toBeGreaterThan(0);
    expect(good.module.slot).toBe("engine");
    expect((good.module as { ispS: number }).ispS).toBeGreaterThan((bad.module as { ispS: number }).ispS);
    expect(good.module.costMUsd).toBeLessThan(catalog.find((m) => m.id === "eng-chem")!.costMUsd);
  });

  it("прихована вада: оцінка її не бачить, аналіз або готова партія її відкриває", () => {
    const dep = own("semi");
    const visibleOnly = MATERIALS.lines.semi!.deposits[dep]!;
    const f0 = emptyFactory();
    expect(knownFlaws(f0, "semi", dep, 0)).toEqual(visibleOnly.visible);
    const analyzed: FactoryState = { ...f0, analyzed: [`semi:${dep}`] };
    expect(knownFlaws(analyzed, "semi", dep, 0)).toEqual([...visibleOnly.visible, ...visibleOnly.hidden]);
    const order: FactoryOrder = { line: "semi", depositId: dep, steps: ["arc", "cz"], baseModuleId: "sol-m" };
    const batch = planBatch(borealis, f0, order, 0, catalog).batch!;
    expect(expectedQuality(borealis, f0, order, 0)!).toBeGreaterThan(batch.quality); // прихована вада зіпсувала результат
    const withBatch: FactoryState = { ...f0, batches: [batch] };
    expect(knownFlaws(withBatch, "semi", dep, batch.readyTurn)).toContain(visibleOnly.hidden[0]);
  });

  it("цех має обмежену потужність: друга партія в зайнятий цех не стартує", () => {
    const weak = { ...borealis, industries: { ...borealis.industries, metallurgy: 0.3 } };
    expect(workshopCapacity(weak, "furnace")).toBe(1);
    const order: FactoryOrder = { line: "alloy", depositId: IMPORT_DEPOSIT, steps: ["direct", "cast"], baseModuleId: "eng-chem" };
    const first = planBatch(weak, emptyFactory(), order, 0, catalog).batch!;
    const busy: FactoryState = { batches: [first], analyzed: [] };
    expect(planBatch(weak, busy, order, 0, catalog)).toMatchObject({ ok: false, reason: "workshop" });
    expect(planBatch(weak, busy, order, first.readyTurn, catalog).ok).toBe(true);
  });

  it("готовий модуль з'являється в каталозі; добре скло зменшує брак дзеркала", () => {
    const order: FactoryOrder = { line: "glass", depositId: IMPORT_DEPOSIT, steps: ["quick", "polish"], baseModuleId: "cam-m" };
    const batch = planBatch(borealis, emptyFactory(), order, 0, catalog).batch!;
    const f: FactoryState = { batches: [batch], analyzed: [] };
    expect(readyModules(f, batch.readyTurn - 1)).toEqual([]);
    expect(readyModules(f, batch.readyTurn).map((m) => m.id)).toEqual([batch.id]);
    expect(glassDefectFactor(f, batch.readyTurn)).toBeLessThan(1);
    expect(glassDefectFactor(emptyFactory(), 0)).toBe(1);
  });

  it("невідома лінія, чуже родовище, хибний крок і чужий слот відхиляються", () => {
    const f = emptyFactory();
    expect(planBatch(borealis, f, { line: "warp", depositId: "x", steps: ["a", "b"], baseModuleId: "eng-chem" }, 0, catalog).reason).toBe("line");
    const foreign = Object.keys(MATERIALS.lines.alloy!.deposits).find((d) => !depositsOf(borealis.id, "alloy").includes(d))!;
    expect(planBatch(borealis, f, { line: "alloy", depositId: foreign, steps: ["direct", "cast"], baseModuleId: "eng-chem" }, 0, catalog).reason).toBe("deposit");
    expect(planBatch(borealis, f, { line: "alloy", depositId: IMPORT_DEPOSIT, steps: ["cast", "direct"], baseModuleId: "eng-chem" }, 0, catalog).reason).toBe("step");
    expect(planBatch(borealis, f, { line: "alloy", depositId: IMPORT_DEPOSIT, steps: ["direct", "cast"], baseModuleId: "sol-m" }, 0, catalog).reason).toBe("module");
  });
});

describe("фабрика: рев'ю", () => {
  it("fabBaseOf знаходить базовий модуль і з дефісами в id агенції", () => {
    const ids = catalog.map((m) => m.id);
    expect(fabBaseOf("fab-cam-m-borealis-1", ids)).toBe("cam-m");
    expect(fabBaseOf("fab-ant-laser-new-agency-12", ids)).toBe("ant-laser");
    expect(fabBaseOf("cam-m", ids)).toBeUndefined();
  });
});
