// Сервер кімнат консорціуму: тримає RoomState у пам'яті й застосовує дії тим самим stepRoom, що й локальний режим.
// Транспорт: звичайний HTTP з довгим опитуванням (працює через Caddy, Funnel і gzip без особливих налаштувань).
// Живе поза src/core, тож тут дозволені Node-API (crypto, таймери).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { newRoom, stepRoom, type RoomAction, type RoomSetup, type RoomState } from "../src/core/consortium";

export const POLL_MS = 25_000;
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
export const MAX_ROOMS = 50;
const MAX_BODY = 8 * 1024;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // без I та O, щоб не плутати з 1 і 0

interface Room {
  code: string;
  state: RoomState;
  version: number;
  tokens: Map<string, string>; // playerId → токен
  touched: number;
  waiters: Set<() => void>;
}

export interface RoomsOptions {
  setup: RoomSetup;
  now?: () => number;
  pollMs?: number;
}

type Json = Record<string, unknown>;
const ACTION_TYPES = new Set(["wish", "ready", "start", "leave", "play"]);

export class Rooms {
  private rooms = new Map<string, Room>();
  private now: () => number;
  private setup: RoomSetup;
  constructor(opts: RoomsOptions) {
    this.setup = opts.setup;
    this.now = opts.now ?? Date.now;
  }

  size(): number { return this.rooms.size; }

  sweep(): void {
    for (const [code, room] of this.rooms) {
      if (this.now() - room.touched > ROOM_TTL_MS && room.waiters.size === 0) this.rooms.delete(code);
    }
  }

  create(name: string): { code: string; player: string; token: string } | { error: string; status: number } {
    this.sweep();
    if (this.rooms.size >= MAX_ROOMS) return { error: "too many rooms", status: 503 };
    const cleaned = name.trim().slice(0, 24);
    if (!cleaned) return { error: "name required", status: 400 };
    let code = "";
    do { code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(""); } while (this.rooms.has(code));
    const player = randomUUID().slice(0, 8);
    const token = randomUUID();
    const ids = this.setup.agencies.map((a) => a.id);
    const state = newRoom(player, cleaned, ids, randomInt(2 ** 31));
    this.rooms.set(code, { code, state, version: 1, tokens: new Map([[player, token]]), touched: this.now(), waiters: new Set() });
    return { code, player, token };
  }

  join(code: string, name: string): { player: string; token: string } | { error: string; status: number } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { error: "no such room", status: 404 };
    const player = randomUUID().slice(0, 8);
    const next = stepRoom(room.state, player, { type: "join", name }, this.setup);
    if (next === room.state) return { error: "cannot join", status: 409 };
    const token = randomUUID();
    room.tokens.set(player, token);
    this.commit(room, next);
    return { player, token };
  }

  act(code: string, player: string, token: string, action: RoomAction): { version: number } | { error: string; status: number } {
    const room = this.auth(code, player, token);
    if (!room) return { error: "unauthorized", status: 403 };
    if (!ACTION_TYPES.has(action.type)) return { error: "bad action", status: 400 };
    let next: RoomState;
    try {
      next = stepRoom(room.state, player, action, this.setup);
    } catch {
      return { error: "bad action", status: 400 };
    }
    if (next !== room.state) {
      this.commit(room, next);
      if (action.type === "leave") room.tokens.delete(player);
    }
    return { version: room.version };
  }

  // Довге опитування: відповідає одразу, якщо версія новіша за since, інакше чекає зміни до pollMs.
  async poll(code: string, player: string, token: string, since: number, pollMs: number):
    Promise<{ version: number; state: RoomState; changed: boolean } | { error: string; status: number }> {
    const room = this.auth(code, player, token);
    if (!room) return { error: "unauthorized", status: 403 };
    if (room.version <= since) {
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); room.waiters.delete(done); resolve(); };
        const timer = setTimeout(done, pollMs);
        room.waiters.add(done);
      });
    }
    room.touched = this.now();
    return { version: room.version, state: room.state, changed: room.version > since };
  }

  hasWaiters(): boolean {
    for (const room of this.rooms.values()) if (room.waiters.size > 0) return true;
    return false;
  }

  private auth(code: string, player: string, token: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    if (!room || !token || room.tokens.get(player) !== token) return undefined;
    return room;
  }

  private commit(room: Room, state: RoomState): void {
    room.state = state;
    room.version += 1;
    room.touched = this.now();
    for (const wake of [...room.waiters]) wake();
  }
}

function readJson(req: IncomingMessage): Promise<Json> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Uint8Array[] = [];
    req.on("data", (c: Uint8Array) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const v: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        resolve(v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
      } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function createRoomsServer(rooms: Rooms, pollMs = POLL_MS): Server {
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const reply = (res: ServerResponse, r: object) => {
    const failure = r as { error?: string; status?: number };
    if (failure.error !== undefined) send(res, failure.status ?? 400, { error: failure.error });
    else send(res, 200, r);
  };

  return createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", "http://x");
        // Caddy може лишити префікс /api або зняти його: приймаємо обидва.
        const path = url.pathname.replace(/^\/api(?=\/)/, "");
        const parts = path.split("/").filter(Boolean); // rooms, CODE, join|action
        if (parts[0] !== "rooms") return send(res, 404, { error: "not found" });
        if (req.method === "POST" && parts.length === 1) {
          const body = await readJson(req);
          return reply(res, rooms.create(str(body.name)));
        }
        const code = parts[1] ?? "";
        if (req.method === "POST" && parts[2] === "join") {
          const body = await readJson(req);
          return reply(res, rooms.join(code, str(body.name)));
        }
        if (req.method === "POST" && parts[2] === "action") {
          const body = await readJson(req);
          const action = body.action;
          if (!action || typeof action !== "object") return send(res, 400, { error: "bad action" });
          return reply(res, rooms.act(code, str(body.player), str(body.token), action as RoomAction));
        }
        if (req.method === "GET" && parts.length === 2) {
          const since = Number(url.searchParams.get("since") ?? 0);
          return reply(res, await rooms.poll(code, str(url.searchParams.get("player")), str(url.searchParams.get("token")),
            Number.isFinite(since) ? since : 0, pollMs));
        }
        return send(res, 404, { error: "not found" });
      } catch {
        if (!res.headersSent) send(res, 400, { error: "bad request" });
      }
    })();
  });
}
