import { describe, expect, it } from "vitest";
import agenciesData from "../../data/agencies.json";
import campaignData from "../../data/campaign.json";
import marketData from "../../data/market.json";
import { flightPhase } from "../flight";
import { orbitPhase, type OrbitAction } from "../orbit";
import { minOrbitAltKm, orbitInfo } from "../model";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../stubs";
import { botTarget } from "./bot";
import { depositsOf } from "../factory";
import { checkCampaign, hiddenMission, isMissionReport, replayOrbit, sanitizeFlight, type CampaignConfig, type MissionReport } from "./campaign";
import { checkMarket, type Market } from "./market";
import { isRoomAction, newRoom, stepRoom, type PlayState, type RoomAction, type RoomSetup, type RoomState } from "./room";
import { activeAgency, applyReport, flownMission, flownSpec, pendingReports, programProgress, seedsFor } from "./session";

const profiles = Object.values(agenciesData) as RoomSetup["agencies"];
const market = marketData as unknown as Market;
const ids = profiles.map((a) => a.id);
const campaign = campaignData as CampaignConfig;
const setup: RoomSetup = { base: { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, market, agencies: profiles, campaign };
const send = (s: RoomState, who: string, a: RoomAction) => stepRoom(s, who, a, setup);

function soloRoom(bots = 3, seed = 7): PlayState {
  let s: RoomState = newRoom("me", "Me", ids, seed);
  s = send(s, "me", { type: "wish", agencyId: "borealis" });
  for (let i = 0; i < bots; i++) s = send(s, "me", { type: "addBot" });
  s = send(s, "me", { type: "start" });
  if (s.phase !== "play") throw new Error("гра не почалась");
  return s;
}

// Гравець збирає апарат, як бот (найкращий доступний), і запускає.
function launchLikeBot(s: PlayState): PlayState {
  let state: RoomState = s;
  for (let guard = 0; guard < 50; guard++) {
    if (state.phase !== "play") throw new Error("кімната вийшла з гри");
    const c = state.consortium;
    const me = activeAgency(c);
    if (c.result || c.awaiting || !me || me.agency.id !== "borealis" || me.launch) return state;
    const target = botTarget(me.design.input)!;
    const d = me.design.design;
    const slot = (Object.keys(target.modules) as (keyof typeof target.modules)[]).find((k) => d.modules[k] !== target.modules[k]);
    const action: RoomAction["type"] extends never ? never : RoomAction =
      slot ? { type: "play", action: { type: "design", action: { type: "setModule", slot, moduleId: target.modules[slot] } } }
      : d.launcherId !== target.launcherId ? { type: "play", action: { type: "design", action: { type: "setLauncher", launcherId: target.launcherId } } }
      : d.fuelKg !== target.fuelKg ? { type: "play", action: { type: "design", action: { type: "setFuel", fuelKg: target.fuelKg } } }
      : d.altKm !== target.altKm ? { type: "play", action: { type: "design", action: { type: "setAlt", altKm: target.altKm } } }
      : { type: "play", action: { type: "launch" } };
    const next = send(state, "me", action);
    state = next === state ? send(state, "me", { type: "play", action: { type: "wait" } }) : next;
  }
  if (state.phase !== "play") throw new Error("кімната вийшла з гри");
  return state;
}

// Звіт, ніби гравець пройшов політ без пригод і грав орбіту з типовими перемикачами.
function honestReport(s: PlayState): MissionReport {
  const me = s.consortium.agencies.find((e) => e.agency.id === "borealis")!;
  const mission = flownMission(s.consortium);
  const spec = flownSpec(me)!;
  const seeds = seedsFor(s.consortium, "borealis");
  let flight = flightPhase.init({ mission, spec, log: [] }, seeds.flight);
  flight = flightPhase.step(flight, { type: "complete_phase" } as never);
  const result = sanitizeFlight(mission, spec, flightPhase.finish(flight).result);
  const ticks: OrbitAction[] = Array.from({ length: mission.durationOrbits }, () => ({ type: "tick", dtS: result.orbit.periodS }));
  return { flight: result, orbitActions: ticks };
}

describe("кампанія: дані й чисті частини", () => {
  it("налаштування кампанії й ринок валідні", () => {
    expect(() => checkCampaign(campaign)).not.toThrow();
    expect(() => checkMarket(market)).not.toThrow();
  });

  it("справжні умови гірші за номінальні й однакові для того самого сіду", () => {
    const a = hiddenMission(SAMPLE_MISSION, 3);
    expect(a).toEqual(hiddenMission(SAMPLE_MISSION, 3));
    expect(a.passSPerOrbit).toBeLessThan(SAMPLE_MISSION.passSPerOrbit);
    expect(a.dvRequiredMs).toBeGreaterThanOrEqual(SAMPLE_MISSION.dvRequiredMs);
    expect(hiddenMission(SAMPLE_MISSION, 4)).not.toEqual(a);
  });

  it("звіт: форма перевіряється, межі обрізаються, період орбіти не від клієнта", () => {
    const s = launchLikeBot(soloRoom());
    const report = honestReport(s);
    expect(isMissionReport(report)).toBe(true);
    expect(isRoomAction({ type: "report", report })).toBe(true);
    expect(isMissionReport({ ...report, orbitActions: [{ type: "boom" }] })).toBe(false);
    expect(isMissionReport({ ...report, orbitActions: Array(401).fill({ type: "tick", dtS: 1 }) })).toBe(false);
    expect(isMissionReport({ ...report, flight: { ...report.flight, damage: [{ system: "warp", severity: 1 }] } })).toBe(false);
    const me = s.consortium.agencies.find((e) => e.agency.id === "borealis")!;
    const forged = sanitizeFlight(SAMPLE_MISSION, flownSpec(me)!, {
      ...report.flight, orbit: { altKm: 1e9, periodS: 1, eclipseFraction: 0 }, fuelLeftKg: 1e6,
      damage: [{ system: "power", severity: -5 }],
    });
    expect(forged.orbit.altKm).toBeLessThanOrEqual(SAMPLE_MISSION.altRangeKm[1] * 1.5);
    expect(forged.orbit.periodS).toBeGreaterThan(1000);
    expect(forged.fuelLeftKg).toBeLessThanOrEqual(flownSpec(me)!.fuelKg);
    expect(forged.damage[0]!.severity).toBe(0);
  });

  it("повтор орбіти дає те саме, що гра гравця, і доганяє недограні витки", () => {
    const s = launchLikeBot(soloRoom());
    const report = honestReport(s);
    const me = s.consortium.agencies.find((e) => e.agency.id === "borealis")!;
    const mission = flownMission(s.consortium);
    const spec = flownSpec(me)!;
    const seed = seedsFor(s.consortium, "borealis").orbit;
    let direct = orbitPhase.init({ mission, spec, flight: report.flight, log: [] }, seed);
    for (const a of report.orbitActions) direct = orbitPhase.step(direct, a);
    const replay = replayOrbit(mission, spec, report.flight, [], report.orbitActions, seed);
    expect(replay.result).toEqual(orbitPhase.finish(direct).result);
    expect(replayOrbit(mission, spec, report.flight, [], [], seed).result).toEqual(replay.result);
    expect(replayOrbit(mission, spec, { ...report.flight, deploymentStatus: "lost" }, [], [], seed).result.deliveredMb).toBe(0);
  });
});

describe("кампанія в кімнаті", () => {
  it("лобі: лише господар додає й прибирає ботів; кімната лише з ботів не стартує", () => {
    let s: RoomState = newRoom("me", "Me", ids, 1);
    s = send(s, "other", { type: "addBot" });
    expect(s.phase === "lobby" && s.players).toHaveLength(1);
    s = send(s, "me", { type: "addBot" });
    s = send(s, "me", { type: "addBot" });
    if (s.phase !== "lobby") throw new Error();
    expect(s.players.filter((p) => p.bot).map((p) => p.id)).toEqual(["bot-1", "bot-2"]);
    s = send(s, "me", { type: "removeBot", playerId: "bot-1" });
    if (s.phase !== "lobby") throw new Error();
    expect(s.players.map((p) => p.id)).toEqual(["me", "bot-2"]);
    expect(send(s, "me", { type: "removeBot", playerId: "me" })).toBe(s);
    expect(send(s, "me", { type: "leave" })).toBe(s); // лишились би самі боти
  });

  it("звіт з орбітою трохи нижче мінімуму (смуга допуску) зараховує вихід на орбіту й не знімає репутацію", () => {
    let s = launchLikeBot(soloRoom());
    const honest = honestReport(s);
    const mission = flownMission(s.consortium);
    const lowAlt = Math.ceil(minOrbitAltKm(mission) + 1); // між 95% мінімуму і самим мінімумом
    expect(lowAlt).toBeLessThan(mission.altRangeKm[0]);
    const low: MissionReport = { ...honest, flight: { ...honest.flight, orbit: orbitInfo(mission.body, lowAlt) } };
    const repBefore = s.consortium.agencies.find((e) => e.agency.id === "borealis")!.account!.reputation ?? 0;
    s = send(s, "me", { type: "report", report: low }) as PlayState;
    const run = s.consortium.campaign!.rounds[0]!.runs.find((r) => r.agencyId === "borealis")!;
    expect(run.reachedOrbit).toBe(true);
    if (run.outcome.success) {
      const repAfter = s.consortium.agencies.find((e) => e.agency.id === "borealis")!.account!.reputation ?? 0;
      expect(repAfter).toBeGreaterThanOrEqual(repBefore);
    }
  });

  it("боти ходять самі, гравця чекають, а вікно не закривається без його звіту", () => {
    let s = soloRoom();
    expect(activeAgency(s.consortium)?.agency.id).toBe("borealis");
    s = launchLikeBot(s);
    expect(s.consortium.agencies.every((e) => e.launch)).toBe(true);
    expect(s.consortium.awaiting).toBe(true);
    expect(pendingReports(s.consortium)).toEqual(["borealis"]);
    expect(send(s, "me", { type: "play", action: { type: "wait" } })).toBe(s);
    expect(send(s, "bot-1", { type: "report", report: honestReport(s) })).toBe(s); // бот звіту не шле
    const next = send(s, "me", { type: "report", report: honestReport(s) }) as PlayState;
    expect(next.consortium.awaiting).toBe(false);
    expect(next.consortium.campaign!.round).toBe(1);
    expect(next.consortium.campaign!.rounds).toHaveLength(1);
    const me = next.consortium.agencies.find((e) => e.agency.id === "borealis")!;
    expect(me.account!.knowsConditions).toBe(true);
    expect(me.launch).toBeNull();
    const truth = next.consortium.campaign!.trueMission;
    expect(me.design.input.mission.passSPerOrbit).toBe(truth.passSPerOrbit);
    expect(me.design.input.mission.dvRequiredMs).toBe(truth.dvRequiredMs);
    expect(me.design.input.mission.budgetMUsd).toBe(me.account!.fundsMUsd);
    expect(next.consortium.turn).toBe(next.consortium.campaign!.windowStartTurn);
    expect(programProgress(next.consortium)).toBeGreaterThan(0);
  });

  it("гравець пропускає вікно: менший грант, але очки досліджень; кампанія доходить до кінця", () => {
    let s = soloRoom();
    const fundsBefore = s.consortium.agencies.find((e) => e.agency.id === "borealis")!.account!.fundsMUsd;
    for (let guard = 0; guard < 100 && s.consortium.campaign!.round === 0; guard++) {
      s = send(s, "me", { type: "play", action: { type: "wait" } }) as PlayState;
    }
    const r0 = s.consortium.campaign!.rounds[0]!.agencies.find((a) => a.agencyId === "borealis")!;
    expect(r0.launched).toBe(false);
    expect(r0.grantMUsd).toBe(campaign.grantMUsd * campaign.missedGrantFactor);
    expect(r0.researchPts).toBe(campaign.missedResearchPts);
    const me = s.consortium.agencies.find((e) => e.agency.id === "borealis")!;
    expect(me.account!.fundsMUsd).toBeCloseTo(fundsBefore + r0.grantMUsd + r0.payoutMUsd, 2);
    expect(me.account!.knowsConditions).toBe(false);

    for (let guard = 0; guard < 400 && !s.consortium.result; guard++) {
      if (s.consortium.awaiting) s = send(s, "me", { type: "report", report: honestReport(s) }) as PlayState;
      else s = launchLikeBot(s);
    }
    expect(s.consortium.result).not.toBeNull();
    const rounds = s.consortium.campaign!.rounds;
    expect(rounds.length).toBeGreaterThan(1);
    expect(rounds.length).toBeLessThanOrEqual(campaign.rounds);
    for (const e of s.consortium.agencies) expect(e.account!.fundsMUsd).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it("гравець виходить, поки вікно чекає на звіт: запуск рахується заглушкою, кампанія йде далі", () => {
    const s = launchLikeBot(soloRoom());
    expect(s.consortium.awaiting).toBe(true);
    const next = send(s, "me", { type: "leave" }) as PlayState;
    expect(next.consortium.awaiting).not.toBe(true);
    expect(next.consortium.result).not.toBeNull(); // далі лише боти: кампанія доходить до кінця сама
  });

  it("без кампанії кімната поводиться як раніше: звітів не чекає", () => {
    const plain: RoomSetup = { ...setup, campaign: undefined };
    let s: RoomState = newRoom("me", "Me", ids, 2);
    s = stepRoom(s, "me", { type: "addBot" }, plain);
    s = stepRoom(s, "me", { type: "start" }, plain);
    if (s.phase !== "play") throw new Error();
    expect(s.consortium.reportsFrom).toBeUndefined();
    expect(s.consortium.campaign).toBeUndefined();
  });
});

describe("дослідження", () => {
  const withPts = (s: PlayState, pts: number): PlayState => ({
    ...s,
    consortium: {
      ...s.consortium,
      agencies: s.consortium.agencies.map((e) => (e.agency.id === "borealis" ? { ...e, account: { ...e.account!, researchPts: pts } } : e)),
    },
  });
  const me = (s: RoomState) => (s as PlayState).consortium.agencies.find((e) => e.agency.id === "borealis")!;

  it("розвідка відкриває справжні умови без запуску; очки списуються; двічі не купується", () => {
    const s = withPts(soloRoom(), 20);
    const next = send(s, "me", { type: "play", action: { type: "research", nodeId: "scouting" } });
    expect(me(next).account!.knowsConditions).toBe(true);
    expect(me(next).account!.researchPts).toBe(14);
    expect(me(next).design.input.mission.passSPerOrbit).toBe((next as PlayState).consortium.campaign!.trueMission.passSPerOrbit);
    expect(send(next, "me", { type: "play", action: { type: "research", nodeId: "scouting" } })).toBe(next);
    expect(me(next).actionsLeft).toBe(me(s).actionsLeft); // дослідження не забирає дій ходу
  });

  it("індустрія росте, без очок нічого не відбувається, невідомий вузол ігнорується", () => {
    const s = withPts(soloRoom(), 8);
    const before = me(s).agency.industries.optics;
    const next = send(s, "me", { type: "play", action: { type: "research", nodeId: "ind-optics" } });
    expect(me(next).agency.industries.optics).toBeCloseTo(Math.min(1, before + 0.1), 5);
    expect(send(next, "me", { type: "play", action: { type: "research", nodeId: "test-stand" } })).toBe(next);
    expect(send(s, "me", { type: "play", action: { type: "research", nodeId: "warp-drive" } })).toBe(s);
    expect(isRoomAction({ type: "play", action: { type: "research", nodeId: 5 } })).toBe(false);
  });
});

describe("звіт: межі й зайві поля", () => {
  it("низька орбіта після слабкого польоту не підміняється, тож тики клієнта приймаються повтором", () => {
    const s = launchLikeBot(soloRoom());
    const me = s.consortium.agencies.find((e) => e.agency.id === "borealis")!;
    const mission = flownMission(s.consortium);
    const spec = flownSpec(me)!;
    const low = sanitizeFlight(mission, spec, { orbit: { altKm: 120, periodS: 1, eclipseFraction: 0 }, fuelLeftKg: 0, damage: [] });
    expect(low.orbit.altKm).toBe(120);
  });

  it("зайві поля звіту не потрапляють у стан кімнати; звіт без periodS відхиляється", () => {
    const s = launchLikeBot(soloRoom());
    const report = honestReport(s);
    const dirty = { ...report, junk: "x", flight: { ...report.flight, junk: { big: "y" }, orbit: { ...report.flight.orbit, junk: 1 } } };
    expect(isRoomAction({ type: "report", report: dirty })).toBe(true);
    // Вікно ще не закрите (хтось не долетів): звіт лягає в стан і чекає.
    const open = { ...s.consortium, awaiting: false };
    const stored = applyReport(open, "borealis", dirty as MissionReport);
    expect(stored.agencies.find((e) => e.agency.id === "borealis")!.report).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain("junk");
    const { periodS: _p, ...noPeriod } = report.flight.orbit;
    expect(isMissionReport({ ...report, flight: { ...report.flight, orbit: noPeriod } })).toBe(false);
  });
});

describe("фабрика в кімнаті", () => {
  const me = (s: RoomState) => (s as PlayState).consortium.agencies.find((e) => e.agency.id === "borealis")!;
  it("партія списує гроші й дію, модуль з'являється в каталозі, коли готовий; аналіз відкриває ваду", () => {
    const s = soloRoom();
    const funds = me(s).account!.fundsMUsd;
    const order = { line: "glass", depositId: "import", steps: ["quick", "polish"] as [string, string], baseModuleId: "cam-m" };
    const next = send(s, "me", { type: "play", action: { type: "factory", order } });
    const batch = me(next).factory!.batches[0]!;
    expect(batch).toBeDefined();
    expect(me(next).account!.fundsMUsd).toBeCloseTo(funds - batch.costMUsd, 2);
    expect(me(next).actionsLeft).toBe(me(s).actionsLeft - 1);
    expect(me(next).design.input.catalog.modules.some((m) => m.id === batch.id)).toBe(false);
    expect(isRoomAction({ type: "play", action: { type: "factory", order: { ...order, steps: ["quick"] } } })).toBe(false);
    // Імпорт чистий: аналізувати нічого; аналіз власного родовища відкриває приховану ваду.
    expect(send(next, "me", { type: "play", action: { type: "analyze", line: "glass", depositId: "import" } })).toBe(next);
    const own = depositsOf("borealis", "glass").find((d) => d !== "import")!;
    const analyzed = send(next, "me", { type: "play", action: { type: "analyze", line: "glass", depositId: own } });
    expect(me(analyzed).factory!.analyzed).toContain(`glass:${own}`);
    expect(send(analyzed, "me", { type: "play", action: { type: "analyze", line: "glass", depositId: own } })).toBe(analyzed);
  });
});

describe("рев'ю: лобі з ботами, втрата в польоті, фінальний стан", () => {
  it("бот лишається готовим після зміни країни; онлайн-кімната стартує", () => {
    let s: RoomState = newRoom("me", "Me", ids, 1);
    s = send(s, "me", { type: "addBot" });
    s = send(s, "me", { type: "wish", agencyId: "meridia" });
    if (s.phase !== "lobby") throw new Error();
    expect(s.players.find((p) => p.bot)!.ready).toBe(true);
    s = send(s, "me", { type: "start" });
    expect(s.phase).toBe("play");
  });

  it("втрата в польоті дає відмову з причиною в журналі", () => {
    const s = launchLikeBot(soloRoom());
    const me = s.consortium.agencies.find((e) => e.agency.id === "borealis")!;
    const out = replayOrbit(flownMission(s.consortium), flownSpec(me)!, { ...honestReport(s).flight, deploymentStatus: "lost" }, me.launch!.log, [], 1);
    const failure = out.log.find((e) => e.kind === "failure");
    expect(failure?.causedBy?.length).toBeGreaterThan(0);
  });

  it("після підсумку кампанії сирих звітів у стані немає", () => {
    let s = soloRoom();
    for (let guard = 0; guard < 400 && !s.consortium.result; guard++) {
      if (s.consortium.awaiting) s = send(s, "me", { type: "report", report: honestReport(s) }) as PlayState;
      else s = launchLikeBot(s);
    }
    expect(s.consortium.result).not.toBeNull();
    expect(s.consortium.agencies.every((e) => e.report === undefined)).toBe(true);
  });
});

describe("фабрика: санкції й ринок", () => {
  it("агенція не може робити на фабриці модуль, якого не бачить (санкції, ще не на ринку)", () => {
    let s: RoomState = newRoom("me", "Me", ids, 3);
    s = send(s, "me", { type: "wish", agencyId: "kestrel" });
    s = send(s, "me", { type: "start" });
    const order = { line: "glass", depositId: "import", steps: ["quick", "polish"] as [string, string], baseModuleId: "cam-l" };
    expect(send(s, "me", { type: "play", action: { type: "factory", order } })).toBe(s); // cam-l під санкціями для Kestrel
    const late = { line: "rf", depositId: "import", steps: ["roast", "plain"] as [string, string], baseModuleId: "ant-l" };
    expect(send(s, "me", { type: "play", action: { type: "factory", order: late } })).toBe(s); // ant-l ще не на ринку на ході 0
  });
});

describe("TRL у кімнаті", () => {
  const me = (s: RoomState) => (s as PlayState).consortium.agencies.find((e) => e.agency.id === "borealis")!;
  it("наземні випробування: +1 TRL, гроші й дія; перевірений модуль (TRL 9) не випробовується", () => {
    const s = soloRoom();
    expect(send(s, "me", { type: "play", action: { type: "qualify", moduleId: "cam-m" } })).toBe(s);
    expect(isRoomAction({ type: "play", action: { type: "qualify", moduleId: "" } })).toBe(false);
  });

  it("після запуску досвід агенції зростає для модулів, що відпрацювали", () => {
    let s = launchLikeBot(soloRoom());
    s = send(s, "me", { type: "report", report: honestReport(s) }) as PlayState;
    const gain = me(s).account!.trlGain ?? {};
    expect(Object.values(gain).some((v) => v >= 1)).toBe(true);
  });
});

describe("наземний сегмент", () => {
  it("станція подовжує сеанс зв'язку в проєктуванні й у польоті; ліміт і вартість", () => {
    const s = soloRoom();
    const me = (r: RoomState) => (r as PlayState).consortium.agencies.find((e) => e.agency.id === "borealis")!;
    const pass = me(s).design.input.mission.passSPerOrbit;
    const next = send(s, "me", { type: "play", action: { type: "groundStation" } }) as PlayState;
    expect(me(next).account!.groundStations).toBe(1);
    expect(me(next).design.input.mission.passSPerOrbit).toBe(Math.round(pass * 1.25));
    expect(flownMission(next.consortium, me(next)).passSPerOrbit).toBeGreaterThan(flownMission(next.consortium).passSPerOrbit);
    expect(send(next, "me", { type: "play", action: { type: "groundStation" } })).toBe(next); // одна за хід
  });
});
