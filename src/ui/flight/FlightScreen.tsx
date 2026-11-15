import { useEffect, useRef } from "react";
import {
  ALL_GRAB_HANDLES,
  type FlightAction,
  type FlightState,
} from "../../core/flight";
import { GameLoop } from "./GameLoop";
import { getTerminalBadgeAnchor } from "./render/StationRenderer";

const SLINGSHOT_DRAG_THRESHOLD_PX = 8;

export interface FlightScreenProps {
  state: FlightState;
  dispatch: (action: FlightAction) => void;
}

export function FlightScreen({ state, dispatch }: FlightScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loopRef = useRef<GameLoop | null>(null);
  const stateRef = useRef<FlightState>(state);
  const dispatchRef = useRef<(action: FlightAction) => void>(dispatch);
  const pointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerDragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    maxDragDist: number;
    startedAnchored: boolean;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    maxDragDist: 0,
    startedAnchored: false,
  });

  stateRef.current = state;
  dispatchRef.current = dispatch;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const loop = new GameLoop();
    loopRef.current = loop;
    loop.start(
      canvas,
      () => stateRef.current,
      (action) => dispatchRef.current(action),
    );

    return () => {
      loop.stop();
      loopRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      const send = dispatchRef.current;
      const loop = loopRef.current;

      // 1. MODULE_EXPANSION_CUTSCENE — ввід повністю заблоковано
      if (s.gameMode === "MODULE_EXPANSION_CUTSCENE") {
        return;
      }

      // 2. GAME_OVER / VICTORY — перехід до наступної частини
      if (s.gameMode === "VICTORY" || s.gameMode === "GAME_OVER") {
        if (e.code === "Enter" || e.code === "Space") {
          e.preventDefault();
          send({ type: "complete_phase" });
        }
        return;
      }

      // 3. MINIGAME_ACTIVE — ввід маршрутизується виключно в активний MinigameController
      if (s.gameMode === "MINIGAME_ACTIVE") {
        if (e.code === "Escape") {
          e.preventDefault();
          loop?.dockingGame.resetInput();
          loop?.solarGame.resetInput();
          loop?.lifeSupportGame.resetInput();
          send({ type: "close_minigame" });
          return;
        }
        if (s.activeMinigame.type === "DOCKING" && loop) {
          if (loop.dockingGame.handleKeyDown(e.code, send)) {
            e.preventDefault();
          }
        } else if (s.activeMinigame.type === "SOLAR" && loop) {
          if (loop.solarGame.handleKeyDown(e.code, send)) {
            e.preventDefault();
          }
        } else if (s.activeMinigame.lifeSupport && e.code === "Space") {
          e.preventDefault();
          send({ type: "ls_hold_o2", held: true });
        }
        return;
      }

      // 4. STATION_ROAM — керування космонавтом
      if (s.gameMode === "STATION_ROAM") {
        if (loop?.setRoamKey(e.code, true)) {
          e.preventDefault();
          return;
        }
        if (e.code === "KeyE" || e.code === "Enter") {
          e.preventDefault();
          send({ type: "open_terminal" });
          return;
        }
        if (e.code === "Space") {
          e.preventDefault();
          send({ type: "set_active_grab", held: true });
          return;
        }
        if ((e.code === "KeyQ" || e.code === "KeyR") && loop && canvasRef.current) {
          e.preventDefault();
          const rect = canvasRef.current.getBoundingClientRect();
          const astroScreen = loop.camera.worldToScreen(
            s.astronaut.pos.x,
            s.astronaut.pos.y,
            rect.width,
            rect.height,
          );
          const dirX = pointerPosRef.current.x - astroScreen.x;
          const dirY = pointerPosRef.current.y - astroScreen.y;
          send({ type: "fire_thruster", dirX, dirY });
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const s = stateRef.current;
      const send = dispatchRef.current;
      const loop = loopRef.current;

      loop?.setRoamKey(e.code, false);

      if (s.gameMode === "MINIGAME_ACTIVE") {
        if (s.activeMinigame.type === "DOCKING" && loop) {
          loop.dockingGame.handleKeyUp(e.code, send);
        } else if (s.activeMinigame.lifeSupport && e.code === "Space") {
          send({ type: "ls_hold_o2", held: false });
        }
        return;
      }

      if (e.code === "Space") {
        send({ type: "set_active_grab", held: false });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const getRelativeScreenPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      sx: e.clientX - rect.left,
      sy: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { sx, sy, w, h } = getRelativeScreenPos(e);
    pointerPosRef.current = { x: sx, y: sy };

    const s = stateRef.current;
    const send = dispatchRef.current;
    const loop = loopRef.current;
    if (!loop) return;

    // 1. MODULE_EXPANSION_CUTSCENE — ввід заблоковано
    if (s.gameMode === "MODULE_EXPANSION_CUTSCENE") {
      return;
    }

    // 2. GAME_OVER / VICTORY — кнопка завершення
    if (s.gameMode === "VICTORY" || s.gameMode === "GAME_OVER") {
      send({ type: "complete_phase" });
      return;
    }

    // 3. MINIGAME_ACTIVE — ввід отримує виключно активний інстанс MinigameController
    if (s.gameMode === "MINIGAME_ACTIVE") {
      if (s.activeMinigame.type === "DOCKING") {
        loop.dockingGame.handlePointerDown(sx, sy, w, h, send);
      } else if (s.activeMinigame.type === "SOLAR") {
        loop.solarGame.handlePointerDown(sx, sy, w, h, send);
      } else if (s.activeMinigame.lifeSupport) {
        loop.lifeSupportGame.handlePointerDown(
          sx,
          sy,
          w,
          h,
          s.activeMinigame.lifeSupport,
          send,
        );
      }
      return;
    }

    // 4. STATION_ROAM: SlingshotController (якщо ANCHORED) або GrabController (якщо FLYING)
    if (s.gameMode === "STATION_ROAM") {
      // ПКМ у польоті — аварійний мікро-двигун (thrusterCharges), або скасування натягу рогатки
      if (e.button === 2) {
        pointerDragRef.current.active = false;
        if (s.astronaut.state === "ANCHORED") {
          send({ type: "slingshot_cancel" });
        } else {
          const astroScreen = loop.camera.worldToScreen(
            s.astronaut.pos.x,
            s.astronaut.pos.y,
            w,
            h,
          );
          send({
            type: "fire_thruster",
            dirX: sx - astroScreen.x,
            dirY: sy - astroScreen.y,
          });
        }
        return;
      }

      if (e.button !== 0) {
        return;
      }

      if (s.astronaut.state === "ANCHORED") {
        // Хітбокс термінала НЕ перехоплює pointerdown: рогатка завжди стартує першою,
        // а відкриття термінала можливе лише на чистий клік (pointerup при dragDistance <= 8px) або клавішею E.
        pointerDragRef.current = {
          active: true,
          pointerId: e.pointerId,
          startX: sx,
          startY: sy,
          maxDragDist: 0,
          startedAnchored: true,
        };
        send({ type: "slingshot_start", screenX: sx, screenY: sy });
      } else {
        pointerDragRef.current = {
          active: false,
          pointerId: e.pointerId,
          startX: sx,
          startY: sy,
          maxDragDist: 0,
          startedAnchored: false,
        };
        // У польоті затиснута ЛКМ вмикає активний захват ручок (GrabController)
        send({ type: "set_active_grab", held: true });
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy, w, h } = getRelativeScreenPos(e);
    pointerPosRef.current = { x: sx, y: sy };

    const s = stateRef.current;
    const send = dispatchRef.current;
    const loop = loopRef.current;
    if (!loop) return;

    if (
      pointerDragRef.current.active &&
      e.pointerId === pointerDragRef.current.pointerId
    ) {
      const dist = Math.hypot(
        sx - pointerDragRef.current.startX,
        sy - pointerDragRef.current.startY,
      );
      if (dist > pointerDragRef.current.maxDragDist) {
        pointerDragRef.current.maxDragDist = dist;
      }
    }

    if (s.gameMode === "MINIGAME_ACTIVE") {
      if (s.activeMinigame.type === "DOCKING") {
        loop.dockingGame.handlePointerMove(sx, sy, w, h, send);
      } else if (s.activeMinigame.type === "SOLAR") {
        loop.solarGame.handlePointerMove(sx, sy, w, h, send);
      } else if (s.activeMinigame.lifeSupport) {
        loop.lifeSupportGame.handlePointerMove(sx, sy, w, h, send);
      }
      return;
    }

    if (
      s.gameMode === "STATION_ROAM" &&
      s.astronaut.state === "ANCHORED" &&
      s.astronaut.slingshot.isDragging
    ) {
      const dragDist = pointerDragRef.current.active
        ? pointerDragRef.current.maxDragDist
        : Math.hypot(
            sx - s.astronaut.slingshot.dragStartScreen.x,
            sy - s.astronaut.slingshot.dragStartScreen.y,
          );
      if (dragDist > SLINGSHOT_DRAG_THRESHOLD_PX) {
        send({ type: "slingshot_move", screenX: sx, screenY: sy });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const { sx, sy, w, h } = getRelativeScreenPos(e);
    const s = stateRef.current;
    const send = dispatchRef.current;
    const loop = loopRef.current;
    const drag = { ...pointerDragRef.current };
    if (e.pointerId === drag.pointerId) {
      pointerDragRef.current.active = false;
    }
    if (!loop) return;

    if (s.gameMode === "MINIGAME_ACTIVE") {
      if (s.activeMinigame.type === "DOCKING") {
        loop.dockingGame.handlePointerUp(send);
      } else if (s.activeMinigame.type === "SOLAR") {
        loop.solarGame.handlePointerUp();
      } else if (s.activeMinigame.lifeSupport) {
        loop.lifeSupportGame.handlePointerUp(sx, sy, w, h, send);
      }
      return;
    }

    if (s.gameMode === "STATION_ROAM") {
      if (
        e.button === 0 &&
        drag.active &&
        drag.startedAnchored &&
        s.astronaut.state === "ANCHORED"
      ) {
        const dragDistance = Math.max(
          drag.maxDragDist,
          Math.hypot(sx - drag.startX, sy - drag.startY),
        );

        if (dragDistance > SLINGSHOT_DRAG_THRESHOLD_PX) {
          send({ type: "slingshot_release" });
        } else {
          if (s.astronaut.slingshot.isDragging) {
            send({ type: "slingshot_cancel" });
          }
          if (s.astronaut.anchoredHandleId) {
            const handle = ALL_GRAB_HANDLES.find(
              (h) => h.id === s.astronaut.anchoredHandleId,
            );
            if (handle && handle.terminalId) {
              const worldPt = loop.camera.screenToWorld(sx, sy, w, h);
              const term = s.terminals.find((t) => t.id === handle.terminalId);
              let clickedConsole = false;
              let clickedTermBadge = false;
              if (term) {
                const rad = -(term.mountAngle * Math.PI) / 180;
                const dx = worldPt.x - term.pos.x;
                const dy = worldPt.y - term.pos.y;
                const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
                const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
                clickedConsole =
                  Math.abs(lx) <= term.visualPreset.chassisWidth * 0.62 &&
                  Math.abs(ly) <= term.visualPreset.chassisHeight * 0.65;

                const badge = getTerminalBadgeAnchor(term);
                clickedTermBadge =
                  Math.abs(worldPt.x - badge.cx) <= badge.maxWidth * 0.55 &&
                  Math.abs(worldPt.y - badge.cy) <= 15;
              }

              if (clickedConsole || clickedTermBadge) {
                send({ type: "open_terminal" });
              }
            }
          }
        }
      } else if (
        s.astronaut.state === "ANCHORED" &&
        s.astronaut.slingshot.isDragging
      ) {
        send({ type: "slingshot_release" });
      }
      if (s.astronaut.activeGrabHeld) {
        send({ type: "set_active_grab", held: false });
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    pointerDragRef.current.active = false;
    const s = stateRef.current;
    const send = dispatchRef.current;
    if (s.gameMode === "STATION_ROAM") {
      if (s.astronaut.slingshot.isDragging) {
        send({ type: "slingshot_cancel" });
      }
      if (s.astronaut.activeGrabHeld) {
        send({ type: "set_active_grab", held: false });
      }
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        userSelect: "none",
        background: "#04060d",
        zIndex: 1000,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="retro-colors"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          cursor:
            state.gameMode === "STATION_ROAM" &&
            state.astronaut.state === "ANCHORED"
              ? "grab"
              : "crosshair",
          touchAction: "none",
        }}
      />
    </div>
  );
}
