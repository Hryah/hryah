import type { FlightAction, SolarMinigameState } from "../../../core/flight";
import { drawFittedText } from "./textFit";

const PANEL_W = 820;
const PANEL_H = 500;
const ALPHA_CX = 132;
const BETA_CX = 364;
const DIAL_CY = 228;
const DIAL_R = 84;
const RIGHT_X = 498;
const RIGHT_W = 298;
const ESC_BTN_W = 104;
const ESC_BTN_X = PANEL_W - ESC_BTN_W - 24;

export class SolarGame {
  private activeWheel: "ALPHA" | "BETA" | null = null;
  private lastPointerAngleRad = 0;

  public resetInput(): void {
    this.activeWheel = null;
  }

  public getPanelRect(viewportW: number, viewportH: number) {
    const scale = Math.min(
      1,
      (viewportW - 32) / PANEL_W,
      (viewportH - 96) / PANEL_H,
    );
    const w = PANEL_W * scale;
    const h = PANEL_H * scale;
    const x = (viewportW - w) * 0.5;
    const y = (viewportH - h) * 0.5 + 18;
    return { x, y, w, h, scale };
  }

  public handleKeyDown(
    code: string,
    dispatch: (action: FlightAction) => void,
  ): boolean {
    const stepDeg = 3.2;
    if (code === "KeyA" || code === "ArrowLeft") {
      dispatch({ type: "solar_input", deltaAlphaDeg: -stepDeg, deltaBetaDeg: 0, dtS: 0.05 });
      return true;
    }
    if (code === "KeyD" || code === "ArrowRight") {
      dispatch({ type: "solar_input", deltaAlphaDeg: stepDeg, deltaBetaDeg: 0, dtS: 0.05 });
      return true;
    }
    if (code === "KeyW" || code === "ArrowUp") {
      dispatch({ type: "solar_input", deltaAlphaDeg: 0, deltaBetaDeg: stepDeg, dtS: 0.05 });
      return true;
    }
    if (code === "KeyS" || code === "ArrowDown") {
      dispatch({ type: "solar_input", deltaAlphaDeg: 0, deltaBetaDeg: -stepDeg, dtS: 0.05 });
      return true;
    }
    return false;
  }

  public handlePointerDown(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
    dispatch: (action: FlightAction) => void,
  ): void {
    const rect = this.getPanelRect(viewportW, viewportH);
    const lx = (sx - rect.x) / rect.scale;
    const ly = (sy - rect.y) / rect.scale;

    // Кнопка закриття [ESC] Вихід (відступ >= 24px від правого краю)
    if (
      lx >= ESC_BTN_X - 2 &&
      lx <= ESC_BTN_X + ESC_BTN_W + 2 &&
      ly >= 9 &&
      ly <= 41
    ) {
      this.resetInput();
      dispatch({ type: "close_minigame" });
      return;
    }

    if (Math.hypot(lx - ALPHA_CX, ly - DIAL_CY) <= DIAL_R + 18) {
      this.activeWheel = "ALPHA";
      this.lastPointerAngleRad = Math.atan2(ly - DIAL_CY, lx - ALPHA_CX);
    } else if (Math.hypot(lx - BETA_CX, ly - DIAL_CY) <= DIAL_R + 18) {
      this.activeWheel = "BETA";
      this.lastPointerAngleRad = Math.atan2(ly - DIAL_CY, lx - BETA_CX);
    }
  }

  public handlePointerMove(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
    dispatch: (action: FlightAction) => void,
  ): void {
    if (!this.activeWheel) return;
    const rect = this.getPanelRect(viewportW, viewportH);
    const lx = (sx - rect.x) / rect.scale;
    const ly = (sy - rect.y) / rect.scale;
    const cx = this.activeWheel === "ALPHA" ? ALPHA_CX : BETA_CX;
    const cy = DIAL_CY;

    const currentRad = Math.atan2(ly - cy, lx - cx);
    const deltaRad = Math.atan2(
      Math.sin(currentRad - this.lastPointerAngleRad),
      Math.cos(currentRad - this.lastPointerAngleRad),
    );
    this.lastPointerAngleRad = currentRad;

    const deltaDeg = (deltaRad * 180) / Math.PI;
    if (Math.abs(deltaDeg) > 0.05) {
      if (this.activeWheel === "ALPHA") {
        dispatch({ type: "solar_input", deltaAlphaDeg: deltaDeg, deltaBetaDeg: 0, dtS: 0.032 });
      } else {
        dispatch({ type: "solar_input", deltaAlphaDeg: 0, deltaBetaDeg: deltaDeg, dtS: 0.032 });
      }
    }
  }

  public handlePointerUp(): void {
    this.activeWheel = null;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    mg: SolarMinigameState,
    timeElapsedS: number,
    viewportW: number,
    viewportH: number,
  ): void {
    const rect = this.getPanelRect(viewportW, viewportH);

    ctx.save();
    ctx.fillStyle = "rgba(3, 7, 15, 0.62)";
    ctx.fillRect(0, 0, viewportW, viewportH);

    ctx.translate(rect.x, rect.y);
    ctx.scale(rect.scale, rect.scale);

    // Корпус пульта сервоприводів сонячних батарей
    ctx.fillStyle = "#101829";
    ctx.strokeStyle = mg.jamTimerS > 0 ? "#ff4766" : "#5ca8ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(0, 0, PANEL_W, PANEL_H, 14);
    ctx.fill();
    ctx.stroke();

    // Обрізання по внутрішній рамці пульта
    ctx.beginPath();
    ctx.roundRect(2, 2, PANEL_W - 4, PANEL_H - 4, 12);
    ctx.clip();

    // Шапка
    ctx.fillStyle = "#18243d";
    ctx.beginPath();
    ctx.roundRect(3, 3, PANEL_W - 6, 46, [12, 12, 0, 0]);
    ctx.fill();

    drawFittedText(
      ctx,
      "СЕРВОПРИВОДИ СОНЯЧНИХ ПАНЕЛЕЙ · НАВЕДЕННЯ (α, β)",
      18,
      31,
      ESC_BTN_X - 32,
      { fontSize: 15, minFontSize: 11, color: "#ffe066" },
    );

    // Кнопка [ESC] Вихід з безпечним відступом >= 24px від правого краю
    ctx.fillStyle = "#223152";
    ctx.strokeStyle = "#5ca8ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(ESC_BTN_X, 11, ESC_BTN_W, 30, 6);
    ctx.fill();
    ctx.stroke();
    drawFittedText(
      ctx,
      "[ESC] Вихід",
      ESC_BTN_X + ESC_BTN_W * 0.5,
      30,
      ESC_BTN_W - 12,
      { fontSize: 12, minFontSize: 10, align: "center", color: "#e8f3ff" },
    );

    // Два кругові радари + маховики (Кут Альфа та Кут Бета) без зайвого спрайта поверх нижнього прогресу
    this.renderServoRadar(
      ctx,
      ALPHA_CX,
      DIAL_CY,
      DIAL_R,
      "КУТ АЛЬФА (α) [A/D або Миша]",
      mg.sunAlphaDeg,
      mg.panelAlphaDeg,
      mg.jamTimerS > 0,
    );
    this.renderServoRadar(
      ctx,
      BETA_CX,
      DIAL_CY,
      DIAL_R,
      "КУТ БЕТА (β) [W/S або Миша]",
      mg.sunBetaDeg,
      mg.panelBetaDeg,
      mg.jamTimerS > 0,
    );

    // Права колонка з розширеними межами та внутрішніми відступами 18px (без обрізання тексту)
    const innerPad = 18;
    const innerMaxW = RIGHT_W - innerPad * 2;

    // 1. Осцилограф вихідної потужності (кВт)
    const oscY = 68;
    const oscH = 148;
    ctx.fillStyle = "#08121e";
    ctx.strokeStyle = "#2b4c7e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(RIGHT_X, oscY, RIGHT_W, oscH, 8);
    ctx.fill();
    ctx.stroke();

    drawFittedText(
      ctx,
      "ОСЦИЛОГРАФ ПОТОКУ",
      RIGHT_X + innerPad,
      oscY + 22,
      innerMaxW,
      { fontSize: 11, minFontSize: 9, color: "#8a99b8" },
    );

    // Еталонна сонячна синусоїда (пунктирна золота)
    const waveSpanW = RIGHT_W - innerPad * 2;
    ctx.strokeStyle = "rgba(255, 224, 102, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let px = 0; px <= waveSpanW; px += 4) {
      const refY = oscY + 74 + Math.sin(px * 0.11 + timeElapsedS * 9) * 26;
      if (px === 0) ctx.moveTo(RIGHT_X + innerPad + px, refY);
      else ctx.lineTo(RIGHT_X + innerPad + px, refY);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Реальна хвиля генерації панелей
    const phaseShift = ((100 - mg.powerEfficiencyPct) / 100) * 2.4;
    ctx.strokeStyle = mg.powerEfficiencyPct >= 95 ? "#3ddc84" : "#5ca8ff";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    const amp = (mg.powerEfficiencyPct / 100) * 26;
    for (let px = 0; px <= waveSpanW; px += 4) {
      const waveY =
        oscY +
        74 +
        Math.sin(px * 0.11 + timeElapsedS * 9 + phaseShift) * amp;
      if (px === 0) ctx.moveTo(RIGHT_X + innerPad + px, waveY);
      else ctx.lineTo(RIGHT_X + innerPad + px, waveY);
    }
    ctx.stroke();

    drawFittedText(
      ctx,
      `ККД: ${mg.powerEfficiencyPct.toFixed(1)}% (${mg.outputKw.toFixed(1)} кВт)`,
      RIGHT_X + innerPad,
      oscY + 130,
      innerMaxW,
      {
        fontSize: 13.5,
        minFontSize: 10,
        color: mg.powerEfficiencyPct >= 95 ? "#3ddc84" : "#ffe066",
      },
    );

    // 2. Шкала «Перегрів приводу» (при > omega_max росте, при 100% клинить на 3с)
    const heatY = oscY + oscH + 18;
    const heatH = 148;
    ctx.fillStyle = "#0d1627";
    ctx.strokeStyle = mg.jamTimerS > 0 ? "#ff4766" : "#2b4c7e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(RIGHT_X, heatY, RIGHT_W, heatH, 8);
    ctx.fill();
    ctx.stroke();

    drawFittedText(
      ctx,
      "ТЕМПЕРАТУРА МОТОРА",
      RIGHT_X + innerPad,
      heatY + 24,
      innerMaxW,
      { fontSize: 11, minFontSize: 9, color: "#8a99b8" },
    );

    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(RIGHT_X + innerPad, heatY + 38, innerMaxW, 16);
    ctx.fillStyle =
      mg.motorHeatPct > 80 ? "#ff4766" : mg.motorHeatPct > 50 ? "#ffa23d" : "#38bdf8";
    ctx.fillRect(
      RIGHT_X + innerPad,
      heatY + 38,
      (innerMaxW * Math.min(100, mg.motorHeatPct)) / 100,
      16,
    );

    if (mg.jamTimerS > 0) {
      drawFittedText(
        ctx,
        `✗ КЛИН РЕДУКТОРА: ${mg.jamTimerS.toFixed(1)} с!`,
        RIGHT_X + innerPad,
        heatY + 86,
        innerMaxW,
        { fontSize: 13, minFontSize: 10, color: "#ff4766" },
      );
      drawFittedText(
        ctx,
        "Дочекайся охолодження приводу",
        RIGHT_X + innerPad,
        heatY + 110,
        innerMaxW,
        { fontSize: 11, minFontSize: 9, color: "#fca5a5" },
      );
    } else {
      drawFittedText(
        ctx,
        `Нагрів: ${Math.round(mg.motorHeatPct)}%`,
        RIGHT_X + innerPad,
        heatY + 86,
        innerMaxW,
        { fontSize: 13, minFontSize: 10, color: "#e2e8f0" },
      );
      drawFittedText(
        ctx,
        "(крути плавно без ривків)",
        RIGHT_X + innerPad,
        heatY + 110,
        innerMaxW,
        { fontSize: 11.5, minFontSize: 9.5, color: "#94a3b8" },
      );
    }

    // 3. Таймер стабільного утримання >95% протягом 3.0 с
    const holdY = PANEL_H - 76;
    const holdW = PANEL_W - 42;
    ctx.fillStyle = "#0b1322";
    ctx.strokeStyle = mg.powerEfficiencyPct >= 95 ? "#3ddc84" : "#3a4f76";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(18, holdY, holdW, 54, 8);
    ctx.fill();
    ctx.stroke();

    const holdRatio = Math.min(1, mg.holdTimerS / mg.requiredHoldS);
    ctx.fillStyle = "rgba(61, 220, 132, 0.22)";
    ctx.beginPath();
    ctx.roundRect(20, holdY + 2, (holdW - 4) * holdRatio, 50, 6);
    ctx.fill();

    drawFittedText(
      ctx,
      `УТРИМАННЯ >95%: ${mg.holdTimerS.toFixed(1)} / ${mg.requiredHoldS.toFixed(1)} с`,
      18 + holdW * 0.5,
      holdY + 32,
      holdW - 28,
      { fontSize: 13.5, minFontSize: 10.5, align: "center", color: "#ffffff" },
    );

    ctx.restore();
  }

  private renderServoRadar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    label: string,
    sunDeg: number,
    panelDeg: number,
    jammed: boolean,
  ): void {
    ctx.save();

    ctx.fillStyle = "#08101d";
    ctx.strokeStyle = jammed ? "#ff4766" : "#3b5998";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Насічки на ободі маховика (12 зубців)
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6 + (panelDeg * Math.PI) / 180;
      ctx.strokeStyle = jammed ? "#ff4766" : "#64748b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      ctx.lineTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4));
      ctx.stroke();
    }

    // Концентричні кола радара
    ctx.strokeStyle = "rgba(92, 168, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
    ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    const sunRad = (sunDeg * Math.PI) / 180;
    const panelRad = (panelDeg * Math.PI) / 180;

    // Промінь і маркер Сонця
    const sunX = cx + Math.cos(sunRad) * (r * 0.72);
    const sunY = cy + Math.sin(sunRad) * (r * 0.72);
    ctx.strokeStyle = "rgba(255, 224, 102, 0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sunX, sunY);
    ctx.stroke();

    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
    ctx.fill();

    // Вектор сонячної панелі + ручка маховика
    const panX = cx + Math.cos(panelRad) * (r * 0.72);
    const panY = cy + Math.sin(panelRad) * (r * 0.72);
    ctx.strokeStyle = "#3ddc84";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(panX, panY);
    ctx.stroke();

    ctx.strokeStyle = "#3ddc84";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(panX, panY, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Підпис під радаром
    drawFittedText(ctx, label, cx, cy + r + 24, 212, {
      fontSize: 11.5,
      minFontSize: 9.5,
      align: "center",
      color: "#cbd5e1",
    });
    drawFittedText(
      ctx,
      `Сонце: ${Math.round(sunDeg)}° · Панель: ${Math.round(panelDeg)}°`,
      cx,
      cy + r + 42,
      212,
      { fontSize: 11, minFontSize: 9, align: "center", color: "#8a99b8" },
    );

    ctx.restore();
  }
}
