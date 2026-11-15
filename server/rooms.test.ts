import { describe, expect, it, afterEach } from "vitest";
import agenciesData from "../src/data/agencies.json";
import marketData from "../src/data/market.json";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../src/core/stubs";
import type { AgencyProfile } from "../src/core/design/agency";
import type { Market, RoomState } from "../src/core/consortium";
import { Rooms, createRoomsServer } from "./rooms";

const setup = {
  base: { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG },
  market: marketData as unknown as Market,
  agencies: Object.values(agenciesData) as AgencyProfile[],
};

let closer: (() => void) | null = null;
afterEach(() => { closer?.(); closer = null; });

async function boot(pollMs = 300) {
  const rooms = new Rooms({ setup });
  const server = createRoomsServer(rooms, pollMs);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  closer = () => server.close();
  const post = async (path: string, body: unknown) => {
    const r = await fetch(base + path, { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, any> };
  };
  const get = async (path: string, who?: Record<string, string>) => {
    const r = await fetch(base + path, who ? { headers: { authorization: `Bearer ${who.token ?? ""}`, "x-hryah-player": who.player ?? "" } } : undefined);
    return { status: r.status, json: (await r.json()) as Record<string, any> };
  };
  return { rooms, post, get };
}

describe("сервер кімнат", () => {
  it("створення, вхід, довге опитування бачить зміну, гра до ходу власника", async () => {
    const { post, get } = await boot();
    const a = (await post("/api/rooms", { name: "Ann" })).json;
    expect(a.code).toMatch(/^[A-Z]{4}$/);
    const b = (await post(`/api/rooms/${a.code}/join`, { name: "Bob" })).json;
    expect(b.token).toBeTruthy();

    // опитування Анни чекає, поки Боб поставить готовність
    const waiting = get(`/api/rooms/${a.code}?since=2`, a);
    await post(`/api/rooms/${a.code}/action`, { player: b.player, token: b.token, action: { type: "ready", ready: true } });
    const seen = (await waiting).json;
    expect(seen.changed).toBe(true);
    expect((seen.state as RoomState).phase).toBe("lobby");

    // чужий не стартує
    const bad = await post(`/api/rooms/${a.code}/action`, { player: b.player, token: b.token, action: { type: "start" } });
    expect((await get(`/api/rooms/${a.code}?since=0`, a)).json.state.phase).toBe("lobby");
    expect(bad.status).toBe(200);
    await post(`/api/rooms/${a.code}/action`, { player: a.player, token: a.token, action: { type: "start" } });
    const st = (await get(`/api/rooms/${a.code}?since=0`, a)).json.state as RoomState;
    expect(st.phase).toBe("play");
  });

  it("без токена, з чужим токеном і з вигаданою кімнатою відмовляє", async () => {
    const { post, get } = await boot();
    const a = (await post("/api/rooms", { name: "Ann" })).json;
    expect((await get(`/api/rooms/${a.code}?since=0`, { player: a.player, token: "nope" })).status).toBe(403);
    expect((await post(`/api/rooms/${a.code}/action`, { player: a.player, token: "", action: { type: "start" } })).status).toBe(403);
    expect((await post("/api/rooms/ZZZZ/join", { name: "X" })).status).toBe(404);
    expect((await post("/api/rooms", { name: "  " })).status).toBe(400);
    expect((await post(`/api/rooms/${a.code}/join`, { name: "   " })).status).toBe(400); // і join, і create відповідають однаково
  });

  it("не пускає після старту й понад кількість агенцій; сміттєві дії не валять сервер", async () => {
    const { post, get } = await boot();
    const a = (await post("/api/rooms", { name: "Ann" })).json;
    for (let i = 0; i < 3; i++) expect((await post(`/api/rooms/${a.code}/join`, { name: `P${i}` })).status).toBe(200);
    expect((await post(`/api/rooms/${a.code}/join`, { name: "Late" })).status).toBe(409);
    for (const action of [null, "x", { type: "nope" }, { type: "play", action: { type: "design", action: { type: "setFuel", fuelKg: "boom" } } }]) {
      const r = await post(`/api/rooms/${a.code}/action`, { player: a.player, token: a.token, action });
      expect([200, 400]).toContain(r.status);
    }
    expect((await get(`/api/rooms/${a.code}?since=0`, a)).status).toBe(200);
  });

  it("порожнє опитування повертається за таймаутом без змін", async () => {
    const { post, get } = await boot(100);
    const a = (await post("/api/rooms", { name: "Ann" })).json;
    const r = (await get(`/api/rooms/${a.code}?since=99`, a)).json;
    expect(r.changed).toBe(false);
  });

  it("останній гравець виходить із лобі: кімната закривається; опитування не продовжує життя кімнати", async () => {
    let t = 0;
    const rooms = new Rooms({ setup, now: () => t });
    const a = rooms.create("Ann");
    if ("error" in a) throw new Error(a.error);
    await rooms.poll(a.code, a.player, a.token, 99, 5);
    t = 7 * 60 * 60 * 1000; // опитування були, дій не було
    rooms.sweep();
    expect(rooms.size()).toBe(0);
    const b = rooms.create("Bob");
    if ("error" in b) throw new Error(b.error);
    rooms.act(b.code, b.player, b.token, { type: "leave" });
    expect(rooms.size()).toBe(0);
  });

  it("відхиляє дії з хибними типами полів і зайві сегменти шляху", async () => {
    const { post } = await boot();
    const a = (await post("/api/rooms", { name: "Ann" })).json;
    const act = (action: unknown) => post(`/api/rooms/${a.code}/action`, { player: a.player, token: a.token, action });
    expect((await act({ type: "ready", ready: "yes" })).status).toBe(400);
    expect((await act({ type: "wish", agencyId: 5 })).status).toBe(400);
    expect((await act({ type: "play", action: "x" })).status).toBe(400);
    expect((await act({ type: "play", action: { type: "design", action: { type: "setFuel", fuelKg: "boom" } } })).status).toBe(400);
    expect((await act({ type: "join", name: "x" })).status).toBe(400);
    expect((await act({ type: "ready", ready: true })).status).toBe(200);
    expect((await post(`/api/rooms/${a.code}/join/extra`, { name: "X" })).status).toBe(404);
  });

  it("кімната закривається, коли всі гравці вийшли після гри; порожнє опитування не шле стан", async () => {
    const rooms = new Rooms({ setup });
    const a = rooms.create("Ann");
    if ("error" in a) throw new Error(a.error);
    const b = rooms.join(a.code, "Bob");
    if ("error" in b) throw new Error(b.error);
    rooms.act(a.code, b.player, b.token, { type: "ready", ready: true });
    rooms.act(a.code, a.player, a.token, { type: "start" });
    const unchanged = await rooms.poll(a.code, a.player, a.token, 9999, 5);
    expect("state" in unchanged).toBe(false);
    rooms.act(a.code, a.player, a.token, { type: "leave" });
    expect(rooms.size()).toBe(1); // Bob ще в грі
    rooms.act(a.code, b.player, b.token, { type: "leave" });
    expect(rooms.size()).toBe(0);
  });
});

describe("неактивні гравці й рестарт", () => {
  const clock = () => { let t = 1_000; return { now: () => t, advance: (ms: number) => { t += ms; } }; };
  const stateOf = async (rooms: Rooms, code: string, p: { player: string; token: string }) => {
    const r = await rooms.poll(code, p.player, p.token, 0, 0);
    return "error" in r ? null : (r.state as RoomState);
  };

  it("гравець, що зник із лобі без «Вийти», зникає зі списку, а господар переходить далі", async () => {
    const c = clock();
    const rooms = new Rooms({ setup, now: c.now, idleMs: 1000 });
    const a = rooms.create("Ann") as { code: string; player: string; token: string };
    const b = rooms.join(a.code, "Bob") as { player: string; token: string };
    c.advance(500);
    await rooms.poll(a.code, a.player, a.token, 0, 0); // Ann ще тут
    c.advance(700);
    rooms.sweep(); // Bob мовчить 1200 мс
    const s = await stateOf(rooms, a.code, a);
    expect(s?.phase === "lobby" && s.players.map((p) => p.id)).toEqual([a.player]);
    expect(await stateOf(rooms, a.code, b)).toBeNull(); // токен Боба вже недійсний
  });

  it("той, хто тримає опитування, не вважається зниклим; останній зниклий закриває кімнату", async () => {
    const c = clock();
    const rooms = new Rooms({ setup, now: c.now, idleMs: 1000, lobbyAloneIdleMs: 1000 });
    const a = rooms.create("Ann") as { code: string; player: string; token: string };
    const pending = rooms.poll(a.code, a.player, a.token, 99, 50); // відкрите опитування
    c.advance(5000);
    rooms.sweep();
    expect(rooms.size()).toBe(1);
    await pending;
    c.advance(5000);
    rooms.sweep();
    expect(rooms.size()).toBe(0);
  });

  it("господар сам у лобі (пішов надіслати код) тримає кімнату до 10 хвилин, а не 90 секунд", () => {
    const c = clock();
    const rooms = new Rooms({ setup, now: c.now });
    const a = rooms.create("Ann") as { code: string; player: string; token: string };
    c.advance(5 * 60 * 1000); // вкладка у фоні: опитування немає
    rooms.sweep();
    expect(rooms.size()).toBe(1);
    expect(rooms.join(a.code, "Bob")).toHaveProperty("token"); // друг заходить за кодом
  });

  it("господар, що мовчить понад 10 хвилин сам у лобі, закриває кімнату", () => {
    const c = clock();
    const rooms = new Rooms({ setup, now: c.now });
    rooms.create("Ann");
    c.advance(11 * 60 * 1000);
    rooms.sweep();
    expect(rooms.size()).toBe(0);
  });

  it("у грі зниклий гравець більше не блокує чергу", async () => {
    const c = clock();
    const rooms = new Rooms({ setup, now: c.now, idleMs: 1000 });
    const a = rooms.create("Ann") as { code: string; player: string; token: string };
    const b = rooms.join(a.code, "Bob") as { player: string; token: string };
    rooms.act(a.code, b.player, b.token, { type: "ready", ready: true });
    rooms.act(a.code, a.player, a.token, { type: "start" });
    c.advance(1500);
    await rooms.poll(a.code, a.player, a.token, 0, 0); // Ann жива, Bob зник
    rooms.sweep();
    const s = await stateOf(rooms, a.code, a);
    expect(s?.phase === "play" && s.left).toEqual([b.player]);
  });

  it("під час рестарту нові кімнати й входи відхиляються з 503", () => {
    const rooms = new Rooms({ setup });
    const a = rooms.create("Ann") as { code: string };
    rooms.drain();
    expect(rooms.create("Bob")).toMatchObject({ status: 503 });
    expect(rooms.join(a.code, "Bob")).toMatchObject({ status: 503 });
  });
});

describe("кімнати з ботами", () => {
  it("остання людина виходить: кімната закривається, боти її не тримають", () => {
    const rooms = new Rooms({ setup });
    const c = rooms.create("Host");
    if ("error" in c) throw new Error(c.error);
    expect(rooms.act(c.code, c.player, c.token, { type: "addBot" })).not.toHaveProperty("error");
    expect(rooms.act(c.code, c.player, c.token, { type: "start" })).not.toHaveProperty("error");
    rooms.act(c.code, c.player, c.token, { type: "leave" });
    expect(rooms.join(c.code, "Late")).toHaveProperty("error");
  });

  it("в лобі: людина виходить, лишився лише бот — кімнату закрито", () => {
    const rooms = new Rooms({ setup });
    const c = rooms.create("Host");
    if ("error" in c) throw new Error(c.error);
    rooms.act(c.code, c.player, c.token, { type: "addBot" });
    rooms.act(c.code, c.player, c.token, { type: "leave" });
    expect(rooms.join(c.code, "Late")).toHaveProperty("error");
  });
});

describe("сервер кімнат: кампанія через HTTP", () => {
  it("соло з ботом: запуск, звіт із 400 діями орбіти пролазить у ліміт тіла, вікно закривається", async () => {
    const { campaignRoomSetup } = await import("../src/core/consortium");
    const { flightPhase } = await import("../src/core/flight");
    const { flownMission, flownSpec, sanitizeFlight, seedsFor } = await import("../src/core/consortium");
    const rooms = new Rooms({ setup: campaignRoomSetup(setup.market, setup.agencies) });
    const server = createRoomsServer(rooms, 300);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
    closer = () => server.close();
    const post = async (path: string, body: unknown) => {
      const r = await fetch(base + path, { method: "POST", body: JSON.stringify(body) });
      return { status: r.status, json: (await r.json()) as Record<string, any> };
    };
    const me = (await post("/api/rooms", { name: "Ann" })).json;
    const act = (action: unknown) => post(`/api/rooms/${me.code}/action`, { player: me.player, token: me.token, action });
    expect((await act({ type: "addBot" })).status).toBe(200);
    expect((await act({ type: "start" })).status).toBe(200);
    expect((await act({ type: "play", action: { type: "launch" } })).status).toBe(200);
    const snap = await rooms.poll(me.code, me.player, me.token, 0, 0);
    if (!("state" in snap) || !snap.state || snap.state.phase !== "play") throw new Error("немає гри");
    const c = snap.state.consortium;
    expect(c.awaiting).toBe(true);
    const entry = c.agencies.find((e) => e.launch && (c.reportsFrom ?? []).includes(e.agency.id))!;
    const mission = flownMission(c);
    const spec = flownSpec(entry)!;
    let flight = flightPhase.init({ mission, spec, log: [] }, seedsFor(c, entry.agency.id).flight);
    flight = flightPhase.step(flight, { type: "complete_phase" } as never);
    const result = sanitizeFlight(mission, spec, flightPhase.finish(flight).result);
    const orbitActions = Array.from({ length: 400 }, (_, i) => (i % 2 ? { type: "tick", dtS: result.orbit.periodS } : { type: "toggle", id: "heater" }));
    const r = await act({ type: "report", report: { flight: result, orbitActions } });
    expect(r.status).toBe(200);
    const after = await rooms.poll(me.code, me.player, me.token, 0, 0);
    if (!("state" in after) || !after.state || after.state.phase !== "play") throw new Error("немає гри");
    expect(after.state.consortium.campaign!.rounds).toHaveLength(1);
  });
});
