import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoom } from "./online";

afterEach(() => { vi.unstubAllGlobals(); });

describe("клієнт кімнат", () => {
  it("200 з HTML замість JSON (проксі не налаштований) — це помилка, а не порожня відповідь", async () => {
    vi.stubGlobal("fetch", async () => new Response("<!doctype html>", { status: 200 }));
    await expect(createRoom("Ann")).rejects.toThrow("bad response");
  });
  it("помилка сервера зберігає його текст, а нормальна відповідь проходить", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "no such room" }), { status: 404 }));
    await expect(createRoom("Ann")).rejects.toThrow("no such room");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ code: "ABCD", player: "p", token: "t" }), { status: 200 }));
    await expect(createRoom("Ann")).resolves.toMatchObject({ code: "ABCD" });
  });
});
