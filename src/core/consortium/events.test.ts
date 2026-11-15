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

describe("події: проєкт у новому вікні", () => {
  it("модуль, що зник через зрив постачальника, замінюється в проєкті, і кампанія не падає", async () => {
    const { newConsortium, stepConsortium } = await import("./session");
    const { botAction } = await import("./bot");
    const { launchBlockers } = await import("../design");
    const { SCENARIOS } = await import("./scenarios");
    const sc = SCENARIOS["living-planet"]!;
    // Перебираємо сіди, доки не трапиться зрив на модулі, який стоїть у чийсь проєкті.
    for (let seed = 0; seed < 40; seed++) {
      let s = newConsortium({ mission: sc.mission, catalog: CAMPAIGN_CATALOG }, market, agencies, 12, seed, { campaign: sc.campaign });
      for (let g = 0; g < 3000 && !s.result; g++) {
        const n = stepConsortium(s, botAction(s));
        s = n === s ? stepConsortium(s, { type: "wait" }) : n;
        for (const e of s.agencies) {
          const ids = new Set(e.design.input.catalog.modules.map((m) => m.id));
          if (!e.launch) for (const id of Object.values(e.design.design.modules)) expect(ids.has(id), `${seed}: ${id}`).toBe(true);
          expect(() => launchBlockers(e.design)).not.toThrow();
        }
      }
      expect(s.result).not.toBeNull();
    }
  }, 60000);
});
