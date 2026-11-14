import { describe, expect, it } from "vitest";
import agenciesData from "../../data/agencies.json";
import marketData from "../../data/market.json";
import type { DesignInput, MissionOutcome, SpacecraftSpec } from "../contracts";
import { designPhase, launchBlockers } from "../design";
import type { AgencyProfile } from "../design/agency";
import { summarize, sweepDesigns } from "../sim";
import { SAMPLE_CATALOG, SAMPLE_MISSION, stubDesign } from "../stubs";
import { applyMarket, checkMarket, priceFactor, type Market } from "./market";
import { diversityMultiplier, qualityFactor, runValueMUsd, settleRewards, timeFactor, TUNING, type AgencyRun } from "./reward";
import {
  ACTIONS_PER_TURN, DEFAULT_DEADLINE_TURN, inputFor, newConsortium, stepConsortium, type ConsortiumAction, type ConsortiumState,
} from "./session";

const market = marketData as Market;
const agencies = Object.values(agenciesData) as AgencyProfile[];
const base: DesignInput = { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG };
const usa = agencies.find((a) => a.id === "usa")!;
const india = agencies.find((a) => a.id === "india")!;
const esa = agencies.find((a) => a.id === "esa")!;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("ринок у часі", () => {
  it("дані ринку коректні", () => expect(() => checkMarket(market)).not.toThrow());

  it("ціна лінійно падає від startFactor до 1", () => {
    const e = { fromTurn: 2, startFactor: 2, settleTurn: 6 };
    expect(priceFactor(e, 1)).toBeNull();
    expect(priceFactor(e, 2)).toBe(2);
    expect(priceFactor(e, 4)).toBe(1.5);
    expect(priceFactor(e, 6)).toBe(1);
    expect(priceFactor(e, 99)).toBe(1);
  });

  it("кращі модулі з'являються пізніше, а в кожному слоті є що обрати з першого ходу", () => {
    const early = applyMarket(base, market, 0).catalog.modules;
    expect(early.some((m) => m.id === "cam-l")).toBe(false);
    for (const slot of ["engine", "solar", "battery", "antenna", "instrument"]) {
      expect(early.some((m) => m.slot === slot)).toBe(true);
    }
    expect(applyMarket(base, market, 4).catalog.modules.some((m) => m.id === "cam-l")).toBe(true);
  });

  it("модулі дешевшають з часом і не змінюють вхідні дані", () => {
    const before = JSON.stringify(base);
    const cost = (turn: number) => applyMarket(base, market, turn).catalog.modules.find((m) => m.id === "cam-m")?.costMUsd ?? 0;
    expect(cost(0)).toBeGreaterThan(cost(3));
    expect(cost(3)).toBeGreaterThan(cost(6));
    expect(JSON.stringify(base)).toBe(before);
  });

  it("відхиляє некоректний ринок", () => {
    expect(() => checkMarket({ x: { fromTurn: 3, startFactor: 1, settleTurn: 3 } })).toThrow();
    expect(() => checkMarket({ x: { fromTurn: 0, startFactor: 0.5, settleTurn: 3 } })).toThrow();
  });

  for (const agency of agencies) {
    it(`${agency.id}: на першому ході й на дедлайні місію можна виграти`, () => {
      for (const turn of [0, DEFAULT_DEADLINE_TURN]) {
        const input = inputFor(base, market, agency, turn);
        expect(summarize(sweepDesigns(input.mission, input.catalog)).wins, `${agency.id} turn ${turn}`).toBeGreaterThan(0);
      }
    });
  }
});

// Допоміжний запуск: беремо проєкт, рахуємо spec і підставляємо результат.
function run(agencyId: string, launchTurn: number, deliveredMb: number, resolutionM: number, instrument = "cam-m", altKm = 500): AgencyRun {
  const { result } = stubDesign(base, { ...designPhase.init(base, 0).design, altKm, modules: { ...designPhase.init(base, 0).design.modules, instrument } });
  const spec: SpacecraftSpec = { ...result, resolutionM };
  const outcome: MissionOutcome = { success: true, deliveredMb, survivedOrbits: 10, score: 0 };
  return { agencyId, launchTurn, spec, outcome };
}

describe("нагорода", () => {
  const m = SAMPLE_MISSION; // потрібна різкість 2 м

  it("якість: різкіше за вимогу краще, але в межах", () => {
    expect(qualityFactor(m, { resolutionM: 1 } as SpacecraftSpec)).toBe(2);
    expect(qualityFactor(m, { resolutionM: 2 } as SpacecraftSpec)).toBe(1);
    expect(qualityFactor(m, { resolutionM: 4 } as SpacecraftSpec)).toBe(0.5);
    expect(qualityFactor(m, { resolutionM: 0.01 } as SpacecraftSpec)).toBe(TUNING.qualityMax);
    expect(qualityFactor(m, { resolutionM: 1000 } as SpacecraftSpec)).toBe(TUNING.qualityMin);
  });

  it("очікування коштує цінності, але не нижче підлоги", () => {
    expect(timeFactor(0)).toBe(1);
    expect(timeFactor(5)).toBeLessThan(timeFactor(2));
    expect(timeFactor(1000)).toBe(TUNING.timeFloor);
  });

  it("цінність = дані × якість × час", () => {
    expect(runValueMUsd(m, run("a", 0, 20000, 2))).toBe(20);
    expect(runValueMUsd(m, run("a", 0, 20000, 1))).toBe(40);
  });

  it("виплати діляться пропорційно внескам", () => {
    const s = settleRewards(m, [run("a", 0, 10000, 2, "cam-m", 450), run("b", 0, 10000, 2, "cam-m", 450)]);
    expect(s.payouts.map((p) => p.share)).toEqual([0.5, 0.5]);
    expect(s.payouts[0]?.payoutMUsd).toBe(s.payouts[1]?.payoutMUsd);
    expect(s.payouts.some((p) => p.winner)).toBe(false);
  });

  it("різні апарати збільшують пул, але не понад стелю", () => {
    const same = [run("a", 0, 10000, 2, "cam-m", 450), run("b", 0, 10000, 2, "cam-m", 450)];
    const mixed = [run("a", 0, 10000, 2, "cam-m", 450), run("b", 0, 10000, 2, "cam-s", 650)];
    expect(diversityMultiplier(same)).toBe(1);
    expect(diversityMultiplier(mixed)).toBeCloseTo(1.1);
    const many = ["cam-s", "cam-m", "cam-l"].flatMap((c, i) => [run(`x${i}`, 0, 1, 2, c, 450), run(`y${i}`, 0, 1, 2, c, 750)]);
    expect(diversityMultiplier(many)).toBeCloseTo(1 + TUNING.diversityMax);
  });

  it("переможець із відривом отримує бонус, без відриву ні", () => {
    const clear = settleRewards(m, [run("a", 0, 30000, 2, "cam-m", 450), run("b", 0, 10000, 2, "cam-m", 450)]);
    expect(clear.payouts.find((p) => p.agencyId === "a")?.winner).toBe(true);
    const a = clear.payouts.find((p) => p.agencyId === "a")!;
    expect(a.payoutMUsd).toBeCloseTo(clear.poolMUsd * a.share * TUNING.winnerBonus, 1);
    const close = settleRewards(m, [run("a", 0, 12000, 2, "cam-m", 450), run("b", 0, 10000, 2, "cam-m", 450)]);
    expect(close.payouts.some((p) => p.winner)).toBe(false);
  });

  it("один запуск і порожній набір не дають переможця й не ламаються", () => {
    expect(settleRewards(m, [run("a", 0, 30000, 2)]).payouts[0]?.winner).toBe(false);
    expect(settleRewards(m, [])).toEqual({ diversity: 1, poolMUsd: 0, payouts: [] });
    expect(settleRewards(m, [run("a", 0, 0, 2), run("b", 0, 0, 2)]).payouts.every((p) => p.payoutMUsd === 0)).toBe(true);
  });
});

const start = (list: AgencyProfile[] = [usa, india, esa], deadline = DEFAULT_DEADLINE_TURN) => newConsortium(base, market, list, deadline);
const run2 = (s: ConsortiumState, ...actions: ConsortiumAction[]) => actions.reduce(stepConsortium, s);
const launch: ConsortiumAction = { type: "launch" };
const wait: ConsortiumAction = { type: "wait" };

describe("сесія: хід агенцій", () => {
  it("починає з першої агенції на ході 0 з повним лімітом дій", () => {
    const s = start();
    expect(s.turn).toBe(0);
    expect(s.active).toBe(0);
    expect(s.agencies.every((e) => e.actionsLeft === ACTIONS_PER_TURN && e.launch === null)).toBe(true);
  });

  it("не створюється без агенцій", () => expect(() => start([])).toThrow());

  it("зміна проєкту коштує дію, порожня дія безкоштовна, після ліміту дії ігноруються", () => {
    let s = start();
    s = run2(s, { type: "design", action: { type: "setModule", slot: "battery", moduleId: "bat-s" } });
    expect(s.agencies[0]?.actionsLeft).toBe(ACTIONS_PER_TURN - 1);
    const same = run2(s, { type: "design", action: { type: "setModule", slot: "battery", moduleId: "bat-m" } }); // повертає на початкове
    expect(same.agencies[0]?.actionsLeft).toBe(ACTIONS_PER_TURN - 2);
    const noop = run2(same, { type: "design", action: { type: "setModule", slot: "battery", moduleId: "bat-m" } });
    expect(noop).toBe(same);
    let spent = start();
    for (let i = 0; i < ACTIONS_PER_TURN + 2; i++) {
      spent = run2(spent, { type: "design", action: { type: "setFuel", fuelKg: 10 + i } });
    }
    expect(spent.agencies[0]?.actionsLeft).toBe(0);
    expect(spent.agencies[0]?.design.design.fuelKg).toBe(10 + ACTIONS_PER_TURN - 1);
  });

  it("confirm через дію design заборонено: запуск лише окремою дією", () => {
    const s = start();
    expect(run2(s, { type: "design", action: { type: "confirm" } })).toBe(s);
  });

  it("wait передає хід наступній, а після кола настає новий ход і ціни оновлюються", () => {
    let s = start();
    const costBefore = s.agencies[0]?.design.input.catalog.modules.find((m) => m.id === "cam-m")?.costMUsd ?? 0;
    s = run2(s, wait);
    expect(s.active).toBe(1);
    expect(s.turn).toBe(0);
    s = run2(s, wait, wait);
    expect(s.turn).toBe(1);
    expect(s.active).toBe(0);
    expect(s.agencies.every((e) => e.actionsLeft === ACTIONS_PER_TURN)).toBe(true);
    const costAfter = s.agencies[0]?.design.input.catalog.modules.find((m) => m.id === "cam-m")?.costMUsd ?? 0;
    expect(costAfter).toBeLessThan(costBefore);
  });

  it("запуск фіксує апарат, ход переходить далі, а запущена агенція пропускається", () => {
    let s = start();
    s = run2(s, launch);
    expect(s.agencies[0]?.launch?.turn).toBe(0);
    expect(s.active).toBe(1);
    s = run2(s, wait, wait); // india, esa → новий ход
    expect(s.turn).toBe(1);
    expect(s.active).toBe(1); // перша вже запущена, ходить india
  });

  it("запуск із заблокованим проєктом ігнорується", () => {
    let s = start();
    s = run2(s, { type: "design", action: { type: "setFuel", fuelKg: 100 } });
    expect(launchBlockers(s.agencies[0]!.design)).toEqual(["mass"]);
    expect(run2(s, launch)).toBe(s);
  });

  it("коли запустились усі, сесія рахує нагороду", () => {
    const s = run2(start(), launch, launch, launch);
    expect(s.result).not.toBeNull();
    expect(s.result?.runs).toHaveLength(3);
    expect(s.result?.settlement.payouts).toHaveLength(3);
    expect(run2(s, wait)).toBe(s); // після завершення нічого не змінюється
  });

  it("дедлайн: хто не запустився, лишається без внеску", () => {
    let s = start([usa, india], 1);
    s = run2(s, launch); // usa на ході 0
    s = run2(s, wait); // india чекає, настає ход 1
    expect(s.result).toBeNull();
    s = run2(s, wait); // india на ході 1 знову чекає, ход 2 > дедлайн 1
    expect(s.result?.runs.map((r) => r.agencyId)).toEqual(["usa"]);
  });

  it("якщо ніхто не запустився до дедлайну, нагорода нульова", () => {
    const s = run2(start([usa], 0), wait);
    expect(s.result?.settlement.poolMUsd).toBe(0);
  });

  it("раніший запуск цінніший за той самий апарат пізніше", () => {
    const early = run2(start([usa], 12), launch).result?.settlement.poolMUsd ?? 0;
    let late = start([usa], 12);
    for (let i = 0; i < 6; i++) late = run2(late, wait);
    late = run2(late, launch);
    expect(late.result?.settlement.poolMUsd ?? 0).toBeLessThan(early);
  });

  it("стан не мутується, детермінований і переживає JSON", () => {
    const frozen = deepFreeze(start());
    expect(() => run2(frozen, { type: "design", action: { type: "setFuel", fuelKg: 14 } }, wait, launch)).not.toThrow();
    const play = () => run2(start(), { type: "design", action: { type: "setFuel", fuelKg: 16 } }, launch, wait, launch, launch);
    expect(play()).toEqual(play());
    const s = play();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe("сесія: недоступні модулі", () => {
  it("модуль, якого ще нема на ринку, обрати не можна й це не коштує дії", () => {
    const s = start();
    const after = run2(s, { type: "design", action: { type: "setModule", slot: "battery", moduleId: "bat-l" } });
    expect(after).toBe(s);
  });
});
