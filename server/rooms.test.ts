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
});
