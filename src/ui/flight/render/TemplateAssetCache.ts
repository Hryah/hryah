import type { FlightState } from "../../../core/flight";
import {
  type BlueprintSpec,
  type SpacecraftVisualAssembly,
  resolveAssetUrl,
  templateRegistry,
  type VisualTemplate,
} from "../../graphics";

/**
 * Кеш і 2D Canvas-адаптер для інтеграції `templateRegistry` (`visual-templates.json`)
 * та 2D SVG-темплейтів (`public/assets/templates/`, `public/assets/bodies/`, `public/assets/icons/`)
 * безпосередньо в ігровий цикл FlightScreen.
 */
export class TemplateAssetCache {
  private readonly images = new Map<string, HTMLImageElement | "loading" | "error">();

  public constructor() {
    const preloadTemplates = [
      templateRegistry.getBusTemplate(),
      templateRegistry.getTemplate("sol-m"),
      templateRegistry.getTemplate("ant-m"),
    ];
    for (const tpl of preloadTemplates) {
      if (tpl.sprite2d?.url) {
        this.getImage(tpl.sprite2d.url);
      }
    }

    const flightSprites = [
      "assets/templates/flight/mod-horizontal.svg",
      "assets/templates/flight/mod-hub.svg",
      "assets/templates/flight/mod-vertical.svg",
      "assets/templates/flight/astro-idle.svg",
      "assets/templates/flight/astro-pull.svg",
      "assets/templates/flight/astro-fly.svg",
      "assets/templates/flight/astro-stun.svg",
      "assets/astronaut/front.svg",
      "assets/templates/flight/door-seal.svg",
      "assets/templates/flight/handle-rail.svg",
      "assets/templates/flight/console-terminal.svg",
      "assets/templates/flight/obstacle-pillar.svg",
      "assets/templates/flight/obstacle-cargo.svg",
      "assets/bodies/earth-globe.svg",
      "assets/icons/station/radar-dish.svg",
      "assets/icons/station/filter-barrel.svg",
    ];
    for (const path of flightSprites) {
      this.getImage(path);
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
