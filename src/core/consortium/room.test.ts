import { describe, expect, it } from "vitest";
import agenciesData from "../../data/agencies.json";
import marketData from "../../data/market.json";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../stubs";
import { checkMarket, type Market } from "./market";
import {
  assignAgencies, newRoom, startBlockers, stepRoom, type LobbyState, type RoomAction, type RoomSetup, type RoomState,
} from "./room";

const profiles = Object.values(agenciesData) as RoomSetup["agencies"];
const market = marketData as unknown as Market;
const ids = profiles.map((a) => a.id);
const setup: RoomSetup = { base: { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, market, agencies: profiles };
const send = (s: RoomState, who: string, a: RoomAction) => stepRoom(s, who, a, setup);

function lobby(wishes: (string | null)[], seed = 1): LobbyState {
  let s: RoomState = newRoom("p0", "P0", ids, seed);
  wishes.forEach((w, i) => {
    if (i > 0) s = send(s, `p${i}`, { type: "join", name: `P${i}` });
    s = send(s, `p${i}`, { type: "wish", agencyId: w });
  });
  if (s.phase !== "lobby") throw new Error("очікувалось лобі");
  return s;
}

describe("лобі консорціуму", () => {
  it("ринок із даних валідний (страховка тесту)", () => {
    expect(() => checkMarket(market)).not.toThrow();
  });

  it("без конфліктів кожен отримує бажане", () => {
    const l = lobby([ids[0]!, ids[1]!, ids[2]!]);
    expect(assignAgencies(l).map((a) => [a.agencyId, a.how])).toEqual([[ids[0], "free"], [ids[1], "free"], [ids[2], "free"]]);
  });

  it("конфлікт: монета детермінована, переможець один, програвший отримує вільну", () => {
    const l = lobby([ids[0]!, ids[0]!]);
    const a = assignAgencies(l);
    expect(assignAgencies(l)).toEqual(a);
    expect(a.map((x) => x.agencyId).sort()).toEqual([ids[0], ids[1]].sort());
    expect(a.filter((x) => x.how === "coin")).toHaveLength(1);
    expect(a.filter((x) => x.how === "lost")).toHaveLength(1);
  });

  it("монета не завжди на користь першого місця (різні сіди)", () => {
    const winners = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const a = assignAgencies(lobby([ids[0]!, ids[0]!], seed));
      winners.add(a.find((x) => x.how === "coin")!.playerId);
    }
    expect(winners.size).toBe(2);
  });

  it("гравці без бажань отримують вільні агенції, нікому не дістається одна й та сама", () => {
    const l = lobby([null, ids[0]!, null, ids[1]!]);
    const a = assignAgencies(l);
    expect(new Set(a.map((x) => x.agencyId)).size).toBe(4);
  });

  it("newRoom відхиляє дублікати агенцій і хибний minPlayers", () => {
    expect(() => newRoom("a", "A", [ids[0]!, ids[0]!])).toThrow();
    expect(() => newRoom("a", "A", ids, 1, 99)).toThrow();
    expect(() => newRoom("a", "A", ids, 1, 0)).toThrow();
  });

  it("призначення впорядковані за порядком агенцій кімнати, а не за порядком входу", () => {
    const l = lobby([ids[3]!, ids[0]!, ids[2]!]);
    expect(assignAgencies(l).map((a) => a.agencyId)).toEqual([ids[0], ids[2], ids[3]]);
  });

  it("старт з невідомою агенцією заблокований із причиною, а не мовчки", () => {
    const l = newRoom("a", "A", ["nope", ids[0]!]);
    expect(startBlockers(l, ids)).toContain("lobby.unknownAgency");
    expect(send(l, "a", { type: "start" })).toBe(l);
  });

  it("старт лише від господаря й коли всі готові", () => {
    let s: RoomState = lobby([ids[0]!, ids[1]!]);
    expect(startBlockers(s as LobbyState)).toContain("lobby.notReady");
    expect(send(s, "p1", { type: "start" })).toBe(s);
    s = send(s, "p1", { type: "ready", ready: true });
    expect(send(s, "p1", { type: "start" })).toBe(s);
    const started = send(s, "p0", { type: "start" });
    expect(started.phase).toBe("play");
  });

  it("зміна бажання скидає готовність усіх; те саме бажання нічого не міняє; невідома агенція ігнорується", () => {
    let s: RoomState = lobby([ids[0]!, ids[1]!]);
    s = send(s, "p1", { type: "ready", ready: true });
    s = send(s, "p0", { type: "ready", ready: true });
    expect(send(s, "p1", { type: "wish", agencyId: ids[1]! })).toBe(s);
    s = send(s, "p0", { type: "wish", agencyId: ids[1]! });
    expect((s as LobbyState).players.every((p) => !p.ready)).toBe(true);
    expect(send(s, "p1", { type: "wish", agencyId: "nope" })).toBe(s);
  });

  it("не більше гравців, ніж агенцій, дублікати й порожні імена ігноруються", () => {
    let s: RoomState = lobby([null, null, null, null]);
    expect(send(s, "p9", { type: "join", name: "X" })).toBe(s);
    s = newRoom("p0", "P0", ids);
    expect(send(s, "p0", { type: "join", name: "Again" })).toBe(s);
    expect(send(s, "p5", { type: "join", name: "   " })).toBe(s);
  });

  it("господар виходить: роль переходить; останній не може вийти", () => {
    let s: RoomState = lobby([null, null]);
    s = send(s, "p0", { type: "leave" });
    expect((s as LobbyState).hostId).toBe("p1");
    expect(send(s, "p1", { type: "leave" })).toBe(s);
  });
});

describe("гра в кімнаті", () => {
  function started(): RoomState {
    let s: RoomState = lobby([ids[0]!, ids[1]!]);
    s = send(s, "p1", { type: "ready", ready: true });
    return send(s, "p0", { type: "start" });
  }

  it("дію приймає лише власник активної агенції", () => {
    const s = started();
    if (s.phase !== "play") throw new Error("очікувалась гра");
    const owner = s.assignments.find((a) => a.agencyId === s.consortium.agencies[s.consortium.active]!.agency.id)!;
    const other = owner.playerId === "p0" ? "p1" : "p0";
    expect(send(s, other, { type: "play", action: { type: "wait" } })).toBe(s);
    const moved = send(s, owner.playerId, { type: "play", action: { type: "wait" } });
    expect(moved).not.toBe(s);
  });

  it("стан кімнати серіалізується й не мутується", () => {
    const s = started();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    const before = JSON.stringify(s);
    send(s, "p0", { type: "play", action: { type: "wait" } });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("лобі-дії в грі ігноруються", () => {
    const s = started();
    expect(send(s, "p0", { type: "ready", ready: false })).toBe(s);
  });

  it("гравець, що вийшов у грі, більше не блокує чергу: його агенція пропускає ходи", () => {
    let s = started();
    if (s.phase !== "play") throw new Error("очікувалась гра");
    const g0 = s;
    const first = g0.assignments.find((a) => a.agencyId === g0.consortium.agencies[g0.consortium.active]!.agency.id)!.playerId;
    s = send(s, first, { type: "leave" });
    if (s.phase !== "play") throw new Error("очікувалась гра");
    expect(s.left).toEqual([first]);
    const after: RoomState = s;
    const activeOwner = after.phase === "play" ? after.assignments.find((a) => a.agencyId === after.consortium.agencies[after.consortium.active]?.agency.id)?.playerId : undefined;
    expect(activeOwner).not.toBe(first); // хід одразу перейшов до того, хто лишився (або гра скінчилась)
    expect(send(s, first, { type: "leave" })).toBe(s); // повторний вихід нічого не міняє
    // той, хто лишився, закінчує гру: агенція того, хто вийшов, сама чекає кожен хід
    for (let i = 0; i < 200; i++) {
      const cur: RoomState = s;
      if (cur.phase !== "play" || cur.consortium.result) break;
      const owner = cur.assignments.find((a) => a.agencyId === cur.consortium.agencies[cur.consortium.active]!.agency.id)!.playerId;
      s = send(cur, owner, { type: "play", action: { type: "wait" } });
    }
    expect(s.phase === "play" && s.consortium.result !== null).toBe(true);
  });
});
