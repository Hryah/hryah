import {
  type AstronautEntity,
  type GrabHandle,
  PHYSICS_CONSTANTS,
  type WallSegment,
} from "./StationBlueprint";

export interface PhysicsStepOutput {
  astronaut: AstronautEntity;
  wallImpactSpeedPxS: number;
  grabbedHandleId: string | null;
  slippedHandleId: string | null;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 1e-6) {
    return { x: ax, y: ay, t: 0 };
  }
  const apx = px - ax;
  const apy = py - ay;
  const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  return {
    x: ax + t * abx,
    y: ay + t * aby,
    t,
  };
}

/**
 * 4.1. Розрахунок натягу рогатки (Slingshot Math):
 * D = P_start - P_current
 * L = min(||D||, 180), d_hat = D / ||D||
 * V_launch = d_hat * (L / L_max)^1.2 * V_max (650 px/s)
 */
export function computeSlingshotLaunch(
  dragStartScreen: { x: number; y: number },
  dragCurrentScreen: { x: number; y: number },
): { vx: number; vy: number; pullRatio: number } {
  const dx = dragStartScreen.x - dragCurrentScreen.x;
  const dy = dragStartScreen.y - dragCurrentScreen.y;
  const rawLen = Math.hypot(dx, dy);
  if (rawLen < 4) {
    return { vx: 0, vy: 0, pullRatio: 0 };
  }

  const maxPull = PHYSICS_CONSTANTS.maxPullDistancePx;
  const clampedLen = Math.min(rawLen, maxPull);
  const nx = dx / rawLen;
  const ny = dy / rawLen;
  const pullRatio = clampedLen / maxPull;
  const speed = Math.pow(pullRatio, PHYSICS_CONSTANTS.pullExponent) * PHYSICS_CONSTANTS.maxLaunchSpeedPxS;

  return {
    vx: nx * speed,
    vy: ny * speed,
    pullRatio,
  };
}

/**
 * 4.1.4. Рендер траєкторії: N = 10 точок попереднього перегляду
 * P_i = P_player + V_launch * (i * 0.04 s)
 */
export function computeTrajectoryPreview(
  playerPos: { x: number; y: number },
  launchVector: { vx: number; vy: number },
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const count = PHYSICS_CONSTANTS.trajectoryPreviewCount;
  const stepS = PHYSICS_CONSTANTS.trajectoryStepS;
  for (let i = 1; i <= count; i++) {
    const t = i * stepS;
    points.push({
      x: playerPos.x + launchVector.vx * t,
      y: playerPos.y + launchVector.vy * t,
    });
  }
  return points;
}

/**
 * 4.2 & 4.3. Політ, колізії зі стінами (Circle-to-Segment) та захват ручок-капсуль.
 */
export function stepZeroGPhysics(
  astronaut: AstronautEntity,
  dtS: number,
  activeWalls: readonly WallSegment[],
  activeHandles: readonly GrabHandle[],
): PhysicsStepOutput {
  if (dtS <= 0 || astronaut.state === "ANCHORED") {
    return {
      astronaut: { ...astronaut },
      wallImpactSpeedPxS: 0,
      grabbedHandleId: null,
      slippedHandleId: null,
    };
  }

  // Розбиваємо крок на підкроки <= 8мс, щоб виключити тунелювання крізь стіни та ручки на швидкості 650 px/s
  const subSteps = Math.max(1, Math.ceil(dtS / 0.008));
  const subDt = dtS / subSteps;

  let pos = { ...astronaut.pos };
  let vel = { ...astronaut.vel };
  let angle = astronaut.angle;
  let angularVel = astronaut.angularVel;
  let state: AstronautEntity["state"] = astronaut.state;
  let anchoredHandleId = astronaut.anchoredHandleId;
  let lastHandleId = astronaut.lastHandleId;
  let ignoreHandleTimer = astronaut.ignoreHandleTimer;
  let stunTimer = astronaut.stunTimer;

  let maxWallImpactSpeed = 0;
  let grabbedHandleId: string | null = null;
  let slippedHandleId: string | null = null;

  for (let s = 0; s < subSteps; s++) {
    if (ignoreHandleTimer > 0) {
      ignoreHandleTimer = Math.max(0, ignoreHandleTimer - subDt);
      if (ignoreHandleTimer === 0) {
        lastHandleId = null;
      }
    }

    if (state === "STUNNED") {
      stunTimer = Math.max(0, stunTimer - subDt);
      if (stunTimer === 0) {
        state = "FLYING";
      }
    }

    // 1. Інтеграція позиції та мікро-тертя повітря: V_new = V * (1 - 0.08 * dt)
    pos = {
      x: pos.x + vel.vx * subDt,
      y: pos.y + vel.vy * subDt,
    };
    const airFactor = Math.max(0, 1 - PHYSICS_CONSTANTS.airDragPerS * subDt);
    vel = {
      vx: vel.vx * airFactor,
      vy: vel.vy * airFactor,
    };
    angle += angularVel * subDt;

    // Якщо космонавт летить без оглушення, плавно вирівнюємо кут за вектором руху або легким обертанням
    if (state === "FLYING" && Math.abs(angularVel) < 0.25) {
      const speed = Math.hypot(vel.vx, vel.vy);
      if (speed > 15) {
        const targetAngle = Math.atan2(vel.vy, vel.vx);
        const diff = Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle));
        angle += diff * Math.min(1, subDt * 6);
      }
    }

    // 2. Перевірка зіткнення зі стінами (Circle-to-Segment Collision)
    for (const wall of activeWalls) {
      const closest = closestPointOnSegment(pos.x, pos.y, wall.ax, wall.ay, wall.bx, wall.by);
      const dx = pos.x - closest.x;
      const dy = pos.y - closest.y;
      const dist = Math.hypot(dx, dy);

      if (dist < astronaut.radius) {
        let nx = wall.normal.nx;
        let ny = wall.normal.ny;
        if (dist > 1e-4) {
          nx = dx / dist;
          ny = dy / dist;
        }

        // Виштовхуємо гравця з колізії вздовж нормалі N
        const overlap = astronaut.radius - dist + 0.5;
        pos = {
          x: pos.x + nx * overlap,
          y: pos.y + ny * overlap,
        };

        // Нормальна складова швидкості удару
        const vn = vel.vx * nx + vel.vy * ny;
        if (vn < 0) {
          const impactSpeed = Math.abs(vn);
          if (impactSpeed > maxWallImpactSpeed) {
            maxWallImpactSpeed = impactSpeed;
          }

          // Відбиваємо вектор швидкості (коефіцієнт пружності e = 0.65)
          const e = PHYSICS_CONSTANTS.wallRestitution;
          vel = {
            vx: (vel.vx - 2 * vn * nx) * e,
            vy: (vel.vy - 2 * vn * ny) * e,
          };

          // Додаємо обертання після рикошету
          const tangentDot = vel.vx * -ny + vel.vy * nx;
          angularVel = clamp(tangentDot * 0.015, -5.5, 5.5);

          // Штраф за паніку (High-Speed Impact): |V . N| > 480 px/s -> STUNNED на 0.8 с
          if (impactSpeed > PHYSICS_CONSTANTS.highSpeedStunThresholdPxS) {
            state = "STUNNED";
            stunTimer = PHYSICS_CONSTANTS.stunDurationS;
            angularVel = (tangentDot >= 0 ? 1 : -1) * 6.2;
          }
        }
      }
    }

    // 3. Механіка ціпляння за ручки (Grab Resolution - капсула AB з радіусом R_grab)
    if (state === "FLYING") {
      for (const handle of activeHandles) {
        if (handle.id === lastHandleId && ignoreHandleTimer > 0) {
          continue;
        }
        const closestH = closestPointOnSegment(pos.x, pos.y, handle.ax, handle.ay, handle.bx, handle.by);
        const distH = Math.hypot(pos.x - closestH.x, pos.y - closestH.y);

        if (distH <= handle.grabRadius) {
          const speed = Math.hypot(vel.vx, vel.vy);
          const canGrab =
            speed <= PHYSICS_CONSTANTS.safeGrabSpeedPxS || astronaut.activeGrabHeld;

          if (canGrab) {
            pos = { x: closestH.x, y: closestH.y };
            vel = { vx: 0, vy: 0 };
            angularVel = 0;
            state = "ANCHORED";
            anchoredHandleId = handle.id;
            grabbedHandleId = handle.id;
            break;
          } else {
            // Зрив захвату при високій швидкості без реакції: V <- V * 0.7
            vel = {
              vx: vel.vx * PHYSICS_CONSTANTS.slipDampingFactor,
              vy: vel.vy * PHYSICS_CONSTANTS.slipDampingFactor,
            };
            lastHandleId = handle.id;
            ignoreHandleTimer = 0.2;
            slippedHandleId = handle.id;
          }
        }
      }
    }

    if (state === "ANCHORED") {
      break;
    }
  }

  return {
    astronaut: {
      ...astronaut,
      pos,
      vel,
      angle,
      angularVel,
      state,
      anchoredHandleId,
      lastHandleId,
      ignoreHandleTimer,
      stunTimer,
      slingshot:
        state === "ANCHORED"
          ? astronaut.slingshot
          : {
              isDragging: false,
              dragStartScreen: { x: 0, y: 0 },
              dragCurrentScreen: { x: 0, y: 0 },
              launchVector: { vx: 0, vy: 0 },
            },
    },
    wallImpactSpeedPxS: maxWallImpactSpeed,
    grabbedHandleId,
    slippedHandleId,
  };
}
