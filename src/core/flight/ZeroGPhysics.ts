import {
  type AstronautEntity,
  type CircleObstacleWorld,
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
  const speed =
    Math.pow(pullRatio, PHYSICS_CONSTANTS.pullExponent) *
    PHYSICS_CONSTANTS.maxLaunchSpeedPxS;

  return {
    vx: nx * speed,
    vy: ny * speed,
    pullRatio,
  };
}

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

export interface BallisticTrajectoryPreview {
  points: { x: number; y: number }[];
  bouncePoints: { x: number; y: number }[];
  targetHandleId: string | null;
  targetPoint: { x: number; y: number } | null;
  impactSpeedPxS: number;
  requiresActiveGrab: boolean;
}

/**
 * Якщо космонавт тримається за поручень біля самої стіни і випадково натягує рогатку
 * під кутом у стіну позаду себе, автоматично відбиваємо вектор від стіни всередину відсіку.
 */
export function sanitizeLaunchVectorAgainstNearbyWalls(
  pos: { x: number; y: number },
  launchVector: { vx: number; vy: number },
  radius: number,
  activeWalls: readonly WallSegment[],
): { vx: number; vy: number } {
  let vx = launchVector.vx;
  let vy = launchVector.vy;
  const speed = Math.hypot(vx, vy);
  if (speed < 5) return { vx, vy };

  for (const wall of activeWalls) {
    const closest = closestPointOnSegment(
      pos.x,
      pos.y,
      wall.ax,
      wall.ay,
      wall.bx,
      wall.by,
    );
    const dx = pos.x - closest.x;
    const dy = pos.y - closest.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= radius + 42) {
      const nx = dist > 1e-4 ? dx / dist : wall.normal.nx;
      const ny = dist > 1e-4 ? dy / dist : wall.normal.ny;
      const vn = vx * nx + vy * ny;
      if (vn < -15) {
        vx = vx - 1.9 * vn * nx;
        vy = vy - 1.9 * vn * ny;
      }
    }
  }
  return { vx, vy };
}

/**
 * Чесна симуляція балістичної траєкторії з рикошетами від восьмикутних стін,
 * колон та автоматичним визначенням цільового поручня [LOCK ON].
 */
export function computeBallisticTrajectoryWithBounces(
  startPos: { x: number; y: number },
  launchVector: { vx: number; vy: number },
  radius: number,
  activeWalls: readonly WallSegment[],
  activeHandles: readonly GrabHandle[],
  circleObstacles: readonly CircleObstacleWorld[] = [],
  ignoredHandleId: string | null = null,
): BallisticTrajectoryPreview {
  const points: { x: number; y: number }[] = [];
  const bouncePoints: { x: number; y: number }[] = [];

  let px = startPos.x;
  let py = startPos.y;
  let vx = launchVector.vx;
  let vy = launchVector.vy;

  const totalSteps = 60;
  const dt = 0.018;
  let ignoreTimer = PHYSICS_CONSTANTS.ignoreHandleDurationS;
  let targetHandleId: string | null = null;
  let targetPoint: { x: number; y: number } | null = null;
  let impactSpeedPxS = Math.hypot(vx, vy);

  for (let step = 1; step <= totalSteps; step++) {
    ignoreTimer = Math.max(0, ignoreTimer - dt);
    px += vx * dt;
    py += vy * dt;

    const airFactor = Math.max(0, 1 - PHYSICS_CONSTANTS.airDragPerS * dt);
    vx *= airFactor;
    vy *= airFactor;

    // 1. Відбиття від восьмикутних стін та вантажних контейнерів
    for (const wall of activeWalls) {
      const closest = closestPointOnSegment(px, py, wall.ax, wall.ay, wall.bx, wall.by);
      const dx = px - closest.x;
      const dy = py - closest.y;
      const dist = Math.hypot(dx, dy);
      if (dist < radius) {
        const nx = dist > 1e-4 ? dx / dist : wall.normal.nx;
        const ny = dist > 1e-4 ? dy / dist : wall.normal.ny;
        const overlap = radius - dist + 0.5;
        px += nx * overlap;
        py += ny * overlap;

        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          const e = wall.bounciness ?? PHYSICS_CONSTANTS.wallRestitution;
          vx = (vx - 2 * vn * nx) * e;
          vy = (vy - 2 * vn * ny) * e;
          if (bouncePoints.length < 4) {
            bouncePoints.push({ x: closest.x, y: closest.y });
          }
        }
      }
    }

    // 2. Відбиття від круглих колон
    for (const col of circleObstacles) {
      const dx = px - col.wx;
      const dy = py - col.wy;
      const dist = Math.hypot(dx, dy);
      const minDist = radius + col.radius;
      if (dist < minDist) {
        const nx = dist > 1e-4 ? dx / dist : 1;
        const ny = dist > 1e-4 ? dy / dist : 0;
        const overlap = minDist - dist + 0.5;
        px += nx * overlap;
        py += ny * overlap;

        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          vx = (vx - 2 * vn * nx) * col.bounciness;
          vy = (vy - 2 * vn * ny) * col.bounciness;
          if (bouncePoints.length < 4) {
            bouncePoints.push({
              x: col.wx + nx * col.radius,
              y: col.wy + ny * col.radius,
            });
          }
        }
      }
    }

    if (step % 3 === 0) {
      points.push({ x: px, y: py });
    }

    // 3. Перевірка перетину з поручнем (Target Lock)
    for (const handle of activeHandles) {
      if (handle.id === ignoredHandleId && ignoreTimer > 0) continue;
      const closestH = closestPointOnSegment(
        px,
        py,
        handle.ax,
        handle.ay,
        handle.bx,
        handle.by,
      );
      const distH = Math.hypot(px - closestH.x, py - closestH.y);
      if (distH <= handle.grabRadius) {
        targetHandleId = handle.id;
        targetPoint = { x: closestH.x, y: closestH.y };
        impactSpeedPxS = Math.hypot(vx, vy);
        points.push({ x: closestH.x, y: closestH.y });
        break;
      }
    }

    if (targetHandleId !== null) {
      break;
    }
  }

  return {
    points,
    bouncePoints,
    targetHandleId,
    targetPoint,
    impactSpeedPxS,
    requiresActiveGrab: impactSpeedPxS > PHYSICS_CONSTANTS.safeGrabSpeedPxS,
  };
}

export function stepZeroGPhysics(
  astronaut: AstronautEntity,
  dtS: number,
  activeWalls: readonly WallSegment[],
  activeHandles: readonly GrabHandle[],
  circleObstacles: readonly CircleObstacleWorld[] = [],
): PhysicsStepOutput {
  if (dtS <= 0 || astronaut.state === "ANCHORED") {
    return {
      astronaut: { ...astronaut },
      wallImpactSpeedPxS: 0,
      grabbedHandleId: null,
      slippedHandleId: null,
    };
  }

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

    if (state === "FLYING" && Math.abs(angularVel) < 0.25) {
      const speed = Math.hypot(vel.vx, vel.vy);
      if (speed > 15) {
        const targetAngle = Math.atan2(vel.vy, vel.vx);
        const diff = Math.atan2(
          Math.sin(targetAngle - angle),
          Math.cos(targetAngle - angle),
        );
        angle += diff * Math.min(1, subDt * 6);
      }
    }

    // 1. Колізії зі стінами восьмикутника та CARGO_BOX (Circle-to-Segment)
    for (const wall of activeWalls) {
      const closest = closestPointOnSegment(
        pos.x,
        pos.y,
        wall.ax,
        wall.ay,
        wall.bx,
        wall.by,
      );
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

        const overlap = astronaut.radius - dist + 0.5;
        pos = {
          x: pos.x + nx * overlap,
          y: pos.y + ny * overlap,
        };

        const vn = vel.vx * nx + vel.vy * ny;
        if (vn < 0) {
          const impactSpeed = Math.abs(vn);
          if (impactSpeed > maxWallImpactSpeed) {
            maxWallImpactSpeed = impactSpeed;
          }

          const e = wall.bounciness ?? PHYSICS_CONSTANTS.wallRestitution;
          vel = {
            vx: (vel.vx - 2 * vn * nx) * e,
            vy: (vel.vy - 2 * vn * ny) * e,
          };

          const tangentDot = vel.vx * -ny + vel.vy * nx;
          angularVel = clamp(tangentDot * 0.015, -5.5, 5.5);

          if (impactSpeed > PHYSICS_CONSTANTS.highSpeedStunThresholdPxS) {
            state = "STUNNED";
            stunTimer = PHYSICS_CONSTANTS.stunDurationS;
            angularVel = (tangentDot >= 0 ? 1 : -1) * 6.2;
          }
        }
      }
    }

    // 2. Колізії з круглими колонами PILLAR_CIRCLE (Circle-to-Circle)
    for (const col of circleObstacles) {
      const dx = pos.x - col.wx;
      const dy = pos.y - col.wy;
      const dist = Math.hypot(dx, dy);
      const minDist = astronaut.radius + col.radius;

      if (dist < minDist) {
        const nx = dist > 1e-4 ? dx / dist : 1;
        const ny = dist > 1e-4 ? dy / dist : 0;
        const overlap = minDist - dist + 0.5;
        pos = {
          x: pos.x + nx * overlap,
          y: pos.y + ny * overlap,
        };

        const vn = vel.vx * nx + vel.vy * ny;
        if (vn < 0) {
          const impactSpeed = Math.abs(vn);
          if (impactSpeed > maxWallImpactSpeed) {
            maxWallImpactSpeed = impactSpeed;
          }

          const e = col.bounciness;
          vel = {
            vx: (vel.vx - 2 * vn * nx) * e,
            vy: (vel.vy - 2 * vn * ny) * e,
          };

          const tangentDot = vel.vx * -ny + vel.vy * nx;
          angularVel = clamp(tangentDot * 0.018, -5.5, 5.5);

          if (impactSpeed > PHYSICS_CONSTANTS.highSpeedStunThresholdPxS) {
            state = "STUNNED";
            stunTimer = PHYSICS_CONSTANTS.stunDurationS;
            angularVel = (tangentDot >= 0 ? 1 : -1) * 6.2;
          }
        }
      }
    }

    // 3. Захват ручок-капсуль (Grab Resolution)
    if (state === "FLYING") {
      for (const handle of activeHandles) {
        if (handle.id === lastHandleId && ignoreHandleTimer > 0) {
          continue;
        }
        const closestH = closestPointOnSegment(
          pos.x,
          pos.y,
          handle.ax,
          handle.ay,
          handle.bx,
          handle.by,
        );
        const distH = Math.hypot(pos.x - closestH.x, pos.y - closestH.y);

        if (distH <= handle.grabRadius) {
          const speed = Math.hypot(vel.vx, vel.vy);
          const canGrab =
            speed <= PHYSICS_CONSTANTS.safeGrabSpeedPxS ||
            astronaut.activeGrabHeld;

          if (canGrab) {
            pos = { x: closestH.x, y: closestH.y };
            vel = { vx: 0, vy: 0 };
            angularVel = 0;
            state = "ANCHORED";
            anchoredHandleId = handle.id;
            grabbedHandleId = handle.id;
            break;
          } else {
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
