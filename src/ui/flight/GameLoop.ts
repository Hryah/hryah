import type { FlightAction, FlightState } from "../../core/flight";
import { SoundEngine } from "./audio/SoundEngine";
import { Camera2D } from "./Camera2D";
import { DockingGame } from "./minigames/DockingGame";
import { LifeSupportGame } from "./minigames/LifeSupportGame";
import { SolarGame } from "./minigames/SolarGame";
import { DiegeticHUD } from "./render/DiegeticHUD";
import { ParticleSystem } from "./render/ParticleSystem";
import { StationRenderer } from "./render/StationRenderer";

export class GameLoop {
  public readonly camera = new Camera2D();
  public readonly stationRenderer = new StationRenderer();
  public readonly hudRenderer = new DiegeticHUD();
  public readonly particles = new ParticleSystem();
  public readonly sound = new SoundEngine();
  public readonly dockingGame = new DockingGame();
  public readonly solarGame = new SolarGame();
  public readonly lifeSupportGame = new LifeSupportGame();

  private rafId: number | null = null;
  private lastTimestampMs = 0;
  private lastAlarmBeepTimeS = 0;
  private roamKeysHeld = { w: false, a: false, s: false, d: false };

  public setRoamKey(code: string, held: boolean): boolean {
    if (code === "KeyW" || code === "ArrowUp") {
      this.roamKeysHeld.w = held;
      return true;
    }
    if (code === "KeyS" || code === "ArrowDown") {
      this.roamKeysHeld.s = held;
      return true;
    }
    if (code === "KeyA" || code === "ArrowLeft") {
      this.roamKeysHeld.a = held;
      return true;
    }
    if (code === "KeyD" || code === "ArrowRight") {
      this.roamKeysHeld.d = held;
      return true;
    }
    return false;
  }

  public resetRoamKeys(): void {
    this.roamKeysHeld = { w: false, a: false, s: false, d: false };
  }

  public start(
    canvas: HTMLCanvasElement,
    getState: () => FlightState,
    dispatch: (action: FlightAction) => void,
  ): void {
    this.stop();
    this.lastTimestampMs = performance.now();

    const initial = getState();
    const initRect = canvas.getBoundingClientRect();
    this.camera.snapToModule(
      initial.activeModuleId,
      Math.max(320, Math.round(initRect.width)),
      Math.max(240, Math.round(initRect.height)),
    );

    const frame = (nowMs: number) => {
      const rawDtS = (nowMs - this.lastTimestampMs) / 1000;
      this.lastTimestampMs = nowMs;
      const dtS = Math.max(0.001, Math.min(0.05, rawDtS));

      const prevState = getState();

      // Плавне ковзання вздовж поручня клавішами WASD / Стрілками, коли космонавт ANCHORED
      if (
        prevState.gameMode === "STATION_ROAM" &&
        prevState.astronaut.state === "ANCHORED"
      ) {
        const dirX =
          (this.roamKeysHeld.d ? 1 : 0) - (this.roamKeysHeld.a ? 1 : 0);
        const dirY =
          (this.roamKeysHeld.s ? 1 : 0) - (this.roamKeysHeld.w ? 1 : 0);
        if (dirX !== 0 || dirY !== 0) {
          dispatch({ type: "slide_along_handle", dirX, dirY, dtS });
        }
      }

      if (
        !prevState.phaseDone &&
        prevState.gameMode !== "GAME_OVER" &&
        prevState.gameMode !== "VICTORY"
      ) {
        dispatch({ type: "tick", dtS });
      }

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const viewportW = Math.max(320, Math.round(rect.width));
      const viewportH = Math.max(240, Math.round(rect.height));

      const updatedState = getState();

      // Реактивні звукові ефекти та частинки на переходи станів
      this.processJuiceEvents(prevState, updatedState, dtS);

      this.camera.updateFromState(updatedState, dtS, viewportW, viewportH);

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

        // 1. Відмальовка станції, частинок та космонавта у World Space
        this.stationRenderer.render(
          ctx,
          updatedState,
          this.camera,
          viewportW,
          viewportH,
          this.particles,
        );

        // 2. Дієгетичний HUD, тактичний радар та стрілки позаекранних терміналів
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

  private processJuiceEvents(
    prev: FlightState,
    curr: FlightState,
    dtS: number,
  ): void {
    // 1. Відштовхування від поручня (ANCHORED -> FLYING)
    if (
      prev.astronaut.state === "ANCHORED" &&
      curr.astronaut.state === "FLYING"
    ) {
      const speed = Math.hypot(curr.astronaut.vel.vx, curr.astronaut.vel.vy);
      this.particles.spawnPushOff(
        prev.astronaut.pos.x,
        prev.astronaut.pos.y,
        curr.astronaut.vel.vx,
        curr.astronaut.vel.vy,
      );
      this.sound.playLaunch(Math.min(1, speed / 650));
    }

    // 2. Захват поручня (FLYING/STUNNED -> ANCHORED)
    if (
      prev.astronaut.state !== "ANCHORED" &&
      curr.astronaut.state === "ANCHORED"
    ) {
      this.particles.spawnGrabLatch(
        curr.astronaut.pos.x,
        curr.astronaut.pos.y,
      );
      this.sound.playGrab();
    }

    // 3. Рикошет об стіну або колону (різкий стрибок screenShakePx під час польоту)
    if (
      curr.gameMode === "STATION_ROAM" &&
      curr.astronaut.state !== "ANCHORED" &&
      curr.screenShakePx > prev.screenShakePx + 1.2
    ) {
      const stunned = curr.astronaut.state === "STUNNED";
      const impactSpeed = stunned ? 550 : 280;
      this.particles.spawnWallImpact(
        curr.astronaut.pos.x,
        curr.astronaut.pos.y,
        impactSpeed,
      );
      this.sound.playWallBounce(impactSpeed, stunned);
    }

    // 4. Постріл аварійного мікро-двигуна (thrusterCharges зменшився)
    if (curr.astronaut.thrusterCharges < prev.astronaut.thrusterCharges) {
      this.particles.spawnThrusterPlume(
        curr.astronaut.pos.x,
        curr.astronaut.pos.y,
        Math.cos(curr.astronaut.angle),
        Math.sin(curr.astronaut.angle),
      );
      this.sound.playThrusterBurst();
    }

    // 5. Відкриття термінала мінігри
    if (
      prev.gameMode === "STATION_ROAM" &&
      curr.gameMode === "MINIGAME_ACTIVE"
    ) {
      this.resetRoamKeys();
      this.sound.playTerminalOpen();
    }

    // 6. Успішне проходження мінігри або відкриття нового відсіку
    if (
      prev.gameMode === "MINIGAME_ACTIVE" &&
      (curr.gameMode === "MODULE_EXPANSION_CUTSCENE" ||
        curr.gameMode === "VICTORY" ||
        (curr.gameMode === "STATION_ROAM" &&
          prev.activeMinigame.terminalId &&
          curr.terminals.find((t) => t.id === prev.activeMinigame.terminalId)
            ?.state === "IDLE"))
    ) {
      this.sound.playTerminalSuccess();
    }

    // 7. Періодичний звуковий сигнал при критичній аварії
    const hasCritical = curr.terminals.some(
      (t) =>
        curr.unlockedModuleIds.includes(t.moduleId) && t.state === "CRITICAL",
    );
    if (hasCritical && curr.timeElapsedS - this.lastAlarmBeepTimeS > 1.8) {
      this.lastAlarmBeepTimeS = curr.timeElapsedS;
      this.sound.playAlarmPing();
    }

    this.particles.update(
      dtS,
      curr.astronaut.pos,
      curr.astronaut.vel,
      curr.astronaut.state !== "ANCHORED",
    );
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
