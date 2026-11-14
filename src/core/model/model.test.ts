import { describe, expect, it } from "vitest";
import type { DesignInput, SpacecraftSpec } from "../contracts";
import { deltaVMs } from "../physics";
import { allDesigns, summarize, sweepDesigns } from "../sim";
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION, stubFlight, stubOrbit } from "../stubs";
import {
  buildSpec, burnFuelKg, downlinkMb, lifetimeOrbits, netPowerW, orbitInfo, reachedAltKm, shadowNeedWh, stepCharge, type Loads, type PowerSpec,
} from "./index";

const input: DesignInput = { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG };
const m = SAMPLE_MISSION;
const power: PowerSpec = { panelPowerW: 160, baseLoadW: 20, instrumentW: 30, transmitterW: 30, heaterW: 15 };
const off: Loads = { camera: false, transmitter: false, heater: false, safeMode: false };

describe("buildSpec", () => {
  const { result: spec, log } = buildSpec(input, SAMPLE_DESIGN);

  it("рахує масу, вартість, Δv і шість запасів", () => {
    expect(spec.margins.map((x) => x.id)).toEqual(["dv", "energy", "link", "science", "mass", "budget"]);
    expect(spec.wetMassKg).toBeCloseTo(spec.dryMassKg + spec.fuelKg);
    expect(spec.dvMs).toBeCloseTo(deltaVMs(spec.ispS, spec.dryMassKg, spec.fuelKg));
  });

  it("пише рішення по кожному слоту з фіксованими id", () => {
    expect(log.map((e) => e.id)).toEqual(["design:engine", "design:solar", "design:battery", "design:antenna", "design:instrument"]);
  });

  it("чиста й детермінована", () => {
    expect(buildSpec(input, SAMPLE_DESIGN)).toEqual(buildSpec(input, SAMPLE_DESIGN));
  });

  it("зрозуміла помилка для невідомого модуля чи носія", () => {
    expect(() => buildSpec(input, { ...SAMPLE_DESIGN, modules: { ...SAMPLE_DESIGN.modules, solar: "nope" } })).toThrow(/nope/);
    expect(() => buildSpec(input, { ...SAMPLE_DESIGN, launcherId: "nope" })).toThrow(/nope/);
  });

  it("регресія: перебір проєктів дає ті самі числа, що до винесення в model/", () => {
    const summary = summarize(sweepDesigns(m, SAMPLE_CATALOG));
    expect(summary.total).toBe(6561);
    expect(summary.launchable).toBe(4836);
    expect(summary.wins).toBe(562);
    expect(summary.failsByMargin).toEqual({ dv: 2241, science: 3645, energy: 1458, link: 2187, mass: 936, budget: 792 });
  });

  it("прогноз збігається з реальністю: запас energy червоний лише тоді, коли батарея помре на орбіті", () => {
    // Паливо 24 кг гарантує вихід на задану висоту, тож порівнюємо прогноз і орбіту на одній висоті.
    let checked = 0;
    for (const design of allDesigns(m, SAMPLE_CATALOG, [24], [m.altRangeKm[0], m.altRangeKm[1]])) {
      const d = buildSpec(input, design);
      if (d.result.dvMs < m.dvRequiredMs) continue;
      const f = stubFlight({ mission: m, spec: d.result, log: d.log });
      const o = stubOrbit({ mission: m, spec: d.result, flight: f.result, log: [...d.log, ...f.log] });
      const dead = o.log.some((e) => e.id === "orbit:battery-dead");
      const energyOk = d.result.margins.find((x) => x.id === "energy")?.ok;
      expect(energyOk, JSON.stringify(design)).toBe(!dead);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("паливо й висота", () => {
  it("burnFuelKg: нуль Δv не спалює, повне Δv спалює все, більше Δv не спалює понад бак", () => {
    const full = deltaVMs(300, 90, 12);
    expect(burnFuelKg(300, 90, 12, 0)).toBeCloseTo(0);
    expect(burnFuelKg(300, 90, 12, full)).toBeCloseTo(12);
    expect(burnFuelKg(300, 90, 12, full * 3)).toBeCloseTo(12);
  });

  it("burnFuelKg зростає з Δv", () => {
    expect(burnFuelKg(300, 90, 12, 200)).toBeLessThan(burnFuelKg(300, 90, 12, 300));
  });

  const spec = (dvMs: number) => ({ dvMs, design: SAMPLE_DESIGN }) as Pick<SpacecraftSpec, "dvMs" | "design">;
  it("reachedAltKm: вистачає Δv — задана висота; не вистачає — нижче, монотонно", () => {
    expect(reachedAltKm(m, spec(m.dvRequiredMs))).toBe(SAMPLE_DESIGN.altKm);
    expect(reachedAltKm(m, spec(m.dvRequiredMs * 2))).toBe(SAMPLE_DESIGN.altKm);
    const half = reachedAltKm(m, spec(m.dvRequiredMs / 2));
    const quarter = reachedAltKm(m, spec(m.dvRequiredMs / 4));
    expect(half).toBeLessThan(SAMPLE_DESIGN.altKm);
    expect(quarter).toBeLessThan(half);
    expect(reachedAltKm(m, spec(0))).toBe(m.altRangeKm[0] * 0.5);
  });
});

describe("орбіта", () => {
  it("orbitInfo: вища орбіта довша, тінь коротша", () => {
    const low = orbitInfo(m.body, 400);
    const high = orbitInfo(m.body, 800);
    expect(low.altKm).toBe(400);
    expect(high.periodS).toBeGreaterThan(low.periodS);
    expect(high.eclipseFraction).toBeLessThan(low.eclipseFraction);
    expect(low.periodS).toBeGreaterThan(5000);
    expect(low.periodS).toBeLessThan(6000);
  });

  it("lifetimeOrbits: не менше одного витка, зростає з висотою", () => {
    expect(lifetimeOrbits(0)).toBe(1);
    expect(lifetimeOrbits(150)).toBe(1);
    expect(lifetimeOrbits(400)).toBe(25);
    expect(lifetimeOrbits(500)).toBe(49);
    for (let alt = 100; alt < 900; alt += 50) expect(lifetimeOrbits(alt + 50)).toBeGreaterThanOrEqual(lifetimeOrbits(alt));
  });
});

describe("енергія й дані", () => {
  it("netPowerW: на сонці все вимкнено заряджає на різницю панелей і бази", () => {
    expect(netPowerW(power, off, true)).toBe(140);
  });

  it("netPowerW: у тіні нема генерації, тумблери додають споживання", () => {
    expect(netPowerW(power, off, false)).toBe(-20);
    expect(netPowerW(power, { ...off, camera: true, heater: true }, false)).toBe(-65);
    expect(netPowerW(power, { camera: true, transmitter: true, heater: true, safeMode: false }, false)).toBe(-95);
  });

  it("netPowerW: безпечний режим вимикає камеру й передавач, база вдвічі менша, обігрів лишається", () => {
    const loads = { camera: true, transmitter: true, heater: false, safeMode: true };
    expect(netPowerW(power, loads, false)).toBe(-10);
    expect(netPowerW(power, { ...loads, heater: true }, false)).toBe(-25);
  });

  it("netPowerW: пошкодження панелей зменшує генерацію", () => {
    expect(netPowerW(power, off, true, 0.5)).toBe(60);
    expect(netPowerW(power, off, true, 1)).toBe(-20);
    expect(netPowerW(power, off, false, 0.5)).toBe(-20);
  });

  it("shadowNeedWh: камера й обігрів протягом тіні", () => {
    expect(shadowNeedWh(power, 3600)).toBeCloseTo(65);
    expect(shadowNeedWh(power, 0)).toBe(0);
  });

  it("stepCharge: рахує Вт·год і тримається в межах 0..ємність", () => {
    expect(stepCharge(50, 100, 10, 3600)).toBe(60);
    expect(stepCharge(50, 100, 100, 3600)).toBe(100);
    expect(stepCharge(50, 100, -100, 3600)).toBe(0);
    expect(stepCharge(50, 100, 0, 3600)).toBe(50);
  });

  it("downlinkMb: лише коли активно, не більше буфера, пошкодження знижує швидкість", () => {
    expect(downlinkMb(100, 10, 0, 5, false)).toBe(0);
    expect(downlinkMb(100, 10, 0, 5, true)).toBe(50);
    expect(downlinkMb(30, 10, 0, 5, true)).toBe(30);
    expect(downlinkMb(100, 10, 0.5, 5, true)).toBe(25);
    expect(downlinkMb(0, 10, 0, 5, true)).toBe(0);
  });
});
