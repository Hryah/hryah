import {
  clamp,
  type FlightState,
  getModuleOctagonPolygon,
  STATION_LEVEL_CONFIG,
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

    // 1. Верхня приладова панель телеметрії (ліворуч/по центру)
    this.renderTopBar(ctx, state, viewportW);

    // 2. Тактичний Радар / Міні-карта станції (StationMinimapHUD, 220x160 px у правому верхньому куті)
    this.renderStationMinimap(ctx, state, viewportW);

    // 3. Динамічні маркери-стрілки по краях екрана до аварійних терміналів у сусідніх модулях
    if (state.gameMode === "STATION_ROAM") {
      this.renderOffscreenTerminalArrows(
        ctx,
        state,
        camera,
        viewportW,
        viewportH,
      );
    }

    // 4. Банер катсцени розширення станції
    if (state.gameMode === "MODULE_EXPANSION_CUTSCENE") {
      this.renderCutsceneOverlay(ctx, state, viewportW, viewportH);
    }

    // 5. Дієгетичні підказки керування внизу екрана
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
    const maxAvailW = Math.max(460, viewportW - 270);
    const barW = Math.min(760, maxAvailW);
    const barX = 16;
    const barY = 14;
    const barH = 48;

    ctx.fillStyle = "rgba(8, 13, 26, 0.88)";
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 10);
    ctx.fill();
    ctx.stroke();

    // O2 індикатор
    this.renderGauge(
      ctx,
      barX + 16,
      barY + 11,
      125,
      "O₂ КИСЕНЬ",
      `${Math.round(state.oxygenPct)}%`,
      state.oxygenPct / 100,
      state.oxygenPct < 35
        ? "#ef4444"
        : state.oxygenPct < 65
          ? "#f59e0b"
          : "#38bdf8",
    );

    // Енергія станції
    this.renderGauge(
      ctx,
      barX + 158,
      barY + 11,
      125,
      "⚡ ЕНЕРГІЯ",
      `${Math.round(state.energyPct)}%`,
      state.energyPct / 100,
      state.energyPct < 35
        ? "#ef4444"
        : state.energyPct < 65
          ? "#f59e0b"
          : "#10b981",
    );

    // Температура
    const tempRatio = clamp((state.tempC - 18) / (75 - 18), 0, 1);
    this.renderGauge(
      ctx,
      barX + 300,
      barY + 11,
      115,
      "🌡 ТЕМП.",
      `${Math.round(state.tempC)}°C`,
      tempRatio,
      state.tempC > 45 ? "#ef4444" : state.tempC > 32 ? "#f59e0b" : "#38bdf8",
    );

    // Етап стикування модулів
    const dockedCount = state.openedSeals.length;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("СТИКУВАННЯ МОДУЛІВ", barX + 432, barY + 21);

    ctx.fillStyle = "#e8f3ff";
    ctx.font = "700 12px monospace";
    let waveLabel = `${dockedCount}/3 · `;
    if (dockedCount === 0) {
      const rem = Math.max(
        0,
        Math.ceil(WAVE_TIMINGS.wave1TimeS - state.waveClockS),
      );
      waveLabel += rem > 0 ? `Хвиля 1: ${rem}с` : "ШЛЮЗ ПІВНІЧ АКТИВНИЙ!";
    } else if (dockedCount === 1) {
      const rem = Math.max(
        0,
        Math.ceil(WAVE_TIMINGS.wave2TimeS - state.waveClockS),
      );
      waveLabel += rem > 0 ? `Хвиля 2: ${rem}с` : "ШЛЮЗ СХІД АКТИВНИЙ!";
    } else if (dockedCount === 2) {
      const rem = Math.max(
        0,
        Math.ceil(WAVE_TIMINGS.wave3TimeS - state.waveClockS),
      );
      waveLabel += rem > 0 ? `Хвиля 3: ${rem}с` : "ШЛЮЗ ПІВДЕНЬ АКТИВНИЙ!";
    } else {
      waveLabel += "СТАНЦІЮ ЗІБРАНО";
    }
    ctx.fillText(waveLabel, barX + 432, barY + 39);

    // Заряди аварійного мікро-двигуна
    const dots =
      "●".repeat(state.astronaut.thrusterCharges) +
      "○".repeat(Math.max(0, 3 - state.astronaut.thrusterCharges));
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 10px monospace";
    ctx.textAlign = "right";
    ctx.fillText("ІМПУЛЬС [Q]", barX + barW - 16, barY + 21);
    ctx.fillStyle =
      state.astronaut.thrusterCharges > 0 ? "#fde047" : "#ef4444";
    ctx.font = "700 14px monospace";
    ctx.fillText(dots, barX + barW - 16, barY + 39);
  }

  /**
   * 2. Радар / Міні-карта станції (StationMinimapHUD, 220x160 px у правому верхньому куті):
   * - Схема всіх відкритих модулів, поточний модуль підсвічений яскравим білим/блакитним контуром.
   * - Непристиковані модулі малюються пунктиром (LOCKED — DOCKING #1..3).
   * - Зелений маркер космонавта в реальному часі.
   * - Пульсуючі червоні/помаранчеві FNAF-тривоги з таймером у кімнатах, де горять комп'ютери.
   */
  private renderStationMinimap(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
    viewportW: number,
  ): void {
    const mapW = 220;
    const mapH = 160;
    const mapX = viewportW - mapW - 16;
    const mapY = 14;

    ctx.save();

    // Корпус радара
    ctx.fillStyle = "rgba(7, 12, 24, 0.92)";
    ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, mapW, mapH, 10);
    ctx.fill();
    ctx.stroke();

    // Заголовок радара
    ctx.fillStyle = "#38bdf8";
    ctx.font = "700 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("ТАКТИЧНИЙ РАДАР СТАНЦІЇ", mapX + 10, mapY + 15);

    // Обчислюємо світовий bounding box усіх модулів для масштабу ~1:18
    const worldMinX = -80;
    const worldMaxX = 2620;
    const worldMinY = -1000;
    const worldMaxY = 1180;
    const spanX = worldMaxX - worldMinX;
    const spanY = worldMaxY - worldMinY;

    const innerW = mapW - 20;
    const innerH = mapH - 28;
    const scale = Math.min(innerW / spanX, innerH / spanY);

    const offsetX = mapX + 10 + (innerW - spanX * scale) * 0.5;
    const offsetY = mapY + 22 + (innerH - spanY * scale) * 0.5;

    const toMiniX = (wx: number) => offsetX + (wx - worldMinX) * scale;
    const toMiniY = (wy: number) => offsetY + (wy - worldMinY) * scale;

    const pulse = 0.5 + 0.5 * Math.sin(state.timeElapsedS * 8);

    // Рендеримо контури всіх 5 модулів
    for (const mod of STATION_LEVEL_CONFIG) {
      const isUnlocked = state.unlockedModuleIds.includes(mod.id);
      const isActive = mod.id === state.activeModuleId;
      const poly = getModuleOctagonPolygon(mod);

      // Перевіряємо, чи є в цьому модулі активна FNAF-тривога
      const alarmTerm = state.terminals.find(
        (t) =>
          t.moduleId === mod.id &&
          (t.state === "WARNING" || t.state === "CRITICAL"),
      );

      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < poly.length; i++) {
        const pt = poly[i]!;
        const mx = toMiniX(pt.x);
        const my = toMiniY(pt.y);
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      }
      ctx.closePath();

      if (!isUnlocked) {
        // Непристикований модуль (майбутнє розширення): пунктир зі статусом LOCKED
        ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
        ctx.fill();
        ctx.strokeStyle = "rgba(100, 116, 139, 0.55)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        const cx = toMiniX(mod.worldPos.x + mod.size.width * 0.5);
        const cy = toMiniY(mod.worldPos.y + mod.size.height * 0.5);
        ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
        ctx.font = "700 7px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`LOCKED #${mod.unlockedAtWave}`, cx, cy + 2);
      } else {
        // Відкритий модуль
        if (alarmTerm) {
          const isCrit = alarmTerm.state === "CRITICAL";
          ctx.fillStyle = isCrit
            ? `rgba(239, 68, 68, ${0.28 + pulse * 0.38})`
            : `rgba(245, 158, 11, ${0.22 + pulse * 0.3})`;
        } else if (isActive) {
          ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
        } else {
          ctx.fillStyle = "rgba(30, 41, 59, 0.75)";
        }
        ctx.fill();

        ctx.strokeStyle = alarmTerm
          ? alarmTerm.state === "CRITICAL"
            ? "#ef4444"
            : "#f59e0b"
          : isActive
            ? "#e0f2fe"
            : "#475569";
        ctx.lineWidth = isActive || alarmTerm ? 1.8 : 1;
        ctx.stroke();

        // Якщо в кімнаті тривога — малюємо іконку та зворотний відлік прямо на мінікарті!
        if (alarmTerm) {
          const cx = toMiniX(mod.worldPos.x + mod.size.width * 0.5);
          const cy = toMiniY(mod.worldPos.y + mod.size.height * 0.5);
          const icon =
            alarmTerm.type === "SOLAR"
              ? "⚡"
              : alarmTerm.type === "OXYGEN"
                ? "O₂"
                : alarmTerm.type === "THERMAL"
                  ? "🌡"
                  : "⚓";
          ctx.fillStyle = "#ffffff";
          ctx.font = "700 8px monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            `${icon}${Math.ceil(alarmTerm.urgencyTimer)}s`,
            cx,
            cy + 3,
          );
        }
      }
      ctx.restore();
    }

    // Точка космонавта: яскравий зелений маркер у реальному часі
    const ax = toMiniX(state.astronaut.pos.x);
    const ay = toMiniY(state.astronaut.pos.y);
    ctx.fillStyle = "rgba(61, 220, 132, 0.35)";
    ctx.beginPath();
    ctx.arc(ax, ay, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#3ddc84";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ax, ay, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
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
    ctx.fillStyle = "#94a3b8";
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
      // Якщо термінал уже в поточній кімнаті — його видно безпосередньо
      if (term.moduleId === state.activeModuleId) continue;

      const screenPos = camera.worldToScreen(
        term.pos.x,
        term.pos.y,
        viewportW,
        viewportH,
      );

      const dx = screenPos.x - cx;
      const dy = screenPos.y - cy;
      const angle = Math.atan2(dy, dx);

      const maxRx = viewportW * 0.5 - pad;
      const maxRy = viewportH * 0.5 - pad - 34;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const scaleX = Math.abs(cos) > 1e-4 ? maxRx / Math.abs(cos) : 1e9;
      const scaleY = Math.abs(sin) > 1e-4 ? maxRy / Math.abs(sin) : 1e9;
      const scale = Math.min(scaleX, scaleY);

      const edgeX = cx + cos * scale;
      const edgeY = cy + sin * scale;

      const color = term.state === "CRITICAL" ? "#ef4444" : "#f59e0b";
      const distM = Math.round(
        Math.hypot(
          term.pos.x - state.astronaut.pos.x,
          term.pos.y - state.astronaut.pos.y,
        ) / 45,
      );

      ctx.save();
      ctx.translate(edgeX, edgeY);

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

      const labelOffsetX = -cos * 46;
      const labelOffsetY = -sin * 28;
      ctx.fillStyle = "rgba(10, 15, 28, 0.92)";
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
    ctx.fillStyle = "rgba(14, 28, 56, 0.9)";
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    const w = 500;
    const h = 64;
    const x = (viewportW - w) * 0.5;
    const y = viewportH - 110;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#10b981";
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
      "Новий відсік розгерметизовано та додано на тактичний радар",
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
        ? "ЛКМ (затисни і тягни назад) — натяг рогатки для стрибка  |  [E] — увімкнути комп'ютер біля ручки"
        : "У ПОЛЬОТІ: утримуй [SPACE] або [ЛКМ] для захвату поручня на швидкості  |  [Q / ПКМ] — аварійний імпульс";

    ctx.fillStyle = "rgba(8, 13, 26, 0.8)";
    ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
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
