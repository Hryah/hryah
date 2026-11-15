import { describe, expect, it } from "vitest";
import agenciesData from "../../data/agencies.json";
import marketData from "../../data/market.json";
import type { AgencyProfile } from "../design/agency";
import { agencyAfterEvents, catalogAfterEvents, EVENTS, rollEvent } from "./events";
import type { Market } from "./market";
import { CAMPAIGN_CATALOG } from "./scenarios";

const agencies = Object.values(agenciesData) as AgencyProfile[];
const market = marketData as Market;
const modules = CAMPAIGN_CATALOG.modules;

describe("події між вікнами", () => {
  it("кидок детермінований і за багато вікон дає різні події", () => {
    expect(rollEvent(3, 1, CAMPAIGN_CATALOG, market, agencies)).toEqual(rollEvent(3, 1, CAMPAIGN_CATALOG, market, agencies));
    const kinds = new Set<string>();
    for (let seed = 0; seed < 60; seed++) kinds.add(rollEvent(seed, 1, CAMPAIGN_CATALOG, market, agencies)?.kind ?? "none");
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    expect(EVENTS.length).toBeGreaterThan(0);
  });

  it("прорив: модуль дешевший і доступний навіть до виходу на ринок; зрив: модуль зникає; лише у своєму вікні", () => {
    const now = modules.filter((m) => m.id !== "eng-hall");
    const br = catalogAfterEvents(now, modules, [{ round: 2, id: "b", kind: "breakthrough", moduleId: "eng-hall", priceFactor: 0.6 }], 2);
    const hall = br.find((m) => m.id === "eng-hall")!;
    expect(hall.costMUsd).toBeCloseTo(modules.find((m) => m.id === "eng-hall")!.costMUsd * 0.6, 2);
    expect(catalogAfterEvents(now, modules, [{ round: 2, id: "b", kind: "breakthrough", moduleId: "eng-hall", priceFactor: 0.6 }], 3).some((m) => m.id === "eng-hall")).toBe(false);
    const dis = catalogAfterEvents(modules, modules, [{ round: 1, id: "d", kind: "disruption", moduleId: "cam-m" }], 1);
    expect(dis.some((m) => m.id === "cam-m")).toBe(false);
  });

  it("зняття санкцій діє назавжди для своєї агенції", () => {
    const kestrel = agencies.find((a) => a.id === "kestrel")!;
    expect(agencyAfterEvents(kestrel, [{ round: 1, id: "s", kind: "sanctionsLifted", agencyId: "kestrel" }]).blockedModules).toEqual([]);
    expect(agencyAfterEvents(kestrel, [{ round: 1, id: "s", kind: "sanctionsLifted", agencyId: "borealis" }]).blockedModules).toEqual(kestrel.blockedModules);
  });
});
