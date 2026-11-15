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
import { flightAssetCache } from "./TemplateAssetCache";

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
  OXYGEN: "🫧 КИСЕНЬ O₂",
  THERMAL: "🌡 ТЕРМОКОНТУР",
};

export function getTerminalBadgeAnchor(term: TerminalNode): {
  cx: number;
  cy: number;
  maxWidth: number;
} {
  const cw = term.visualPreset.chassisWidth;
  const ch = term.visualPreset.chassisHeight;

  if (term.id === "DOCKING_1") {
    // Нижче шасі DOCKING_1 по центру проходу, без перекриття екрану й H_HUB_NORTH
    return {
      cx: term.pos.x,
      cy: term.pos.y + ch * 0.5 + 20,
      maxWidth: 160,
    };
  }
  if (term.id === "SOLAR") {
    // Під поручнем H_SOLAR_TERM з чистим відступом від консолі, космонавта й перешкод
    return {
      cx: term.pos.x,
      cy: term.pos.y + ch * 0.5 + 60,
      maxWidth: 164,
    };
  }
  if (term.id === "DOCKING_2") {
    // Над вертикальною консоллю без накладання на поручень H_HUB_EAST і центральний ілюмінатор
    return {
      cx: term.pos.x,
      cy: term.pos.y - cw * 0.5 - 22,
      maxWidth: 152,
    };
  }
  if (term.id === "OXYGEN") {
    // Над консоллю життєзабезпечення зсунуто вліво від H_OXYGEN_TERM та ілюмінатора
    return {
      cx: term.pos.x - 20,
      cy: term.pos.y - cw * 0.5 - 22,
      maxWidth: 152,
    };
  }
  if (term.id === "THERMAL") {
    // Під термоконсоллю у вільному нижньому куті відсіку
    return {
      cx: term.pos.x - 10,
      cy: term.pos.y + cw * 0.5 + 24,
      maxWidth: 152,
    };
  }
  if (term.id === "DOCKING_3") {
    return {
      cx: term.pos.x - 40,
      cy: term.pos.y - 68,
      maxWidth: 152,
    };
  }
  return {
    cx: term.pos.x,
    cy: term.pos.y - ch * 0.5 - 22,
    maxWidth: 152,
  };
}

function getModuleWatermarkPos(mod: ModuleBlueprint): { x: number; y: number } {
  const cx = mod.worldPos.x + mod.size.width * 0.5;
  const wy = mod.worldPos.y;
  switch (mod.id) {
    case "MOD_HABITAT":
      return { x: cx, y: wy + 148 };
    case "MOD_INTERSECTION":
      return { x: cx, y: wy + 228 };
    case "MOD_VERTICAL_LAB":
      return { x: cx, y: wy + 496 };
    case "MOD_THERMAL_BAY":
      return { x: cx, y: wy + 422 };
    case "MOD_COMMAND":
      return { x: cx, y: wy + 398 };
    default:
      return { x: cx, y: wy + mod.size.height * 0.5 };
  }
}

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

    // 1–2. Єдиний космічний фон із паралаксом зірок та єдиною планетою Земля
    this.renderCosmicSpaceLayer(ctx, state, camera, viewportW, viewportH);

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

      this.renderModuleOctagonHull(
        ctx,
        mod,
        state,
        camera,
        viewportW,
        viewportH,
      );

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

  private renderCosmicSpaceLayer(
    ctx: CanvasRenderingContext2D,
    state: FlightState,
    camera: Camera2D,
    viewportW: number,
    viewportH: number,
  ): void {
    ctx.save();

    // 1. Фон глибокого космосу
    const spaceGrad = ctx.createLinearGradient(0, 0, 0, viewportH);
    spaceGrad.addColorStop(0, "#02040a");
    spaceGrad.addColorStop(0.65, "#050a17");
    spaceGrad.addColorStop(1, "#091933");
    ctx.fillStyle = spaceGrad;
    ctx.fillRect(0, 0, viewportW, viewportH);

    // 2. Багатошарове зоряне небо на паралаксі
    const baseAlpha = ctx.globalAlpha;
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
      ctx.globalAlpha = baseAlpha * star.alpha * twinkle;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = baseAlpha;

    // 3. Єдина планета Земля у фоновому космічному шарі з паралаксом
    const earthR = Math.max(200, Math.min(viewportW, viewportH) * 0.4);
    const earthCx = viewportW * 0.44 - (camera.x - 460) * 0.1;
    const earthCy = viewportH * 0.7 - (camera.y - 240) * 0.1;

    // Зовнішнє атмосферне сяйво лімба Землі
    const atmoGrad = ctx.createRadialGradient(
      earthCx,
      earthCy,
      earthR * 0.88,
      earthCx,
      earthCy,
      earthR * 1.24,
    );
    atmoGrad.addColorStop(0, "rgba(56, 189, 248, 0.34)");
    atmoGrad.addColorStop(0.55, "rgba(14, 116, 144, 0.12)");
    atmoGrad.addColorStop(1, "rgba(2, 4, 10, 0)");
    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthR * 1.24, 0, Math.PI * 2);
    ctx.fill();

    // Диск єдиної Землі
    ctx.save();
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthR, 0, Math.PI * 2);
    ctx.clip();

    const oceanGrad = ctx.createRadialGradient(
      earthCx - earthR * 0.28,
      earthCy - earthR * 0.32,
      earthR * 0.12,
      earthCx,
      earthCy,
      earthR,
    );
    oceanGrad.addColorStop(0, "#0284c7");
    oceanGrad.addColorStop(0.68, "#0369a1");
    oceanGrad.addColorStop(1, "#082f49");
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(
      earthCx - earthR,
      earthCy - earthR,
      earthR * 2,
      earthR * 2,
    );

    const earthImg = flightAssetCache.getImage("assets/bodies/earth-globe.svg");
    if (earthImg) {
      ctx.save();
      ctx.globalAlpha = 0.94;
      const globeSize = earthR * 2.14;
      ctx.drawImage(
        earthImg,
        earthCx - globeSize * 0.5,
        earthCy - globeSize * 0.5,
        globeSize,
        globeSize,
      );
      ctx.restore();
    }

    // М'які орбітальні хмари
    const cloudDrift = (state.timeElapsedS * 6) % (earthR * 1.6);
    ctx.fillStyle = "rgba(241, 245, 249, 0.26)";
    ctx.beginPath();
    ctx.ellipse(
      earthCx - earthR * 0.25 + cloudDrift * 0.25,
      earthCy - earthR * 0.22,
      earthR * 0.46,
      earthR * 0.11,
      -0.14,
      0,
      Math.PI * 2,
    );
    ctx.ellipse(
      earthCx + earthR * 0.22 - cloudDrift * 0.2,
      earthCy + earthR * 0.14,
      earthR * 0.38,
      earthR * 0.09,
      0.1,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Нічний термінатор знизу-праворуч для об'єму планети
    const termGrad = ctx.createLinearGradient(
      earthCx - earthR * 0.55,
      earthCy - earthR * 0.55,
      earthCx + earthR * 0.85,
      earthCy + earthR * 0.85,
    );
    termGrad.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    termGrad.addColorStop(0.55, "rgba(2, 6, 23, 0)");
    termGrad.addColorStop(1, "rgba(2, 6, 23, 0.72)");
    ctx.fillStyle = termGrad;
    ctx.fillRect(
      earthCx - earthR,
      earthCy - earthR,
      earthR * 2,
      earthR * 2,
    );
    ctx.restore();

    // Тонкий блакитний обідок атмосфери
    ctx.strokeStyle = "rgba(125, 211, 252, 0.52)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private renderModuleOctagonHull(
    ctx: CanvasRenderingContext2D,
    mod: ModuleBlueprint,
    state: FlightState,
    camera: Camera2D,
    viewportW: number,
    viewportH: number,
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

    const deckSpritePath =
      mod.orientation === "VERTICAL"
        ? "assets/templates/flight/mod-vertical.svg"
        : mod.orientation === "INTERSECTION"
          ? "assets/templates/flight/mod-hub.svg"
          : "assets/templates/flight/mod-horizontal.svg";
    const deckImg = flightAssetCache.getImage(deckSpritePath);
    if (deckImg) {
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.drawImage(deckImg, wx, wy, w, h);
      ctx.restore();
    } else {
      // Внутрішні 2.5D панелі обшивки (фолбек поки вантажиться SVG)
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

    // Ілюмінатори як чисті маски (ctx.clip()) у єдиний космічний фон із зірками та паралаксом Землі
    for (const port of mod.theme.portholes) {
      const px = wx + port.x;
      const py = wy + port.y;
      this.renderOrbitalPorthole(
        ctx,
        px,
        py,
        port.r,
        state,
        camera,
        viewportW,
        viewportH,
      );
    }

    // Фоновий водяний знак модуля у чистій центральній зоні підлоги (alpha: 0.16, без накладання на ручки)
    const wmPos = getModuleWatermarkPos(mod);
    const cleanWatermarkTitle = mod.title.replace(/\s*\([^)]*\)\s*$/, "");
    ctx.fillStyle = "rgba(148, 163, 184, 0.16)";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(cleanWatermarkTitle, wmPos.x, wmPos.y, Math.max(180, w - 130));

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

        const genImg = flightAssetCache.getImage(
          "assets/templates/flight/obstacle-pillar.svg",
        );
        if (genImg) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(ox, oy, r - 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(genImg, ox - r, oy - r, r * 2, r * 2);
          ctx.restore();
        }

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
        boxGrad.addColorStop(0, "#1e3a8a");
        boxGrad.addColorStop(1, "#1e293b");
        ctx.fillStyle = boxGrad;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 6);
        ctx.fill();

        const cargoImg = flightAssetCache.getImage(
          "assets/templates/flight/obstacle-cargo.svg",
        );
        if (cargoImg) {
          ctx.drawImage(cargoImg, bx, by, bw, bh);
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + 6, by + 6, bw - 12, bh - 12);
        ctx.clip();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.32)";
        ctx.lineWidth = 3.5;
        for (let d = -bh; d < bw + bh; d += 18) {
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

        ctx.fillStyle = "#ef4444";
        const corner = 8;
        ctx.fillRect(bx - 1, by - 1, corner, 4);
        ctx.fillRect(bx - 1, by - 1, 4, corner);
        ctx.fillRect(bx + bw - corner + 1, by - 1, corner, 4);
        ctx.fillRect(bx + bw - 3, by - 1, 4, corner);
        ctx.fillRect(bx - 1, by + bh - 3, corner, 4);
        ctx.fillRect(bx - 1, by + bh - corner + 1, 4, corner);
        ctx.fillRect(bx + bw - corner + 1, by + bh - 3, corner, 4);
        ctx.fillRect(bx + bw - 3, by + bh - corner + 1, 4, corner);

        ctx.fillStyle = "rgba(226, 232, 240, 0.78)";
        ctx.font = "700 9px monospace";
        ctx.textAlign = "center";
        ctx.fillText("CARGO", ox, oy + 3);
      }
    }

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
    state: FlightState,
    camera: Camera2D,
    viewportW: number,
    viewportH: number,
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

    // Кругла маска вікна у єдиний космічний фон із зірками та паралаксом Землі
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(1 / camera.zoom, 1 / camera.zoom);
    ctx.translate(
      -(viewportW * 0.5 + camera.shakeOffsetX),
      -(viewportH * 0.5 + camera.shakeOffsetY),
    );
    this.renderCosmicSpaceLayer(ctx, state, camera, viewportW, viewportH);
    ctx.restore();

    // Внутрішня фаска та відблиск бронескла
    ctx.strokeStyle = "rgba(15, 23, 42, 0.72)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py, r - 1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 2.2;
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
        const mx = (wall.ax + wall.bx) * 0.5;
        const my = (wall.ay + wall.by) * 0.5;
        const segLen = Math.hypot(wall.bx - wall.ax, wall.by - wall.ay);
        const segAngle = Math.atan2(wall.by - wall.ay, wall.bx - wall.ax);
        const sealImg = flightAssetCache.getImage(
          "assets/templates/flight/door-seal.svg",
        );

        if (sealImg) {
          ctx.save();
          ctx.translate(mx, my);
          ctx.rotate(segAngle);
          ctx.drawImage(sealImg, -(segLen + 8) * 0.5, -16, segLen + 8, 32);
          ctx.restore();
        } else {
          // Масивні стулки закритого гермошлюзу з гідрозамками (фолбек)
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
        }

        // Пульсуючий червоний індикатор замка по центру гермошлюзу
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

    // Компактне світлове гало + стриманий промінь маячка під час тривоги без перекриття сусідніх об'єктів
    if (isAlarm) {
      const haloR = cw * 0.85;
      const grad = ctx.createRadialGradient(
        term.pos.x,
        term.pos.y,
        8,
        term.pos.x,
        term.pos.y,
        haloR,
      );
      if (term.state === "CRITICAL") {
        grad.addColorStop(0, `rgba(239, 68, 68, ${0.22 + pulse * 0.18})`);
        grad.addColorStop(1, "rgba(239, 68, 68, 0)");
      } else {
        grad.addColorStop(0, `rgba(245, 158, 11, ${0.17 + pulse * 0.14})`);
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
          ? "rgba(239, 68, 68, 0.1)"
          : "rgba(245, 158, 11, 0.08)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, haloR * 1.02, -0.32, 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, haloR * 1.02, Math.PI - 0.32, Math.PI + 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Корпус комп'ютерної стійки з урахуванням mountAngle + акуратна пристінна рамка
    ctx.save();
    ctx.translate(term.pos.x, term.pos.y);
    ctx.rotate((term.mountAngle * Math.PI) / 180);

    // Компактна пристінна монтажна рамка без виступів за контур консолі
    ctx.fillStyle = "rgba(7, 12, 24, 0.88)";
    ctx.strokeStyle = isAnchoredAtThisConsole ? "#38bdf8" : "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-cw * 0.54, -ch * 0.54, cw * 1.08, ch * 1.08, 9);
    ctx.fill();
    ctx.stroke();

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

    // Обрізаємо внутрішні прилади та радар строго по внутрішніх межах шасі консолі
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-cw * 0.5 + 2, -ch * 0.5 + 2, cw - 4, ch - 4, 5);
    ctx.clip();

    // 2D SVG темплейт термінала в корпусі
    const compSprite = flightAssetCache.getImage(
      "assets/templates/flight/console-terminal.svg",
    );
    if (compSprite) {
      ctx.save();
      ctx.globalAlpha = 0.78;
      ctx.drawImage(compSprite, -cw * 0.48, -ch * 0.48, cw * 0.96, ch * 0.96);
      ctx.restore();
    }

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

    // Підключення реального VisualTemplate з templateRegistry (src/ui/graphics/registry.ts)
    const assembly = flightAssetCache.getAssemblyForState(state);
    const linkedTemplate =
      term.id === "SOLAR"
        ? assembly.attachedModules.solar.template
        : term.id === "OXYGEN"
          ? assembly.attachedModules.battery.template
          : term.id === "THERMAL"
            ? assembly.attachedModules.instrument.template
            : assembly.attachedModules.engine.template;

    if (linkedTemplate) {
      const unitImg = linkedTemplate.sprite2d?.url
        ? flightAssetCache.getImage(linkedTemplate.sprite2d.url)
        : null;
      ctx.save();
      ctx.translate(-cw * 0.27, -ch * 0.11);
      ctx.rotate((-term.mountAngle * Math.PI) / 180);
      if (unitImg) {
        const iconSize = mh * 0.64;
        ctx.drawImage(
          unitImg,
          -iconSize * 0.5,
          -iconSize * 0.5,
          iconSize,
          iconSize,
        );
      } else {
        flightAssetCache.drawBlueprintShapeOnCanvas(
          ctx,
          linkedTemplate.blueprint,
          0,
          0,
          mh * 0.58,
          isAlarm,
        );
      }
      ctx.restore();
    }

    // Жива телеметрія на екрані монітора
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let sx = -cw * 0.12; sx <= cw * 0.18; sx += 4) {
      const sy =
        -ch * 0.12 +
        Math.sin(sx * 0.25 + timeElapsedS * 8) * (isAlarm ? 6.5 : 3.5);
      if (sx === -cw * 0.12) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // Приладовий відсік праворуч: радар стикування строго всередині шасі + світлодіоди стану
    const leds = [
      isAlarm ? "#ef4444" : "#10b981",
      term.state === "WARNING" ? "#f59e0b" : "#38bdf8",
      "#94a3b8",
    ];
    if (preset.hasRadarDish) {
      const rcx = cw * 0.34;
      const rcy = -ch * 0.17;
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(rcx - 10, rcy - 10, 20, 20, 4);
      ctx.fill();
      ctx.stroke();

      const dishImg = flightAssetCache.getImage(
        "assets/icons/station/radar-dish.svg",
      );
      ctx.save();
      ctx.translate(rcx, rcy);
      ctx.rotate(-(term.mountAngle * Math.PI) / 180);
      if (dishImg) {
        ctx.drawImage(dishImg, -8, -8, 16, 16);
      } else {
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 2, 6, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      ctx.restore();

      for (let i = 0; i < leds.length; i++) {
        ctx.fillStyle = leds[i]!;
        ctx.beginPath();
        ctx.arc(cw * 0.27 + i * 7, ch * 0.09, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (let i = 0; i < leds.length; i++) {
        ctx.fillStyle = leds[i]!;
        ctx.beginPath();
        ctx.arc(cw * 0.32, -ch * 0.26 + i * 10, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Клавіатурна дека внизу стійки
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(-cw * 0.42, ch * 0.22, cw * 0.84, ch * 0.18, 3);
    ctx.fill();

    // Код підсистеми (SOL-M, ENG-CHEM тощо) для горизонтальних стійок з компенсацією повороту 180°
    const mountRad = (term.mountAngle * Math.PI) / 180;
    const isHorizontalMount = Math.abs(Math.sin(mountRad)) < 0.2;
    if (linkedTemplate && isHorizontalMount) {
      ctx.save();
      ctx.translate(0, ch * 0.31);
      ctx.rotate(-mountRad);
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "700 7.5px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(linkedTemplate.blueprint.label, 0, 0.5);
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();

    // Для вертикальних і кутових консолей — горизонтальний шильдик підсистеми акуратно на верхній кромці шасі
    if (linkedTemplate && !isHorizontalMount) {
      const worldHalfH =
        Math.abs(Math.cos(mountRad)) * ch * 0.5 +
        Math.abs(Math.sin(mountRad)) * cw * 0.5;
      const tagW = 44;
      const tagH = 11;
      const tagX = term.pos.x - tagW * 0.5;
      const tagY = term.pos.y - worldHalfH + 3;
      ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
      ctx.strokeStyle = "rgba(125, 211, 252, 0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagW, tagH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#7dd3fc";
      ctx.font = "700 7.5px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        linkedTemplate.blueprint.label,
        term.pos.x,
        tagY + tagH * 0.5 + 0.5,
        tagW - 4,
      );
      ctx.textBaseline = "alphabetic";
    }

    // Єдиний компактний голографічний бейдж (макс. висота 24px, без накладання на ручку/екран)
    const labelTitle = TERMINAL_BADGE_LABELS[term.id] ?? term.id;
    const baseText = isAlarm
      ? `${labelTitle} · ${Math.ceil(term.urgencyTimer)}с`
      : term.state === "COMPLETED"
        ? `✓ ${labelTitle}`
        : labelTitle;
    const badgeText = isAnchoredAtThisConsole
      ? `[E/КЛІК] · ${baseText}`
      : baseText;

    const anchor = getTerminalBadgeAnchor(term);
    ctx.font = "700 9.5px monospace";
    const textW = ctx.measureText(badgeText).width;
    const bw = Math.min(anchor.maxWidth, Math.max(76, textW + 14));
    const bh = 24;
    const bx = anchor.cx - bw * 0.5;
    const by = anchor.cy - bh * 0.5;

    ctx.fillStyle = isAlarm
      ? term.state === "CRITICAL"
        ? isAnchoredAtThisConsole
          ? "rgba(185, 28, 28, 0.96)"
          : "rgba(127, 29, 29, 0.94)"
        : isAnchoredAtThisConsole
          ? "rgba(217, 72, 15, 0.96)"
          : "rgba(120, 53, 15, 0.94)"
      : isAnchoredAtThisConsole
        ? "rgba(3, 105, 161, 0.95)"
        : "rgba(15, 23, 42, 0.88)";
    ctx.strokeStyle = isAnchoredAtThisConsole
      ? term.state === "COMPLETED"
        ? "#3ddc84"
        : "#ffffff"
      : isAlarm
        ? term.state === "CRITICAL"
          ? "#ef4444"
          : "#f59e0b"
        : "rgba(56, 189, 248, 0.45)";
    ctx.lineWidth = isAnchoredAtThisConsole ? 1.8 : 1.3;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isAlarm || isAnchoredAtThisConsole ? "#ffffff" : "#bae6fd";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, anchor.cx, by + bh * 0.5 + 0.5, bw - 10);
    ctx.textBaseline = "alphabetic";

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

    const railImg = flightAssetCache.getImage(
      "assets/templates/flight/handle-rail.svg",
    );
    const railColor = isAnchoredHere
      ? "#38bdf8"
      : isTargetLocked
        ? "#3ddc84"
        : handle.colorTheme;

    if (railImg) {
      const hdx = handle.bx - handle.ax;
      const hdy = handle.by - handle.ay;
      const hlen = Math.hypot(hdx, hdy);
      const hang = Math.atan2(hdy, hdx);
      const hmx = (handle.ax + handle.bx) * 0.5;
      const hmy = (handle.ay + handle.by) * 0.5;

      // Підкладка кольору поручня: базовий колір теми видно і з картинкою, підсвітка робить її ширшою.
      {
        const highlighted = isAnchoredHere || isTargetLocked;
        ctx.strokeStyle = railColor;
        ctx.lineWidth = highlighted ? 11 : 7;
        ctx.lineCap = "round";
        ctx.globalAlpha = highlighted ? 0.35 : 0.3;
        ctx.beginPath();
        ctx.moveTo(handle.ax, handle.ay);
        ctx.lineTo(handle.bx, handle.by);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.save();
      ctx.translate(hmx, hmy);
      ctx.rotate(hang);
      ctx.drawImage(railImg, -(hlen + 12) * 0.5, -10, hlen + 12, 20);
      ctx.restore();
    } else {
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
    }

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

    const anchoredHandle =
      astro.state === "ANCHORED" && astro.anchoredHandleId
        ? (ALL_GRAB_HANDLES.find((h) => h.id === astro.anchoredHandleId) ?? null)
        : null;
    const isFrontView = astro.state === "FLYING" || astro.state === "STUNNED";

    ctx.save();

    if (isFrontView) {
      // Вид спереду (Front View) у вільному польоті та при запамороченні, з нахилом від вектора (vx, vy)
      const vxRatio = Math.max(-1, Math.min(1, astro.vel.vx / 380));
      const vyRatio = Math.max(-1, Math.min(1, astro.vel.vy / 480));
      const stunnedWobble =
        astro.state === "STUNNED" ? Math.sin(state.timeElapsedS * 11) * 0.16 : 0;
      const bodyTilt =
        vxRatio * 0.24 +
        vyRatio * (astro.vel.vx >= 0 ? 0.05 : -0.05) +
        stunnedWobble;
      ctx.rotate(bodyTilt);

      // Тінь під космонавтом
      ctx.fillStyle = "rgba(2, 6, 16, 0.42)";
      ctx.beginPath();
      ctx.ellipse(0, 6, 16, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      const frontImg = flightAssetCache.getImage("assets/astronaut/front.svg");
      if (frontImg) {
        ctx.drawImage(frontImg, -28, -28, 56, 56);
      } else {
        // Фолбек виду спереду у невагомості (руки та ноги трохи розведені, візор до гравця)
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-6, 8);
        ctx.lineTo(-12, 20);
        ctx.moveTo(6, 8);
        ctx.lineTo(12, 20);
        ctx.moveTo(-9, -4);
        ctx.lineTo(-20, -10);
        ctx.moveTo(9, -4);
        ctx.lineTo(20, -10);
        ctx.stroke();

        ctx.fillStyle = "#f4f0ef";
        ctx.strokeStyle = "#121e37";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-10, -7, 20, 18, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#fc8219";
        ctx.fillRect(-7, -3, 14, 7);

        ctx.fillStyle = "#f4f0ef";
        ctx.beginPath();
        ctx.arc(0, -13, 10.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = astro.state === "STUNNED" ? "#fb7185" : "#aad8f0";
        ctx.beginPath();
        ctx.ellipse(0, -13, 7.2, 5.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // Вид збоку (Side View) у стані ANCHORED: корпус завжди вертикальний, віддзеркалення в бік націлювання/відсіку
      const anchoredMod = anchoredHandle
        ? STATION_LEVEL_CONFIG.find((m) => m.id === anchoredHandle.moduleId)
        : undefined;
      let flipX = Math.cos(astro.angle) < 0 ? -1 : 1;
      let anchorOffsetY = 0;
      let anchorTilt = 0;

      if (anchoredHandle && anchoredMod) {
        const hdx = anchoredHandle.bx - anchoredHandle.ax;
        const hdy = anchoredHandle.by - anchoredHandle.ay;
        const midX = (anchoredHandle.ax + anchoredHandle.bx) * 0.5;
        const midY = (anchoredHandle.ay + anchoredHandle.by) * 0.5;
        const modCx = anchoredMod.worldPos.x + anchoredMod.size.width * 0.5;
        const modCy = anchoredMod.worldPos.y + anchoredMod.size.height * 0.5;
        const isHorizontal = Math.abs(hdx) > Math.abs(hdy) * 1.4;
        const isVertical = Math.abs(hdy) > Math.abs(hdx) * 1.4;

        if (isHorizontal) {
          if (midY < modCy - anchoredMod.size.height * 0.18) {
            anchorOffsetY = 7;
          } else if (midY > modCy + anchoredMod.size.height * 0.18) {
            anchorOffsetY = -5;
          }
          if (!astro.slingshot.isDragging && Math.abs(Math.cos(astro.angle)) <= 0.15) {
            flipX = midX <= modCx ? 1 : -1;
          }
        } else if (isVertical) {
          if (!astro.slingshot.isDragging && Math.abs(Math.cos(astro.angle)) <= 0.25) {
            flipX = midX <= modCx ? 1 : -1;
          }
        } else {
          anchorOffsetY = midY < modCy ? 6 : -5;
          if (!astro.slingshot.isDragging) {
            flipX = midX <= modCx ? 1 : -1;
          }
          anchorTilt = (midX <= modCx ? -1 : 1) * 0.14;
        }
      }

      if (astro.slingshot.isDragging) {
        anchorTilt += crouchRatio * 0.14 * flipX;
      }

      ctx.rotate(anchorTilt);
      ctx.translate((idleFloat - crouchRatio * 5) * flipX, anchorOffsetY);

      // Тінь під космонавтом
      ctx.fillStyle = "rgba(2, 6, 16, 0.45)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 18, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      const sideSpritePath = astro.slingshot.isDragging
        ? "assets/templates/flight/astro-pull.svg"
        : "assets/templates/flight/astro-idle.svg";
      const astroImg = flightAssetCache.getImage(sideSpritePath);

      ctx.save();
      ctx.scale(flipX, 1);

      if (astroImg) {
        ctx.drawImage(astroImg, -27, -27, 54, 54);
      } else {
        // Ранець життєзабезпечення PLSS (вид збоку)
        ctx.fillStyle = "#cbd5e1";
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-19, -12, 13, 24, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#3ddc84";
        ctx.beginPath();
        ctx.arc(-14, -5, 2.6, 0, Math.PI * 2);
        ctx.fill();

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

        ctx.fillStyle = "#475569";
        ctx.beginPath();
        ctx.arc(-legExtend - 1, -10, 3.2, 0, Math.PI * 2);
        ctx.arc(-legExtend - 1, 10, 3.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f8fafc";
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-8, -11, 18, 22, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#0284c7";
        ctx.fillRect(-2, -10, 6, 3);
        ctx.fillStyle = "#e11d48";
        ctx.fillRect(-2, 7, 6, 3);

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

        ctx.fillStyle = astro.activeGrabHeld ? "#3ddc84" : "#e63946";
        ctx.beginPath();
        ctx.arc(armReach + 1, -6, 3.3, 0, Math.PI * 2);
        ctx.arc(armReach + 1, 6, 3.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(3, 0, 10.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#0284c7";
        ctx.beginPath();
        ctx.ellipse(6.5, 0, 5.4, 7.0, 0, -Math.PI * 0.58, Math.PI * 0.58);
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(5.5, -2, 3.8, -Math.PI * 0.4, Math.PI * 0.15);
        ctx.stroke();
      }

      ctx.restore();
    }

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
