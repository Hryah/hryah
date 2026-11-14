import type { FlightAction, SolarMinigameState } from "../../../core/flight";

export class SolarGame {
  private activeWheel: "ALPHA" | "BETA" | null = null;
  private lastPointerAngleRad = 0;

  public resetInput(): void {
    this.activeWheel = null;
  }

  public getPanelRect(viewportW: number, viewportH: number) {
    const w = Math.min(760, viewportW - 40);
    const h = Math.min(520, viewportH - 110);
    const x = (viewportW - w) * 0.5;
    const y = (viewportH - h) * 0.5 + 22;
    return { x, y, w, h };
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

    // Кнопка закриття [ESC]
    if (
      sx >= rect.x + rect.w - 96 &&
      sx <= rect.x + rect.w - 14 &&
      sy >= rect.y + 12 &&
      sy <= rect.y + 42
    ) {
      this.resetInput();
      dispatch({ type: "close_minigame" });
      return;
    }

    const alphaCx = rect.x + rect.w * 0.24;
    const alphaCy = rect.y + rect.h * 0.52;
    const betaCx = rect.x + rect.w * 0.55;
    const betaCy = rect.y + rect.h * 0.52;

    if (Math.hypot(sx - alphaCx, sy - alphaCy) <= 105) {
      this.activeWheel = "ALPHA";
      this.lastPointerAngleRad = Math.atan2(sy - alphaCy, sx - alphaCx);
    } else if (Math.hypot(sx - betaCx, sy - betaCy) <= 105) {
      this.activeWheel = "BETA";
      this.lastPointerAngleRad = Math.atan2(sy - betaCy, sx - betaCx);
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
    const cx =
      this.activeWheel === "ALPHA"
        ? rect.x + rect.w * 0.24
        : rect.x + rect.w * 0.55;
    const cy = rect.y + rect.h * 0.52;

    const currentRad = Math.atan2(sy - cy, sx - cx);
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

    // Корпус пульта сервоприводів сонячних батарей
    ctx.fillStyle = "#101829";
    ctx.strokeStyle = mg.jamTimerS > 0 ? "#ff4766" : "#5ca8ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 14);
    ctx.fill();
    ctx.stroke();

    // Шапка
    ctx.fillStyle = "#18243d";
    ctx.beginPath();
    ctx.roundRect(rect.x + 3, rect.y + 3, rect.w - 6, 46, [12, 12, 0, 0]);
    ctx.fill();

    ctx.fillStyle = "#ffe066";
    ctx.font = "700 15px monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      "СЕРВОПРИВОДИ СОНЯЧНИХ ПАНЕЛЕЙ · НАВЕДЕННЯ (α, β)",
      rect.x + 18,
      rect.y + 31,
    );

    // Кнопка [ESC]
    ctx.fillStyle = "#223152";
    ctx.strokeStyle = "#5ca8ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(rect.x + rect.w - 94, rect.y + 11, 78, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e8f3ff";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("[ESC] Вихід", rect.x + rect.w - 55, rect.y + 30);

    // Два кругові радари + маховики (Кут Альфа та Кут Бета)
    const alphaCx = rect.x + rect.w * 0.23;
    const alphaCy = rect.y + rect.h * 0.48;
    const betaCx = rect.x + rect.w * 0.52;
    const betaCy = rect.y + rect.h * 0.48;

    this.renderServoRadar(
      ctx,
      alphaCx,
      alphaCy,
      88,
      "КУТ АЛЬФА (α) [A/D або Миша]",
      mg.sunAlphaDeg,
      mg.panelAlphaDeg,
      mg.jamTimerS > 0,
    );
    this.renderServoRadar(
      ctx,
      betaCx,
      betaCy,
      88,
      "КУТ БЕТА (β) [W/S або Миша]",
      mg.sunBetaDeg,
      mg.panelBetaDeg,
      mg.jamTimerS > 0,
    );

    // Права колонка: Осцилограф потужності (кВт) та індикатор температури мотора
    const rightX = rect.x + rect.w * 0.69;
    const rightW = rect.w * 0.28;

    // 1. Осцилограф вихідної потужності (кВт)
    const oscY = rect.y + 72;
    const oscH = 120;
    ctx.fillStyle = "#08121e";
    ctx.strokeStyle = "#2b4c7e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(rightX, oscY, rightW, oscH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#8a99b8";
    ctx.font = "700 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("ОСЦИЛОГРАФ СИНХРОНІЗАЦІЇ ПОТОКУ", rightX + 10, oscY + 18);

    // Еталонна сонячна синусоїда (пунктирна золота)
    ctx.strokeStyle = "rgba(255, 224, 102, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let px = 0; px <= rightW - 20; px += 4) {
      const refY = oscY + 64 + Math.sin(px * 0.11 + timeElapsedS * 9) * 26;
      if (px === 0) ctx.moveTo(rightX + 10 + px, refY);
      else ctx.lineTo(rightX + 10 + px, refY);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Реальна хвиля генерації панелей
    const phaseShift = ((100 - mg.powerEfficiencyPct) / 100) * 2.4;
    ctx.strokeStyle = mg.powerEfficiencyPct >= 95 ? "#3ddc84" : "#5ca8ff";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    const amp = (mg.powerEfficiencyPct / 100) * 26;
    for (let px = 0; px <= rightW - 20; px += 4) {
      const waveY =
        oscY +
        64 +
        Math.sin(px * 0.11 + timeElapsedS * 9 + phaseShift) * amp;
      if (px === 0) ctx.moveTo(rightX + 10 + px, waveY);
      else ctx.lineTo(rightX + 10 + px, waveY);
    }
    ctx.stroke();

    ctx.fillStyle = mg.powerEfficiencyPct >= 95 ? "#3ddc84" : "#ffe066";
    ctx.font = "700 13px monospace";
    ctx.fillText(
      `ККД: ${mg.powerEfficiencyPct.toFixed(1)}% (${mg.outputKw.toFixed(1)} кВт)`,
      rightX + 10,
      oscY + 108,
    );

    // 2. Шкала «Перегрів приводу» (при > omega_max росте, при 100% клинить на 3с)
    const heatY = oscY + 138;
    ctx.fillStyle = "#0d1627";
    ctx.strokeStyle = mg.jamTimerS > 0 ? "#ff4766" : "#2b4c7e";
    ctx.beginPath();
    ctx.roundRect(rightX, heatY, rightW, 96, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#8a99b8";
    ctx.font = "700 10px monospace";
    ctx.fillText("ТЕМПЕРАТУРА МОТОРА / РЕДУКТОРА", rightX + 10, heatY + 18);

    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(rightX + 10, heatY + 28, rightW - 20, 14);
    ctx.fillStyle =
      mg.motorHeatPct > 80 ? "#ff4766" : mg.motorHeatPct > 50 ? "#ffa23d" : "#38bdf8";
    ctx.fillRect(
      rightX + 10,
      heatY + 28,
      ((rightW - 20) * Math.min(100, mg.motorHeatPct)) / 100,
      14,
    );

    ctx.fillStyle = mg.jamTimerS > 0 ? "#ff4766" : "#cbd5e1";
    ctx.font = "700 11px monospace";
    ctx.fillText(
      mg.jamTimerS > 0
        ? `✗ КЛИН РЕДУКТОРА: ${mg.jamTimerS.toFixed(1)}с!`
        : `Нагрів: ${Math.round(mg.motorHeatPct)}% (не крути занадто різко)`,
      rightX + 10,
      heatY + 62,
    );

    // 3. Таймер стабільного утримання >95% протягом 3.0 с
    const holdY = rect.y + rect.h - 76;
    const holdW = rect.w - 36;
    ctx.fillStyle = "#0b1322";
    ctx.strokeStyle = mg.powerEfficiencyPct >= 95 ? "#3ddc84" : "#3a4f76";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(rect.x + 18, holdY, holdW, 54, 8);
    ctx.fill();
    ctx.stroke();

    const holdRatio = Math.min(1, mg.holdTimerS / mg.requiredHoldS);
    ctx.fillStyle = "rgba(61, 220, 132, 0.22)";
    ctx.beginPath();
    ctx.roundRect(rect.x + 20, holdY + 2, (holdW - 4) * holdRatio, 50, 6);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `УТРИМАННЯ ПОТУЖНОСТІ >95%: ${mg.holdTimerS.toFixed(1)} / ${mg.requiredHoldS.toFixed(1)} с`,
      rect.x + rect.w * 0.5,
      holdY + 32,
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
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "700 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, cx, cy + r + 24);
    ctx.fillStyle = "#8a99b8";
    ctx.fillText(
      `Сонце: ${Math.round(sunDeg)}° · Панель: ${Math.round(panelDeg)}°`,
      cx,
      cy + r + 42,
    );

    ctx.restore();
  }
}
