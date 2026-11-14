import { describe, expect, it } from "vitest";
import { causeChains, danglingCauses } from "./debrief";
import { SAMPLE_DESIGN, runStubGame } from "./stubs";

const withModule = (slot: "battery" | "instrument", id: string) => ({
  ...SAMPLE_DESIGN,
  modules: { ...SAMPLE_DESIGN.modules, [slot]: id },
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
