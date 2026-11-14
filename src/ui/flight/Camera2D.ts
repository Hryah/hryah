import {
  type FlightState,
  STATION_MODULES,
} from "../../core/flight";

export class Camera2D {
  public x = -610;
  public y = 0;
  public zoom = 1.0;

  public targetX = -610;
  public targetY = 0;
  public targetZoom = 1.0;

  private shakePhase = 0;
  public shakeOffsetX = 0;
  public shakeOffsetY = 0;

  public updateFromState(state: FlightState, dtS: number): void {
    if (state.gameMode === "STATION_ROAM") {
      // Камера плавно слідує за Astronaut (lerp = 0.08)
      this.targetX = state.astronaut.pos.x;
      this.targetY = state.astronaut.pos.y;
      this.targetZoom = 1.0;

      const lerpFactor = 1 - Math.pow(1 - 0.08, Math.max(1, dtS * 60));
      this.x += (this.targetX - this.x) * lerpFactor;
      this.y += (this.targetY - this.y) * lerpFactor;
      this.zoom += (this.targetZoom - this.zoom) * lerpFactor;
    } else if (state.gameMode === "MINIGAME_ACTIVE") {
      // Зафіксована на активному TerminalNode (легкий зум 1.2x)
      const activeTerm = state.terminals.find(
        (t) => t.id === state.activeMinigame.terminalId,
      );
      if (activeTerm) {
        this.targetX = activeTerm.pos.x;
        this.targetY = activeTerm.pos.y;
      } else {
        this.targetX = state.astronaut.pos.x;
        this.targetY = state.astronaut.pos.y;
      }
      this.targetZoom = 1.2;

      const lerpFactor = 1 - Math.pow(1 - 0.12, Math.max(1, dtS * 60));
      this.x += (this.targetX - this.x) * lerpFactor;
      this.y += (this.targetY - this.y) * lerpFactor;
      this.zoom += (this.targetZoom - this.zoom) * lerpFactor;
    } else if (state.gameMode === "MODULE_EXPANSION_CUTSCENE") {
      // Панорамування на новий пристикований модуль (Zoom 0.7x)
      const targetMod = STATION_MODULES.find(
        (m) => m.id === state.cutsceneTargetModuleId,
      );
      if (targetMod) {
        this.targetX = targetMod.cameraCenter.x;
        this.targetY = targetMod.cameraCenter.y;
      }
      this.targetZoom = 0.7;

      const lerpFactor = 1 - Math.pow(1 - 0.1, Math.max(1, dtS * 60));
      this.x += (this.targetX - this.x) * lerpFactor;
      this.y += (this.targetY - this.y) * lerpFactor;
      this.zoom += (this.targetZoom - this.zoom) * lerpFactor;
    } else {
      // GAME_OVER / VICTORY: статична камера з легким віддаленням
      this.targetZoom = 0.75;
      const lerpFactor = 1 - Math.pow(1 - 0.06, Math.max(1, dtS * 60));
      this.zoom += (this.targetZoom - this.zoom) * lerpFactor;
    }

    // Тряска екрана (screenShake) при ударах об стіни або аваріях
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
