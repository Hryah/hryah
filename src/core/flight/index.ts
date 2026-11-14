// flight/index.ts — Логіка Частини 2: Політ та робота космонавта на борту в невагомості.
// Чиста функція step(state, action) -> state без побічних ефектів.

import type {
  CauseEntry,
  Damage,
  DebugAction,
  FlightInput,
  FlightPhase,
  FlightResult,
  MarginId,
  PhaseOutput,
  SystemId,
} from '../contracts';
import { eclipseFraction, fuelLeftKg, nextRandom, orbitalPeriodS } from '../physics';
import cabinConfig from '../../data/flight-cabin.json';

export type CabinWall = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type CabinNodeKind = 'handrail' | 'console';

export interface CabinNode {
  readonly id: string;
  readonly kind: CabinNodeKind;
  readonly wall: CabinWall;
  readonly xM: number;
  readonly yM: number;
  readonly titleKey: string;
  readonly system: SystemId | null;
}

export interface AstronautState {
  readonly xM: number;
  readonly yM: number;
  readonly vxMs: number;
  readonly vyMs: number;
  readonly angleDeg: number;
  readonly omegaDegS: number;
  readonly grabbedNodeId: string | null;
  readonly targetNodeId: string | null;
  readonly lastHopFast: boolean;
}

export type FlightTaskStatus = 'pending' | 'active' | 'resolved' | 'failed';

export interface FlightTask {
  readonly id: string;
  readonly consoleId: string;
  readonly system: SystemId;
  readonly titleKey: string;
  readonly resolvedKey: string;
  readonly failureKey: string;
  readonly status: FlightTaskStatus;
  readonly spawnAtS: number;
  readonly ttlS: number;
  readonly maxTtlS: number;
  readonly severityPenalty: number;
  readonly dvPenaltyMs: number;
  readonly fuelPenaltyKg: number;
  readonly targetValue: number;
  readonly currentValue: number;
  readonly causedBy: readonly string[];
}

export interface FlightState {
  readonly input: FlightInput;
  readonly rngState: number;
  readonly elapsedS: number;
  readonly durationS: number;
  readonly cabinWidthM: number;
  readonly cabinHeightM: number;
  readonly grabRadiusM: number;
  readonly fastHopMaxDistM: number;
  readonly nodes: readonly CabinNode[];
  readonly astronaut: AstronautState;
  readonly tasks: readonly FlightTask[];
  readonly panelAngleDeg: number;
  readonly targetPanelAngleDeg: number;
  readonly cabinTempC: number;
  readonly targetTempC: number;
  readonly dvPenaltyMs: number;
  readonly extraFuelBurnedKg: number;
  readonly damages: readonly Damage[];
  readonly log: readonly CauseEntry[];
  readonly done: boolean;
}

export type FlightAction =
  | { type: 'tick'; dtS: number }
  | { type: 'pushOff'; targetNodeId: string }
  | { type: 'pushVector'; vxMs: number; vyMs: number }
  | { type: 'interactConsole'; consoleId: string; value?: number }
  | { type: 'solveTask'; taskId: string }
  | { type: 'separatePayload' }
  | { type: 'completeFlight' };

const CABIN_NODES: readonly CabinNode[] = cabinConfig.nodes.map((n) => ({
  id: n.id,
  kind: n.kind as CabinNodeKind,
  wall: n.wall as CabinWall,
  xM: n.xM,
  yM: n.yM,
  titleKey: n.titleKey,
  system: ((n as { system?: string }).system as SystemId | undefined) ?? null,
}));

function clamp(val: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, val));
}

function hasMarginOk(input: FlightInput, id: MarginId): boolean {
  const found = input.spec.margins.find((m) => m.id === id);
  return found ? found.ok : true;
}

function mergeDamage(existing: readonly Damage[], system: SystemId, addedSeverity: number): Damage[] {
  const rounded = Math.round(clamp(addedSeverity, 0, 1) * 100) / 100;
  if (rounded <= 0) return [...existing];
  const found = existing.find((d) => d.system === system);
  if (!found) {
    return [...existing, { system, severity: rounded }];
  }
  return existing.map((d) =>
    d.system === system
      ? { ...d, severity: Math.round(clamp(d.severity + rounded, 0, 1) * 100) / 100 }
      : d,
  );
}

function buildInitialTasks(input: FlightInput, seed: number): { tasks: FlightTask[]; nextRng: number } {
  const { spec } = input;
  let rng = seed;

  const dvOk = hasMarginOk(input, 'dv');
  const energyOk = hasMarginOk(input, 'energy');
  const linkOk = hasMarginOk(input, 'link');
  const massOk = hasMarginOk(input, 'mass');
  const highPowerInstrument = spec.instrumentW >= 30;

  let r1 = 0;
  [r1, rng] = nextRandom(rng);
  const targetAngleDeg = Math.round(35 + r1 * 35);

  let r2 = 0;
  [r2, rng] = nextRandom(rng);
  const initialTempC = Math.round(28 + (highPowerInstrument ? 10 : 4) + r2 * 6);

  const propulsionTtlS = !dvOk || !massOk ? 28 : 50;
  const solarTtlS = !energyOk ? 30 : 55;
  const thermalTtlS = highPowerInstrument || !energyOk ? 32 : 55;
  const commsTtlS = !linkOk ? 32 : 60;

  const tasks: FlightTask[] = [
    {
      id: 'task:propulsion-burn',
      consoleId: 'console-propulsion',
      system: 'propulsion',
      titleKey: 'flight.task.propulsionBurn',
      resolvedKey: 'flight.resolved.propulsion',
      failureKey: 'flight.failure.propulsionTimeout',
      status: 'active',
      spawnAtS: 0,
      ttlS: propulsionTtlS,
      maxTtlS: propulsionTtlS,
      severityPenalty: !dvOk || !massOk ? 0.45 : 0.25,
      dvPenaltyMs: !dvOk ? 60 : 35,
      fuelPenaltyKg: 1.5,
      targetValue: 100,
      currentValue: !dvOk ? 60 : 80,
      causedBy: ['design:engine', 'design:instrument'],
    },
    {
      id: 'task:solar-angle',
      consoleId: 'console-solar',
      system: 'power',
      titleKey: 'flight.task.solarAngle',
      resolvedKey: 'flight.resolved.solar',
      failureKey: 'flight.failure.solarTimeout',
      status: 'active',
      spawnAtS: 0,
      ttlS: solarTtlS,
      maxTtlS: solarTtlS,
      severityPenalty: !energyOk ? 0.5 : 0.25,
      dvPenaltyMs: 0,
      fuelPenaltyKg: 0,
      targetValue: targetAngleDeg,
      currentValue: 0,
      causedBy: ['design:solar', 'design:battery'],
    },
    {
      id: 'task:thermal-stabilize',
      consoleId: 'console-thermal',
      system: 'thermal',
      titleKey: 'flight.task.thermalStabilize',
      resolvedKey: 'flight.resolved.thermal',
      failureKey: 'flight.failure.thermalTimeout',
      status: highPowerInstrument || !energyOk ? 'active' : 'pending',
      spawnAtS: highPowerInstrument || !energyOk ? 0 : 8,
      ttlS: thermalTtlS,
      maxTtlS: thermalTtlS,
      severityPenalty: highPowerInstrument ? 0.45 : 0.25,
      dvPenaltyMs: 0,
      fuelPenaltyKg: 0,
      targetValue: 20,
      currentValue: initialTempC,
      causedBy: ['design:instrument', 'design:battery'],
    },
    {
      id: 'task:comms-beacon',
      consoleId: 'console-comms',
      system: 'comms',
      titleKey: 'flight.task.commsBeacon',
      resolvedKey: 'flight.resolved.comms',
      failureKey: 'flight.failure.commsTimeout',
      status: !linkOk ? 'active' : 'pending',
      spawnAtS: !linkOk ? 0 : 14,
      ttlS: commsTtlS,
      maxTtlS: commsTtlS,
      severityPenalty: !linkOk ? 0.45 : 0.2,
      dvPenaltyMs: 0,
      fuelPenaltyKg: 0,
      targetValue: 100,
      currentValue: 40,
      causedBy: ['design:antenna', 'design:instrument'],
    },
  ];

  return { tasks, nextRng: rng };
}

function resolveTaskById(state: FlightState, taskId: string): FlightState {
  const targetTask = state.tasks.find((t) => t.id === taskId);
  if (!targetTask || targetTask.status === 'resolved' || targetTask.status === 'failed') {
    return state;
  }

  const targetNode = state.nodes.find((n) => n.id === targetTask.consoleId);
  const nextAstronaut: AstronautState = targetNode
    ? {
        xM: targetNode.xM,
        yM: targetNode.yM,
        vxMs: 0,
        vyMs: 0,
        angleDeg: 0,
        omegaDegS: 0,
        grabbedNodeId: targetNode.id,
        targetNodeId: null,
        lastHopFast: true,
      }
    : state.astronaut;

  const updatedTasks = state.tasks.map((t) =>
    t.id === taskId
      ? { ...t, status: 'resolved' as const, currentValue: t.targetValue }
      : t,
  );

  const eventEntry: CauseEntry = {
    id: `flight:resolved-${taskId.replace('task:', '')}`,
    phase: 'flight',
    tS: Math.round(state.elapsedS),
    kind: 'event',
    system: targetTask.system,
    messageKey: targetTask.resolvedKey,
    params: { consoleId: targetTask.consoleId, value: targetTask.targetValue },
  };

  return {
    ...state,
    astronaut: nextAstronaut,
    tasks: updatedTasks,
    panelAngleDeg:
      targetTask.id === 'task:solar-angle' ? targetTask.targetValue : state.panelAngleDeg,
    cabinTempC:
      targetTask.id === 'task:thermal-stabilize' ? targetTask.targetValue : state.cabinTempC,
    log: [...state.log, eventEntry],
  };
}

function triggerSeparation(state: FlightState): FlightState {
  let nextTasks = [...state.tasks];
  let nextDamages = [...state.damages];
  let nextLog = [...state.log];
  let nextDvPenaltyMs = state.dvPenaltyMs;
  let nextExtraFuelKg = state.extraFuelBurnedKg;

  // Якщо гравець тисне аварійне відділення до розв'язання активних криз, фіксуємо їхні наслідки
  for (let i = 0; i < nextTasks.length; i++) {
    const t = nextTasks[i]!;
    if (t.status === 'active') {
      nextTasks[i] = { ...t, status: 'failed', ttlS: 0 };
      nextDamages = mergeDamage(nextDamages, t.system, t.severityPenalty);
      nextDvPenaltyMs += t.dvPenaltyMs;
      nextExtraFuelKg += t.fuelPenaltyKg;
      nextLog = [
        ...nextLog,
        {
          id: `flight:failed-${t.id.replace('task:', '')}`,
          phase: 'flight',
          tS: Math.round(state.elapsedS),
          kind: 'failure',
          system: t.system,
          messageKey: t.failureKey,
          params: { consoleId: t.consoleId },
          causedBy: [...t.causedBy],
        },
      ];
    }
  }

  const sepNode = state.nodes.find((n) => n.id === 'console-separation');
  const nextAstronaut: AstronautState = sepNode
    ? {
        xM: sepNode.xM,
        yM: sepNode.yM,
        vxMs: 0,
        vyMs: 0,
        angleDeg: 0,
        omegaDegS: 0,
        grabbedNodeId: sepNode.id,
        targetNodeId: null,
        lastHopFast: true,
      }
    : state.astronaut;

  nextLog = [
    ...nextLog,
    {
      id: 'flight:separated',
      phase: 'flight',
      tS: Math.round(state.elapsedS),
      kind: 'event',
      system: 'structure',
      messageKey: 'flight.resolved.separation',
    },
  ];

  return {
    ...state,
    astronaut: nextAstronaut,
    tasks: nextTasks,
    damages: nextDamages,
    dvPenaltyMs: nextDvPenaltyMs,
    extraFuelBurnedKg: nextExtraFuelKg,
    log: nextLog,
    done: true,
  };
}

function advanceTick(state: FlightState, rawDtS: number): FlightState {
  const dtS = clamp(rawDtS, 0, 30);
  if (dtS <= 0 || state.done) return state;

  const nextElapsedS = Math.round((state.elapsedS + dtS) * 100) / 100;

  // 1. Рух космонавта в невагомості (якщо відштовхнувся від ручки)
  let astro = state.astronaut;
  if (astro.grabbedNodeId === null) {
    let nextXM = astro.xM + astro.vxMs * dtS;
    let nextYM = astro.yM + astro.vyMs * dtS;
    let nextVxMs = astro.vxMs;
    let nextVyMs = astro.vyMs;
    const nextAngleDeg = (astro.angleDeg + astro.omegaDegS * dtS) % 360;

    // Відбивання від стінок герметичної кабіни
    const marginM = 0.6;
    if (nextXM < marginM) {
      nextXM = marginM;
      nextVxMs = Math.abs(nextVxMs) * 0.75;
    } else if (nextXM > state.cabinWidthM - marginM) {
      nextXM = state.cabinWidthM - marginM;
      nextVxMs = -Math.abs(nextVxMs) * 0.75;
    }
    if (nextYM < marginM) {
      nextYM = marginM;
      nextVyMs = Math.abs(nextVyMs) * 0.75;
    } else if (nextYM > state.cabinHeightM - marginM) {
      nextYM = state.cabinHeightM - marginM;
      nextVyMs = -Math.abs(nextVyMs) * 0.75;
    }

    // Перевірка захвату цільової або попутної ручки/пульта
    let grabbedId: string | null = null;
    let snappedXM = nextXM;
    let snappedYM = nextYM;

    const targetNode = astro.targetNodeId
      ? state.nodes.find((n) => n.id === astro.targetNodeId)
      : undefined;

    if (targetNode) {
      const distToTargetM = Math.hypot(targetNode.xM - nextXM, targetNode.yM - nextYM);
      const stepDistM = Math.hypot(astro.vxMs * dtS, astro.vyMs * dtS);
      if (distToTargetM <= Math.max(state.grabRadiusM, stepDistM * 0.85)) {
        grabbedId = targetNode.id;
        snappedXM = targetNode.xM;
        snappedYM = targetNode.yM;
      }
    } else {
      for (const node of state.nodes) {
        const distM = Math.hypot(node.xM - nextXM, node.yM - nextYM);
        if (distM <= state.grabRadiusM * 0.85) {
          grabbedId = node.id;
          snappedXM = node.xM;
          snappedYM = node.yM;
          break;
        }
      }
    }

    astro =
      grabbedId !== null
        ? {
            xM: Math.round(snappedXM * 100) / 100,
            yM: Math.round(snappedYM * 100) / 100,
            vxMs: 0,
            vyMs: 0,
            angleDeg: 0,
            omegaDegS: 0,
            grabbedNodeId: grabbedId,
            targetNodeId: null,
            lastHopFast: astro.lastHopFast,
          }
        : {
            ...astro,
            xM: Math.round(nextXM * 100) / 100,
            yM: Math.round(nextYM * 100) / 100,
            vxMs: Math.round(nextVxMs * 100) / 100,
            vyMs: Math.round(nextVyMs * 100) / 100,
            angleDeg: Math.round(nextAngleDeg * 10) / 10,
          };
  }

  // 2. Оновлення таймерів задач та активація запланованих криз
  let nextDamages = [...state.damages];
  let nextLog = [...state.log];
  let nextDvPenaltyMs = state.dvPenaltyMs;
  let nextExtraFuelKg = state.extraFuelBurnedKg;

  const nextTasks = state.tasks.map((t) => {
    if (t.status === 'pending') {
      if (nextElapsedS >= t.spawnAtS) {
        return { ...t, status: 'active' as const };
      }
      return t;
    }
    if (t.status === 'active') {
      const remS = Math.round((t.ttlS - dtS) * 100) / 100;
      if (remS <= 0) {
        nextDamages = mergeDamage(nextDamages, t.system, t.severityPenalty);
        nextDvPenaltyMs += t.dvPenaltyMs;
        nextExtraFuelKg += t.fuelPenaltyKg;
        nextLog = [
          ...nextLog,
          {
            id: `flight:timeout-${t.id.replace('task:', '')}`,
            phase: 'flight',
            tS: Math.round(nextElapsedS),
            kind: 'failure',
            system: t.system,
            messageKey: t.failureKey,
            params: { consoleId: t.consoleId },
            causedBy: [...t.causedBy],
          },
        ];
        return { ...t, status: 'failed' as const, ttlS: 0 };
      }
      return { ...t, ttlS: remS };
    }
    return t;
  });

  // Якщо космонавт прилетів на пульт із активною задачею, він одразу виконує роботу на пульті
  let nextState: FlightState = {
    ...state,
    elapsedS: nextElapsedS,
    astronaut: astro,
    tasks: nextTasks,
    damages: nextDamages,
    dvPenaltyMs: nextDvPenaltyMs,
    extraFuelBurnedKg: nextExtraFuelKg,
    log: nextLog,
  };

  if (astro.grabbedNodeId !== null) {
    const activeAtConsole = nextState.tasks.find(
      (t) => t.consoleId === astro.grabbedNodeId && t.status === 'active',
    );
    if (activeAtConsole) {
      nextState = resolveTaskById(nextState, activeAtConsole.id);
    }
  }

  // Якщо час польоту вичерпано — автоматичне відділення супутника
  if (nextState.elapsedS >= nextState.durationS && !nextState.done) {
    return triggerSeparation(nextState);
  }

  return nextState;
}

export const flightPhase: FlightPhase<FlightState, FlightAction> = {
  init(input: FlightInput, seed: number): FlightState {
    const startNode = CABIN_NODES[0]!;
    const { tasks, nextRng } = buildInitialTasks(input, seed);
    const solarTask = tasks.find((t) => t.id === 'task:solar-angle');
    const thermalTask = tasks.find((t) => t.id === 'task:thermal-stabilize');

    return {
      input,
      rngState: nextRng,
      elapsedS: 0,
      durationS: cabinConfig.flightDurationS,
      cabinWidthM: cabinConfig.cabinWidthM,
      cabinHeightM: cabinConfig.cabinHeightM,
      grabRadiusM: cabinConfig.grabRadiusM,
      fastHopMaxDistM: cabinConfig.fastHopMaxDistM,
      nodes: CABIN_NODES,
      astronaut: {
        xM: startNode.xM,
        yM: startNode.yM,
        vxMs: 0,
        vyMs: 0,
        angleDeg: 0,
        omegaDegS: 0,
        grabbedNodeId: startNode.id,
        targetNodeId: null,
        lastHopFast: true,
      },
      tasks,
      panelAngleDeg: 0,
      targetPanelAngleDeg: solarTask ? solarTask.targetValue : 45,
      cabinTempC: thermalTask ? thermalTask.currentValue : 24,
      targetTempC: 20,
      dvPenaltyMs: 0,
      extraFuelBurnedKg: 0,
      damages: [],
      log: [],
      done: false,
    };
  },

  step(state: FlightState, action: FlightAction): FlightState {
    if (state.done) return state;

    switch (action.type) {
      case 'tick':
        return advanceTick(state, action.dtS);

      case 'pushOff': {
        const target = state.nodes.find((n) => n.id === action.targetNodeId);
        if (!target) return state;
        const dxM = target.xM - state.astronaut.xM;
        const dyM = target.yM - state.astronaut.yM;
        const distM = Math.hypot(dxM, dyM);
        if (distM < 0.25) {
          const snapped: FlightState = {
            ...state,
            astronaut: {
              xM: target.xM,
              yM: target.yM,
              vxMs: 0,
              vyMs: 0,
              angleDeg: 0,
              omegaDegS: 0,
              grabbedNodeId: target.id,
              targetNodeId: null,
              lastHopFast: true,
            },
          };
          const activeHere = snapped.tasks.find(
            (t) => t.consoleId === target.id && t.status === 'active',
          );
          return activeHere ? resolveTaskById(snapped, activeHere.id) : snapped;
        }

        // Механіка з ескізу: короткий стрибок по сусідніх ручках швидкий і точний,
        // а довгий переліт через усю секцію повільніший і закручує космонавта
        const isFastHop = distM <= state.fastHopMaxDistM;
        const speedMs = isFastHop ? cabinConfig.pushSpeedFastMs : cabinConfig.pushSpeedLongMs;
        const omegaDegS = isFastHop ? 45 : 135;

        return {
          ...state,
          astronaut: {
            xM: state.astronaut.xM,
            yM: state.astronaut.yM,
            vxMs: Math.round(((dxM / distM) * speedMs) * 100) / 100,
            vyMs: Math.round(((dyM / distM) * speedMs) * 100) / 100,
            angleDeg: state.astronaut.angleDeg,
            omegaDegS,
            grabbedNodeId: null,
            targetNodeId: target.id,
            lastHopFast: isFastHop,
          },
        };
      }

      case 'pushVector': {
        const speedMs = Math.hypot(action.vxMs, action.vyMs);
        if (speedMs < 0.05) return state;
        const maxSpeedMs = cabinConfig.pushSpeedFastMs * 1.25;
        const scale = speedMs > maxSpeedMs ? maxSpeedMs / speedMs : 1;
        return {
          ...state,
          astronaut: {
            ...state.astronaut,
            vxMs: Math.round(action.vxMs * scale * 100) / 100,
            vyMs: Math.round(action.vyMs * scale * 100) / 100,
            omegaDegS: speedMs > 3 ? 60 : 110,
            grabbedNodeId: null,
            targetNodeId: null,
            lastHopFast: speedMs >= 3,
          },
        };
      }

      case 'interactConsole': {
        if (action.consoleId === 'console-separation') {
          return triggerSeparation(state);
        }
        const task = state.tasks.find((t) => t.consoleId === action.consoleId);
        if (!task) return state;
        const activated =
          task.status === 'pending'
            ? {
                ...state,
                tasks: state.tasks.map((t) =>
                  t.id === task.id ? { ...t, status: 'active' as const } : t,
                ),
              }
            : state;
        return resolveTaskById(activated, task.id);
      }

      case 'solveTask': {
        const task = state.tasks.find((t) => t.id === action.taskId);
        if (!task) return state;
        const activated =
          task.status === 'pending'
            ? {
                ...state,
                tasks: state.tasks.map((t) =>
                  t.id === task.id ? { ...t, status: 'active' as const } : t,
                ),
              }
            : state;
        return resolveTaskById(activated, task.id);
      }

      case 'separatePayload':
        return triggerSeparation(state);

      case 'completeFlight': {
        let cur = state;
        for (const t of cur.tasks) {
          if (t.status === 'pending' || t.status === 'active') {
            const activated =
              t.status === 'pending'
                ? {
                    ...cur,
                    tasks: cur.tasks.map((item) =>
                      item.id === t.id ? { ...item, status: 'active' as const } : item,
                    ),
                  }
                : cur;
            cur = resolveTaskById(activated, t.id);
          }
        }
        return triggerSeparation(cur);
      }
    }
  },

  isDone(state: FlightState): boolean {
    return state.done;
  },

  finish(state: FlightState): PhaseOutput<FlightResult> {
    const { mission, spec } = state.input;
    const outLog: CauseEntry[] = [...state.log];
    let outDamages: Damage[] = [...state.damages];

    const massOk = hasMarginOk(state.input, 'mass');
    if (!massOk) {
      outDamages = mergeDamage(outDamages, 'structure', 0.35);
      outLog.push({
        id: 'flight:overweight',
        phase: 'flight',
        tS: Math.round(state.elapsedS),
        kind: 'failure',
        system: 'structure',
        messageKey: 'flight.failure.overweight',
        params: { wetMassKg: Math.round(spec.wetMassKg) },
        causedBy: ['design:engine', 'design:instrument'],
      });
    }

    const effectiveDvMs = Math.max(0, spec.dvMs - state.dvPenaltyMs);
    const reached = effectiveDvMs >= mission.dvRequiredMs;

    const altKm = reached
      ? spec.design.altKm
      : Math.round(
          (mission.altRangeKm[0] * 0.5 +
            (spec.design.altKm - mission.altRangeKm[0] * 0.5) *
              clamp(effectiveDvMs / mission.dvRequiredMs, 0, 1)) *
            10,
        ) / 10;

    if (!reached) {
      outLog.push({
        id: 'flight:low-orbit',
        phase: 'flight',
        tS: Math.round(state.elapsedS),
        kind: 'failure',
        system: 'propulsion',
        messageKey: 'flight.failure.lowOrbit',
        params: { haveMs: Math.round(effectiveDvMs), needMs: mission.dvRequiredMs },
        causedBy: ['design:engine', 'design:instrument'],
      });
    }

    const rawFuelLeftKg = reached
      ? fuelLeftKg(spec.ispS, spec.dryMassKg, spec.fuelKg, mission.dvRequiredMs)
      : 0;
    const finalFuelLeftKg = Math.max(
      0,
      Math.round((rawFuelLeftKg - state.extraFuelBurnedKg) * 100) / 100,
    );

    return {
      result: {
        orbit: {
          altKm,
          periodS: orbitalPeriodS(mission.body, altKm),
          eclipseFraction: eclipseFraction(mission.body, altKm),
        },
        fuelLeftKg: finalFuelLeftKg,
        damage: outDamages,
      },
      log: outLog,
    };
  },

  debugActions(state: FlightState): DebugAction<FlightAction>[] {
    const actions: DebugAction<FlightAction>[] = [];

    // 1. Час симуляції
    actions.push(
      { group: 'time', label: '+2s tick', action: { type: 'tick', dtS: 2 } },
      { group: 'time', label: '+5s tick', action: { type: 'tick', dtS: 5 } },
    );

    // 2. Стрибки космонавта по ручках та пультах
    for (const node of state.nodes) {
      const isHere = state.astronaut.grabbedNodeId === node.id;
      actions.push({
        group: node.kind === 'handrail' ? 'handrails' : 'consoles (pushOff)',
        label: isHere ? `● ${node.id}` : `→ ${node.id}`,
        action: { type: 'pushOff', targetNodeId: node.id },
      });
    }

    // 3. Швидке виконання задач на пультах (спрощений режим кліком)
    for (const t of state.tasks) {
      const icon = t.status === 'resolved' ? '✓' : t.status === 'failed' ? '✗' : '⚡';
      actions.push({
        group: 'tasks (consoles)',
        label: `${icon} ${t.id.replace('task:', '')} (${Math.ceil(t.ttlS)}s)`,
        action: { type: 'solveTask', taskId: t.id },
      });
    }

    // 4. Відділення супутника та повний автопрохід (остання дія для ботів / game.test.ts)
    actions.push(
      { group: 'go', label: 'Відділити супутник зараз', action: { type: 'separatePayload' } },
      { group: 'go', label: 'Завершити політ (штатно)', action: { type: 'completeFlight' } },
    );

    return actions;
  },
};
