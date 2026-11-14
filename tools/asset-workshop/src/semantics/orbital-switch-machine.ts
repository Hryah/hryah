export type OrbitalSwitchId = 'camera' | 'transmitter' | 'heater' | 'safeMode';
export type OrbitalWindowId = 'idle_sun' | 'imaging' | 'pass' | 'shadow';

export type SubsystemVisualState =
  | 'ACTIVE'
  | 'OVERFLOW_DISCARDING'
  | 'STANDBY_WINDOW'
  | 'STANDBY_BUFFER_EMPTY'
  | 'BLOCKED_SAFE'
  | 'BLOCKED_COLD'
  | 'BLOCKED_DAMAGE'
  | 'BLOCKED_NO_POWER'
  | 'MISSION_ENDED'
  | 'OFF';

export interface OrbitalDamageState {
  power: number;
  comms: number;
  science: number;
  thermal: number;
  structure: number;
}

export interface OrbitalWorkshopState {
  mode: 'plan' | 'preview';
  orbitNumber: number;
  totalOrbits: number;
  window: OrbitalWindowId;
  storm: boolean;
  coldStress: number; // 0..2 (at >= 2 camera is cold-locked)
  chargeWh: number;
  capacityWh: number;
  bufferMb: number;
  bufferCapacityMb: number;
  deliveredMb: number;
  discardedMb: number;
  missionEnded: boolean;
  damage: OrbitalDamageState;
  /** Current player switch positions */
  commands: Record<OrbitalSwitchId, boolean>;
  /** Saved player commands before Safe Mode was turned ON */
  savedBeforeSafe: {
    camera: boolean;
    transmitter: boolean;
    heater: boolean;
  };
}

export interface SubsystemEvaluation {
  id: OrbitalSwitchId;
  commanded: boolean;
  savedInSafe: boolean;
  overriddenBySafe: boolean;
  effectiveActive: boolean;
  visualState: SubsystemVisualState;
  reasonKey: string;
  targetClip: string;
  vfxVisible: boolean;
}

export interface OrbitalEvaluationSummary {
  inoperable: boolean;
  lighting: 'sunlight' | 'shadow';
  solarChargingActive: boolean;
  solarClip: string;
  busClip: string;
  subsystems: Record<OrbitalSwitchId, SubsystemEvaluation>;
  vfxFlags: {
    vfx_scan_cone: boolean;
    vfx_downlink_beam: boolean;
    vfx_thruster_plume: boolean;
    vfx_heater_glow: boolean;
    vfx_cold_frost: boolean;
    vfx_storm_particles: boolean;
  };
  forecastNextOrbit: {
    predictedEndChargeWh: number;
    predictedGeneratedMb: number;
    predictedDeliveredMb: number;
    predictedDiscardedMb: number;
    predictedNextColdStress: number;
    powerFailureRisk: boolean;
  };
}

export function createInitialOrbitalWorkshopState(): OrbitalWorkshopState {
  return {
    mode: 'preview',
    orbitNumber: 1,
    totalOrbits: 10,
    window: 'imaging',
    storm: false,
    coldStress: 0,
    chargeWh: 52,
    capacityWh: 60,
    bufferMb: 1440,
    bufferCapacityMb: 4000,
    deliveredMb: 2400,
    discardedMb: 0,
    missionEnded: false,
    damage: {
      power: 0,
      comms: 0,
      science: 0,
      thermal: 0,
      structure: 0,
    },
    commands: {
      camera: true,
      transmitter: true,
      heater: true,
      safeMode: false,
    },
    savedBeforeSafe: {
      camera: true,
      transmitter: true,
      heater: true,
    },
  };
}

/**
 * Pure toggle transition: handles SAFE Mode saving/restoring of camera/transmitter/heater commands.
 * In Turn Plan mode (just like the game), toggling switches NEVER changes orbitNumber, chargeWh, bufferMb, or deliveredMb.
 */
export function toggleOrbitalSwitch(
  state: OrbitalWorkshopState,
  id: OrbitalSwitchId,
): OrbitalWorkshopState {
  if (state.missionEnded) return state;

  if (id === 'safeMode') {
    const turningSafeOn = !state.commands.safeMode;
    if (turningSafeOn) {
      return {
        ...state,
        savedBeforeSafe: {
          camera: state.commands.camera,
          transmitter: state.commands.transmitter,
          heater: state.commands.heater,
        },
        commands: {
          camera: false,
          transmitter: false,
          heater: state.damage.thermal < 1,
          safeMode: true,
        },
      };
    } else {
      return {
        ...state,
        commands: {
          camera: state.savedBeforeSafe.camera,
          transmitter: state.savedBeforeSafe.transmitter,
          heater: state.savedBeforeSafe.heater,
          safeMode: false,
        },
      };
    }
  }

  // If Safe Mode is currently ON, individual camera/transmitter/heater commands are locked/remembered in savedBeforeSafe
  if (state.commands.safeMode) {
    return {
      ...state,
      savedBeforeSafe: {
        ...state.savedBeforeSafe,
        [id]: !state.savedBeforeSafe[id],
      },
    };
  }

  const nextVal = !state.commands[id];
  return {
    ...state,
    commands: {
      ...state.commands,
      [id]: nextVal,
    },
    savedBeforeSafe: {
      ...state.savedBeforeSafe,
      [id]: nextVal,
    },
  };
}

/**
 * Evaluates the exact priority hierarchy from Section 4 of docs/ASSET_WORKSHOP_TASK.md:
 * 1. Mission Ended -> all working effects stopped
 * 2. No Power / Spacecraft Inoperable -> all actions stopped
 * 3. SAFE Mode restrictions -> camera & tx parked, available heater allowed
 * 4. Subsystem damage & cold lock (coldStress >= 2)
 * 5. Allowed orbital window & buffer conditions
 * 6. Player command ON / OFF
 */
export function evaluateOrbitalSemantics(state: OrbitalWorkshopState): OrbitalEvaluationSummary {
  const lighting: 'sunlight' | 'shadow' = state.window === 'shadow' ? 'shadow' : 'sunlight';
  const inoperable =
    state.chargeWh <= 0 || state.damage.power >= 1 || state.damage.structure >= 1;
  const safeActive = state.commands.safeMode;

  // Forecast calculation for a full orbit (using same schedule as src/core/orbit/phase.ts)
  const stormFactor = state.storm ? 0.5 : 1.0;
  const panelW = 160 * (1 - state.damage.power) * stormFactor;
  const baseLoadW = 20;
  const instrumentW = 30;
  const transmitterW = 30;
  const heaterW = 15;
  const instrumentRateMbps = 8 * (1 - state.damage.science);
  const downlinkMbps = 10 * (1 - state.damage.comms) * stormFactor;

  const canCameraRunOnOrbit =
    !state.missionEnded &&
    !inoperable &&
    !safeActive &&
    state.commands.camera &&
    state.coldStress < 2 &&
    instrumentRateMbps > 0;

  const canTxRunOnOrbit =
    !state.missionEnded &&
    !inoperable &&
    !safeActive &&
    state.commands.transmitter &&
    downlinkMbps > 0;

  const canHeaterRunOnOrbit =
    !state.missionEnded &&
    !inoperable &&
    (state.commands.heater || safeActive) &&
    state.damage.thermal < 1;

  // Simulate 1 full orbit (idleSun 2602s, imaging 300s, pass 480s, shadow 2163s)
  let simCharge = state.chargeWh;
  let simBuffer = state.bufferMb;
  let simGenerated = 0;
  let simDelivered = 0;
  let simDiscarded = 0;
  let powerFailureRisk = inoperable;

  const stepSegment = (dtS: number, genW: number, loadW: number) => {
    if (powerFailureRisk) return 0;
    const netW = genW - loadW;
    if (netW < 0) {
      const maxS = (simCharge * 3600) / -netW;
      if (maxS <= dtS) {
        simCharge = 0;
        powerFailureRisk = true;
        return maxS;
      }
    }
    simCharge = Math.min(state.capacityWh * (1 - state.damage.power), Math.max(0, simCharge + (netW * dtS) / 3600));
    return dtS;
  };

  stepSegment(2602, panelW, baseLoadW);
  const imgElapsed = stepSegment(300, panelW, baseLoadW + (canCameraRunOnOrbit ? instrumentW : 0));
  if (canCameraRunOnOrbit && imgElapsed > 0) {
    simGenerated = instrumentRateMbps * imgElapsed;
    const free = Math.max(0, state.bufferCapacityMb - simBuffer);
    const stored = Math.min(simGenerated, free);
    simBuffer += stored;
    simDiscarded = Math.max(0, simGenerated - stored);
  }
  const txNeededS = canTxRunOnOrbit && downlinkMbps > 0 ? Math.min(480, simBuffer / downlinkMbps) : 0;
  const txElapsed = stepSegment(txNeededS, panelW, baseLoadW + transmitterW);
  if (canTxRunOnOrbit && txElapsed > 0) {
    simDelivered = Math.min(simBuffer, downlinkMbps * txElapsed);
    simBuffer = Math.max(0, simBuffer - simDelivered);
  }
  stepSegment(480 - txNeededS, panelW, baseLoadW);
  stepSegment(2163, 0, baseLoadW + (canHeaterRunOnOrbit ? heaterW : 0));

  const predictedNextColdStress = powerFailureRisk
    ? state.coldStress
    : Math.min(2, Math.max(0, state.coldStress + (canHeaterRunOnOrbit ? -(1 - state.damage.thermal) : 1)));

  // ── 1. Evaluate CAMERA right now ──
  let camEval: SubsystemEvaluation;
  if (state.missionEnded) {
    camEval = {
      id: 'camera',
      commanded: state.commands.camera,
      savedInSafe: state.savedBeforeSafe.camera,
      overriddenBySafe: safeActive,
      effectiveActive: false,
      visualState: 'MISSION_ENDED',
      reasonKey: 'reason.common.missionEnded',
      targetClip: 'park',
      vfxVisible: false,
    };
  } else if (inoperable) {
    camEval = {
      id: 'camera',
      commanded: state.commands.camera,
      savedInSafe: state.savedBeforeSafe.camera,
      overriddenBySafe: safeActive,
      effectiveActive: false,
      visualState: 'BLOCKED_NO_POWER',
      reasonKey: 'reason.common.noPower',
      targetClip: 'park',
      vfxVisible: false,
    };
  } else if (safeActive) {
    camEval = {
      id: 'camera',
      commanded: false,
      savedInSafe: state.savedBeforeSafe.camera,
      overriddenBySafe: true,
      effectiveActive: false,
      visualState: 'BLOCKED_SAFE',
      reasonKey: 'reason.camera.safeOverride',
      targetClip: 'park',
      vfxVisible: false,
    };
  } else if (state.damage.science >= 1) {
    camEval = {
      id: 'camera',
      commanded: state.commands.camera,
      savedInSafe: state.savedBeforeSafe.camera,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'BLOCKED_DAMAGE',
      reasonKey: 'reason.camera.damaged',
      targetClip: 'park',
      vfxVisible: false,
    };
  } else if (state.coldStress >= 2) {
    camEval = {
      id: 'camera',
      commanded: state.commands.camera,
      savedInSafe: state.savedBeforeSafe.camera,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'BLOCKED_COLD',
      reasonKey: 'reason.camera.coldLocked',
      targetClip: 'cold_locked',
      vfxVisible: false,
    };
  } else if (!state.commands.camera) {
    camEval = {
      id: 'camera',
      commanded: false,
      savedInSafe: false,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'OFF',
      reasonKey: 'reason.camera.off',
      targetClip: 'park',
      vfxVisible: false,
    };
  } else if (state.window !== 'imaging') {
    camEval = {
      id: 'camera',
      commanded: true,
      savedInSafe: true,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'STANDBY_WINDOW',
      reasonKey: 'reason.camera.waitWindow',
      targetClip: 'aim',
      vfxVisible: false,
    };
  } else if (state.bufferMb >= state.bufferCapacityMb) {
    // Buffer full in imaging window: camera still scans and draws power, but discards new data!
    camEval = {
      id: 'camera',
      commanded: true,
      savedInSafe: true,
      overriddenBySafe: false,
      effectiveActive: true,
      visualState: 'OVERFLOW_DISCARDING',
      reasonKey: 'reason.camera.overflow',
      targetClip: 'scan',
      vfxVisible: true,
    };
  } else {
    camEval = {
      id: 'camera',
      commanded: true,
      savedInSafe: true,
      overriddenBySafe: false,
      effectiveActive: true,
      visualState: 'ACTIVE',
      reasonKey: 'reason.camera.scanning',
      targetClip: 'scan',
      vfxVisible: true,
    };
  }

  // ── 2. Evaluate TRANSMITTER right now ──
  let txEval: SubsystemEvaluation;
  if (state.missionEnded) {
    txEval = {
      id: 'transmitter',
      commanded: state.commands.transmitter,
      savedInSafe: state.savedBeforeSafe.transmitter,
      overriddenBySafe: safeActive,
      effectiveActive: false,
      visualState: 'MISSION_ENDED',
      reasonKey: 'reason.common.missionEnded',
      targetClip: 'standby',
      vfxVisible: false,
    };
  } else if (inoperable) {
    txEval = {
      id: 'transmitter',
      commanded: state.commands.transmitter,
      savedInSafe: state.savedBeforeSafe.transmitter,
      overriddenBySafe: safeActive,
      effectiveActive: false,
      visualState: 'BLOCKED_NO_POWER',
      reasonKey: 'reason.common.noPower',
      targetClip: 'standby',
      vfxVisible: false,
    };
  } else if (safeActive) {
    txEval = {
      id: 'transmitter',
      commanded: false,
      savedInSafe: state.savedBeforeSafe.transmitter,
      overriddenBySafe: true,
      effectiveActive: false,
      visualState: 'BLOCKED_SAFE',
      reasonKey: 'reason.tx.safeOverride',
      targetClip: 'standby',
      vfxVisible: false,
    };
  } else if (state.damage.comms >= 1) {
    txEval = {
      id: 'transmitter',
      commanded: state.commands.transmitter,
      savedInSafe: state.savedBeforeSafe.transmitter,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'BLOCKED_DAMAGE',
      reasonKey: 'reason.tx.damaged',
      targetClip: 'standby',
      vfxVisible: false,
    };
  } else if (!state.commands.transmitter) {
    txEval = {
      id: 'transmitter',
      commanded: false,
      savedInSafe: false,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'OFF',
      reasonKey: 'reason.tx.off',
      targetClip: 'standby',
      vfxVisible: false,
    };
  } else if (state.window !== 'pass') {
    txEval = {
      id: 'transmitter',
      commanded: true,
      savedInSafe: true,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'STANDBY_WINDOW',
      reasonKey: 'reason.tx.waitWindow',
      targetClip: 'aim',
      vfxVisible: false,
    };
  } else if (state.bufferMb <= 0) {
    txEval = {
      id: 'transmitter',
      commanded: true,
      savedInSafe: true,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'STANDBY_BUFFER_EMPTY',
      reasonKey: 'reason.tx.emptyBuffer',
      targetClip: 'standby',
      vfxVisible: false,
    };
  } else {
    txEval = {
      id: 'transmitter',
      commanded: true,
      savedInSafe: true,
      overriddenBySafe: false,
      effectiveActive: true,
      visualState: 'ACTIVE',
      reasonKey: state.storm ? 'reason.tx.storm' : 'reason.tx.transmitting',
      targetClip: 'transmit',
      vfxVisible: true,
    };
  }

  // ── 3. Evaluate HEATER right now ──
  let heaterEval: SubsystemEvaluation;
  const heaterWanted = safeActive || state.commands.heater;
  if (state.missionEnded) {
    heaterEval = {
      id: 'heater',
      commanded: state.commands.heater,
      savedInSafe: state.savedBeforeSafe.heater,
      overriddenBySafe: safeActive,
      effectiveActive: false,
      visualState: 'MISSION_ENDED',
      reasonKey: 'reason.common.missionEnded',
      targetClip: 'heater_off',
      vfxVisible: false,
    };
  } else if (inoperable) {
    heaterEval = {
      id: 'heater',
      commanded: state.commands.heater,
      savedInSafe: state.savedBeforeSafe.heater,
      overriddenBySafe: safeActive,
      effectiveActive: false,
      visualState: 'BLOCKED_NO_POWER',
      reasonKey: 'reason.common.noPower',
      targetClip: 'heater_off',
      vfxVisible: false,
    };
  } else if (state.damage.thermal >= 1) {
    heaterEval = {
      id: 'heater',
      commanded: heaterWanted,
      savedInSafe: state.savedBeforeSafe.heater,
      overriddenBySafe: safeActive,
      effectiveActive: false,
      visualState: 'BLOCKED_DAMAGE',
      reasonKey: 'reason.heater.damaged',
      targetClip: 'heater_off',
      vfxVisible: false,
    };
  } else if (!heaterWanted) {
    heaterEval = {
      id: 'heater',
      commanded: false,
      savedInSafe: false,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'OFF',
      reasonKey: lighting === 'shadow' ? 'reason.heater.offShadow' : 'reason.heater.offSun',
      targetClip: 'heater_off',
      vfxVisible: false,
    };
  } else if (lighting !== 'shadow') {
    heaterEval = {
      id: 'heater',
      commanded: true,
      savedInSafe: state.savedBeforeSafe.heater,
      overriddenBySafe: safeActive,
      effectiveActive: false,
      visualState: 'STANDBY_WINDOW',
      reasonKey: 'reason.heater.waitShadow',
      targetClip: 'idle',
      vfxVisible: false,
    };
  } else {
    heaterEval = {
      id: 'heater',
      commanded: true,
      savedInSafe: state.savedBeforeSafe.heater,
      overriddenBySafe: safeActive,
      effectiveActive: true,
      visualState: 'ACTIVE',
      reasonKey: safeActive ? 'reason.heater.forcedSafe' : 'reason.heater.heating',
      targetClip: 'heater_on',
      vfxVisible: true,
    };
  }

  // ── 4. Evaluate SAFE MODE right now ──
  let safeEval: SubsystemEvaluation;
  if (state.missionEnded) {
    safeEval = {
      id: 'safeMode',
      commanded: safeActive,
      savedInSafe: safeActive,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'MISSION_ENDED',
      reasonKey: 'reason.common.missionEnded',
      targetClip: 'idle',
      vfxVisible: false,
    };
  } else if (inoperable) {
    safeEval = {
      id: 'safeMode',
      commanded: safeActive,
      savedInSafe: safeActive,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'BLOCKED_NO_POWER',
      reasonKey: 'reason.common.noPower',
      targetClip: 'idle',
      vfxVisible: false,
    };
  } else if (safeActive) {
    safeEval = {
      id: 'safeMode',
      commanded: true,
      savedInSafe: true,
      overriddenBySafe: false,
      effectiveActive: true,
      visualState: 'ACTIVE',
      reasonKey: 'reason.safe.active',
      targetClip: 'safe_hold',
      vfxVisible: false,
    };
  } else {
    safeEval = {
      id: 'safeMode',
      commanded: false,
      savedInSafe: false,
      overriddenBySafe: false,
      effectiveActive: false,
      visualState: 'OFF',
      reasonKey: 'reason.safe.off',
      targetClip: 'idle',
      vfxVisible: false,
    };
  }

  const solarChargingActive = !state.missionEnded && !inoperable && lighting === 'sunlight';
  const solarClip = safeActive
    ? 'safe_feather'
    : solarChargingActive
      ? 'track_angle'
      : 'hold';
  const busClip = safeActive
    ? 'safe_hold'
    : heaterEval.effectiveActive
      ? 'heater_on'
      : 'idle';

  return {
    inoperable,
    lighting,
    solarChargingActive,
    solarClip,
    busClip,
    subsystems: {
      camera: camEval,
      transmitter: txEval,
      heater: heaterEval,
      safeMode: safeEval,
    },
    vfxFlags: {
      vfx_scan_cone: camEval.vfxVisible,
      vfx_downlink_beam: txEval.vfxVisible,
      // Engine thruster plume is NEVER active during passive orbital observation
      vfx_thruster_plume: false,
      vfx_heater_glow: heaterEval.vfxVisible,
      vfx_cold_frost: !state.missionEnded && state.coldStress >= 2,
      vfx_storm_particles: !state.missionEnded && !inoperable && state.storm,
    },
    forecastNextOrbit: {
      predictedEndChargeWh: Number(simCharge.toFixed(1)),
      predictedGeneratedMb: Math.round(simGenerated),
      predictedDeliveredMb: Math.round(simDelivered),
      predictedDiscardedMb: Math.round(simDiscarded),
      predictedNextColdStress: Number(predictedNextColdStress.toFixed(1)),
      powerFailureRisk,
    },
  };
}

/**
 * Advances one full orbit using the forecast calculation (when clicking "Next Orbit" in Turn Plan or Preview mode).
 */
export function advanceOrbitalTurn(state: OrbitalWorkshopState): OrbitalWorkshopState {
  if (state.missionEnded) return state;
  const evalSummary = evaluateOrbitalSemantics(state);
  const f = evalSummary.forecastNextOrbit;

  if (f.powerFailureRisk) {
    return {
      ...state,
      chargeWh: 0,
      missionEnded: true,
    };
  }

  const nextOrbit = state.orbitNumber + 1;
  const nextBuffer = Math.min(
    state.bufferCapacityMb,
    Math.max(0, state.bufferMb + f.predictedGeneratedMb - f.predictedDiscardedMb - f.predictedDeliveredMb),
  );
  const completed = nextOrbit > state.totalOrbits;

  return {
    ...state,
    orbitNumber: Math.min(state.totalOrbits, nextOrbit),
    chargeWh: f.predictedEndChargeWh,
    bufferMb: nextBuffer,
    deliveredMb: state.deliveredMb + f.predictedDeliveredMb,
    discardedMb: state.discardedMb + f.predictedDiscardedMb,
    coldStress: f.predictedNextColdStress,
    missionEnded: completed,
    storm: nextOrbit === 5,
  };
}
