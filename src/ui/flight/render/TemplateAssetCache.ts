import type { FlightState } from "../../../core/flight";
import {
  type BlueprintSpec,
  parseGlbBuffer,
  type SpacecraftVisualAssembly,
  templateRegistry,
  type VisualTemplate,
} from "../../graphics";
import type { ParsedMesh, Vec3 } from "../../graphics/glb-viewer";

function resolveAssetUrl(rawUrl: string): string {
  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const cleanPath = rawUrl.startsWith("/") ? rawUrl.slice(1) : rawUrl;
  return `${normalizedBase}${cleanPath}`;
}

/**
 * Кеш і Canvas-адаптер для інтеграції `templateRegistry` (`visual-templates.json`),
 * 3D `.glb` моделей (`parseGlbBuffer`), текстур планет (`public/assets/textures/`)
 * та спрайтів станції (`public/assets/sprites/station/`) безпосередньо в ігровий цикл FlightScreen.
 */
export class TemplateAssetCache {
  private readonly images = new Map<string, HTMLImageElement | "loading" | "error">();
  private readonly meshes = new Map<string, ParsedMesh | "loading" | "error">();

  public constructor() {
    // Попередньо ініціюємо завантаження 3 базових GLB моделей із реєстру темплейтів
    const preloadTemplates = [
      templateRegistry.getBusTemplate(),
      templateRegistry.getTemplate("sol-m"),
      templateRegistry.getTemplate("ant-m"),
    ];
    for (const tpl of preloadTemplates) {
      if (tpl.model3d?.url) {
        this.getGlbMesh(tpl.model3d.url);
      }
    }
  }

  /**
   * Будує повну візуальну збірку корабля гравця (`SpacecraftVisualAssembly`)
   * із `templateRegistry` на основі поточного `FlightState`.
   */
  public getAssemblyForState(state: FlightState): SpacecraftVisualAssembly {
    return templateRegistry.buildAssembly({
      phase: "flight",
      mission: state.input.mission,
      design: state.input.spec.design,
      spec: state.input.spec,
      damages: state.damage,
    });
  }

  public getTemplate(id: string): VisualTemplate {
    return templateRegistry.getTemplate(id);
  }

  /**
   * Повертає завантажене зображення (текстуру планети або спрайт Kenney) або null, якщо ще вантажиться / недоступне.
   */
  public getImage(rawUrl: string): HTMLImageElement | null {
    const url = resolveAssetUrl(rawUrl);
    const cached = this.images.get(url);
    if (cached === "loading" || cached === "error") {
      return null;
    }
    if (cached) {
      return cached;
    }

    if (typeof Image === "undefined") {
      this.images.set(url, "error");
      return null;
    }

    this.images.set(url, "loading");
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      this.images.set(url, img);
    };
    img.onerror = () => {
      this.images.set(url, "error");
    };
    img.src = url;
    return null;
  }

  /**
   * Завантажує та парсить бінарну 3D-модель `.glb` через `parseGlbBuffer` із `src/ui/graphics/glb-viewer.tsx`.
   */
  public getGlbMesh(rawUrl: string): ParsedMesh | null {
    const url = resolveAssetUrl(rawUrl);
    const cached = this.meshes.get(url);
    if (cached === "loading" || cached === "error") {
      return null;
    }
    if (cached) {
      return cached;
    }

    if (typeof fetch === "undefined") {
      this.meshes.set(url, "error");
      return null;
    }

    this.meshes.set(url, "loading");
    fetch(url)
      .then((res) => {
        const ct = res.headers.get("content-type") ?? "";
        if (!res.ok || ct.includes("text/html")) {
          throw new Error(`GLB fetch failed: ${res.status}`);
        }
        return res.arrayBuffer();
      })
      .then((buf) => {
        const parsed = parseGlbBuffer(buf);
        this.meshes.set(url, parsed);
      })
      .catch(() => {
        this.meshes.set(url, "error");
      });

    return null;
  }

  /**
   * Проєктує та рендерить 3D `.glb` меш безпосередньо на ігровий `CanvasRenderingContext2D`
   * (використовується в оптичному візирі СОІ стикування та на пульті сервоприводів сонячних панелей).
   */
  public drawGlbMeshOnCanvas(
    ctx: CanvasRenderingContext2D,
    mesh: ParsedMesh,
    cx: number,
    cy: number,
    radiusPx: number,
    yawRad: number,
    pitchRad: number,
    tintHex?: string,
  ): void {
    const cosY = Math.cos(yawRad);
    const sinY = Math.sin(yawRad);
    const cosX = Math.cos(pitchRad);
    const sinX = Math.sin(pitchRad);

    const transform = (v: Vec3): Vec3 => {
      const x1 = v.x * cosY - v.z * sinY;
      const z1 = v.x * sinY + v.z * cosY;
      const y2 = v.y * cosX - z1 * sinX;
      const z2 = v.y * sinX + z1 * cosX;
      return { x: x1, y: y2, z: z2 };
    };

    const projected = mesh.triangles.map((t) => {
      const p0 = transform(t.v0);
      const p1 = transform(t.v1);
      const p2 = transform(t.v2);
      const n = transform(t.normal);
      const avgZ = (p0.z + p1.z + p2.z) / 3;
      return { p0, p1, p2, n, avgZ, color: t.color };
    });

    projected.sort((a, b) => a.avgZ - b.avgZ);

    const fov = radiusPx * 1.15;
    const lightDir = { x: 0.42, y: 0.65, z: 0.63 };

    ctx.save();
    for (const tri of projected) {
      const d0 = 3.2 - tri.p0.z;
      const d1 = 3.2 - tri.p1.z;
      const d2 = 3.2 - tri.p2.z;
      if (d0 <= 0.2 || d1 <= 0.2 || d2 <= 0.2) continue;

      const sx0 = cx + (tri.p0.x * fov) / d0;
      const sy0 = cy - (tri.p0.y * fov) / d0;
      const sx1 = cx + (tri.p1.x * fov) / d1;
      const sy1 = cy - (tri.p1.y * fov) / d1;
      const sx2 = cx + (tri.p2.x * fov) / d2;
      const sy2 = cy - (tri.p2.y * fov) / d2;

      const dot = Math.abs(
        tri.n.x * lightDir.x + tri.n.y * lightDir.y + tri.n.z * lightDir.z,
      );
      const shade = 0.3 + 0.7 * dot;
      const r = Math.min(255, Math.round(tri.color[0] * shade));
      const g = Math.min(255, Math.round(tri.color[1] * shade));
      const b = Math.min(255, Math.round(tri.color[2] * shade));

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.closePath();
      ctx.fill();

      if (tintHex) {
        ctx.strokeStyle = tintHex;
        ctx.lineWidth = 0.45;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Рендерить процедурний векторний шаблон `BlueprintSpec` із `visual-templates.json`
   * безпосередньо на Canvas (двигуни, сонячні панелі, батареї, антени, камери, корпус супутника).
   */
  public drawBlueprintShapeOnCanvas(
    ctx: CanvasRenderingContext2D,
    spec: BlueprintSpec,
    cx: number,
    cy: number,
    sizePx: number,
    damaged = false,
  ): void {
    const scale = sizePx / 100;
    const stroke = damaged ? "#ff5c7a" : spec.accentColor;

    ctx.save();
    ctx.translate(cx - sizePx * 0.5, cy - sizePx * 0.5);
    ctx.scale(scale, scale);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = stroke;

    const { shape, primaryColor, secondaryColor, accentColor } = spec;

    if (
      shape === "solar-small" ||
      shape === "solar-medium" ||
      shape === "solar-large"
    ) {
      const w = shape === "solar-large" ? 92 : shape === "solar-medium" ? 84 : 70;
      const h = shape === "solar-large" ? 50 : shape === "solar-medium" ? 38 : 28;
      const x = (100 - w) * 0.5;
      const y = (100 - h) * 0.5;

      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 4);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.lineTo(50, y + h);
      ctx.moveTo(x + w * 0.25, y);
      ctx.lineTo(x + w * 0.25, y + h);
      ctx.moveTo(x + w * 0.75, y);
      ctx.lineTo(x + w * 0.75, y + h);
      ctx.moveTo(x, 50);
      ctx.lineTo(x + w, 50);
      ctx.stroke();
    } else if (
      shape === "engine-cold" ||
      shape === "engine-chem" ||
      shape === "engine-ion"
    ) {
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.roundRect(30, 16, 40, 26, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = secondaryColor;
      ctx.beginPath();
      ctx.moveTo(35, 42);
      ctx.lineTo(65, 42);
      ctx.lineTo(75, 76);
      ctx.lineTo(25, 76);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(50, 82, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (
      shape === "battery-small" ||
      shape === "battery-medium" ||
      shape === "battery-large"
    ) {
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.roundRect(22, 28, 56, 46, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = secondaryColor;
      ctx.fillRect(30, 36, 11, 30);
      if (shape !== "battery-small") {
        ctx.fillRect(45, 36, 11, 30);
      }
      if (shape === "battery-large") {
        ctx.fillStyle = accentColor;
        ctx.fillRect(60, 36, 11, 30);
      }
    } else if (
      shape === "camera-compact" ||
      shape === "camera-medium" ||
      shape === "camera-telescope"
    ) {
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.roundRect(26, 24, 48, 52, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = secondaryColor;
      ctx.beginPath();
      ctx.arc(50, 50, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#090d16";
      ctx.beginPath();
      ctx.arc(50, 50, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.roundRect(24, 24, 52, 52, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(50, 50, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export const flightAssetCache = new TemplateAssetCache();
