import type { DockingMinigameState, FlightAction } from "../../../core/flight";
import { flightAssetCache } from "../render/TemplateAssetCache";
import { drawFittedText } from "./textFit";

const PANEL_W = 820;
const PANEL_H = 520;

export class DockingGame {
  private keysHeld = { w: false, a: false, s: false, d: false };
  private mouseThrust = { x: 0, y: 0, active: false };

  public resetInput(): void {
    this.keysHeld = { w: false, a: false, s: false, d: false };
    this.mouseThrust = { x: 0, y: 0, active: false };
  }

  public getPanelRect(viewportW: number, viewportH: number) {
    const scale = Math.max(
      0.1,
      Math.min(1, (viewportW - 32) / PANEL_W, (viewportH - 96) / PANEL_H),
    );
    const drawW = PANEL_W * scale;
    const drawH = PANEL_H * scale;
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

  private getLayout() {
    const escW = 104;
    const escH = 30;
    const escX = PANEL_W - escW - 24;
    const escY = 11;
    const rightX = PANEL_W * 0.59;
    const rightW = PANEL_W * 0.382;
    const sightCx = PANEL_W * 0.33;
    const sightCy = PANEL_H * 0.54;
    const sightR = Math.min(182, PANEL_H * 0.36, rightX - sightCx - 16);
    const joyCx = rightX + rightW * 0.5;
    const joyCy = PANEL_H * 0.72;
    return {
      escX,
      escY,
      escW,
      escH,
      sightCx,
      sightCy,
      sightR,
      rightX,
      rightW,
      joyCx,
      joyCy,
    };
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
    const { lx, ly } = this.toLocal(sx, sy, viewportW, viewportH);
    const layout = this.getLayout();
    // Перевірка кнопки закриття [ESC]
    if (
      lx >= layout.escX - 2 &&
      lx <= layout.escX + layout.escW + 2 &&
      ly >= layout.escY - 2 &&
      ly <= layout.escY + layout.escH + 2
    ) {
      this.resetInput();
      dispatch({ type: "close_minigame" });
      return;
    }

    this.updatePointerThrust(lx, ly, true, dispatch);
  }

  public handlePointerMove(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
    dispatch: (action: FlightAction) => void,
  ): void {
    if (!this.mouseThrust.active) return;
    const { lx, ly } = this.toLocal(sx, sy, viewportW, viewportH);
    this.updatePointerThrust(lx, ly, true, dispatch);
  }

  public handlePointerUp(dispatch: (action: FlightAction) => void): void {
    if (!this.mouseThrust.active) return;
    this.mouseThrust = { x: 0, y: 0, active: false };
    this.emitThrust(dispatch);
  }

  private updatePointerThrust(
    lx: number,
    ly: number,
    active: boolean,
    dispatch: (action: FlightAction) => void,
  ): void {
    const { sightCx, sightCy, joyCx, joyCy } = this.getLayout();

    // Керування або через віртуальний джойстик справа, або кліком/перетягуванням прямо на екрані СОІ
    const distJoy = Math.hypot(lx - joyCx, ly - joyCy);
    if (distJoy <= 85) {
      const dx = (lx - joyCx) / 55;
      const dy = (ly - joyCy) / 55;
      this.mouseThrust = {
        x: Math.max(-1, Math.min(1, dx)),
        y: Math.max(-1, Math.min(1, dy)),
        active,
      };
    } else {
      // Натискання на екран СОІ штовхає мішень до центру
      const dx = (sightCx - lx) / 90;
      const dy = (sightCy - ly) / 90;
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
    const {
      escX,
      escY,
      escW,
      escH,
      sightCx,
      sightCy,
      sightR,
      rightX,
      rightW,
      joyCx,
      joyCy,
    } = this.getLayout();

    ctx.save();
    // Напівпрозоре затемнення фону (станція позаду продовжує жити!)
    ctx.fillStyle = "rgba(3, 7, 15, 0.62)";
    ctx.fillRect(0, 0, viewportW, viewportH);

    ctx.translate(rect.x, rect.y);
    ctx.scale(rect.scale, rect.scale);

    // Корпус приладу СОІ (Система Оптичної Індикації)
    ctx.fillStyle = "#081410";
    ctx.strokeStyle = mg.collisionFlashTimerS > 0 ? "#ff4766" : "#2ec4b6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(0, 0, PANEL_W, PANEL_H, 14);
    ctx.fill();
    ctx.stroke();

    // Верхня планка заголовка
    ctx.fillStyle = "#0d241c";
    ctx.beginPath();
    ctx.roundRect(3, 3, PANEL_W - 6, 46, [12, 12, 0, 0]);
    ctx.fill();

    drawFittedText(
      ctx,
      `СОІ · РУЧНЕ СТИКУВАННЯ [${mg.terminalId}]`,
      18,
      31,
      escX - 18 - 14,
      { fontSize: 15, minFontSize: 11, color: "#3ddc84" },
    );

    // Кнопка [ESC] з безпечним відступом 24px від правого краю
    ctx.fillStyle = "#1b3329";
    ctx.strokeStyle = "#3ddc84";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(escX, escY, escW, escH, 6);
    ctx.fill();
    ctx.stroke();
    drawFittedText(
      ctx,
      "[ESC] Вихід",
      escX + escW * 0.5,
      escY + 19,
      escW - 12,
      { fontSize: 12, minFontSize: 10, align: "center", color: "#d8f3dc" },
    );

    // Круглий оптичний візир СОІ
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
    const scale = 0.62 + ((10 - mg.distanceZM) / 10) * 0.62;

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    // 2D SVG силует стикувального модуля (assets/templates/design/bus-standard.svg)
    const busImg = flightAssetCache.getImage(
      "assets/templates/design/bus-standard.svg",
    );
    if (busImg) {
      ctx.save();
      ctx.rotate(mg.offsetXPx * 0.002);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(busImg, -46, -46, 92, 92);
      ctx.restore();
    }

    // 3D-каркас корпусу модуля в перспективі позаду стикувального кільця
    ctx.strokeStyle = "rgba(46, 196, 182, 0.32)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-48, -34, 96, 68, 12);
    ctx.stroke();

    // Крила сонячних панелей / радіаторів модуля на задньому плані
    ctx.beginPath();
    ctx.moveTo(-48, -8);
    ctx.lineTo(-92, -8);
    ctx.lineTo(-92, 8);
    ctx.lineTo(-48, 8);
    ctx.moveTo(48, -8);
    ctx.lineTo(92, -8);
    ctx.lineTo(92, 8);
    ctx.lineTo(48, 8);
    ctx.stroke();

    // Лінії перспективи від корпусу до стикувального вузла АПАС
    ctx.beginPath();
    ctx.moveTo(-36, -26);
    ctx.lineTo(-16, -16);
    ctx.moveTo(36, -26);
    ctx.lineTo(16, -16);
    ctx.moveTo(-36, 26);
    ctx.lineTo(-16, 16);
    ctx.moveTo(36, 26);
    ctx.lineTo(16, 16);
    ctx.stroke();

    ctx.strokeStyle = mg.inLockZone ? "#3ddc84" : "#ffb703";
    ctx.lineWidth = 2.5;
    // Зовнішнє кільце шлюзу модуля
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();

    // Внутрішнє кільце ущільнювача
    ctx.strokeStyle = mg.inLockZone ? "rgba(61, 220, 132, 0.65)" : "rgba(255, 183, 3, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();

    // 4 пелюстки стикувального вузла АПАС
    ctx.strokeStyle = mg.inLockZone ? "#3ddc84" : "#ffb703";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
      ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
      ctx.stroke();
    }

    // Перехрестя мішені (ромб + хрест)
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.restore();

    // Візуалізація реактивних струменів двигунів орієнтації по краях візира СОІ
    if (Math.abs(mg.thrustX) > 0.05 || Math.abs(mg.thrustY) > 0.05) {
      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
      ctx.lineWidth = 2;
      if (mg.thrustX > 0.05) {
        ctx.beginPath();
        ctx.moveTo(sightCx - sightR + 8, sightCy);
        ctx.lineTo(sightCx - sightR + 28, sightCy - 9);
        ctx.lineTo(sightCx - sightR + 28, sightCy + 9);
        ctx.closePath();
        ctx.fill();
      } else if (mg.thrustX < -0.05) {
        ctx.beginPath();
        ctx.moveTo(sightCx + sightR - 8, sightCy);
        ctx.lineTo(sightCx + sightR - 28, sightCy - 9);
        ctx.lineTo(sightCx + sightR - 28, sightCy + 9);
        ctx.closePath();
        ctx.fill();
      }
      if (mg.thrustY > 0.05) {
        ctx.beginPath();
        ctx.moveTo(sightCx, sightCy - sightR + 8);
        ctx.lineTo(sightCx - 9, sightCy - sightR + 28);
        ctx.lineTo(sightCx + 9, sightCy - sightR + 28);
        ctx.closePath();
        ctx.fill();
      } else if (mg.thrustY < -0.05) {
        ctx.beginPath();
        ctx.moveTo(sightCx, sightCy + sightR - 8);
        ctx.lineTo(sightCx - 9, sightCy + sightR - 28);
        ctx.lineTo(sightCx + 9, sightCy + sightR - 28);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Права приладова колонка: Дистанція Z (10м -> 0м), швидкість Vz, похибка R, віртуальний джойстик
    const padX = 18;
    const padY = 22;
    const cardY = 66;
    const cardH = 196;
    const textMaxW = rightW - padX * 2;

    ctx.fillStyle = "#0b1d16";
    ctx.strokeStyle = "#1f6f54";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(rightX, cardY, rightW, cardH, 8);
    ctx.fill();
    ctx.stroke();

    const radialErr = Math.hypot(mg.offsetXPx, mg.offsetYPx);
    const textStartY = cardY + padY + 6;
    drawFittedText(
      ctx,
      `ДИСТАНЦІЯ Z: ${mg.distanceZM.toFixed(1)} м`,
      rightX + padX,
      textStartY,
      textMaxW,
      { fontSize: 13.5, minFontSize: 10.5, color: "#80ed99" },
    );
    drawFittedText(
      ctx,
      `ШВИДКІСТЬ Vz: ${mg.approachSpeedVzMs.toFixed(2)} м/с`,
      rightX + padX,
      textStartY + 24,
      textMaxW,
      { fontSize: 13.5, minFontSize: 10.5, color: "#80ed99" },
    );
    drawFittedText(
      ctx,
      `ВІДХИЛЕННЯ R: ${Math.round(radialErr)} px (<25px)`,
      rightX + padX,
      textStartY + 48,
      textMaxW,
      {
        fontSize: 13.5,
        minFontSize: 10.5,
        color: mg.inLockZone ? "#3ddc84" : "#ff5c7a",
      },
    );

    // Прогрес-бар зближення Z (10м -> 0м)
    const zProgress = Math.max(0, Math.min(1, (10 - mg.distanceZM) / 10));
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(rightX + padX, cardY + 94, textMaxW, 12);
    ctx.fillStyle = mg.inLockZone ? "#3ddc84" : "#ffa23d";
    ctx.fillRect(rightX + padX, cardY + 94, textMaxW * zProgress, 12);

    drawFittedText(
      ctx,
      mg.inLockZone
        ? "✓ В НОРМІ — ТРИМАЙ ЦЕНТР"
        : "⚠ ВИРІВНЯЙ МІШЕНЬ (<25px)",
      rightX + padX,
      cardY + 132,
      textMaxW,
      {
        fontSize: 13,
        minFontSize: 10,
        color: mg.inLockZone ? "#3ddc84" : "#ffd166",
      },
    );

    if (mg.collisionFlashTimerS > 0) {
      drawFittedText(
        ctx,
        "✗ УДАР! ВІДКАТ +5М · -15%",
        rightX + padX,
        cardY + cardH - padY + 4,
        textMaxW,
        { fontSize: 12.5, minFontSize: 9.5, color: "#ff4766" },
      );
    }

    // Віртуальний джойстик імпульсних двигунів
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

    drawFittedText(
      ctx,
      "ДВИГУНИ [WASD / Стрілки / Миша]",
      joyCx,
      joyCy + 76,
      rightW,
      {
        fontWeight: 600,
        fontSize: 11,
        minFontSize: 9,
        align: "center",
        color: "#a3e635",
      },
    );

    ctx.restore();
  }
}
