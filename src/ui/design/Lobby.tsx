import { assignAgencies, startBlockers, MAX_PLAYERS, type LobbyState, type RoomAction } from "../../core/consortium";
import type { AgencyProfile } from "../../core/design/agency";
import { t } from "../text";

// Лобі: місця, бажані країни, підказка про монету. Один компонент для обох режимів.
// local: усі гравці за одним екраном, екран керує кожним із них. Онлайн: керувати можна лише собою (meId).
const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", accent: "#5ca8ff", gold: "#ffd166" };
const button = {
  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 15,
} as const;

export interface LobbyProps {
  room: LobbyState;
  agencies: AgencyProfile[];
  send: (playerId: string, action: RoomAction) => void;
  onStart: () => void;
  local?: boolean;
  meId?: string;
}

export function Lobby({ room, agencies, send, onStart, local = false, meId }: LobbyProps) {
  const nameOf = (id: string) => { const a = agencies.find((x) => x.id === id); return a ? t(a.nameKey) : id; };
  const blockers = startBlockers(local ? { ...room, players: room.players.map((p) => ({ ...p, ready: true })) } : room);
  const wishCount = (agencyId: string) => room.players.filter((p) => p.wish === agencyId).length;
  const preview = assignAgencies(room);
  const canStart = blockers.length === 0 && (local || meId === room.hostId);
  const nextId = `p${room.players.length + 1}`;
  const full = room.players.length >= Math.min(MAX_PLAYERS, room.agencyIds.length);

  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 20, display: "grid", gap: 12 }} data-testid="lobby">
      <h2 style={{ margin: 0 }}>{t("ui.lobby.title")}</h2>
      <p style={{ color: C.dim, margin: 0 }}>{t(local ? "ui.lobby.hintLocal" : "ui.lobby.hintOnline")}</p>
      {room.players.map((p) => {
        const mine = local || p.id === meId;
        const got = preview.find((a) => a.playerId === p.id);
        return (
          <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ minWidth: 110 }}>{p.name}{p.id === room.hostId ? " ★" : ""}</strong>
            <select value={p.wish ?? ""} disabled={!mine} aria-label={t("ui.lobby.wishFor", { player: p.name })}
              onChange={(e) => send(p.id, { type: "wish", agencyId: e.target.value || null })}>
              <option value="">{t("ui.lobby.anyAgency")}</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{t(a.nameKey)}</option>)}
            </select>
            {got && <span style={{ color: C.dim, fontSize: 13 }}>→ {nameOf(got.agencyId)}{got.how === "coin" ? ` 🪙 ${t("ui.lobby.coinWon")}` : got.how === "lost" ? ` (${t("ui.lobby.coinLost")})` : ""}</span>}
            {!local && <label><input type="checkbox" checked={p.ready} disabled={!mine} onChange={(e) => send(p.id, { type: "ready", ready: e.target.checked })} /> {t("ui.lobby.ready")}</label>}
            {mine && room.players.length > 1 && <button style={button} onClick={() => send(p.id, { type: "leave" })}>✕</button>}
          </div>
        );
      })}
      {room.agencyIds.some((id) => wishCount(id) > 1) && <div style={{ color: C.gold, fontSize: 13 }}>🪙 {t("ui.lobby.coinHint")}</div>}
      {local && (
        <div>
          <button style={button} disabled={full} onClick={() => send(nextId, { type: "join", name: `Player ${room.players.length + 1}` })}>
            + {t("ui.lobby.addPlayer")}
          </button>
        </div>
      )}
      {blockers.map((b) => <div key={b} style={{ color: C.dim, fontSize: 13 }}>{t(`ui.${b}`)}</div>)}
      <div>
        <button style={{ ...button, borderColor: C.accent, opacity: canStart ? 1 : 0.5 }} disabled={!canStart} onClick={onStart}>
          {t("ui.setup.start")}
        </button>
      </div>
    </div>
  );
}
