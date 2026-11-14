import type { FlightAction, FlightState } from "../../core/flight";
import { Camera2D } from "./Camera2D";
import { DockingGame } from "./minigames/DockingGame";
import { LifeSupportGame } from "./minigames/LifeSupportGame";
import { SolarGame } from "./minigames/SolarGame";
import { DiegeticHUD } from "./render/DiegeticHUD";
import { StationRenderer } from "./render/StationRenderer";

export class GameLoop {
  public readonly camera = new Camera2D();
  public readonly stationRenderer = new StationRenderer();
  public readonly hudRenderer = new DiegeticHUD();
  public readonly dockingGame = new DockingGame();
  public readonly solarGame = new SolarGame();
  public readonly lifeSupportGame = new LifeSupportGame();

  private rafId: number | null = null;
  private lastTimestampMs = 0;

  public start(
    canvas: HTMLCanvasElement,
    getState: () => FlightState,
    dispatch: (action: FlightAction) => void,
  ): void {
    this.stop();
    this.lastTimestampMs = performance.now();

    const initial = getState();
    this.camera.x = initial.astronaut.pos.x;
    this.camera.y = initial.astronaut.pos.y;

    const frame = (nowMs: number) => {
      const rawDtS = (nowMs - this.lastTimestampMs) / 1000;
      this.lastTimestampMs = nowMs;
      const dtS = Math.max(0.001, Math.min(0.05, rawDtS));

      const currentState = getState();
      if (
        !currentState.phaseDone &&
        currentState.gameMode !== "GAME_OVER" &&
        currentState.gameMode !== "VICTORY"
      ) {
        dispatch({ type: "tick", dtS });
      }

      const updatedState = getState();
      this.camera.updateFromState(updatedState, dtS);

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const viewportW = Math.max(320, Math.round(rect.width));
      const viewportH = Math.max(240, Math.round(rect.height));

      if (
        canvas.width !== Math.round(viewportW * dpr) ||
        canvas.height !== Math.round(viewportH * dpr)
      ) {
        canvas.width = Math.round(viewportW * dpr);
        canvas.height = Math.round(viewportH * dpr);
      }

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.save();
        ctx.scale(dpr, dpr);

        // 1. Відмальовка станції та космонавта у World Space
        this.stationRenderer.render(
          ctx,
          updatedState,
          this.camera,
          viewportW,
          viewportH,
        );

        // 2. Дієгетичний HUD та стрілки позаекранних терміналів
        this.hudRenderer.render(
          ctx,
          updatedState,
          this.camera,
          viewportW,
          viewportH,
        );

        // 3. Відмальовка активної ізольованої мінігри
        if (updatedState.gameMode === "MINIGAME_ACTIVE") {
          const mg = updatedState.activeMinigame;
          if (mg.type === "DOCKING" && mg.docking) {
            this.dockingGame.render(ctx, mg.docking, viewportW, viewportH);
          } else if (mg.type === "SOLAR" && mg.solar) {
            this.solarGame.render(
              ctx,
              mg.solar,
              updatedState.timeElapsedS,
              viewportW,
              viewportH,
            );
          } else if (mg.lifeSupport) {
            this.lifeSupportGame.render(
              ctx,
              mg.lifeSupport,
              updatedState.timeElapsedS,
              viewportW,
              viewportH,
            );
          }
        }

        // 4. Екран завершення рівня (VICTORY / GAME_OVER)
        if (
          updatedState.gameMode === "VICTORY" ||
          updatedState.gameMode === "GAME_OVER"
        ) {
          this.renderEndOverlay(ctx, updatedState, viewportW, viewportH);
        }

        ctx.restore();
      }

      this.rafId = window.requestAnimationFrame(frame);
    };

    this.rafId = window.requestAnimationFrame(frame);
  }

  public stop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private renderEndOverlay(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
    viewportW: number,
    viewportH: number,
  ): void {
    const isWin = state.gameMode === "VICTORY";
    ctx.save();
    ctx.fillStyle = "rgba(4, 8, 18, 0.78)";
    ctx.fillRect(0, 0, viewportW, viewportH);

    const w = Math.min(540, viewportW - 40);
    const h = 290;
    const x = (viewportW - w) * 0.5;
    const y = (viewportH - h) * 0.5;

    ctx.fillStyle = "#0e172a";
    ctx.strokeStyle = isWin ? "#3ddc84" : "#ff4766";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isWin ? "#3ddc84" : "#ff4766";
    ctx.font = "700 22px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      isWin
        ? "✓ ОРБІТАЛЬНУ СТАНЦІЮ ЗІБРАНО!"
        : "✗ КРИТИЧНЕ ВИСНАЖЕННЯ СИСТЕМ СТАНЦІЇ",
      viewportW * 0.5,
      y + 48,
    );

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "14px monospace";
    ctx.fillText(
      `Пристиковано модулів: ${state.openedSeals.length}/3 · Висота орбіти: ${state.achievedAltKm} км`,
      viewportW * 0.5,
      y + 92,
    );
    ctx.fillText(
      `Залишок палива: ${state.fuelLeftKg.toFixed(1)} кг · Кисень: ${Math.round(state.oxygenPct)}% · Енергія: ${Math.round(state.energyPct)}%`,
      viewportW * 0.5,
      y + 122,
    );
    const damagedText =
      state.damage.length === 0
        ? "немає"
        : state.damage.map((d) => `${d.system} (${Math.round(d.severity * 100)}%)`).join(", ");
    ctx.fillText(
      `Пошкоджені підсистеми: ${damagedText}`,
      viewportW * 0.5,
      y + 152,
    );

    // Кнопка переходу до Частини 3 (Орбіта)
    const btnW = 320;
    const btnH = 48;
    const btnX = (viewportW - btnW) * 0.5;
    const btnY = y + 204;

    ctx.fillStyle = isWin ? "#15803d" : "#b91c1c";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 15px monospace";
    ctx.fillText(
      "РОЗГОРНУТИ СУПУТНИК → ФАЗА 3 [ENTER]",
      viewportW * 0.5,
      btnY + 30,
    );

    ctx.restore();
  }
}
