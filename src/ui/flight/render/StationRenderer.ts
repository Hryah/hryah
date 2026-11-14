import {
  ALL_GRAB_HANDLES,
  ALL_WALL_SEGMENTS,
  closestPointOnSegment,
  computeTrajectoryPreview,
  type FlightState,
  getActiveHandles,
  type GrabHandle,
  STATION_MODULES,
  type StationModuleBlueprint,
  type TerminalNode,
} from "../../../core/flight";
import type { Camera2D } from "../Camera2D";

interface StarPoint {
  x: number;
  y: number;
  size: number;
  alpha: number;
  layer: number;
}

const STARFIELD: StarPoint[] = Array.from({ length: 140 }, (_, i) => {
  const s1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  const s2 = Math.cos(i * 45.164 + 19.13) * 29431.112;
  const r1 = s1 - Math.floor(s1);
  const r2 = s2 - Math.floor(s2);
  return {
    x: (r1 - 0.5) * 3600,
    y: (r2 - 0.5) * 2800,
    size: 1 + (i % 3) * 0.75,
    alpha: 0.25 + (i % 5) * 0.14,
    layer: 1 + (i % 3),
  };
});

export class StationRenderer {
  public render(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
    camera: Camera2D,
    viewportW: number,
    viewportH: number,
  ): void {
    ctx.save();

    // 1. Фон глибокого космосу
    ctx.fillStyle = "#04060d";
    ctx.fillRect(0, 0, viewportW, viewportH);

    // 2. Зоряне небо на паралаксі
    for (const star of STARFIELD) {
      const parallax = 0.12 * star.layer;
      const sx =
        (((star.x - camera.x * parallax) % viewportW) + viewportW) % viewportW;
      const sy =
        (((star.y - camera.y * parallax) % viewportH) + viewportH) % viewportH;
      ctx.fillStyle = `rgba(205, 224, 255, ${star.alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Перехід у World Space через матрицю Camera2D
    ctx.save();
    camera.applyTransform(ctx, viewportW, viewportH);

    // Малюємо модулі станції (спочатку заблоковані як голографічний контур, потім активні)
    for (const mod of STATION_MODULES) {
      const unlocked = state.unlockedModuleIds.includes(mod.id);
      this.renderModuleHull(ctx, mod, unlocked, state);
    }

    // Малюємо сегменти стін та гермошлюзи стикування
    this.renderWallsAndSeals(ctx, state);

    // Малюємо термінали (трапецієподібні пульти з ескізу)
    for (const term of state.terminals) {
      const unlocked = state.unlockedModuleIds.includes(term.moduleId);
      if (unlocked) {
        this.renderTerminal(ctx, term, state.timeElapsedS);
      }
    }

    // Малюємо червоні поручні-капсули (GrabHandle)
    const activeHandles = getActiveHandles(state.unlockedModuleIds);
    for (const handle of activeHandles) {
      this.renderGrabHandle(ctx, handle, state);
    }

    // Малюємо пунктир траєкторії та вектор натягу рогатки, якщо гравець цілиться
    this.renderSlingshotPreview(ctx, state);

    // Малюємо космонавта
    this.renderAstronaut(ctx, state);

    ctx.restore();

    // 4. Атмосферні штрафи FNAF-режисера (падіння енергії гасить світло, падіння O2 звужує поле зору віньєткою)
    this.renderEnvironmentalPenalties(ctx, state, viewportW, viewportH);

    ctx.restore();
  }

  private renderModuleHull(
    ctx: CanvasRenderingContext2D,
    mod: StationModuleBlueprint,
    unlocked: boolean,
    state: FlightState,
  ): void {
    const { minX, minY, maxX, maxY } = mod.bounds;
    const w = maxX - minX;
    const h = maxY - minY;

    ctx.save();

    if (!unlocked) {
      // Заблокований модуль — напівпрозорий креслярський контур за шлюзом
      ctx.strokeStyle = "rgba(72, 130, 210, 0.22)";
      ctx.fillStyle = "rgba(12, 20, 38, 0.28)";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(minX, minY, w, h);
      ctx.fillRect(minX, minY, w, h);
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(110, 165, 240, 0.42)";
      ctx.font = "700 15px monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        `[ОЧІКУЄ СТИКУВАННЯ · ${mod.id}]`,
        mod.cameraCenter.x,
        mod.cameraCenter.y,
      );
      ctx.restore();
      return;
    }

    // Світність обшивки залежить від рівня енергії станції
    const lightRatio = Math.max(0.22, state.energyPct / 100);
    const hullBg =
      lightRatio > 0.55 ? "#121a2d" : lightRatio > 0.35 ? "#111322" : "#140c14";

    ctx.fillStyle = hullBg;

    if (mod.type === "INTERSECTION") {
      // Восьмикутний хаб зі скошеними під 45° кутами (як на скетчі Intersection)
      ctx.beginPath();
      ctx.moveTo(-260, -90);
      ctx.lineTo(-90, -260);
      ctx.lineTo(90, -260);
      ctx.lineTo(260, -90);
      ctx.lineTo(260, 90);
      ctx.lineTo(90, 260);
      ctx.lineTo(-90, 260);
      ctx.lineTo(-260, 90);
      ctx.closePath();
      ctx.fill();

      // Внутрішня розмітка хабу
      ctx.strokeStyle = "rgba(92, 168, 255, 0.14)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 145, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillRect(minX, minY, w, h);

      // Ребра жорсткості обшивки (як на скетчах Vertical / Horizontal)
      ctx.strokeStyle = "rgba(120, 155, 210, 0.1)";
      ctx.lineWidth = 2;
      if (mod.type === "HORIZONTAL") {
        for (let rx = minX + 90; rx < maxX; rx += 110) {
          ctx.beginPath();
          ctx.moveTo(rx, minY + 12);
          ctx.lineTo(rx, maxY - 12);
          ctx.stroke();
        }
      } else {
        for (let ry = minY + 90; ry < maxY; ry += 110) {
          ctx.beginPath();
          ctx.moveTo(minX + 12, ry);
          ctx.lineTo(maxX - 12, ry);
          ctx.stroke();
        }
      }
    }

    // Ілюмінатори (круглі вікна 'O' зі скетчу з зорями всередині)
    for (const port of mod.portholes) {
      const grad = ctx.createRadialGradient(
        port.x - port.radius * 0.2,
        port.y - port.radius * 0.2,
        4,
        port.x,
        port.y,
        port.radius,
      );
      grad.addColorStop(0, "#102848");
      grad.addColorStop(0.7, "#071124");
      grad.addColorStop(1, "#040812");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(port.x, port.y, port.radius, 0, Math.PI * 2);
      ctx.fill();

      // Рама ілюмінатора з заклепками
      ctx.strokeStyle = "#3a4f76";
      ctx.lineWidth = 5;
      ctx.stroke();

      // Блік скла
      ctx.strokeStyle = "rgba(130, 205, 255, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        port.x,
        port.y,
        port.radius * 0.76,
        -Math.PI * 0.75,
        -Math.PI * 0.2,
      );
      ctx.stroke();
    }

    // Центральна перешкода у Модулі 3 ([///] квадратний блок посередині кімнати зі скетчу)
    for (const obs of mod.obstacles) {
      const ow = obs.maxX - obs.minX;
      const oh = obs.maxY - obs.minY;
      ctx.fillStyle = "#1d263b";
      ctx.fillRect(obs.minX, obs.minY, ow, oh);

      // Діагональна штриховка [///] як на скетчі
      ctx.save();
      ctx.beginPath();
      ctx.rect(obs.minX + 6, obs.minY + 6, ow - 12, oh - 12);
      ctx.clip();
      ctx.strokeStyle = "rgba(255, 162, 61, 0.24)";
      ctx.lineWidth = 4;
      for (let d = -oh; d < ow + oh; d += 22) {
        ctx.beginPath();
        ctx.moveTo(obs.minX + d, obs.minY);
        ctx.lineTo(obs.minX + d - oh, obs.maxY);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = "#5f759e";
      ctx.lineWidth = 3;
      ctx.strokeRect(obs.minX, obs.minY, ow, oh);
    }

    // Підпис модуля на обшивці
    ctx.fillStyle = "rgba(148, 175, 215, 0.22)";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(mod.id, mod.cameraCenter.x, minY + 24);

    ctx.restore();
  }

  private renderWallsAndSeals(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
  ): void {
    ctx.save();
    for (const wall of ALL_WALL_SEGMENTS) {
      if (!state.unlockedModuleIds.includes(wall.moduleId)) continue;

      if (wall.isDockingSeal !== null) {
        const isOpened = state.openedSeals.includes(wall.isDockingSeal);
        if (isOpened) {
          // Відкритий гермошлюз — зелені вогні проходу
          ctx.strokeStyle = "rgba(61, 220, 132, 0.4)";
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 12]);
          ctx.beginPath();
          ctx.moveTo(wall.ax, wall.ay);
          ctx.lineTo(wall.bx, wall.by);
          ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }

        // Закритий шлюз стикування (масивні гермодвері)
        ctx.strokeStyle = "#ff7847";
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(wall.ax, wall.ay);
        ctx.lineTo(wall.bx, wall.by);
        ctx.stroke();

        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.moveTo(wall.ax, wall.ay);
        ctx.lineTo(wall.bx, wall.by);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }

      // Звичайна силова стіна станції
      ctx.strokeStyle = "#6e86b3";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(wall.ax, wall.ay);
      ctx.lineTo(wall.bx, wall.by);
      ctx.stroke();

      ctx.strokeStyle = "#a6c0ee";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wall.ax, wall.ay);
      ctx.lineTo(wall.bx, wall.by);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderTerminal(
    ctx: CanvasRenderingContext2D,
    term: TerminalNode,
    timeElapsedS: number,
  ): void {
    ctx.save();
    ctx.translate(term.pos.x, term.pos.y);

    const pulse = 0.5 + 0.5 * Math.sin(timeElapsedS * 7);
    let baseColor = "#3c82f6";
    let glowColor = "rgba(60, 130, 246, 0.25)";
    if (term.state === "WARNING") {
      baseColor = "#ffa23d";
      glowColor = `rgba(255, 162, 61, ${0.3 + pulse * 0.35})`;
    } else if (term.state === "CRITICAL") {
      baseColor = "#ff4766";
      glowColor = `rgba(255, 71, 102, ${0.4 + pulse * 0.45})`;
    } else if (term.state === "COMPLETED") {
      baseColor = "#3ddc84";
      glowColor = "rgba(61, 220, 132, 0.28)";
    }

    // Світіння пульта
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fill();

    // Синя трапеція пульта (\___/ як на ескізі)
    ctx.fillStyle = "#162442";
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-28, -14);
    ctx.lineTo(28, -14);
    ctx.lineTo(20, 14);
    ctx.lineTo(-20, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Екранчик термінала
    ctx.fillStyle = baseColor;
    ctx.font = "700 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(term.id, 0, -2);

    if (term.state === "WARNING" || term.state === "CRITICAL") {
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 11px monospace";
      ctx.fillText(`${Math.ceil(term.urgencyTimer)}s`, 0, 10);

      // Кільце таймера аварії
      const ratio = Math.max(0, term.urgencyTimer / Math.max(1, term.maxUrgencyTimer));
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 33, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderGrabHandle(
    ctx: CanvasRenderingContext2D,
    handle: GrabHandle,
    state: FlightState,
  ): void {
    const astro = state.astronaut;
    const isAnchoredHere =
      astro.state === "ANCHORED" && astro.anchoredHandleId === handle.id;

    const closest = closestPointOnSegment(
      astro.pos.x,
      astro.pos.y,
      handle.ax,
      handle.ay,
      handle.bx,
      handle.by,
    );
    const dist = Math.hypot(astro.pos.x - closest.x, astro.pos.y - closest.y);
    const inGrabRange = dist <= handle.grabRadius * 1.45;

    ctx.save();

    // Підсвітка радіуса захвату капсули (R_grab = 32px)
    if (isAnchoredHere || inGrabRange || astro.activeGrabHeld) {
      ctx.strokeStyle = isAnchoredHere
        ? "rgba(61, 220, 132, 0.45)"
        : inGrabRange
          ? "rgba(92, 168, 255, 0.35)"
          : "rgba(255, 92, 122, 0.14)";
      ctx.lineWidth = handle.grabRadius * 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(handle.ax, handle.ay);
      ctx.lineTo(handle.bx, handle.by);
      ctx.stroke();
    }

    // Ніжки кріплення поручня
    ctx.strokeStyle = "#8a99b8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(handle.ax, handle.ay, 4.5, 0, Math.PI * 2);
    ctx.arc(handle.bx, handle.by, 4.5, 0, Math.PI * 2);
    ctx.stroke();

    // Червона перекладина поручня (як на скетчах [===])
    ctx.strokeStyle = isAnchoredHere ? "#3ddc84" : "#e63946";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(handle.ax, handle.ay);
    ctx.lineTo(handle.bx, handle.by);
    ctx.stroke();

    // Відблиск на поручні
    ctx.strokeStyle = isAnchoredHere ? "#b8f7d4" : "#ff8fa3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(handle.ax, handle.ay);
    ctx.lineTo(handle.bx, handle.by);
    ctx.stroke();

    ctx.restore();
  }

  private renderSlingshotPreview(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
  ): void {
    const astro = state.astronaut;
    if (
      state.gameMode !== "STATION_ROAM" ||
      astro.state !== "ANCHORED" ||
      !astro.slingshot.isDragging
    ) {
      return;
    }

    const lv = astro.slingshot.launchVector;
    const speed = Math.hypot(lv.vx, lv.vy);
    if (speed < 15) return;

    const points = computeTrajectoryPreview(astro.pos, lv);
    const powerRatio = Math.min(1, speed / 650);

    ctx.save();

    // Лінія натягу рогатки позаду космонавта (візуальна тятива)
    const pullDx = astro.slingshot.dragCurrentScreen.x - astro.slingshot.dragStartScreen.x;
    const pullDy = astro.slingshot.dragCurrentScreen.y - astro.slingshot.dragStartScreen.y;
    const pullLen = Math.min(180, Math.hypot(pullDx, pullDy));
    if (pullLen > 4) {
      const pullAngle = Math.atan2(pullDy, pullDx);
      const bandEndX = astro.pos.x + Math.cos(pullAngle) * pullLen * 0.65;
      const bandEndY = astro.pos.y + Math.sin(pullAngle) * pullLen * 0.65;

      ctx.strokeStyle = "rgba(255, 107, 107, 0.75)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(astro.pos.x, astro.pos.y);
      ctx.lineTo(bandEndX, bandEndY);
      ctx.stroke();

      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(bandEndX, bandEndY, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 10 точок попереднього перегляду балістичної траєкторії: P_i = P_player + V_launch * (i * 0.04s)
    for (let i = 0; i < points.length; i++) {
      const pt = points[i]!;
      const alpha = 0.9 - (i / points.length) * 0.65;
      const radius = 4.5 - (i / points.length) * 2.2;
      ctx.fillStyle =
        powerRatio > 0.74
          ? `rgba(255, 162, 61, ${alpha})`
          : `rgba(92, 200, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Синя стрілка вектора імпульсу (як на скетчі image copy.png "--->")
    const endPt = points[Math.min(4, points.length - 1)]!;
    const angle = Math.atan2(lv.vy, lv.vx);
    ctx.strokeStyle = "#4cc9f0";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(astro.pos.x, astro.pos.y);
    ctx.lineTo(endPt.x, endPt.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Наконечник стрілки
    ctx.fillStyle = "#4cc9f0";
    ctx.beginPath();
    ctx.moveTo(endPt.x, endPt.y);
    ctx.lineTo(
      endPt.x - Math.cos(angle - 0.45) * 14,
      endPt.y - Math.sin(angle - 0.45) * 14,
    );
    ctx.lineTo(
      endPt.x - Math.cos(angle + 0.45) * 14,
      endPt.y - Math.sin(angle + 0.45) * 14,
    );
    ctx.closePath();
    ctx.fill();

    // Підпис швидкості вильоту
    ctx.fillStyle = "#e8f3ff";
    ctx.font = "700 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `${Math.round(speed)} px/s`,
      astro.pos.x,
      astro.pos.y + 38,
    );

    ctx.restore();
  }

  private renderAstronaut(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
  ): void {
    const astro = state.astronaut;

    ctx.save();
    ctx.translate(astro.pos.x, astro.pos.y);

    // Аура активного захвату (коли затиснуто Space / ЛКМ у польоті)
    if (astro.state === "FLYING" && astro.activeGrabHeld) {
      ctx.strokeStyle = "rgba(61, 220, 132, 0.7)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, astro.radius + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.rotate(astro.angle);

    // PLSS ранець життєзабезпечення за спиною (як на скетчі)
    ctx.fillStyle = "#cbd5e1";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-18, -12, 12, 24, 3);
    ctx.fill();
    ctx.stroke();

    // Індикатор на ранці
    ctx.fillStyle =
      astro.state === "STUNNED"
        ? "#ff4766"
        : astro.state === "ANCHORED"
          ? "#3ddc84"
          : "#38bdf8";
    ctx.beginPath();
    ctx.arc(-14, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Ноги космонавта
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 5.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(-19, -11);
    ctx.moveTo(-6, 5);
    ctx.lineTo(-19, 11);
    ctx.stroke();

    // Торс скафандра
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-8, -11, 18, 22, 6);
    ctx.fill();
    ctx.stroke();

    // Руки космонавта (витягнуті вперед для захвату поручня)
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, -9);
    ctx.lineTo(19, -6);
    ctx.moveTo(4, 9);
    ctx.lineTo(19, 6);
    ctx.stroke();

    // Червоні рукавички
    ctx.fillStyle = "#e63946";
    ctx.beginPath();
    ctx.arc(20, -6, 3.2, 0, Math.PI * 2);
    ctx.arc(20, 6, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Шолом і золотисто-блакитний візор
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(3, 0, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = astro.state === "STUNNED" ? "#fb7185" : "#38bdf8";
    ctx.beginPath();
    ctx.ellipse(6.5, 0, 5.2, 6.8, 0, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.fill();

    ctx.restore();

    // Зірочки оглушення при STUNNED після удару об стіну на швидкості > 480 px/s
    if (astro.state === "STUNNED") {
      for (let i = 0; i < 3; i++) {
        const a = state.timeElapsedS * 8 + (i * Math.PI * 2) / 3;
        const sx = Math.cos(a) * 26;
        const sy = Math.sin(a) * 16 - 24;
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ff5c7a";
      ctx.font = "700 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("STUNNED!", 0, -34);
    }

    // Дієгетична підказка взаємодії прямо над космонавтом, якщо тримається за ручку з терміналом
    if (
      state.gameMode === "STATION_ROAM" &&
      astro.state === "ANCHORED" &&
      astro.anchoredHandleId
    ) {
      const handle = ALL_GRAB_HANDLES.find((h) => h.id === astro.anchoredHandleId);
      if (handle && handle.terminalId) {
        const term = state.terminals.find((t) => t.id === handle.terminalId);
        const isUrgent = term && (term.state === "WARNING" || term.state === "CRITICAL");
        ctx.fillStyle = isUrgent ? "rgba(255, 130, 45, 0.94)" : "rgba(30, 64, 175, 0.92)";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-84, -52, 168, 24, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "700 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`[E] ПУЛЬТ: ${handle.terminalId}`, 0, -36);
      }
    }

    ctx.restore();
  }

  private renderEnvironmentalPenalties(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
    viewportW: number,
    viewportH: number,
  ): void {
    // 1. Падіння енергії гасить світло в рендері
    if (state.energyPct < 75) {
      const darkness = Math.min(0.68, ((75 - state.energyPct) / 75) * 0.68);
      ctx.fillStyle = `rgba(3, 5, 12, ${darkness})`;
      ctx.fillRect(0, 0, viewportW, viewportH);
    }

    // 2. Падіння O2 звужує поле зору віньєткою (гіпоксія)
    if (state.oxygenPct < 75) {
      const severity = Math.min(1, (75 - state.oxygenPct) / 75);
      const innerR = Math.max(90, Math.min(viewportW, viewportH) * (0.48 - severity * 0.28));
      const outerR = Math.max(viewportW, viewportH) * 0.72;
      const grad = ctx.createRadialGradient(
        viewportW * 0.5,
        viewportH * 0.5,
        innerR,
        viewportW * 0.5,
        viewportH * 0.5,
        outerR,
      );
      grad.addColorStop(0, "rgba(0, 0, 0, 0)");
      grad.addColorStop(1, `rgba(18, 2, 8, ${0.35 + severity * 0.58})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewportW, viewportH);
    }

    // 3. Перегрів станції додає червоне теплове марево по краях
    if (state.tempC > 34) {
      const heatAlpha = Math.min(0.32, ((state.tempC - 34) / 45) * 0.32);
      ctx.fillStyle = `rgba(255, 65, 35, ${heatAlpha})`;
      ctx.fillRect(0, 0, viewportW, viewportH);
    }
  }
}
