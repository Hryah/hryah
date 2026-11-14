import {
  ALL_GRAB_HANDLES,
  buildOctagonWallsFromChamfer,
  closestPointOnSegment,
  computeTrajectoryPreview,
  type FlightState,
  getModuleOctagonPolygon,
  type GrabHandle,
  type ModuleBlueprint,
  STATION_LEVEL_CONFIG,
  type TerminalNode,
  type WallSegment,
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

const TERMINAL_BADGE_LABELS: Record<string, string> = {
  SOLAR: "⚡ СОНЯЧНІ ПАНЕЛІ",
  DOCKING_1: "⚓ ШЛЮЗ ПІВНІЧ",
  DOCKING_2: "⚓ ШЛЮЗ СХІД",
  DOCKING_3: "⚓ ШЛЮЗ ПІВДЕНЬ",
  OXYGEN: "🫧 РЕГЕНЕРАЦІЯ O₂",
  THERMAL: "🌡 ТЕРМОКОНТУР",
};

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
      const parallax = 0.08 * star.layer;
      const sx =
        (((star.x - camera.x * parallax) % viewportW) + viewportW) % viewportW;
      const sy =
        (((star.y - camera.y * parallax) % viewportH) + viewportH) % viewportH;
      ctx.fillStyle = `rgba(205, 224, 255, ${star.alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. World Space через RoomCameraController
    ctx.save();
    camera.applyTransform(ctx, viewportW, viewportH);

    const focusModuleId =
      state.gameMode === "MODULE_EXPANSION_CUTSCENE" &&
      state.cutsceneTargetModuleId
        ? state.cutsceneTargetModuleId
        : state.activeModuleId;

    const completedDockings = state.openedSeals.length;

    // Рендеримо кожен відкритий модуль: поточний на 100% яскравості, сусідні під FogOfWar (opacity: 0.25)
    for (const mod of STATION_LEVEL_CONFIG) {
      const unlocked = state.unlockedModuleIds.includes(mod.id);
      if (!unlocked) continue;

      const isFocus = mod.id === focusModuleId;
      ctx.save();
      ctx.globalAlpha = isFocus ? 1.0 : 0.25;

      this.renderModuleOctagonHull(ctx, mod, state);

      const walls = buildOctagonWallsFromChamfer(mod, completedDockings);
      this.renderModuleWallsAndDoors(ctx, walls);

      // Комп'ютерні стійки цього модуля (ComputerBlueprint окремо від ручок!)
      const modTerminals = state.terminals.filter((t) => t.moduleId === mod.id);
      for (const term of modTerminals) {
        this.renderComputerConsole(ctx, term, state.timeElapsedS);
      }

      // Поручні цього модуля (HandleBlueprint)
      const modHandles = ALL_GRAB_HANDLES.filter((h) => h.moduleId === mod.id);
      for (const handle of modHandles) {
        this.renderGrabHandle(ctx, handle, state);
      }

      ctx.restore();
    }

    // Вектор рогатки і 10 точок балістичної траєкторії
    this.renderSlingshotPreview(ctx, state);

    // Космонавт
    this.renderAstronaut(ctx, state);

    ctx.restore();

    // 4. Атмосферні штрафи FNAF-режисера
    this.renderEnvironmentalPenalties(ctx, state, viewportW, viewportH);

    ctx.restore();
  }

  private renderModuleOctagonHull(
    ctx: CanvasRenderingContext2D,
    mod: ModuleBlueprint,
    state: FlightState,
  ): void {
    const poly = getModuleOctagonPolygon(mod);
    const wx = mod.worldPos.x;
    const wy = mod.worldPos.y;
    const w = mod.size.width;
    const h = mod.size.height;

    ctx.save();

    // Восьмикутний контур підлоги модуля
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const pt = poly[i]!;
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();

    ctx.fillStyle = mod.theme.floorColor;
    ctx.fill();

    // Обрізаємо внутрішній декор восьмикутником модуля
    ctx.clip();

    // Внутрішній технічний патерн підлоги (TECH_RIBS, HEX, PANELS)
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 2;
    if (mod.theme.gridPattern === "TECH_RIBS") {
      for (let rx = wx + 80; rx < wx + w; rx += 95) {
        ctx.beginPath();
        ctx.moveTo(rx, wy);
        ctx.lineTo(rx, wy + h);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(wx, wy + h * 0.5);
      ctx.lineTo(wx + w, wy + h * 0.5);
      ctx.stroke();
    } else if (mod.theme.gridPattern === "HEX") {
      const cx = wx + w * 0.5;
      const cy = wy + h * 0.5;
      for (const r of [120, 210, 290]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(wx, cy);
      ctx.lineTo(wx + w, cy);
      ctx.moveTo(cx, wy);
      ctx.lineTo(cx, wy + h);
      ctx.stroke();
    } else {
      for (let ry = wy + 80; ry < wy + h; ry += 95) {
        ctx.beginPath();
        ctx.moveTo(wx, ry);
        ctx.lineTo(wx + w, ry);
        ctx.stroke();
      }
    }

    // Ілюмінатори (круглі вікна з зорями всередині)
    for (const port of mod.theme.portholes) {
      const px = wx + port.x;
      const py = wy + port.y;
      const grad = ctx.createRadialGradient(
        px - port.r * 0.2,
        py - port.r * 0.2,
        4,
        px,
        py,
        port.r,
      );
      grad.addColorStop(0, "#0f294a");
      grad.addColorStop(0.7, "#061020");
      grad.addColorStop(1, "#030710");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, port.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.strokeStyle = "rgba(125, 211, 252, 0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, port.r * 0.78, -Math.PI * 0.75, -Math.PI * 0.2);
      ctx.stroke();
    }

    // Перешкоди всередині модуля (PILLAR_CIRCLE та CARGO_BOX)
    for (const obs of mod.obstacles) {
      const ox = wx + obs.pos.x;
      const oy = wy + obs.pos.y;
      if (obs.kind === "PILLAR_CIRCLE") {
        const r = obs.radiusOrSize.w;
        const pGrad = ctx.createRadialGradient(ox - r * 0.25, oy - r * 0.25, 4, ox, oy, r);
        pGrad.addColorStop(0, "#334155");
        pGrad.addColorStop(0.75, "#1e293b");
        pGrad.addColorStop(1, "#0f172a");

        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();

        // Кільце безпеки колони
        ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(ox, oy, r - 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (obs.kind === "CARGO_BOX") {
        const bw = obs.radiusOrSize.w;
        const bh = obs.radiusOrSize.h;
        const bx = ox - bw * 0.5;
        const by = oy - bh * 0.5;

        ctx.fillStyle = "#1e293b";
        ctx.fillRect(bx, by, bw, bh);

        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + 6, by + 6, bw - 12, bh - 12);
        ctx.clip();
        ctx.strokeStyle = "rgba(245, 158, 11, 0.22)";
        ctx.lineWidth = 4;
        for (let d = -bh; d < bw + bh; d += 22) {
          ctx.beginPath();
          ctx.moveTo(bx + d, by);
          ctx.lineTo(bx + d - bh, by + bh);
          ctx.stroke();
        }
        ctx.restore();

        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, bw, bh);
      }
    }

    // Технічне маркування назви відсіку на обшивці
    ctx.fillStyle = "rgba(148, 163, 184, 0.24)";
    ctx.font = "700 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(mod.title, wx + w * 0.5, wy + 28);

    // Підсвітка зелених вогнів відкритих шлюзів (DoorTransitionZone)
    for (const door of mod.doors) {
      if (door.unlockedAtDockingWave <= state.openedSeals.length) {
        let dx = wx;
        let dy = wy;
        if (door.side === "RIGHT") {
          dx = wx + w;
          dy = wy + door.offset;
        } else if (door.side === "LEFT") {
          dx = wx;
          dy = wy + door.offset;
        } else if (door.side === "TOP") {
          dx = wx + door.offset;
          dy = wy;
        } else {
          dx = wx + door.offset;
          dy = wy + h;
        }
        ctx.fillStyle = "rgba(61, 220, 132, 0.12)";
        ctx.beginPath();
        ctx.arc(dx, dy, door.width * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private renderModuleWallsAndDoors(
    ctx: CanvasRenderingContext2D,
    walls: readonly WallSegment[],
  ): void {
    ctx.save();
    for (const wall of walls) {
      if (wall.isDockingSeal !== null) {
        // Броньовані стулки закритого гермошлюзу
        ctx.strokeStyle = "#ea580c";
        ctx.lineWidth = 12;
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.moveTo(wall.ax, wall.ay);
        ctx.lineTo(wall.bx, wall.by);
        ctx.stroke();

        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(wall.ax, wall.ay);
        ctx.lineTo(wall.bx, wall.by);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }

      // Товста силова обшивка восьмикутника
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(wall.ax, wall.ay);
      ctx.lineTo(wall.bx, wall.by);
      ctx.stroke();

      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(wall.ax, wall.ay);
      ctx.lineTo(wall.bx, wall.by);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 4. Відокремлений рендер ComputerBlueprint:
   * Деталізована стійка/консоль, вмонтована в стіну модуля (монітор, клавіатура, світлодіоди, кабелі, антена/труби/радар).
   */
  private renderComputerConsole(
    ctx: CanvasRenderingContext2D,
    term: TerminalNode,
    timeElapsedS: number,
  ): void {
    const linkedHandle = ALL_GRAB_HANDLES.find((h) => h.id === term.handleId);
    const preset = term.visualPreset;
    const cw = preset.chassisWidth;
    const ch = preset.chassisHeight;

    const pulse = 0.5 + 0.5 * Math.sin(timeElapsedS * 7.5);
    const isAlarm = term.state === "WARNING" || term.state === "CRITICAL";

    let screenColor = preset.screenColor;
    if (term.state === "WARNING") {
      screenColor = pulse > 0.45 ? "#f59e0b" : "#b45309";
    } else if (term.state === "CRITICAL") {
      screenColor = pulse > 0.35 ? "#ef4444" : "#7f1d1d";
    } else if (term.state === "COMPLETED") {
      screenColor = "#10b981";
    }

    ctx.save();

    // Силові кабелі по стіні від консолі до прив'язаної ручки-фіксатора
    if (linkedHandle) {
      const hx = (linkedHandle.ax + linkedHandle.bx) * 0.5;
      const hy = (linkedHandle.ay + linkedHandle.by) * 0.5;
      ctx.strokeStyle = isAlarm ? "rgba(245, 158, 11, 0.45)" : "rgba(56, 189, 248, 0.28)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(term.pos.x - 10, term.pos.y);
      ctx.lineTo(hx - 10, hy);
      ctx.moveTo(term.pos.x + 10, term.pos.y);
      ctx.lineTo(hx + 10, hy);
      ctx.stroke();
    }

    // М'яке світлове гало (radialGradient), коли на комп'ютері тривога
    if (isAlarm) {
      const haloR = cw * 1.15;
      const grad = ctx.createRadialGradient(
        term.pos.x,
        term.pos.y,
        8,
        term.pos.x,
        term.pos.y,
        haloR,
      );
      if (term.state === "CRITICAL") {
        grad.addColorStop(0, `rgba(239, 68, 68, ${0.28 + pulse * 0.25})`);
        grad.addColorStop(1, "rgba(239, 68, 68, 0)");
      } else {
        grad.addColorStop(0, `rgba(245, 158, 11, ${0.22 + pulse * 0.2})`);
        grad.addColorStop(1, "rgba(245, 158, 11, 0)");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(term.pos.x, term.pos.y, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Корпус комп'ютерної стійки з урахуванням mountAngle
    ctx.save();
    ctx.translate(term.pos.x, term.pos.y);
    ctx.rotate((term.mountAngle * Math.PI) / 180);

    // Візуальні труби охолодження (hasCoolingPipes)
    if (preset.hasCoolingPipes) {
      ctx.strokeStyle = "#0ea5e9";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-cw * 0.5 - 14, -ch * 0.25);
      ctx.lineTo(cw * 0.5 + 14, -ch * 0.25);
      ctx.moveTo(-cw * 0.5 - 14, ch * 0.15);
      ctx.lineTo(cw * 0.5 + 14, ch * 0.15);
      ctx.stroke();
    }

    // Візуальна антена (hasAntenna)
    if (preset.hasAntenna) {
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cw * 0.32, -ch * 0.5);
      ctx.lineTo(cw * 0.32, -ch * 0.5 - 22);
      ctx.stroke();
      ctx.fillStyle = isAlarm ? "#ef4444" : "#38bdf8";
      ctx.beginPath();
      ctx.arc(cw * 0.32, -ch * 0.5 - 24, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Візуальна тарілка радара для Docking комп'ютера (hasRadarDish)
    if (preset.hasRadarDish) {
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(-cw * 0.3, -ch * 0.5 - 10, 12, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }

    // Металева шафа-корпус консолі
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-cw * 0.5, -ch * 0.5, cw, ch, 7);
    ctx.fill();
    ctx.stroke();

    // Монітор консолі (блимає сам екран під час тривоги!)
    const mw = cw * 0.62;
    const mh = ch * 0.54;
    ctx.fillStyle = screenColor;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-cw * 0.42, -ch * 0.38, mw, mh, 4);
    ctx.fill();
    ctx.stroke();

    // Телеметрія на екрані монітора
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-cw * 0.36, -ch * 0.12);
    ctx.lineTo(-cw * 0.22, -ch * 0.22);
    ctx.lineTo(-cw * 0.08, -ch * 0.06);
    ctx.lineTo(cw * 0.12, -ch * 0.18);
    ctx.stroke();

    // Світлодіоди стану праворуч від монітора
    const leds = [
      isAlarm ? "#ef4444" : "#10b981",
      term.state === "WARNING" ? "#f59e0b" : "#38bdf8",
      "#94a3b8",
    ];
    for (let i = 0; i < leds.length; i++) {
      ctx.fillStyle = leds[i]!;
      ctx.beginPath();
      ctx.arc(cw * 0.32, -ch * 0.26 + i * 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Клавіатурна дека внизу стійки
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(-cw * 0.42, ch * 0.22, cw * 0.84, ch * 0.18, 3);
    ctx.fill();

    ctx.restore();

    // Голографічний бейдж над консоллю (завжди горизонтальний для читабельності)
    const labelTitle = TERMINAL_BADGE_LABELS[term.id] ?? term.id;
    const badgeText = isAlarm
      ? `[${labelTitle}: ${Math.ceil(term.urgencyTimer)}с]`
      : term.state === "COMPLETED"
        ? `[✓ ${labelTitle}]`
        : `[${labelTitle}]`;

    ctx.font = "700 11px monospace";
    const textW = ctx.measureText(badgeText).width;
    const bw = textW + 18;
    const bh = 22;
    const bx = term.pos.x - bw * 0.5;
    const by = term.pos.y - ch * 0.5 - 32;

    ctx.fillStyle = isAlarm
      ? term.state === "CRITICAL"
        ? "rgba(127, 29, 29, 0.92)"
        : "rgba(120, 53, 15, 0.92)"
      : "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = isAlarm
      ? term.state === "CRITICAL"
        ? "#ef4444"
        : "#f59e0b"
      : "rgba(56, 189, 248, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isAlarm ? "#ffffff" : "#bae6fd";
    ctx.textAlign = "center";
    ctx.fillText(badgeText, term.pos.x, by + 15);

    ctx.restore();
  }

  /**
   * 4. Рендер HandleBlueprint:
   * Без «зеленого огірка»! Радіус захвату малюється лише як тонкий пунктирний технічний контур
   * (1px dashed rgba(56, 189, 248, 0.35)), і тільки коли космонавт поруч.
   */
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
    const isNear = dist <= handle.grabRadius * 1.65;

    ctx.save();

    // Тонкий пунктирний технічний контур зони захвату (1px dashed rgba(56, 189, 248, 0.35)) тільки коли поруч
    if (isNear && !isAnchoredHere) {
      const dx = handle.bx - handle.ax;
      const dy = handle.by - handle.ay;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const r = handle.grabRadius;

      ctx.save();
      ctx.translate(handle.ax, handle.ay);
      ctx.rotate(angle);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(len, 0, r, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Кронштейни кріплення поручня до стіни
    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.arc(handle.ax, handle.ay, 5, 0, Math.PI * 2);
    ctx.arc(handle.bx, handle.by, 5, 0, Math.PI * 2);
    ctx.fill();

    // Основна перекладина поручня (синя/бірюзова для комп'ютерів, червона для стінових)
    const railColor = isAnchoredHere ? "#38bdf8" : handle.colorTheme;
    ctx.strokeStyle = railColor;
    ctx.lineWidth = 6.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(handle.ax, handle.ay);
    ctx.lineTo(handle.bx, handle.by);
    ctx.stroke();

    // Тонкий металевий блік на трубі поручня
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 1.5;
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

    // Тонке технологічне кільце прицілу навколо космонавта
    ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(astro.pos.x, astro.pos.y, astro.radius + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Лінія натягу рогатки позаду космонавта
    const pullDx =
      astro.slingshot.dragCurrentScreen.x - astro.slingshot.dragStartScreen.x;
    const pullDy =
      astro.slingshot.dragCurrentScreen.y - astro.slingshot.dragStartScreen.y;
    const pullLen = Math.min(180, Math.hypot(pullDx, pullDy));
    if (pullLen > 4) {
      const pullAngle = Math.atan2(pullDy, pullDx);
      const bandEndX = astro.pos.x + Math.cos(pullAngle) * pullLen * 0.65;
      const bandEndY = astro.pos.y + Math.sin(pullAngle) * pullLen * 0.65;

      ctx.strokeStyle = "rgba(255, 107, 107, 0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(astro.pos.x, astro.pos.y);
      ctx.lineTo(bandEndX, bandEndY);
      ctx.stroke();

      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(bandEndX, bandEndY, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 10 точок попереднього перегляду балістичної траєкторії
    for (let i = 0; i < points.length; i++) {
      const pt = points[i]!;
      const alpha = 0.9 - (i / points.length) * 0.65;
      const radius = 4.2 - (i / points.length) * 2.0;
      ctx.fillStyle =
        powerRatio > 0.74
          ? `rgba(255, 162, 61, ${alpha})`
          : `rgba(92, 200, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const endPt = points[Math.min(4, points.length - 1)]!;
    const angle = Math.atan2(lv.vy, lv.vx);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(astro.pos.x, astro.pos.y);
    ctx.lineTo(endPt.x, endPt.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.moveTo(endPt.x, endPt.y);
    ctx.lineTo(
      endPt.x - Math.cos(angle - 0.45) * 13,
      endPt.y - Math.sin(angle - 0.45) * 13,
    );
    ctx.lineTo(
      endPt.x - Math.cos(angle + 0.45) * 13,
      endPt.y - Math.sin(angle + 0.45) * 13,
    );
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e8f3ff";
    ctx.font = "700 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(speed)} px/s`, astro.pos.x, astro.pos.y + 38);

    ctx.restore();
  }

  private renderAstronaut(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
  ): void {
    const astro = state.astronaut;

    ctx.save();
    ctx.translate(astro.pos.x, astro.pos.y);

    // Тонке технологічне кільце при активному захваті в польоті
    if (astro.state === "FLYING" && astro.activeGrabHeld) {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, astro.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.rotate(astro.angle);

    // Ранець життєзабезпечення PLSS
    ctx.fillStyle = "#cbd5e1";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-18, -12, 12, 24, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle =
      astro.state === "STUNNED"
        ? "#ff4766"
        : astro.state === "ANCHORED"
          ? "#3ddc84"
          : "#38bdf8";
    ctx.beginPath();
    ctx.arc(-14, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Ноги
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 5.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(-19, -11);
    ctx.moveTo(-6, 5);
    ctx.lineTo(-19, 11);
    ctx.stroke();

    // Торс
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-8, -11, 18, 22, 6);
    ctx.fill();
    ctx.stroke();

    // Руки
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, -9);
    ctx.lineTo(19, -6);
    ctx.moveTo(4, 9);
    ctx.lineTo(19, 6);
    ctx.stroke();

    // Рукавички
    ctx.fillStyle = "#e63946";
    ctx.beginPath();
    ctx.arc(20, -6, 3.2, 0, Math.PI * 2);
    ctx.arc(20, 6, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Шолом і візор
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

    // Дієгетична кнопка взаємодії [E], коли тримається за ручку біля комп'ютера
    if (
      state.gameMode === "STATION_ROAM" &&
      astro.state === "ANCHORED" &&
      astro.anchoredHandleId
    ) {
      const handle = ALL_GRAB_HANDLES.find(
        (h) => h.id === astro.anchoredHandleId,
      );
      if (handle && handle.terminalId) {
        const term = state.terminals.find((t) => t.id === handle.terminalId);
        const isUrgent =
          term && (term.state === "WARNING" || term.state === "CRITICAL");
        ctx.fillStyle = isUrgent
          ? "rgba(234, 88, 12, 0.94)"
          : "rgba(3, 105, 161, 0.92)";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-86, -48, 172, 22, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "700 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`[E] УВІМКНУТИ: ${handle.terminalId}`, 0, -33);
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
    if (state.energyPct < 75) {
      const darkness = Math.min(0.68, ((75 - state.energyPct) / 75) * 0.68);
      ctx.fillStyle = `rgba(3, 5, 12, ${darkness})`;
      ctx.fillRect(0, 0, viewportW, viewportH);
    }

    if (state.oxygenPct < 75) {
      const severity = Math.min(1, (75 - state.oxygenPct) / 75);
      const innerR = Math.max(
        90,
        Math.min(viewportW, viewportH) * (0.48 - severity * 0.28),
      );
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

    if (state.tempC > 34) {
      const heatAlpha = Math.min(0.32, ((state.tempC - 34) / 45) * 0.32);
      ctx.fillStyle = `rgba(255, 65, 35, ${heatAlpha})`;
      ctx.fillRect(0, 0, viewportW, viewportH);
    }
  }
}
