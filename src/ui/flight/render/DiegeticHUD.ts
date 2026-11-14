import {
  clamp,
  type FlightState,
  WAVE_TIMINGS,
} from "../../../core/flight";
import type { Camera2D } from "../Camera2D";

export class DiegeticHUD {
  public render(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
    camera: Camera2D,
    viewportW: number,
    viewportH: number,
  ): void {
    ctx.save();

    // 1. Верхня мінімалістична приладова панель телеметрії
    this.renderTopBar(ctx, state, viewportW);

    // 2. Динамічні маркери-стрілки по краях екрана до аварійних терміналів за межами камери
    if (state.gameMode === "STATION_ROAM") {
      this.renderOffscreenTerminalArrows(ctx, state, camera, viewportW, viewportH);
    }

    // 3. Банер катсцени розширення станції (MODULE_EXPANSION_CUTSCENE)
    if (state.gameMode === "MODULE_EXPANSION_CUTSCENE") {
      this.renderCutsceneOverlay(ctx, state, viewportW, viewportH);
    }

    // 4. Короткі дієгетичні підказки керування внизу екрана
    if (state.gameMode === "STATION_ROAM") {
      this.renderBottomHint(ctx, state, viewportW, viewportH);
    }

    ctx.restore();
  }

  private renderTopBar(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
    viewportW: number,
  ): void {
    const barW = Math.min(820, viewportW - 32);
    const barX = (viewportW - barW) * 0.5;
    const barY = 14;
    const barH = 48;

    ctx.fillStyle = "rgba(8, 13, 26, 0.86)";
    ctx.strokeStyle = "rgba(92, 168, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 10);
    ctx.fill();
    ctx.stroke();

    // O2 індикатор
    this.renderGauge(
      ctx,
      barX + 18,
      barY + 11,
      135,
      "O₂ КИСЕНЬ",
      `${Math.round(state.oxygenPct)}%`,
      state.oxygenPct / 100,
      state.oxygenPct < 35 ? "#ff4766" : state.oxygenPct < 65 ? "#ffa23d" : "#38bdf8",
    );

    // Енергія станції
    this.renderGauge(
      ctx,
      barX + 172,
      barY + 11,
      135,
      "⚡ ЕНЕРГІЯ",
      `${Math.round(state.energyPct)}%`,
      state.energyPct / 100,
      state.energyPct < 35 ? "#ff4766" : state.energyPct < 65 ? "#ffa23d" : "#3ddc84",
    );

    // Температура
    const tempRatio = clamp((state.tempC - 18) / (75 - 18), 0, 1);
    this.renderGauge(
      ctx,
      barX + 326,
      barY + 11,
      125,
      "🌡 ТЕМП.",
      `${Math.round(state.tempC)}°C`,
      tempRatio,
      state.tempC > 45 ? "#ff4766" : state.tempC > 32 ? "#ffa23d" : "#5ca8ff",
    );

    // Етап розширення станції (3 стикування)
    const dockedCount = state.openedSeals.length;
    ctx.fillStyle = "#8a99b8";
    ctx.font = "700 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("СТИКУВАННЯ МОДУЛІВ", barX + 470, barY + 21);

    ctx.fillStyle = "#e8f3ff";
    ctx.font = "700 13px monospace";
    let waveLabel = `${dockedCount}/3 · `;
    if (dockedCount === 0) {
      const rem = Math.max(0, Math.ceil(WAVE_TIMINGS.wave1TimeS - state.waveClockS));
      waveLabel += rem > 0 ? `Хвиля 1 через ${rem}с` : "СХІДНИЙ ШЛЮЗ АКТИВНИЙ!";
    } else if (dockedCount === 1) {
      const rem = Math.max(0, Math.ceil(WAVE_TIMINGS.wave2TimeS - state.waveClockS));
      waveLabel += rem > 0 ? `Хвиля 2 через ${rem}с` : "ПІВНІЧНИЙ ШЛЮЗ АКТИВНИЙ!";
    } else if (dockedCount === 2) {
      const rem = Math.max(0, Math.ceil(WAVE_TIMINGS.wave3TimeS - state.waveClockS));
      waveLabel += rem > 0 ? `Хвиля 3 через ${rem}с` : "ПІВДЕННИЙ ШЛЮЗ АКТИВНИЙ!";
    } else {
      waveLabel += "УСІ МОДУЛІ ЗІБРАНО";
    }
    ctx.fillText(waveLabel, barX + 470, barY + 39);

    // Заряди аварійного мікро-двигуна (thrusterCharges)
    const dots =
      "●".repeat(state.astronaut.thrusterCharges) +
      "○".repeat(Math.max(0, 3 - state.astronaut.thrusterCharges));
    ctx.fillStyle = "#8a99b8";
    ctx.font = "700 10px monospace";
    ctx.textAlign = "right";
    ctx.fillText("МІКРО-ДВИГУН [Q]", barX + barW - 18, barY + 21);
    ctx.fillStyle = state.astronaut.thrusterCharges > 0 ? "#ffd166" : "#ff4766";
    ctx.font = "700 14px monospace";
    ctx.fillText(dots, barX + barW - 18, barY + 39);
  }

  private renderGauge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    label: string,
    valueText: string,
    ratio: number,
    color: string,
  ): void {
    ctx.fillStyle = "#8a99b8";
    ctx.font = "700 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(label, x, y + 10);

    ctx.fillStyle = color;
    ctx.font = "700 11px monospace";
    ctx.textAlign = "right";
    ctx.fillText(valueText, x + w, y + 10);

    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.roundRect(x, y + 16, w, 7, 3.5);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y + 16, Math.max(4, w * clamp(ratio, 0, 1)), 7, 3.5);
    ctx.fill();
  }

  private renderOffscreenTerminalArrows(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
    camera: Camera2D,
    viewportW: number,
    viewportH: number,
  ): void {
    const pad = 46;
    const cx = viewportW * 0.5;
    const cy = viewportH * 0.5;

    for (const term of state.terminals) {
      if (term.state !== "WARNING" && term.state !== "CRITICAL") continue;
      if (!state.unlockedModuleIds.includes(term.moduleId)) continue;

      const screenPos = camera.worldToScreen(
        term.pos.x,
        term.pos.y,
        viewportW,
        viewportH,
      );

      const isInside =
        screenPos.x >= pad &&
        screenPos.x <= viewportW - pad &&
        screenPos.y >= pad + 56 &&
        screenPos.y <= viewportH - pad;

      if (isInside) continue;

      const dx = screenPos.x - cx;
      const dy = screenPos.y - cy;
      const angle = Math.atan2(dy, dx);

      // Знаходимо точку на межі екрана
      const maxRx = viewportW * 0.5 - pad;
      const maxRy = viewportH * 0.5 - pad - 28;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const scaleX = Math.abs(cos) > 1e-4 ? maxRx / Math.abs(cos) : 1e9;
      const scaleY = Math.abs(sin) > 1e-4 ? maxRy / Math.abs(sin) : 1e9;
      const scale = Math.min(scaleX, scaleY);

      const edgeX = cx + cos * scale;
      const edgeY = cy + sin * scale;

      const color = term.state === "CRITICAL" ? "#ff4766" : "#ffa23d";
      const distM = Math.round(
        Math.hypot(term.pos.x - state.astronaut.pos.x, term.pos.y - state.astronaut.pos.y) / 45,
      );

      ctx.save();
      ctx.translate(edgeX, edgeY);

      // Пульсуючий трикутник-стрілка
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Підпис термінала і таймера аварії біля стрілки
      const labelOffsetX = -cos * 44;
      const labelOffsetY = -sin * 28;
      ctx.fillStyle = "rgba(10, 15, 28, 0.9)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(labelOffsetX - 48, labelOffsetY - 16, 96, 32, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = "700 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(term.id, labelOffsetX, labelOffsetY - 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        `${Math.ceil(term.urgencyTimer)}s · ${distM}m`,
        labelOffsetX,
        labelOffsetY + 11,
      );

      ctx.restore();
    }
  }

  private renderCutsceneOverlay(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
    viewportW: number,
    viewportH: number,
  ): void {
    ctx.fillStyle = "rgba(14, 28, 56, 0.88)";
    ctx.strokeStyle = "#3ddc84";
    ctx.lineWidth = 2;
    const w = 480;
    const h = 64;
    const x = (viewportW - w) * 0.5;
    const y = viewportH - 110;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#3ddc84";
    ctx.font = "700 15px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `✓ ШЛЮЗ ВІДКРИТО · ПРИСТИКОВАНО ${state.cutsceneTargetModuleId ?? ""}`,
      viewportW * 0.5,
      y + 28,
    );
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px monospace";
    ctx.fillText(
      "Новий відсік станції розгерметизовано та інтегровано в енергомережу",
      viewportW * 0.5,
      y + 48,
    );
  }

  private renderBottomHint(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
    viewportW: number,
    viewportH: number,
  ): void {
    const astro = state.astronaut;
    const hint =
      astro.state === "ANCHORED"
        ? "ЛКМ (затисни і тягни назад) — натяг рогатки для стрибка  |  [E] — відкрити пульт термінала"
        : "У ПОЛЬОТІ: утримуй [SPACE] або [ЛКМ] для захвату поручня на високій швидкості  |  [Q / ПКМ] — аварійний імпульс";

    ctx.fillStyle = "rgba(8, 13, 26, 0.78)";
    ctx.strokeStyle = "rgba(92, 168, 255, 0.25)";
    ctx.lineWidth = 1;
    const w = Math.min(780, viewportW - 32);
    const x = (viewportW - w) * 0.5;
    const y = viewportH - 42;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 28, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(hint, viewportW * 0.5, y + 18);
  }
}
