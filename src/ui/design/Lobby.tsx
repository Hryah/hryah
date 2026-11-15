import { assignAgencies, startBlockers, DEFAULT_SCENARIO, MAX_PLAYERS, type LobbyState, type RoomAction, type ScenarioSetup } from "../../core/consortium";
import type { AgencyProfile } from "../../core/design/agency";
import { resolveAssetUrl } from "../graphics/registry";
import { t } from "../text";

// Лобі: місця, бажані країни, підказка про монету. Один компонент для обох режимів.
// local: усі гравці за одним екраном, екран керує кожним із них. Онлайн: керувати можна лише собою (meId).

export interface LobbyProps {
  room: LobbyState;
  agencies: AgencyProfile[];
  send: (playerId: string, action: RoomAction) => void;
  onStart: () => void;
  local?: boolean;
  meId?: string;
  scenarios?: Record<string, ScenarioSetup>;
}

export function Lobby({ room, agencies, send, onStart, local = false, meId, scenarios }: LobbyProps) {
  const nameOf = (id: string) => {
    const a = agencies.find((x) => x.id === id);
    return a ? t(a.nameKey) : id;
  };
  const blockers = startBlockers(
    local ? { ...room, players: room.players.map((p) => ({ ...p, ready: true })) } : room,
    agencies.map((a) => a.id),
  );
  const wishCount = (agencyId: string) => room.players.filter((p) => p.wish === agencyId).length;
  const preview = assignAgencies(room);
  const canStart = blockers.length === 0 && (local || meId === room.hostId);
  // Вільний id: максимальний числовий суфікс + 1, а не довжина списку (після виходу гравця довжина дала б дубль).
  const nextN = Math.max(0, ...room.players.map((p) => Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0))) + 1;
  const nextId = `p${nextN}`;
  const full = room.players.length >= Math.min(MAX_PLAYERS, room.agencyIds.length);
  const isHost = local || meId === room.hostId;

  return (
    <div className="mc-panel" style={{ display: "grid", gap: 14, maxWidth: 820 }} data-testid="lobby">
      <h2 style={{ margin: 0, color: "var(--c-cream)" }}>{t("ui.lobby.title")}</h2>
      <p style={{ color: "var(--c-text-muted)", margin: 0, fontSize: 14 }}>
        {t(local ? "ui.lobby.hintLocal" : "ui.lobby.hintOnline")}
      </p>
      {scenarios &&
        (() => {
          const current = scenarios[room.scenarioId ?? DEFAULT_SCENARIO];
          return (
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <strong className="mc-label">{t("ui.lobby.scenario")}</strong>
                <select
                  className="mc-select"
                  value={room.scenarioId ?? DEFAULT_SCENARIO}
                  disabled={!isHost}
                  aria-label={t("ui.lobby.scenario")}
                  onChange={(e) => send(room.hostId, { type: "scenario", scenarioId: e.target.value })}
                >
                  {Object.values(scenarios).map((s) => (
                    <option key={s.def.id} value={s.def.id}>
                      {t(s.def.titleKey)}
                    </option>
                  ))}
                </select>
              </label>
              {current && (
                <span style={{ color: "var(--c-text-muted)", fontSize: 13 }}>
                  {t(current.def.briefKey)} · {t(current.mission.titleKey)}
                </span>
              )}
            </div>
          );
        })()}

      <div style={{ display: "grid", gap: 8 }}>
        {room.players.map((p) => {
          const mine = local || p.id === meId;
          const got = preview.find((a) => a.playerId === p.id);
          // Результат монети лишається таємницею до старту: інакше його можна обійти перевибором країни.
          const contested = p.wish !== null && wishCount(p.wish) > 1;
          return (
            <div
              key={p.id}
              className="mc-stepper-box"
              style={{ justifyContent: "flex-start", gap: 12, flexWrap: "wrap" }}
            >
              <strong style={{ minWidth: 110, color: "var(--c-cream)" }}>
                {p.bot ? "🤖 " : ""}
                {p.name}
                {p.id === room.hostId ? " ★" : ""}
              </strong>
              <select
                className="mc-select"
                value={p.wish ?? ""}
                disabled={!mine || p.bot}
                aria-label={t("ui.lobby.wishFor", { player: p.name })}
                onChange={(e) => send(p.id, { type: "wish", agencyId: e.target.value || null })}
              >
                <option value="">{t("ui.lobby.anyAgency")}</option>
                {agencies
                  .filter((a) => room.agencyIds.includes(a.id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {t(a.nameKey)}
                    </option>
                  ))}
              </select>
              {contested && (
                <span style={{ color: "var(--c-orange)", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <img src={resolveAssetUrl("assets/icons/ui/coins.svg")} alt="" width={14} height={14} />
                  {t("ui.lobby.coinPending")}
                </span>
              )}
              {got && got.how === "free" && (
                <span style={{ color: "var(--c-text-muted)", fontSize: 13 }}>→ {nameOf(got.agencyId)}</span>
              )}
              {!local && !p.bot && (
                <label style={{ fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={p.ready}
                    disabled={!mine}
                    onChange={(e) => send(p.id, { type: "ready", ready: e.target.checked })}
                  />{" "}
                  {t("ui.lobby.ready")}
                </label>
              )}
              {p.bot
                ? isHost && (
                    <button
                      type="button"
                      className="mc-btn mc-btn-sm"
                      onClick={() => send(room.hostId, { type: "removeBot", playerId: p.id })}
                    >
                      ✕
                    </button>
                  )
                : mine &&
                  room.players.some((o) => o.id !== p.id && !o.bot) && (
                    <button type="button" className="mc-btn mc-btn-sm" onClick={() => send(p.id, { type: "leave" })}>
                      ✕
                    </button>
                  )}
            </div>
          );
        })}
      </div>

      {room.agencyIds.some((id) => wishCount(id) > 1) && (
        <div style={{ color: "var(--c-orange)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <img src={resolveAssetUrl("assets/icons/ui/coins.svg")} alt="" width={14} height={14} />
          {t("ui.lobby.coinHint")}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {local && (
          <button
            type="button"
            className="mc-btn"
            disabled={full}
            onClick={() => send(nextId, { type: "join", name: `Player ${nextN}` })}
          >
            + {t("ui.lobby.addPlayer")}
          </button>
        )}
        {isHost && (
          <button type="button" className="mc-btn" disabled={full} onClick={() => send(room.hostId, { type: "addBot" })}>
            + 🤖 {t("ui.lobby.addBot")}
          </button>
        )}
      </div>
      {blockers.map((b) => (
        <div key={b} style={{ color: "var(--c-text-dim)", fontSize: 13 }}>
          {t(`ui.${b}`)}
        </div>
      ))}
      <div>
        <button type="button" className="mc-btn mc-btn-primary" disabled={!canStart} onClick={onStart}>
          {t("ui.setup.start")}
        </button>
      </div>
    </div>
  );
}
