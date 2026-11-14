import type { RoomAction, RoomState } from "../../core/consortium";

// Клієнт кімнат: довге опитування сервера. Сервер лежить на тому ж хості під /api (або /experimental/api).
export interface Session { code: string; player: string; token: string }
export interface Snapshot { version: number; state: RoomState; changed: boolean }

const base = () => `${import.meta.env.BASE_URL}api/rooms`;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body;
}
const post = (path: string, body: unknown) => ({ method: "POST", body: JSON.stringify(body) }) satisfies RequestInit;

export const createRoom = (name: string) => call<Session>(base(), post("", { name }));
export const joinRoom = (code: string, name: string) =>
  call<Omit<Session, "code">>(`${base()}/${encodeURIComponent(code.trim().toUpperCase())}/join`, post("", { name }))
    .then((s) => ({ ...s, code: code.trim().toUpperCase() }));
export const sendAction = (s: Session, action: RoomAction) =>
  call<{ version: number }>(`${base()}/${s.code}/action`, post("", { player: s.player, token: s.token, action }));
export const poll = (s: Session, since: number, signal: AbortSignal) =>
  call<Snapshot>(`${base()}/${s.code}?player=${s.player}&token=${s.token}&since=${since}`, { signal });

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
