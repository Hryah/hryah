import {
  type FlightAction,
  type LifeSupportMinigameState,
  LS_AMMONIA_VALVE_POS,
  LS_MANOMETER_POS,
  LS_O2_BUTTON_POS,
  LS_SLOT_POS,
  LS_TRASH_POS,
} from "../../../core/flight";
import { flightAssetCache } from "../render/TemplateAssetCache";

export class LifeSupportGame {
  private dragMode: "RED_FILTER" | "GREEN_FILTER" | "AMMONIA_VALVE" | "O2_VALVE" | null = null;
  private lastValveAngleRad = 0;

  public resetInput(): void {
    this.dragMode = null;
  }

  public getPanelRect(viewportW: number, viewportH: number) {
    const w = 800;
    const h = 520;
    const scale = Math.min(1, (viewportW - 32) / w, (viewportH - 96) / h);
    const drawW = w * scale;
    const drawH = h * scale;
    const x = (viewportW - drawW) * 0.5;
    const y = (viewportH - drawH) * 0.5 + 22;
    return { x, y, w: drawW, h: drawH, scale };
  }

  private toLocal(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
  ): { lx: number; ly: number } {
    const rect = this.getPanelRect(viewportW, viewportH);
    return {
      lx: (sx - rect.x) / rect.scale,
      ly: (sy - rect.y) / rect.scale,
    };
  }

  public handlePointerDown(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
    mg: LifeSupportMinigameState,
    dispatch: (action: FlightAction) => void,
  ): void {
    const { lx, ly } = this.toLocal(sx, sy, viewportW, viewportH);

    // Кнопка [ESC]
    if (lx >= 700 && lx <= 786 && ly >= 10 && ly <= 42) {
      this.resetInput();
      dispatch({ type: "close_minigame" });
      return;
    }

    // Перевірка захвата червоного (відпрацьованого) фільтра
    if (
      !mg.redFilterTrashed &&
      Math.hypot(lx - mg.redFilterPos.x, ly - mg.redFilterPos.y) <= 46
    ) {
      this.dragMode = "RED_FILTER";
      return;
    }

    // Перевірка захвата зеленого (нового) фільтра
    if (
      mg.redFilterTrashed &&
      !mg.greenFilterInstalled &&
      Math.hypot(lx - mg.greenFilterPos.x, ly - mg.greenFilterPos.y) <= 46
    ) {
      this.dragMode = "GREEN_FILTER";
      return;
    }

    // Перевірка вентиля аміаку (Крок 2: прокрутка на 360°)
    if (
      !mg.ammoniaFlushed &&
      Math.hypot(lx - LS_AMMONIA_VALVE_POS.x, ly - LS_AMMONIA_VALVE_POS.y) <= 84
    ) {
      this.dragMode = "AMMONIA_VALVE";
      this.lastValveAngleRad = Math.atan2(
        ly - LS_AMMONIA_VALVE_POS.y,
        lx - LS_AMMONIA_VALVE_POS.x,
      );
      return;
    }

    // Перевірка клапана нагнітання O2 (Крок 3: затиснути і відпустити в 70-85 кПа)
    if (
      Math.hypot(lx - LS_O2_BUTTON_POS.x, ly - LS_O2_BUTTON_POS.y) <= 58
    ) {
      this.dragMode = "O2_VALVE";
      dispatch({ type: "ls_hold_o2", held: true });
    }
  }

  public handlePointerMove(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
    dispatch: (action: FlightAction) => void,
  ): void {
    if (!this.dragMode) return;
    const { lx, ly } = this.toLocal(sx, sy, viewportW, viewportH);

    if (this.dragMode === "RED_FILTER") {
      dispatch({
        type: "ls_drag_filter",
        target: "RED",
        x: lx,
        y: ly,
        released: false,
      });
    } else if (this.dragMode === "GREEN_FILTER") {
      dispatch({
        type: "ls_drag_filter",
        target: "GREEN",
        x: lx,
        y: ly,
        released: false,
      });
    } else if (this.dragMode === "AMMONIA_VALVE") {
      const curRad = Math.atan2(
        ly - LS_AMMONIA_VALVE_POS.y,
        lx - LS_AMMONIA_VALVE_POS.x,
      );
      const diffRad = Math.atan2(
        Math.sin(curRad - this.lastValveAngleRad),
        Math.cos(curRad - this.lastValveAngleRad),
      );
      this.lastValveAngleRad = curRad;
      const deltaDeg = (Math.abs(diffRad) * 180) / Math.PI;
      if (deltaDeg > 0.2) {
        dispatch({ type: "ls_rotate_ammonia", deltaDeg });
      }
    }
  }

  public handlePointerUp(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
    dispatch: (action: FlightAction) => void,
  ): void {
    if (!this.dragMode) return;
    const { lx, ly } = this.toLocal(sx, sy, viewportW, viewportH);

    if (this.dragMode === "RED_FILTER") {
      dispatch({
        type: "ls_drag_filter",
        target: "RED",
        x: lx,
        y: ly,
        released: true,
      });
    } else if (this.dragMode === "GREEN_FILTER") {
      dispatch({
        type: "ls_drag_filter",
        target: "GREEN",
        x: lx,
        y: ly,
        released: true,
      });
    } else if (this.dragMode === "O2_VALVE") {
      dispatch({ type: "ls_hold_o2", held: false });
    }

    this.dragMode = null;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    mg: LifeSupportMinigameState,
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

    // Корпус інженерного щита (800x520)
    ctx.fillStyle = "#121724";
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(0, 0, 800, 520, 14);
    ctx.fill();
    ctx.stroke();

    // Шапка щита
    ctx.fillStyle = "#1e2638";
    ctx.beginPath();
    ctx.roundRect(3, 3, 794, 46, [12, 12, 0, 0]);
    ctx.fill();

    ctx.fillStyle = "#fdba74";
    ctx.font = "700 15px monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `ІНЖЕНЕРНИЙ ЩИТ СЖЗ ТА ТЕРМОКОНТУРУ [${mg.terminalId}]`,
      18,
      31,
    );

    // Кнопка [ESC]
    ctx.fillStyle = "#2b364f";
    ctx.strokeStyle = "#fdba74";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(704, 11, 80, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("[ESC] Вихід", 744, 30);

    // 3 магістральні труби щита
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(40, 110);
    ctx.lineTo(760, 110);
    ctx.moveTo(40, 270);
    ctx.lineTo(760, 270);
    ctx.moveTo(40, 445);
    ctx.lineTo(760, 445);
    ctx.stroke();

    // Анімований потік газу/холодоагенту в магістральних трубах
    ctx.save();
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 10]);
    ctx.lineDashOffset = -timeElapsedS * 48;
    ctx.strokeStyle = mg.greenFilterInstalled ? "#3ddc84" : "rgba(248, 113, 113, 0.35)";
    ctx.beginPath();
    ctx.moveTo(45, 110);
    ctx.lineTo(755, 110);
    ctx.stroke();

    ctx.strokeStyle = mg.ammoniaFlushed ? "#38bdf8" : "rgba(251, 146, 60, 0.35)";
    ctx.beginPath();
    ctx.moveTo(45, 270);
    ctx.lineTo(755, 270);
    ctx.stroke();

    ctx.strokeStyle = mg.pressureLocked ? "#3ddc84" : "rgba(56, 189, 248, 0.35)";
    ctx.beginPath();
    ctx.moveTo(45, 445);
    ctx.lineTo(755, 445);
    ctx.stroke();
    ctx.restore();

    // === СЕКЦІЯ 1: ЗАМІНА КАРТРИДЖА CO2-ФІЛЬТРА ===
    ctx.fillStyle = "#0b111d";
    ctx.strokeStyle = mg.greenFilterInstalled ? "#3ddc84" : "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(24, 68, 255, 425, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("1. ЗАМІНА CO₂-ФІЛЬТРА", 151, 92);

    // Паз фільтра
    ctx.fillStyle = "#162033";
    ctx.strokeStyle = mg.greenFilterInstalled ? "#3ddc84" : "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(LS_SLOT_POS.x - 42, LS_SLOT_POS.y - 52, 84, 104, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px monospace";
    ctx.fillText("ПАЗ ФІЛЬТРА", LS_SLOT_POS.x, LS_SLOT_POS.y - 60);

    // Сміттєвий шлюз
    ctx.fillStyle = "#1f1218";
    ctx.strokeStyle = mg.redFilterTrashed ? "#3ddc84" : "#e63946";
    ctx.beginPath();
    ctx.roundRect(LS_TRASH_POS.x - 46, LS_TRASH_POS.y - 44, 92, 88, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fca5a5";
    ctx.fillText("СМІТТЄВИЙ ШЛЮЗ", LS_TRASH_POS.x, LS_TRASH_POS.y + 58);

    // Новий зелений фільтр
    ctx.fillStyle = "#14532d";
    ctx.strokeStyle = "#3ddc84";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(mg.greenFilterPos.x - 32, mg.greenFilterPos.y - 42, 64, 84, 8);
    ctx.fill();
    ctx.stroke();

    const barrelSprite = flightAssetCache.getImage(
      "assets/sprites/station/machine_barrelLarge.png",
    );
    if (barrelSprite) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.drawImage(
        barrelSprite,
        mg.greenFilterPos.x - 24,
        mg.greenFilterPos.y - 34,
        48,
        68,
      );
      ctx.restore();
    }

    // 3D GLB телеметричний датчик СЖЗ у шапці щита (assets/models/modules/antenna_medium.glb)
    const sensorGlb = flightAssetCache.getGlbMesh(
      "assets/models/modules/antenna_medium.glb",
    );
    if (sensorGlb) {
      flightAssetCache.drawGlbMeshOnCanvas(
        ctx,
        sensorGlb,
        670,
        26,
        15,
        timeElapsedS * 1.6,
        0.35,
        "#fdba74",
      );
    }

    ctx.fillStyle = "#dcfce7";
    ctx.font = "700 10px monospace";
    ctx.fillText("НОВИЙ", mg.greenFilterPos.x, mg.greenFilterPos.y - 4);
    ctx.fillText("CO₂", mg.greenFilterPos.x, mg.greenFilterPos.y + 12);

    // Відпрацьований червоний фільтр
    if (!mg.redFilterTrashed) {
      ctx.fillStyle = "#7f1d1d";
      ctx.strokeStyle = "#ff4766";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(mg.redFilterPos.x - 32, mg.redFilterPos.y - 42, 64, 84, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fee2e2";
      ctx.fillText("СТАРИЙ", mg.redFilterPos.x, mg.redFilterPos.y - 4);
      ctx.fillText("У ШЛЮЗ ↓", mg.redFilterPos.x, mg.redFilterPos.y + 12);
    }

    // === СЕКЦІЯ 2: ВЕНТИЛЬ СКИДАННЯ АМІАКУ (360° DRAG) ===
    ctx.fillStyle = "#0b111d";
    ctx.strokeStyle = mg.ammoniaFlushed ? "#3ddc84" : "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(295, 68, 255, 425, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "700 12px monospace";
    ctx.fillText("2. ВЕНТИЛЬ АМІАКУ (360°)", 422, 92);

    const vCx = LS_AMMONIA_VALVE_POS.x;
    const vCy = LS_AMMONIA_VALVE_POS.y;
    const vRad = (mg.ammoniaValveDeg * Math.PI) / 180;

    // Кільце прогресу 360°
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(vCx, vCy, 76, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = mg.ammoniaFlushed ? "#3ddc84" : "#38bdf8";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(vCx, vCy, 76, -Math.PI * 0.5, -Math.PI * 0.5 + (mg.ammoniaValveDeg / 360) * Math.PI * 2);
    ctx.stroke();

    // Колесо вентиля
    ctx.save();
    ctx.translate(vCx, vCy);
    ctx.rotate(vRad);
    ctx.strokeStyle = mg.ammoniaFlushed ? "#3ddc84" : "#fb923c";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 56, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 56, Math.sin(a) * 56);
      ctx.stroke();
    }

    // Ручка на ободі вентиля
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(56, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = mg.ammoniaFlushed ? "#3ddc84" : "#fdba74";
    ctx.font = "700 12px monospace";
    ctx.fillText(
      mg.ammoniaFlushed
        ? "✓ КОНТУР ПРОКАЧАНО (360°)"
        : `Обертай мишею по колу: ${Math.round(mg.ammoniaValveDeg)}° / 360°`,
      vCx,
      vCy + 115,
    );

    // === СЕКЦІЯ 3: АНАЛОГОВИЙ МАНОМЕТР ТА КЛАПАН O2 (70–85 кПа) ===
    ctx.fillStyle = "#0b111d";
    ctx.strokeStyle = mg.pressureLocked ? "#3ddc84" : "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(566, 68, 210, 425, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "700 12px monospace";
    ctx.fillText("3. ТИСК O₂ (70–85 кПа)", 671, 92);

    // Циферблат аналогового манометра
    const mCx = LS_MANOMETER_POS.x + 26;
    const mCy = LS_MANOMETER_POS.y;
    const mR = 74;

    ctx.fillStyle = "#070c16";
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mCx, mCy, mR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Зелений сектор (70–85 кПа зі шкали 0..100 кПа)
    const kpaToAngle = (kpa: number) => Math.PI * 0.75 + (kpa / 100) * Math.PI * 1.5;
    ctx.strokeStyle = "#3ddc84";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(mCx, mCy, mR - 10, kpaToAngle(70), kpaToAngle(85));
    ctx.stroke();

    // Червоний сектор аварійного скидання (>90 кПа)
    ctx.strokeStyle = "#ff4766";
    ctx.beginPath();
    ctx.arc(mCx, mCy, mR - 10, kpaToAngle(90), kpaToAngle(100));
    ctx.stroke();

    // Тремтіння стрілки манометра
    const jitter =
      mg.o2ValveHeld
        ? Math.sin(timeElapsedS * 44) * 1.6
        : Math.sin(timeElapsedS * 19) * 0.5;
    const needleAngle = kpaToAngle(Math.max(0, Math.min(100, mg.pressureKpa + jitter)));

    ctx.strokeStyle = mg.pressureLocked ? "#3ddc84" : "#f8fafc";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mCx, mCy);
    ctx.lineTo(
      mCx + Math.cos(needleAngle) * (mR - 14),
      mCy + Math.sin(needleAngle) * (mR - 14),
    );
    ctx.stroke();

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "700 13px monospace";
    ctx.fillText(`${Math.round(mg.pressureKpa)} кПа`, mCx, mCy + 36);

    // Клапан-кнопка нагнітання O2
    const btnX = LS_O2_BUTTON_POS.x + 26;
    const btnY = LS_O2_BUTTON_POS.y;
    ctx.fillStyle = mg.pressureLocked
      ? "#14532d"
      : mg.o2ValveHeld
        ? "#0284c7"
        : "#1e293b";
    ctx.strokeStyle = mg.pressureLocked
      ? "#3ddc84"
      : mg.reliefValvePoppedTimerS > 0
        ? "#ff4766"
        : "#38bdf8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(btnX, btnY, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 11px monospace";
    ctx.fillText(
      mg.pressureLocked
        ? "✓ ЗАФІКСОВАНО"
        : mg.o2ValveHeld
          ? "ВІДПУСТИ В 70–85!"
          : "ЗАТИСНИ КЛАПАН O₂",
      btnX,
      btnY + 4,
    );

    if (mg.reliefValvePoppedTimerS > 0) {
      ctx.fillStyle = "#ff4766";
      ctx.fillText("✗ СКИДАННЯ >90 кПа!", btnX, btnY + 66);
    } else if (!mg.greenFilterInstalled || !mg.ammoniaFlushed) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px monospace";
      ctx.fillText("Спочатку виконай кроки 1 і 2", btnX, btnY + 66);
    }

    ctx.restore();
  }
}
