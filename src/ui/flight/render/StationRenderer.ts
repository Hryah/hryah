import {
  ALL_GRAB_HANDLES,
  buildOctagonWallsFromChamfer,
  closestPointOnSegment,
  computeBallisticTrajectoryWithBounces,
  type FlightState,
  getActiveCircleObstacles,
  getActiveHandles,
  getActiveWalls,
  getModuleOctagonPolygon,
  type GrabHandle,
  type ModuleBlueprint,
  STATION_LEVEL_CONFIG,
  type TerminalNode,
  type WallSegment,
} from "../../../core/flight";
import type { Camera2D } from "../Camera2D";
import type { ParticleSystem } from "./ParticleSystem";

interface StarPoint {
  x: number;
  y: number;
  size: number;
  alpha: number;
  layer: number;
  tint: string;
}

const STAR_TINTS = ["#cde0ff", "#e0f2fe", "#fef08a", "#fed7aa"];

const STARFIELD: StarPoint[] = Array.from({ length: 170 }, (_, i) => {
  const s1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  const s2 = Math.cos(i * 45.164 + 19.13) * 29431.112;
  const r1 = s1 - Math.floor(s1);
  const r2 = s2 - Math.floor(s2);
  return {
    x: (r1 - 0.5) * 3800,
    y: (r2 - 0.5) * 3000,
    size: 0.9 + (i % 4) * 0.65,
    alpha: 0.22 + (i % 5) * 0.14,
    layer: 1 + (i % 3),
    tint: STAR_TINTS[i % STAR_TINTS.length]!,
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
    particles?: ParticleSystem,
  ): void {
    ctx.save();

    // 1. Фон глибокого космосу з орбітальним світінням Землі знизу
    const spaceGrad = ctx.createLinearGradient(0, 0, 0, viewportH);
    spaceGrad.addColorStop(0, "#02040a");
    spaceGrad.addColorStop(0.65, "#050a17");
    spaceGrad.addColorStop(1, "#091933");
    ctx.fillStyle = spaceGrad;
    ctx.fillRect(0, 0, viewportW, viewportH);

    // Тонке атмосферне сяйво лімба Землі внизу екрана
    const limbGrad = ctx.createRadialGradient(
      viewportW * 0.5,
      viewportH * 1.45,
      viewportH * 0.3,
      viewportW * 0.5,
      viewportH * 1.45,
      viewportH * 1.15,
    );
    limbGrad.addColorStop(0, "rgba(56, 189, 248, 0.22)");
    limbGrad.addColorStop(0.45, "rgba(14, 116, 144, 0.08)");
    limbGrad.addColorStop(1, "rgba(2, 4, 10, 0)");
    ctx.fillStyle = limbGrad;
    ctx.fillRect(0, 0, viewportW, viewportH);

    // 2. Багатошарове зоряне небо на паралаксі
    for (let i = 0; i < STARFIELD.length; i++) {
      const star = STARFIELD[i]!;
      const parallax = 0.06 * star.layer;
      const sx =
        (((star.x - camera.x * parallax) % viewportW) + viewportW) % viewportW;
      const sy =
        (((star.y - camera.y * parallax) % viewportH) + viewportH) % viewportH;
      const twinkle =
        0.75 + 0.25 * Math.sin(state.timeElapsedS * 2.2 + i * 1.7);
      ctx.fillStyle = star.tint;
      ctx.globalAlpha = star.alpha * twinkle;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 3. World Space через RoomCameraController
    ctx.save();
    camera.applyTransform(ctx, viewportW, viewportH);

    const focusModuleId =
      state.gameMode === "MODULE_EXPANSION_CUTSCENE" &&
      state.cutsceneTargetModuleId
        ? state.cutsceneTargetModuleId
        : state.activeModuleId;

    const completedDockings = state.openedSeals.length;

    // Обчислюємо цільову ручку з рикошетної траєкторії, якщо гравець цілиться рогаткою
    let lockedTargetHandleId: string | null = null;
    if (
      state.gameMode === "STATION_ROAM" &&
      state.astronaut.state === "ANCHORED" &&
      state.astronaut.slingshot.isDragging
    ) {
      const lv = state.astronaut.slingshot.launchVector;
      if (Math.hypot(lv.vx, lv.vy) >= 20) {
        const preview = computeBallisticTrajectoryWithBounces(
          state.astronaut.pos,
          lv,
          state.astronaut.radius,
          getActiveWalls(state.unlockedModuleIds, state.openedSeals),
          getActiveHandles(state.unlockedModuleIds),
          getActiveCircleObstacles(state.unlockedModuleIds),
          state.astronaut.anchoredHandleId,
        );
        lockedTargetHandleId = preview.targetHandleId;
      }
    }

    // Зовнішні силові ферми між модулями (щоб станція виглядала як єдиний космічний корабель)
    this.renderExteriorTrusses(ctx, state);

    // Рендеримо кожен відкритий модуль: поточний на 100% яскравості, сусідні під FogOfWar (opacity: 0.28)
    for (const mod of STATION_LEVEL_CONFIG) {
      const unlocked = state.unlockedModuleIds.includes(mod.id);
      if (!unlocked) continue;

      const isFocus = mod.id === focusModuleId;
      ctx.save();
      ctx.globalAlpha = isFocus ? 1.0 : 0.28;

      this.renderModuleOctagonHull(ctx, mod, state);

      const walls = buildOctagonWallsFromChamfer(mod, completedDockings);
      this.renderModuleWallsAndDoors(ctx, mod, walls, state.timeElapsedS);

      // Комп'ютерні стійки цього модуля (ComputerBlueprint окремо від ручок!)
      const modTerminals = state.terminals.filter((t) => t.moduleId === mod.id);
      for (const term of modTerminals) {
        this.renderComputerConsole(ctx, term, state);
      }

      // Поручні цього модуля (HandleBlueprint)
      const modHandles = ALL_GRAB_HANDLES.filter((h) => h.moduleId === mod.id);
      for (const handle of modHandles) {
        this.renderGrabHandle(
          ctx,
          handle,
          state,
          handle.id === lockedTargetHandleId,
        );
      }

      ctx.restore();
    }

    // Частинки у світових координатах (слід польоту, іскри, струмені RCS)
    if (particles) {
      particles.render(ctx);
    }

    // Вектор рогатки, балістична траєкторія з рикошетами та індикатор [ЦІЛЬ ЗАХОПЛЕНО]
    this.renderSlingshotPreview(ctx, state);

    // Космонавт із живою анімацією кінцівок
    this.renderAstronaut(ctx, state);

    ctx.restore();

    // 4. Атмосферні штрафи FNAF-режисера
    this.renderEnvironmentalPenalties(ctx, state, viewportW, viewportH);

    ctx.restore();
  }

  private renderExteriorTrusses(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
  ): void {
    ctx.save();
    for (const mod of STATION_LEVEL_CONFIG) {
      if (!state.unlockedModuleIds.includes(mod.id)) continue;
      const poly = getModuleOctagonPolygon(mod);

      // Зовнішній броньований кожух модуля (тінь + металева окантовка)
      ctx.beginPath();
      for (let i = 0; i < poly.length; i++) {
        const pt = poly[i]!;
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
      ctx.lineWidth = 28;
      ctx.lineJoin = "round";
      ctx.stroke();

      ctx.strokeStyle = "rgba(51, 65, 85, 0.55)";
      ctx.lineWidth = 20;
      ctx.stroke();
    }
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
    const cx = wx + w * 0.5;
    const cy = wy + h * 0.5;

    ctx.save();

    // Восьмикутний контур підлоги модуля
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const pt = poly[i]!;
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();

    // Градієнтне освітлення палуби (яскравіше в центрі, глибше біля переборок)
    const floorGrad = ctx.createRadialGradient(
      cx,
      cy,
      40,
      cx,
      cy,
      Math.max(w, h) * 0.65,
    );
    floorGrad.addColorStop(0, "#172338");
    floorGrad.addColorStop(0.65, mod.theme.floorColor);
    floorGrad.addColorStop(1, "#070c16");
    ctx.fillStyle = floorGrad;
    ctx.fill();

    // Обрізаємо внутрішній декор восьмикутником модуля
    ctx.clip();

    // Внутрішні 2.5D панелі обшивки (втоплені секції палуби)
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 2;
    if (mod.theme.gridPattern === "TECH_RIBS") {
      for (let rx = wx + 80; rx < wx + w; rx += 95) {
        ctx.beginPath();
        ctx.moveTo(rx, wy);
        ctx.lineTo(rx, wy + h);
        ctx.stroke();

        // Заклепки вздовж силових шпангоутів
        ctx.fillStyle = "rgba(148, 163, 184, 0.14)";
        for (let ry = wy + 45; ry < wy + h - 30; ry += 70) {
          ctx.fillRect(rx - 5, ry - 2, 3, 3);
          ctx.fillRect(rx + 3, ry - 2, 3, 3);
        }
      }
      // Центральна сервісна доріжка з решіткою
      ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
      ctx.fillRect(wx + 24, cy - 36, w - 48, 72);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
      ctx.strokeRect(wx + 24, cy - 36, w - 48, 72);
    } else if (mod.theme.gridPattern === "HEX") {
      for (const r of [95, 185, 275]) {
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

      // Центральне стикувальне кільце вузлового хабу
      ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
      ctx.beginPath();
      ctx.arc(cx, cy, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 62, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      for (let ry = wy + 80; ry < wy + h; ry += 95) {
        ctx.beginPath();
        ctx.moveTo(wx, ry);
        ctx.lineTo(wx + w, ry);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(15, 23, 42, 0.5)";
      ctx.fillRect(cx - 38, wy + 24, 76, h - 48);
    }

    // Внутрішній периметральний кабель-канал (дає ефект глибини стін)
    ctx.strokeStyle = "rgba(30, 41, 59, 0.9)";
    ctx.lineWidth = 22;
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const pt = poly[i]!;
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
    ctx.stroke();

    // Ілюмінатори з видом на орбіту Землі та хмари, що рухаються
    for (const port of mod.theme.portholes) {
      const px = wx + port.x;
      const py = wy + port.y;
      this.renderOrbitalPorthole(ctx, px, py, port.r, state.timeElapsedS);
    }

    // Лампи денного світла на стелі відсіку (м'які світлові плями)
    const lightBoost = Math.max(0.25, state.energyPct / 100);
    const lightGrad = ctx.createRadialGradient(cx, cy, 12, cx, cy, Math.min(w, h) * 0.45);
    lightGrad.addColorStop(0, `rgba(186, 230, 253, ${0.09 * lightBoost})`);
    lightGrad.addColorStop(1, "rgba(186, 230, 253, 0)");
    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Якщо в цьому модулі аварія — червоне/помаранчеве аварійне світло заливає відсік
    const alarmTerm = state.terminals.find(
      (t) =>
        t.moduleId === mod.id &&
        (t.state === "WARNING" || t.state === "CRITICAL"),
    );
    if (alarmTerm) {
      const pulse = 0.5 + 0.5 * Math.sin(state.timeElapsedS * 7);
      const isCrit = alarmTerm.state === "CRITICAL";
      ctx.fillStyle = isCrit
        ? `rgba(239, 68, 68, ${0.05 + pulse * 0.09})`
        : `rgba(245, 158, 11, ${0.04 + pulse * 0.06})`;
      ctx.fillRect(wx, wy, w, h);
    }

    // Перешкоди всередині модуля (PILLAR_CIRCLE та CARGO_BOX)
    for (const obs of mod.obstacles) {
      const ox = wx + obs.pos.x;
      const oy = wy + obs.pos.y;
      if (obs.kind === "PILLAR_CIRCLE") {
        const r = obs.radiusOrSize.w;

        // Тінь під колоною
        ctx.fillStyle = "rgba(2, 6, 16, 0.65)";
        ctx.beginPath();
        ctx.arc(ox + 5, oy + 6, r + 4, 0, Math.PI * 2);
        ctx.fill();

        // Опорний фланець
        ctx.fillStyle = "#0f172a";
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ox, oy, r + 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const pGrad = ctx.createRadialGradient(
          ox - r * 0.3,
          oy - r * 0.3,
          4,
          ox,
          oy,
          r,
        );
        pGrad.addColorStop(0, "#475569");
        pGrad.addColorStop(0.7, "#1e293b");
        pGrad.addColorStop(1, "#0f172a");

        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();

        // Обертовий ротор турбіни/вентилятора всередині колони
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(state.timeElapsedS * 1.8);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 2.5;
        for (let b = 0; b < 3; b++) {
          const a = (b * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * (r * 0.52), Math.sin(a) * (r * 0.52));
          ctx.stroke();
        }
        ctx.restore();

        // Кільце безпеки колони (пружний бампер)
        ctx.strokeStyle = "rgba(245, 158, 11, 0.75)";
        ctx.lineWidth = 3.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(ox, oy, r - 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (obs.kind === "CARGO_BOX") {
        const bw = obs.radiusOrSize.w;
        const bh = obs.radiusOrSize.h;
        const bx = ox - bw * 0.5;
        const by = oy - bh * 0.5;

        // Тінь контейнера
        ctx.fillStyle = "rgba(2, 6, 16, 0.65)";
        ctx.beginPath();
        ctx.roundRect(bx + 6, by + 7, bw, bh, 6);
        ctx.fill();

        // Основний корпус вантажного контейнера
        const boxGrad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        boxGrad.addColorStop(0, "#334155");
        boxGrad.addColorStop(1, "#1e293b");
        ctx.fillStyle = boxGrad;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 6);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + 6, by + 6, bw - 12, bh - 12);
        ctx.clip();
        ctx.strokeStyle = "rgba(245, 158, 11, 0.24)";
        ctx.lineWidth = 4;
        for (let d = -bh; d < bw + bh; d += 22) {
          ctx.beginPath();
          ctx.moveTo(bx + d, by);
          ctx.lineTo(bx + d - bh, by + bh);
          ctx.stroke();
        }
        ctx.restore();

        // Стяжні ремені та кутові відбійники
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 6);
        ctx.stroke();

        ctx.fillStyle = "#f59e0b";
        const corner = 8;
        ctx.fillRect(bx - 1, by - 1, corner, 4);
        ctx.fillRect(bx - 1, by - 1, 4, corner);
        ctx.fillRect(bx + bw - corner + 1, by - 1, corner, 4);
        ctx.fillRect(bx + bw - 3, by - 1, 4, corner);
        ctx.fillRect(bx - 1, by + bh - 3, corner, 4);
        ctx.fillRect(bx - 1, by + bh - corner + 1, 4, corner);
        ctx.fillRect(bx + bw - corner + 1, by + bh - 3, corner, 4);
        ctx.fillRect(bx + bw - 3, by + bh - corner + 1, 4, corner);

        ctx.fillStyle = "rgba(226, 232, 240, 0.6)";
        ctx.font = "700 9px monospace";
        ctx.textAlign = "center";
        ctx.fillText("CARGO", ox, oy + 3);
      }
    }

    // Технічне трафаретне маркування назви відсіку на обшивці
    ctx.fillStyle = "rgba(148, 163, 184, 0.26)";
    ctx.font = "700 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(mod.title, wx + w * 0.5, wy + 30);

    // Підсвітка порогів відкритих шлюзів (DoorTransitionZone) + напрямні шеврони
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
        const doorGrad = ctx.createRadialGradient(
          dx,
          dy,
          4,
          dx,
          dy,
          door.width * 0.52,
        );
        doorGrad.addColorStop(0, "rgba(61, 220, 132, 0.22)");
        doorGrad.addColorStop(1, "rgba(61, 220, 132, 0)");
        ctx.fillStyle = doorGrad;
        ctx.beginPath();
        ctx.arc(dx, dy, door.width * 0.52, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private renderOrbitalPorthole(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    r: number,
    timeElapsedS: number,
  ): void {
    ctx.save();

    // Зовнішня броньована рама ілюмінатора з болтами
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py, r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(
        px + Math.cos(a) * (r + 3),
        py + Math.sin(a) * (r + 3),
        1.6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Скло ілюмінатора
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.clip();

    const skyGrad = ctx.createLinearGradient(px, py - r, px, py + r);
    skyGrad.addColorStop(0, "#020617");
    skyGrad.addColorStop(0.55, "#082f49");
    skyGrad.addColorStop(1, "#0284c7");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);

    // Кривий горизонт Землі з хмарами в ілюмінаторі
    const cloudShift = (timeElapsedS * 6) % (r * 2);
    ctx.fillStyle = "#0369a1";
    ctx.beginPath();
    ctx.arc(px - r * 0.2, py + r * 1.25, r * 1.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(224, 242, 254, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      px - r * 0.2 + cloudShift * 0.15,
      py + r * 1.22,
      r * 1.12,
      -Math.PI * 0.75,
      -Math.PI * 0.25,
    );
    ctx.stroke();

    // Відблиск скла
    ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.82, -Math.PI * 0.78, -Math.PI * 0.28);
    ctx.stroke();

    ctx.restore();
  }

  private renderModuleWallsAndDoors(
    ctx: CanvasRenderingContext2D,
    mod: ModuleBlueprint,
    walls: readonly WallSegment[],
    timeElapsedS: number,
  ): void {
    ctx.save();
    for (const wall of walls) {
      if (wall.isDockingSeal !== null) {
        // Масивні стулки закритого гермошлюзу з гідрозамками
        ctx.strokeStyle = "#7c2d12";
        ctx.lineWidth = 18;
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.moveTo(wall.ax, wall.ay);
        ctx.lineTo(wall.bx, wall.by);
        ctx.stroke();

        ctx.strokeStyle = "#ea580c";
        ctx.lineWidth = 10;
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

        // Пульсуючий червоний індикатор замка по центру гермошлюзу
        const mx = (wall.ax + wall.bx) * 0.5;
        const my = (wall.ay + wall.by) * 0.5;
        const blink = 0.5 + 0.5 * Math.sin(timeElapsedS * 6);
        ctx.fillStyle = "#1e293b";
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = `rgba(239, 68, 68, ${0.45 + blink * 0.55})`;
        ctx.beginPath();
        ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // Багатошарова силова обшивка восьмикутника (2.5D ефект товстої переборки)
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 18;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(wall.ax, wall.ay);
      ctx.lineTo(wall.bx, wall.by);
      ctx.stroke();

      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(wall.ax, wall.ay);
      ctx.lineTo(wall.bx, wall.by);
      ctx.stroke();

      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wall.ax, wall.ay);
      ctx.lineTo(wall.bx, wall.by);
      ctx.stroke();
    }

    // Кутові силові вузли восьмикутника
    const poly = getModuleOctagonPolygon(mod);
    for (const pt of poly) {
      ctx.fillStyle = "#334155";
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 4. Відокремлений рендер ComputerBlueprint:
   * Деталізована стійка/консоль, вмонтована в стіну модуля, з живими осцилограмами та проблисковим маячком.
   */
  private renderComputerConsole(
    ctx: CanvasRenderingContext2D,
    term: TerminalNode,
    state: FlightState,
  ): void {
    const timeElapsedS = state.timeElapsedS;
    const linkedHandle = ALL_GRAB_HANDLES.find((h) => h.id === term.handleId);
    const preset = term.visualPreset;
    const cw = preset.chassisWidth;
    const ch = preset.chassisHeight;

    const pulse = 0.5 + 0.5 * Math.sin(timeElapsedS * 7.5);
    const isAlarm = term.state === "WARNING" || term.state === "CRITICAL";
    const isAnchoredAtThisConsole =
      state.astronaut.state === "ANCHORED" &&
      linkedHandle &&
      state.astronaut.anchoredHandleId === linkedHandle.id;

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
      ctx.strokeStyle = isAlarm
        ? "rgba(245, 158, 11, 0.55)"
        : isAnchoredAtThisConsole
          ? "rgba(56, 189, 248, 0.7)"
          : "rgba(56, 189, 248, 0.28)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(term.pos.x - 9, term.pos.y);
      ctx.lineTo(hx - 9, hy);
      ctx.moveTo(term.pos.x + 9, term.pos.y);
      ctx.lineTo(hx + 9, hy);
      ctx.stroke();
    }

    // М'яке світлове гало + обертовий промінь проблискового маячка під час тривоги
    if (isAlarm) {
      const haloR = cw * 1.3;
      const grad = ctx.createRadialGradient(
        term.pos.x,
        term.pos.y,
        8,
        term.pos.x,
        term.pos.y,
        haloR,
      );
      if (term.state === "CRITICAL") {
        grad.addColorStop(0, `rgba(239, 68, 68, ${0.32 + pulse * 0.28})`);
        grad.addColorStop(1, "rgba(239, 68, 68, 0)");
      } else {
        grad.addColorStop(0, `rgba(245, 158, 11, ${0.24 + pulse * 0.22})`);
        grad.addColorStop(1, "rgba(245, 158, 11, 0)");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(term.pos.x, term.pos.y, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Обертовий конус маячка тривоги
      const beaconAngle = timeElapsedS * (term.state === "CRITICAL" ? 7 : 4.5);
      ctx.save();
      ctx.translate(term.pos.x, term.pos.y);
      ctx.rotate(beaconAngle);
      ctx.fillStyle =
        term.state === "CRITICAL"
          ? "rgba(239, 68, 68, 0.16)"
          : "rgba(245, 158, 11, 0.13)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, haloR * 1.05, -0.35, 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, haloR * 1.05, Math.PI - 0.35, Math.PI + 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Корпус комп'ютерної стійки з урахуванням mountAngle
    ctx.save();
    ctx.translate(term.pos.x, term.pos.y);
    ctx.rotate((term.mountAngle * Math.PI) / 180);

    // Візуальні труби охолодження (hasCoolingPipes)
    if (preset.hasCoolingPipes) {
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-cw * 0.5 - 15, -ch * 0.25);
      ctx.lineTo(cw * 0.5 + 15, -ch * 0.25);
      ctx.moveTo(-cw * 0.5 - 15, ch * 0.15);
      ctx.lineTo(cw * 0.5 + 15, ch * 0.15);
      ctx.stroke();

      ctx.strokeStyle = "#7dd3fc";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -timeElapsedS * 24;
      ctx.beginPath();
      ctx.moveTo(-cw * 0.5 - 15, -ch * 0.25);
      ctx.lineTo(cw * 0.5 + 15, -ch * 0.25);
      ctx.stroke();
      ctx.setLineDash([]);
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
      ctx.arc(cw * 0.32, -ch * 0.5 - 24, 3.8, 0, Math.PI * 2);
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

    // Тінь під шафою консолі
    ctx.fillStyle = "rgba(2, 6, 16, 0.7)";
    ctx.beginPath();
    ctx.roundRect(-cw * 0.5 + 3, -ch * 0.5 + 4, cw, ch, 8);
    ctx.fill();

    // Металева шафа-корпус консолі
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = isAnchoredAtThisConsole ? "#38bdf8" : "#64748b";
    ctx.lineWidth = isAnchoredAtThisConsole ? 3 : 2.5;
    ctx.beginPath();
    ctx.roundRect(-cw * 0.5, -ch * 0.5, cw, ch, 7);
    ctx.fill();
    ctx.stroke();

    // Монітор консолі (блимає сам екран під час тривоги!)
    const mw = cw * 0.64;
    const mh = ch * 0.54;
    ctx.fillStyle = screenColor;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-cw * 0.43, -ch * 0.38, mw, mh, 4);
    ctx.fill();
    ctx.stroke();

    // Жива телеметрія на екрані монітора
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let sx = -cw * 0.38; sx <= cw * 0.15; sx += 5) {
      const sy =
        -ch * 0.12 +
        Math.sin(sx * 0.22 + timeElapsedS * 8) * (isAlarm ? 6.5 : 3.5);
      if (sx === -cw * 0.38) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
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

    // Клавіатурна дека з підсвіткою клавіш внизу стійки
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
    const by = term.pos.y - ch * 0.5 - 34;

    ctx.fillStyle = isAlarm
      ? term.state === "CRITICAL"
        ? "rgba(127, 29, 29, 0.94)"
        : "rgba(120, 53, 15, 0.94)"
      : "rgba(15, 23, 42, 0.88)";
    ctx.strokeStyle = isAlarm
      ? term.state === "CRITICAL"
        ? "#ef4444"
        : "#f59e0b"
      : isAnchoredAtThisConsole
        ? "#3ddc84"
        : "rgba(56, 189, 248, 0.45)";
    ctx.lineWidth = isAnchoredAtThisConsole ? 2 : 1.5;
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
   * (1px dashed rgba(56, 189, 248, 0.35)), коли космонавт поруч, або прицільна рамка [ЦІЛЬ ЗАХОПЛЕНО].
   */
  private renderGrabHandle(
    ctx: CanvasRenderingContext2D,
    handle: GrabHandle,
    state: FlightState,
    isTargetLocked: boolean,
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

    // Тонкий пунктирний технічний контур зони захвату (1px dashed rgba(56, 189, 248, 0.35)) тільки коли поруч або під прицілом
    if ((isNear || isTargetLocked) && !isAnchoredHere) {
      const dx = handle.bx - handle.ax;
      const dy = handle.by - handle.ay;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const r = handle.grabRadius;

      ctx.save();
      ctx.translate(handle.ax, handle.ay);
      ctx.rotate(angle);
      ctx.strokeStyle = isTargetLocked
        ? "rgba(61, 220, 132, 0.78)"
        : "rgba(56, 189, 248, 0.35)";
      ctx.lineWidth = isTargetLocked ? 1.8 : 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(len, 0, r, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Тінь під поручнем
    ctx.strokeStyle = "rgba(2, 6, 16, 0.7)";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(handle.ax + 2, handle.ay + 3);
    ctx.lineTo(handle.bx + 2, handle.by + 3);
    ctx.stroke();

    // Кронштейни кріплення поручня до стіни
    ctx.fillStyle = "#334155";
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(handle.ax, handle.ay, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(handle.bx, handle.by, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Основна перекладина поручня
    const railColor = isAnchoredHere
      ? "#38bdf8"
      : isTargetLocked
        ? "#3ddc84"
        : handle.colorTheme;
    ctx.strokeStyle = railColor;
    ctx.lineWidth = 6.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(handle.ax, handle.ay);
    ctx.lineTo(handle.bx, handle.by);
    ctx.stroke();

    // Тонкий металевий блік на трубі поручня
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1.6;
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

    const activeWalls = getActiveWalls(state.unlockedModuleIds, state.openedSeals);
    const activeHandles = getActiveHandles(state.unlockedModuleIds);
    const circleObs = getActiveCircleObstacles(state.unlockedModuleIds);

    const preview = computeBallisticTrajectoryWithBounces(
      astro.pos,
      lv,
      astro.radius,
      activeWalls,
      activeHandles,
      circleObs,
      astro.anchoredHandleId,
    );

    const points = preview.points;
    const powerRatio = Math.min(1, speed / 650);

    ctx.save();

    // Тонке технологічне кільце прицілу навколо космонавта
    ctx.strokeStyle = preview.targetHandleId
      ? "rgba(61, 220, 132, 0.65)"
      : "rgba(56, 189, 248, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(astro.pos.x, astro.pos.y, astro.radius + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Еластична стропа натягу позаду космонавта
    const pullDx =
      astro.slingshot.dragCurrentScreen.x - astro.slingshot.dragStartScreen.x;
    const pullDy =
      astro.slingshot.dragCurrentScreen.y - astro.slingshot.dragStartScreen.y;
    const pullLen = Math.min(180, Math.hypot(pullDx, pullDy));
    if (pullLen > 4) {
      const pullAngle = Math.atan2(pullDy, pullDx);
      const bandEndX = astro.pos.x + Math.cos(pullAngle) * pullLen * 0.65;
      const bandEndY = astro.pos.y + Math.sin(pullAngle) * pullLen * 0.65;

      ctx.strokeStyle =
        powerRatio > 0.72
          ? "rgba(251, 146, 60, 0.85)"
          : "rgba(56, 189, 248, 0.78)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(astro.pos.x, astro.pos.y);
      ctx.lineTo(bandEndX, bandEndY);
      ctx.stroke();

      ctx.fillStyle = powerRatio > 0.72 ? "#fb923c" : "#38bdf8";
      ctx.beginPath();
      ctx.arc(bandEndX, bandEndY, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Пунктирна лінія повної рикошетної траєкторії
    if (points.length > 0) {
      ctx.strokeStyle = preview.targetHandleId
        ? "rgba(61, 220, 132, 0.42)"
        : "rgba(56, 189, 248, 0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(astro.pos.x, astro.pos.y);
      for (const pt of points) {
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Точки балістичної траєкторії
    for (let i = 0; i < points.length; i++) {
      const pt = points[i]!;
      const alpha = 0.92 - (i / Math.max(1, points.length)) * 0.65;
      const radius = 4.2 - (i / Math.max(1, points.length)) * 1.8;
      ctx.fillStyle = preview.targetHandleId
        ? `rgba(61, 220, 132, ${alpha})`
        : powerRatio > 0.74
          ? `rgba(255, 162, 61, ${alpha})`
          : `rgba(92, 200, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(1.8, radius), 0, Math.PI * 2);
      ctx.fill();
    }

    // Маркери точок рикошету від стін восьмикутника та колон
    for (const bp of preview.bouncePoints) {
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Прицільна мітка [ЦІЛЬ ЗАХОПЛЕНО] на поручні призначення
    if (preview.targetPoint && preview.targetHandleId) {
      const tp = preview.targetPoint;
      const targetColor = preview.requiresActiveGrab ? "#f59e0b" : "#3ddc84";
      ctx.strokeStyle = targetColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 16, 0, Math.PI * 2);
      ctx.stroke();

      // Кутові дужки прицілу
      const b = 12;
      ctx.beginPath();
      ctx.moveTo(tp.x - b, tp.y - 4);
      ctx.lineTo(tp.x - b, tp.y - b);
      ctx.lineTo(tp.x - 4, tp.y - b);
      ctx.moveTo(tp.x + 4, tp.y - b);
      ctx.lineTo(tp.x + b, tp.y - b);
      ctx.lineTo(tp.x + b, tp.y - 4);
      ctx.moveTo(tp.x - b, tp.y + 4);
      ctx.lineTo(tp.x - b, tp.y + b);
      ctx.lineTo(tp.x - 4, tp.y + b);
      ctx.moveTo(tp.x + 4, tp.y + b);
      ctx.lineTo(tp.x + b, tp.y + b);
      ctx.lineTo(tp.x + b, tp.y + 4);
      ctx.stroke();

      ctx.fillStyle = targetColor;
      ctx.font = "700 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        preview.requiresActiveGrab
          ? "⚡ ЗАТИСНИ [SPACE] ПРИ ПІДЛЬОТІ"
          : "✓ АВТОЗАХВАТ ПОРУЧНЯ",
        tp.x,
        tp.y - 22,
      );
    }

    // Стрілка напрямку стартового імпульсу
    if (points.length > 0) {
      const endPt = points[Math.min(3, points.length - 1)]!;
      const angle = Math.atan2(lv.vy, lv.vx);
      ctx.fillStyle = preview.targetHandleId ? "#3ddc84" : "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(endPt.x, endPt.y);
      ctx.lineTo(
        endPt.x - Math.cos(angle - 0.45) * 12,
        endPt.y - Math.sin(angle - 0.45) * 12,
      );
      ctx.lineTo(
        endPt.x - Math.cos(angle + 0.45) * 12,
        endPt.y - Math.sin(angle + 0.45) * 12,
      );
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#e8f3ff";
    ctx.font = "700 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `${Math.round(speed)} px/s (${Math.round(powerRatio * 100)}%)`,
      astro.pos.x,
      astro.pos.y + 40,
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

    // Тонке технологічне кільце при активному захваті в польоті
    if (astro.state === "FLYING" && astro.activeGrabHeld) {
      ctx.strokeStyle = "rgba(61, 220, 132, 0.78)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, astro.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Розрахунок пружинного підгинання ніг при натягуванні рогатки
    const pullSpeed = Math.hypot(
      astro.slingshot.launchVector.vx,
      astro.slingshot.launchVector.vy,
    );
    const crouchRatio =
      astro.state === "ANCHORED" && astro.slingshot.isDragging
        ? Math.min(1, pullSpeed / 650)
        : 0;
    const idleFloat =
      astro.state === "ANCHORED" && !astro.slingshot.isDragging
        ? Math.sin(state.timeElapsedS * 3.2) * 1.8
        : 0;

    ctx.save();
    ctx.rotate(astro.angle);
    ctx.translate(idleFloat - crouchRatio * 5, 0);

    // Тінь під космонавтом
    ctx.fillStyle = "rgba(2, 6, 16, 0.45)";
    ctx.beginPath();
    ctx.ellipse(0, 4, 18, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ранець життєзабезпечення PLSS із соплами мікро-двигунів
    ctx.fillStyle = "#cbd5e1";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-19, -12, 13, 24, 3);
    ctx.fill();
    ctx.stroke();

    // Індикатор заряду PLSS на ранці
    ctx.fillStyle =
      astro.state === "STUNNED"
        ? "#ff4766"
        : astro.state === "ANCHORED"
          ? "#3ddc84"
          : "#38bdf8";
    ctx.beginPath();
    ctx.arc(-14, -5, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Ноги (згинаються в колінах, коли гравець натягує рогатку!)
    const legExtend = 19 - crouchRatio * 7;
    const kneeSpread = 8 + crouchRatio * 5;
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 5.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(-12, -kneeSpread);
    ctx.lineTo(-legExtend, -10);
    ctx.moveTo(-6, 5);
    ctx.lineTo(-12, kneeSpread);
    ctx.lineTo(-legExtend, 10);
    ctx.stroke();

    // Черевики скафандра
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.arc(-legExtend - 1, -10, 3.2, 0, Math.PI * 2);
    ctx.arc(-legExtend - 1, 10, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Торс скафандра з нагрудним модулем керування
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-8, -11, 18, 22, 6);
    ctx.fill();
    ctx.stroke();

    // Сині/червоні нашивки NASA/ISS на плечах
    ctx.fillStyle = "#0284c7";
    ctx.fillRect(-2, -10, 6, 3);
    ctx.fillStyle = "#e11d48";
    ctx.fillRect(-2, 7, 6, 3);

    // Руки (тягнуться вперед при польоті або тримають поручень)
    const armReach = astro.activeGrabHeld ? 22 : 19 - crouchRatio * 3;
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, -9);
    ctx.lineTo(12, -10);
    ctx.lineTo(armReach, -6);
    ctx.moveTo(4, 9);
    ctx.lineTo(12, 10);
    ctx.lineTo(armReach, 6);
    ctx.stroke();

    // Рукавички
    ctx.fillStyle = astro.activeGrabHeld ? "#3ddc84" : "#e63946";
    ctx.beginPath();
    ctx.arc(armReach + 1, -6, 3.3, 0, Math.PI * 2);
    ctx.arc(armReach + 1, 6, 3.3, 0, Math.PI * 2);
    ctx.fill();

    // Шолом і дзеркальний золотисто-блакитний візор
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(3, 0, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = astro.state === "STUNNED" ? "#fb7185" : "#0284c7";
    ctx.beginPath();
    ctx.ellipse(6.5, 0, 5.4, 7.0, 0, -Math.PI * 0.58, Math.PI * 0.58);
    ctx.fill();

    // Відблиск на візорі шолома
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(5.5, -2, 3.8, -Math.PI * 0.4, Math.PI * 0.15);
    ctx.stroke();

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
      ctx.fillText("ЗАПАМОРОЧЕННЯ!", 0, -34);
    }

    // Дієгетична кнопка взаємодії [E / КЛІК], коли тримається за ручку біля комп'ютера
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
          ? "rgba(234, 88, 12, 0.95)"
          : "rgba(3, 105, 161, 0.94)";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-94, -50, 188, 24, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "700 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`[E / КЛІК] ПУЛЬТ: ${handle.terminalId}`, 0, -34);
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
