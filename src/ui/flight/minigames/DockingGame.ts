import type { DockingMinigameState, FlightAction } from "../../../core/flight";

export class DockingGame {
  private keysHeld = { w: false, a: false, s: false, d: false };
  private mouseThrust = { x: 0, y: 0, active: false };

  public resetInput(): void {
    this.keysHeld = { w: false, a: false, s: false, d: false };
    this.mouseThrust = { x: 0, y: 0, active: false };
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
    if (code === "KeyW" || code === "ArrowUp") this.keysHeld.w = true;
    else if (code === "KeyS" || code === "ArrowDown") this.keysHeld.s = true;
    else if (code === "KeyA" || code === "ArrowLeft") this.keysHeld.a = true;
    else if (code === "KeyD" || code === "ArrowRight") this.keysHeld.d = true;
    else return false;

    this.emitThrust(dispatch);
    return true;
  }

  public handleKeyUp(
    code: string,
    dispatch: (action: FlightAction) => void,
  ): boolean {
    if (code === "KeyW" || code === "ArrowUp") this.keysHeld.w = false;
    else if (code === "KeyS" || code === "ArrowDown") this.keysHeld.s = false;
    else if (code === "KeyA" || code === "ArrowLeft") this.keysHeld.a = false;
    else if (code === "KeyD" || code === "ArrowRight") this.keysHeld.d = false;
    else return false;

    this.emitThrust(dispatch);
    return true;
  }

  public handlePointerDown(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
    dispatch: (action: FlightAction) => void,
  ): void {
    const rect = this.getPanelRect(viewportW, viewportH);
    // Перевірка кнопки закриття [ESC]
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

    this.updatePointerThrust(sx, sy, viewportW, viewportH, true, dispatch);
  }

  public handlePointerMove(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
    dispatch: (action: FlightAction) => void,
  ): void {
    if (!this.mouseThrust.active) return;
    this.updatePointerThrust(sx, sy, viewportW, viewportH, true, dispatch);
  }

  public handlePointerUp(dispatch: (action: FlightAction) => void): void {
    if (!this.mouseThrust.active) return;
    this.mouseThrust = { x: 0, y: 0, active: false };
    this.emitThrust(dispatch);
  }

  private updatePointerThrust(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
    active: boolean,
    dispatch: (action: FlightAction) => void,
  ): void {
    const rect = this.getPanelRect(viewportW, viewportH);
    const sightCx = rect.x + rect.w * 0.42;
    const sightCy = rect.y + rect.h * 0.54;
    const joyCx = rect.x + rect.w * 0.83;
    const joyCy = rect.y + rect.h * 0.72;

    // Керування або через віртуальний джойстик справа, або кліком/перетягуванням прямо на екрані СОІ
    const distJoy = Math.hypot(sx - joyCx, sy - joyCy);
    if (distJoy <= 85) {
      const dx = (sx - joyCx) / 55;
      const dy = (sy - joyCy) / 55;
      this.mouseThrust = {
        x: Math.max(-1, Math.min(1, dx)),
        y: Math.max(-1, Math.min(1, dy)),
        active,
      };
    } else {
      // Натискання на екран СОІ штовхає мішень до центру
      const dx = ( sightCx - sx ) / 90;
      const dy = ( sightCy - sy ) / 90;
      this.mouseThrust = {
        x: Math.max(-1, Math.min(1, -dx)),
        y: Math.max(-1, Math.min(1, -dy)),
        active,
      };
    }
    this.emitThrust(dispatch);
  }

  private emitThrust(dispatch: (action: FlightAction) => void): void {
    let tx = (this.keysHeld.d ? 1 : 0) - (this.keysHeld.a ? 1 : 0);
    let ty = (this.keysHeld.s ? 1 : 0) - (this.keysHeld.w ? 1 : 0);
    if (this.mouseThrust.active) {
      tx = this.mouseThrust.x;
      ty = this.mouseThrust.y;
    }
    dispatch({ type: "docking_input", thrustX: tx, thrustY: ty });
  }

  public render(
    ctx: CanvasRenderingContext2D,
    mg: DockingMinigameState,
    viewportW: number,
    viewportH: number,
  ): void {
    const rect = this.getPanelRect(viewportW, viewportH);

    ctx.save();
    // Напівпрозоре затемнення фону (станція позаду продовжує жити!)
    ctx.fillStyle = "rgba(3, 7, 15, 0.62)";
    ctx.fillRect(0, 0, viewportW, viewportH);

    // Корпус приладу СОІ (Система Оптичної Індикації)
    ctx.fillStyle = "#081410";
    ctx.strokeStyle = mg.collisionFlashTimerS > 0 ? "#ff4766" : "#2ec4b6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 14);
    ctx.fill();
    ctx.stroke();

    // Верхня планка заголовка
    ctx.fillStyle = "#0d241c";
    ctx.beginPath();
    ctx.roundRect(rect.x + 3, rect.y + 3, rect.w - 6, 46, [12, 12, 0, 0]);
    ctx.fill();

    ctx.fillStyle = "#3ddc84";
    ctx.font = "700 15px monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `СОІ · РУЧНЕ ОРБІТАЛЬНЕ СТИКУВАННЯ [${mg.terminalId}]`,
      rect.x + 18,
      rect.y + 31,
    );

    // Кнопка [ESC]
    ctx.fillStyle = "#1b3329";
    ctx.strokeStyle = "#3ddc84";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(rect.x + rect.w - 94, rect.y + 11, 78, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d8f3dc";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("[ESC] Вихід", rect.x + rect.w - 55, rect.y + 30);

    // Круглий оптичний візир СОІ
    const sightCx = rect.x + rect.w * 0.42;
    const sightCy = rect.y + rect.h * 0.54;
    const sightR = Math.min(185, rect.h * 0.36);

    ctx.fillStyle = "#040d09";
    ctx.strokeStyle = "#1f6f54";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sightCx, sightCy, sightR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Координатна сітка візира
    ctx.strokeStyle = "rgba(61, 220, 132, 0.2)";
    ctx.lineWidth = 1;
    for (let r = 45; r < sightR; r += 45) {
      ctx.beginPath();
      ctx.arc(sightCx, sightCy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(sightCx - sightR, sightCy);
    ctx.lineTo(sightCx + sightR, sightCy);
    ctx.moveTo(sightCx, sightCy - sightR);
    ctx.lineTo(sightCx, sightCy + sightR);
    ctx.stroke();

    // Допуск захоплення R < 25px у центрі прицілу
    ctx.strokeStyle = mg.inLockZone ? "#3ddc84" : "#ffa23d";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(sightCx, sightCy, mg.lockRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Силует стикувального вузла нового модуля, що коливається у точці (offsetXPx, offsetYPx)
    const tx = sightCx + mg.offsetXPx;
    const ty = sightCy + mg.offsetYPx;
    const scale = 0.65 + ((10 - mg.distanceZM) / 10) * 0.55;

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    ctx.strokeStyle = mg.inLockZone ? "#3ddc84" : "#ffb703";
    ctx.lineWidth = 2.5;
    // Зовнішнє кільце шлюзу модуля
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();

    // 4 пелюстки стикувального вузла АПАС
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
      ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
      ctx.stroke();
    }

    // Перехрестя мішені
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.restore();

    // Права приладова колонка: Дистанція Z (10м -> 0м), швидкість Vz, похибка R, віртуальний джойстик
    const rightX = rect.x + rect.w * 0.7;
    const rightW = rect.w * 0.26;

    ctx.fillStyle = "#0b1d16";
    ctx.strokeStyle = "#1f6f54";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(rightX, rect.y + 66, rightW, 185, 8);
    ctx.fill();
    ctx.stroke();

    const radialErr = Math.hypot(mg.offsetXPx, mg.offsetYPx);
    ctx.fillStyle = "#80ed99";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`ДИСТАНЦІЯ Z: ${mg.distanceZM.toFixed(1)} м`, rightX + 14, rect.y + 92);
    ctx.fillText(`ШВИДКІСТЬ Vz: ${mg.approachSpeedVzMs.toFixed(2)} м/с`, rightX + 14, rect.y + 114);
    ctx.fillStyle = mg.inLockZone ? "#3ddc84" : "#ff5c7a";
    ctx.fillText(
      `ВІДХИЛЕННЯ R: ${Math.round(radialErr)} px (<25px)`,
      rightX + 14,
      rect.y + 136,
    );

    // Прогрес-бар зближення Z (10м -> 0м)
    const zProgress = Math.max(0, Math.min(1, (10 - mg.distanceZM) / 10));
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(rightX + 14, rect.y + 152, rightW - 28, 12);
    ctx.fillStyle = mg.inLockZone ? "#3ddc84" : "#ffa23d";
    ctx.fillRect(rightX + 14, rect.y + 152, (rightW - 28) * zProgress, 12);

    ctx.fillStyle = mg.inLockZone ? "#3ddc84" : "#ffd166";
    ctx.font = "700 11px monospace";
    ctx.fillText(
      mg.inLockZone
        ? "✓ ЗАХВАТ В НОРМІ — ТРИМАЙ ЦЕНТР!"
        : "⚠ ВИРІВНЯЙ МІШЕНЬ У ЦЕНТР (<25px)!",
      rightX + 14,
      rect.y + 188,
    );

    if (mg.collisionFlashTimerS > 0) {
      ctx.fillStyle = "#ff4766";
      ctx.fillText("✗ УДАР ШЛЮЗОМ! ВІДКАТ +5М, -15% ЕНЕРГІЇ", rightX + 14, rect.y + 212);
    }

    // Віртуальний джойстик імпульсних двигунів
    const joyCx = rect.x + rect.w * 0.83;
    const joyCy = rect.y + rect.h * 0.72;
    ctx.fillStyle = "#0b1d16";
    ctx.strokeStyle = "#2ec4b6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(joyCx, joyCy, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Положення ручки джойстика
    const knobX = joyCx + mg.thrustX * 36;
    const knobY = joyCy + mg.thrustY * 36;
    ctx.fillStyle = "#3ddc84";
    ctx.beginPath();
    ctx.arc(knobX, knobY, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#a3e635";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("ДВИГУНИ ОРІЄНТАЦІЇ [WASD / Стрілки / Миша]", joyCx, joyCy + 76);

    ctx.restore();
  }
}
