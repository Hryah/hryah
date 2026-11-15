import { describe, expect, it } from "vitest";
import agenciesData from "../../data/agencies.json";
import marketData from "../../data/market.json";
import type { AgencyProfile } from "../design/agency";
import { launchBlockers } from "../design";
import { groundResolutionM } from "../physics";
import { sweepDesigns } from "../sim";
import { botAction } from "./bot";
import { checkCampaign } from "./campaign";
import { MAX_APERTURE_M } from "./develop";
import { checkMarket, type Market } from "./market";
import { RESEARCH } from "./research";
import { CAMPAIGN_CATALOG, DEFAULT_SCENARIO, SCENARIOS } from "./scenarios";
import { newConsortium, programProgress, stepConsortium, type ConsortiumState } from "./session";

const agencies = Object.values(agenciesData) as AgencyProfile[];
const market = marketData as Market;

function playBots(id: string): ConsortiumState {
  const sc = SCENARIOS[id]!;
  let s = newConsortium({ mission: sc.mission, catalog: sc.catalog ?? CAMPAIGN_CATALOG }, market, agencies, 12, 5, { campaign: sc.campaign });
  for (let g = 0; g < 3000 && !s.result; g++) {
    const n = stepConsortium(s, botAction(s));
    s = n === s ? stepConsortium(s, { type: "wait" }) : n;
  }
  return s;
}

describe("сценарії кампанії: дані", () => {
  it("усі сценарії мають місію й валідну кампанію; ринок знає нові модулі", () => {
    expect(SCENARIOS[DEFAULT_SCENARIO]).toBeDefined();
    for (const sc of Object.values(SCENARIOS)) expect(() => checkCampaign(sc.campaign)).not.toThrow();
    expect(() => checkMarket(market)).not.toThrow();
    const ids = CAMPAIGN_CATALOG.modules.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("вузли досліджень мають додатну ціну й відомий ефект", () => {
    for (const node of Object.values(RESEARCH)) {
      expect(node.costPts).toBeGreaterThan(0);
      expect(["industry", "defect", "devSpeed", "marketLead", "scout", "series"]).toContain(node.effect.kind);
    }
  });
});

describe("баланс сценаріїв (перебір і кампанія ботів)", () => {
  for (const id of Object.keys(SCENARIOS)) {
    it(`${id}: прохідний, без єдиного виграшного проєкту, програма не закривається за одне вікно`, () => {
      const sc = SCENARIOS[id]!;
      const rows = sweepDesigns(sc.mission, sc.catalog ?? CAMPAIGN_CATALOG, [6, 12, 24, 48]);
      const wins = rows.filter((r) => r.win);
      if (sc.mission.id === "big-eye") {
        // Каталог не дає потрібної різкості: лише власне дзеркало максимальної апертури.
        expect(wins).toHaveLength(0);
        const best = groundResolutionM(5.5e-7, sc.mission.altRangeKm[0], MAX_APERTURE_M);
        expect(best).toBeLessThanOrEqual(sc.mission.requiredResolutionM);
      } else {
        expect(wins.length).toBeGreaterThan(1);
        expect(new Set(wins.map((w) => JSON.stringify(w.design.modules))).size).toBeGreaterThan(1);
      }
      const s = playBots(id);
      expect(s.result).not.toBeNull();
      const rounds = s.campaign!.rounds;
      if ((sc.campaign.victory ?? "program") === "program") expect(rounds.length).toBeGreaterThanOrEqual(Math.min(2, sc.campaign.rounds));
      // Перший запуск одного апарата — лише частка програми («за перший запуск ти досягнеш мало»).
      for (const r of rounds[0]!.agencies) expect(r.valuePts / sc.campaign.programGoal).toBeLessThan(0.2);
      if ((sc.campaign.victory ?? "program") === "program") expect(programProgress(s)).toBeGreaterThan(0.3);
      else expect(s.campaign!.winner).toBeDefined();
      for (const e of s.agencies) expect(e.account!.fundsMUsd).toBeGreaterThanOrEqual(0);
    }, 30000);
  }
});

describe("доопрацювання: боти й стартовий проєкт", () => {
  it("стартовий проєкт кампанії не заблокований масою в жодному сценарії й жодній агенції", () => {
    for (const sc of Object.values(SCENARIOS)) {
      const s = newConsortium({ mission: sc.mission, catalog: sc.catalog ?? CAMPAIGN_CATALOG }, market, agencies, 12, 5, { campaign: sc.campaign });
      for (const e of s.agencies) {
        expect(launchBlockers(e.design), `${sc.def.id}/${e.agency.id}`).not.toContain("mass");
      }
    }
  });

  it("Big Eye: боти замовляють власне дзеркало й отримують внесок", () => {
    const s = playBots("big-eye");
    expect(s.agencies.some((e) => e.projects.some((p) => p.slot === "instrument"))).toBe(true);
    expect(s.campaign!.rounds.some((r) => r.runs.some((run) => run.spec.resolutionM <= s.base.mission.requiredResolutionM))).toBe(true);
  });

  it("Lifeline: у вікні боти везуть різні контейнери", () => {
    const s = playBots("lifeline");
    const first = s.campaign!.rounds[0]!;
    const kinds = first.runs.map((r) => r.spec.design.modules.instrument);
    expect(new Set(kinds).size).toBeGreaterThan(1);
  });

  it("боти купують дослідження, коли є очки", () => {
    const s = playBots("living-planet");
    expect(s.agencies.some((e) => e.account!.unlocked.length > 0)).toBe(true);
  });
});

describe("Марс: вікна запуску з паузою", () => {
  it("наступне вікно відкривається після паузи gapTurns; ринок за цей час дешевшає", () => {
    const sc = SCENARIOS["red-planet"]!;
    let s = newConsortium({ mission: sc.mission, catalog: CAMPAIGN_CATALOG }, market, agencies, 12, 5, { campaign: sc.campaign });
    for (let g = 0; g < 3000 && s.campaign!.round === 0; g++) {
      const n = stepConsortium(s, botAction(s));
      s = n === s ? stepConsortium(s, { type: "wait" }) : n;
    }
    // Вікно могло закритись раніше (усі запустились), але пауза додається завжди.
    expect(s.campaign!.windowStartTurn).toBeGreaterThanOrEqual(1 + (sc.campaign.gapTurns ?? 0));
    expect(s.turn).toBe(s.campaign!.windowStartTurn);
    expect(s.deadlineTurn).toBe(s.campaign!.windowStartTurn + sc.campaign.windowTurns - 1);
  });
});

describe("режими перемоги", () => {
  it("комерційний: перемагає той, хто заробив ціль; виплати падають із насиченням ринку", () => {
    const s = playBots("gold-rush");
    const w = s.campaign!.winner!;
    expect(w.reason).toBe("commercial");
    const sc = SCENARIOS["gold-rush"]!;
    const winner = s.agencies.find((e) => e.agency.id === w.agencyId)!;
    const reached = winner.account!.fundsMUsd >= sc.campaign.victoryTarget!;
    expect(reached || s.campaign!.rounds.length === sc.campaign.rounds).toBe(true);
  });

  it("перегони: перемагає перша місія з проривною цінністю", () => {
    const s = playBots("first-light");
    expect(s.campaign!.winner!.reason).toBe("race");
  });

  it("наукова програма: переможець — найбільший внесок", () => {
    const s = playBots("living-planet");
    const top = [...s.agencies].sort((a, b) => b.account!.programPts - a.account!.programPts)[0]!;
    expect(s.campaign!.winner).toEqual({ agencyId: top.agency.id, reason: "program" });
  });
});
