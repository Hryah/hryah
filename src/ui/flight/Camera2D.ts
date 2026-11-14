import {
  type FlightState,
  type ModuleBlueprint,
  STATION_LEVEL_CONFIG,
} from "../../core/flight";

export class Camera2D {
  public x = 460;
  public y = 240;
  public zoom = 1.0;

  public targetX = 460;
  public targetY = 240;
  public targetZoom = 1.0;

  private initialized = false;
  private shakePhase = 0;
  public shakeOffsetX = 0;
  public shakeOffsetY = 0;

  public computeModuleCameraTarget(
    mod: ModuleBlueprint,
    viewportW: number,
    viewportH: number,
  ): { cx: number; cy: number; zoom: number } {
    const cx = mod.worldPos.x + mod.size.width * 0.5;
    const cy = mod.worldPos.y + mod.size.height * 0.5;
    const zoomX = (viewportW * 0.82) / mod.size.width;
    const zoomY = (viewportH * 0.78) / mod.size.height;
    const zoom = Math.max(0.45, Math.min(1.65, Math.min(zoomX, zoomY)));
    return { cx, cy, zoom };
  }

  public snapToModule(
    moduleId: string,
    viewportW: number,
    viewportH: number,
  ): void {
    const mod =
      STATION_LEVEL_CONFIG.find((m) => m.id === moduleId) ??
      STATION_LEVEL_CONFIG[0]!;
    const { cx, cy, zoom } = this.computeModuleCameraTarget(
      mod,
      viewportW,
      viewportH,
    );
    this.x = cx;
    this.y = cy;
    this.zoom = zoom;
    this.targetX = cx;
    this.targetY = cy;
    this.targetZoom = zoom;
    this.initialized = true;
  }

  public updateFromState(
    state: FlightState,
    dtS: number,
    viewportW = 1280,
    viewportH = 720,
  ): void {
    if (!this.initialized) {
      this.snapToModule(state.activeModuleId, viewportW, viewportH);
    }

    const focusModuleId =
      state.gameMode === "MODULE_EXPANSION_CUTSCENE" &&
      state.cutsceneTargetModuleId
        ? state.cutsceneTargetModuleId
        : state.activeModuleId;

    const activeModule =
      STATION_LEVEL_CONFIG.find((m) => m.id === focusModuleId) ??
      STATION_LEVEL_CONFIG[0]!;

    const { cx, cy, zoom } = this.computeModuleCameraTarget(
      activeModule,
      viewportW,
      viewportH,
    );

    this.targetX = cx;
    this.targetY = cy;
    this.targetZoom =
      state.gameMode === "MINIGAME_ACTIVE" ? zoom * 1.06 : zoom;

    // Плавний глайд при переході через шлюз (RoomCameraController, speed = 7.5)
    const speed = 7.5;
    const step = Math.min(1, speed * dtS);
    this.x += (this.targetX - this.x) * step;
    this.y += (this.targetY - this.y) * step;
    this.zoom += (this.targetZoom - this.zoom) * step;

    if (state.screenShakePx > 0.2) {
      this.shakePhase += dtS * 48;
      this.shakeOffsetX = Math.sin(this.shakePhase * 1.7) * state.screenShakePx;
      this.shakeOffsetY = Math.cos(this.shakePhase * 2.3) * state.screenShakePx;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  public worldToScreen(
    wx: number,
    wy: number,
    viewportW: number,
    viewportH: number,
  ): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + viewportW * 0.5 + this.shakeOffsetX,
      y: (wy - this.y) * this.zoom + viewportH * 0.5 + this.shakeOffsetY,
    };
  }

  public screenToWorld(
    sx: number,
    sy: number,
    viewportW: number,
    viewportH: number,
  ): { x: number; y: number } {
    return {
      x: (sx - viewportW * 0.5 - this.shakeOffsetX) / this.zoom + this.x,
      y: (sy - viewportH * 0.5 - this.shakeOffsetY) / this.zoom + this.y,
    };
  }

  public applyTransform(
    ctx: CanvasRenderingContext2D,
    viewportW: number,
    viewportH: number,
  ): void {
    ctx.translate(
      viewportW * 0.5 + this.shakeOffsetX,
      viewportH * 0.5 + this.shakeOffsetY,
    );
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}
