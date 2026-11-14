import { useEffect, useRef } from "react";
import {
  ALL_GRAB_HANDLES,
  type FlightAction,
  type FlightState,
} from "../../core/flight";
import { GameLoop } from "./GameLoop";

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

      if (s.astronaut.state === "ANCHORED") {
        // Якщо клікнули по іконці [E / КЛІК] над персонажем або по самій консолі поруч — відкриваємо термінал
        if (s.astronaut.anchoredHandleId) {
          const handle = ALL_GRAB_HANDLES.find(
            (h) => h.id === s.astronaut.anchoredHandleId,
          );
          if (handle && handle.terminalId) {
            const badgePos = loop.camera.worldToScreen(
              s.astronaut.pos.x,
              s.astronaut.pos.y - 40,
              w,
              h,
            );
            const term = s.terminals.find((t) => t.id === handle.terminalId);
            const termScreen = term
              ? loop.camera.worldToScreen(term.pos.x, term.pos.y, w, h)
              : null;

            const clickedBadge =
              Math.abs(sx - badgePos.x) <= 98 &&
              Math.abs(sy - badgePos.y) <= 24;
            const clickedConsole =
              termScreen !== null &&
              Math.hypot(sx - termScreen.x, sy - termScreen.y) <= 58;

            if (clickedBadge || clickedConsole) {
              send({ type: "open_terminal" });
              return;
            }
          }
        }

        // Початок натягу рогатки (SlingshotController)
        send({ type: "slingshot_start", screenX: sx, screenY: sy });
      } else {
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
      send({ type: "slingshot_move", screenX: sx, screenY: sy });
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
      if (s.astronaut.state === "ANCHORED" && s.astronaut.slingshot.isDragging) {
        send({ type: "slingshot_release" });
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
