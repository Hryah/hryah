import type { RoomAction, RoomState } from "../../core/consortium";

// Клієнт кімнат: довге опитування сервера. Сервер лежить на тому ж хості під /api (або /experimental/api).
export interface Session { code: string; player: string; token: string }
export interface Snapshot { version: number; state?: RoomState; changed: boolean }

const base = () => `${import.meta.env.BASE_URL}api/rooms`;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body;
}
const post = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) satisfies RequestInit;

export const createRoom = (name: string) => call<Session>(base(), post({ name }));
export const joinRoom = (code: string, name: string) =>
  call<Omit<Session, "code">>(`${base()}/${encodeURIComponent(code.trim().toUpperCase())}/join`, post({ name }))
    .then((s) => ({ ...s, code: code.trim().toUpperCase() }));
export const sendAction = (s: Session, action: RoomAction) =>
  call<{ version: number }>(`${base()}/${s.code}/action`, post({ player: s.player, token: s.token, action }));
// «Вихід» важливий для сервера (звільнити місце, не блокувати чергу): при мережевому збої пробуємо ще кілька разів.
export async function sendLeave(s: Session, attempts = 3): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try { await sendAction(s, { type: "leave" }); return; } catch (e) {
      if (!(e instanceof TypeError)) return; // сервер відповів (403/404): повторювати нема сенсу
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
export const poll = (s: Session, since: number, signal: AbortSignal) =>
  call<Snapshot>(`${base()}/${s.code}?since=${since}`, { signal, headers: { authorization: `Bearer ${s.token}`, "x-hryah-player": s.player } });

// Канали / і /experimental/ живуть на одному домені, тож ключ має префікс каналу (правило 8).
const KEY = `${import.meta.env.BASE_URL}hryah.room`;
export function saveSession(s: Session | null): void {
  try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch { /* приватний режим */ }
}
export function loadSession(): Session | null {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    const s = v as Partial<Session> | null;
    return s && typeof s.code === "string" && typeof s.player === "string" && typeof s.token === "string" ? (s as Session) : null;
  } catch { return null; }
}
