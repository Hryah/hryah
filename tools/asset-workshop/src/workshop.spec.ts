import { describe, expect, it } from 'vitest';
import catalogJson from '../../../src/data/catalog.json';
import { STANDALONE_GLB_ASSETS, getAssetDef } from './catalog/asset-registry';
import { exportAssetToGlbBytes } from './generator/export-glb';
import { validateExportedGlbBytes } from './validation/validate-glb';
import {
  advanceOrbitalTurn,
  createInitialOrbitalWorkshopState,
  evaluateOrbitalSemantics,
  toggleOrbitalSwitch,
} from './semantics/orbital-switch-machine';
import {
  commandCrewToConsole,
  createInitialCrewState,
  stepCrewChoreography,
  toggleCrewGravityMode,
} from './semantics/crew-choreography';
import {
  attachModuleToSocket,
  loadWorkshopGlb,
  WorkshopAnimationController,
} from './adapter/import-and-animate';

describe('HRYAH 2.5D Asset Workshop & Clean-Scene Validator', () => {
  it('matches all 15 module IDs and stats with src/data/catalog.json', () => {
    expect(catalogJson.modules).toHaveLength(15);
    for (const mod of catalogJson.modules) {
      const workshopDef = getAssetDef(mod.id);
      expect(workshopDef, `Missing workshop asset for catalog id ${mod.id}`).toBeDefined();
      expect(workshopDef?.catalogStats?.slot).toBe(mod.slot);
      expect(workshopDef?.catalogStats?.massKg).toBe(mod.massKg);
      expect(workshopDef?.catalogStats?.costMUsd).toBe(mod.costMUsd);
    }
  });

  it('exports and re-imports astronaut.glb into a clean GLTFLoader with 14 dynamic clips and zero drift', async () => {
    const { bytes } = await exportAssetToGlbBytes('astronaut');
    const report = await validateExportedGlbBytes('astronaut', bytes);

    expect(report.valid, report.errors.join('; ')).toBe(true);
    expect(report.clips).toHaveLength(14);
    expect(report.coplanarZFightingRisks).toEqual([]);
    expect(report.missingMounts).toEqual([]);

    const clipNames = report.clips.map((c) => c.name);
    expect(clipNames).toEqual([
      'idle',
      'run',
      'float_idle',
      'float_move',
      'push_off',
      'grab_handle',
      'task_work',
      'switch_on',
      'switch_off',
      'turn_left',
      'turn_right',
      'reposition',
      'task_success',
      'task_error',
    ]);

    for (const clip of report.clips) {
      expect(clip.movedDuringPlayback, `Clip ${clip.name} was static`).toBe(true);
      expect(clip.driftAfter5Cycles).toBeLessThan(0.001);
    }
  });

  it('exports and re-imports ship-cutaway, satellite-bus, consoles, and catalog modules with valid mounts & clips', async () => {
    const sampleIds = [
      'ship-cutaway',
      'satellite-bus',
      'orbital-switches',
      'console-oxygen',
      'console-separation',
      'eng-ion',
      'sol-l',
      'bat-l',
      'ant-l',
      'cam-l',
      'earth',
    ];

    for (const id of sampleIds) {
      const { bytes } = await exportAssetToGlbBytes(id);
      const report = await validateExportedGlbBytes(id, bytes);
      expect(report.valid, `${id} failed: ${report.errors.join('; ')}`).toBe(true);
      expect(report.coplanarZFightingRisks).toEqual([]);
      for (const c of report.clips) {
        expect(c.movedDuringPlayback).toBe(true);
        expect(c.scalePreserved).toBe(true);
      }
    }
    expect(STANDALONE_GLB_ASSETS).toHaveLength(25);
  });

  it('attaches modular GLBs to stationary sockets and resets bind pose cleanly via adapter', async () => {
    const busExport = await exportAssetToGlbBytes('satellite-bus');
    const solarExport = await exportAssetToGlbBytes('sol-m');
    const camExport = await exportAssetToGlbBytes('cam-m');

    const busGltf = await loadWorkshopGlb(busExport.bytes);
    const solarGltf = await loadWorkshopGlb(solarExport.bytes);
    const camGltf = await loadWorkshopGlb(camExport.bytes);

    expect(attachModuleToSocket(busGltf.scene, 'solar_left', solarGltf.scene)).toBe(true);
    expect(attachModuleToSocket(busGltf.scene, 'camera_mount', camGltf.scene)).toBe(true);

    const solarCtrl = new WorkshopAnimationController(solarGltf.scene, solarGltf.animations);
    const hingeNode = solarGltf.scene.getObjectByName('solar_hinge_root')!;
    const bindQuat = hingeNode.quaternion.clone();

    solarCtrl.playClip('deploy', { loop: false, crossFadeDurationS: 0 });
    solarCtrl.seekTime(0.4);
    expect(hingeNode.quaternion.equals(bindQuat)).toBe(false);

    solarCtrl.stopAndResetBindPose();
    expect(hingeNode.quaternion.angleTo(bindQuat)).toBeLessThan(1e-5);
    solarCtrl.dispose();
  });

  it('validates all orbital switch semantics: ON/OFF, rapid clicks, SAFE override/restore, cold lock, overflow, empty buffer, storm, no power, and mission end', () => {
    let s = createInitialOrbitalWorkshopState();

    // 1. Nominal imaging window: Camera is ACTIVE, Transmitter is STANDBY_WINDOW
    let ev = evaluateOrbitalSemantics(s);
    expect(ev.subsystems.camera.commanded).toBe(true);
    expect(ev.subsystems.camera.effectiveActive).toBe(true);
    expect(ev.subsystems.camera.visualState).toBe('ACTIVE');
    expect(ev.subsystems.camera.targetClip).toBe('scan');
    expect(ev.vfxFlags.vfx_scan_cone).toBe(true);
    expect(ev.subsystems.transmitter.visualState).toBe('STANDBY_WINDOW');
    expect(ev.vfxFlags.vfx_downlink_beam).toBe(false);

    // 2. Toggle Camera OFF and back ON, plus rapid double-toggle idempotency
    const camOff = toggleOrbitalSwitch(s, 'camera');
    expect(camOff.commands.camera).toBe(false);
    expect(evaluateOrbitalSemantics(camOff).subsystems.camera.visualState).toBe('OFF');
    expect(evaluateOrbitalSemantics(camOff).vfxFlags.vfx_scan_cone).toBe(false);
    expect(camOff.orbitNumber).toBe(s.orbitNumber); // Toggling never advances turn
    expect(camOff.chargeWh).toBe(s.chargeWh);

    const rapidDouble = toggleOrbitalSwitch(toggleOrbitalSwitch(s, 'camera'), 'camera');
    expect(rapidDouble.commands).toEqual(s.commands);

    // 3. Full buffer during imaging window -> OVERFLOW_DISCARDING (discards new data, does not transmit)
    const fullBuf = { ...s, window: 'imaging' as const, bufferMb: 4000, bufferCapacityMb: 4000 };
    ev = evaluateOrbitalSemantics(fullBuf);
    expect(ev.subsystems.camera.effectiveActive).toBe(true);
    expect(ev.subsystems.camera.visualState).toBe('OVERFLOW_DISCARDING');
    expect(ev.subsystems.transmitter.effectiveActive).toBe(false);
    expect(ev.forecastNextOrbit.predictedDiscardedMb).toBeGreaterThan(0);

    // 4. Cold Lock (coldStress = 2): Camera command stays ON, but camera is BLOCKED_COLD; recovers after heated shadow pass
    const coldState = { ...s, window: 'imaging' as const, coldStress: 2 };
    ev = evaluateOrbitalSemantics(coldState);
    expect(ev.subsystems.camera.commanded).toBe(true);
    expect(ev.subsystems.camera.effectiveActive).toBe(false);
    expect(ev.subsystems.camera.visualState).toBe('BLOCKED_COLD');
    expect(ev.subsystems.camera.targetClip).toBe('cold_locked');
    expect(ev.vfxFlags.vfx_scan_cone).toBe(false);
    expect(ev.vfxFlags.vfx_cold_frost).toBe(true);

    const recoveredAfterOrbit = advanceOrbitalTurn(coldState);
    expect(recoveredAfterOrbit.coldStress).toBe(1);
    expect(evaluateOrbitalSemantics(recoveredAfterOrbit).subsystems.camera.visualState).toBe('ACTIVE');

    // 5. Ground Pass window: Transmitter ACTIVE when buffer > 0, STANDBY_BUFFER_EMPTY when buffer == 0
    const passWithData = { ...s, window: 'pass' as const, bufferMb: 1200 };
    ev = evaluateOrbitalSemantics(passWithData);
    expect(ev.subsystems.transmitter.effectiveActive).toBe(true);
    expect(ev.subsystems.transmitter.visualState).toBe('ACTIVE');
    expect(ev.vfxFlags.vfx_downlink_beam).toBe(true);

    const passEmptyBuf = { ...passWithData, bufferMb: 0 };
    ev = evaluateOrbitalSemantics(passEmptyBuf);
    expect(ev.subsystems.transmitter.effectiveActive).toBe(false);
    expect(ev.subsystems.transmitter.visualState).toBe('STANDBY_BUFFER_EMPTY');
    expect(ev.vfxFlags.vfx_downlink_beam).toBe(false);

    // 6. Entering SAFE Mode during work saves commands, stops camera & transmitter, enables heater in shadow
    const preSafe = { ...s, window: 'shadow' as const, commands: { camera: true, transmitter: false, heater: false, safeMode: false }, savedBeforeSafe: { camera: true, transmitter: false, heater: false } };
    const inSafe = toggleOrbitalSwitch(preSafe, 'safeMode');
    ev = evaluateOrbitalSemantics(inSafe);
    expect(inSafe.commands.safeMode).toBe(true);
    expect(ev.subsystems.camera.visualState).toBe('BLOCKED_SAFE');
    expect(ev.subsystems.transmitter.visualState).toBe('BLOCKED_SAFE');
    expect(ev.subsystems.heater.effectiveActive).toBe(true);
    expect(ev.subsystems.heater.visualState).toBe('ACTIVE');

    // Exiting SAFE Mode restores saved commands (camera: true, transmitter: false, heater: false)
    const exitedSafe = toggleOrbitalSwitch(inSafe, 'safeMode');
    expect(exitedSafe.commands).toEqual({
      camera: true,
      transmitter: false,
      heater: false,
      safeMode: false,
    });

    // 7. No Power (chargeWh = 0) stops all actions immediately
    const deadBattery = { ...s, chargeWh: 0 };
    ev = evaluateOrbitalSemantics(deadBattery);
    expect(ev.inoperable).toBe(true);
    expect(ev.subsystems.camera.visualState).toBe('BLOCKED_NO_POWER');
    expect(ev.subsystems.transmitter.visualState).toBe('BLOCKED_NO_POWER');
    expect(ev.subsystems.heater.visualState).toBe('BLOCKED_NO_POWER');
    expect(ev.vfxFlags.vfx_scan_cone).toBe(false);

    // 8. Mission Ended stops all working effects
    const ended = { ...s, missionEnded: true };
    ev = evaluateOrbitalSemantics(ended);
    expect(ev.subsystems.camera.visualState).toBe('MISSION_ENDED');
    expect(ev.vfxFlags.vfx_scan_cone).toBe(false);
  });

  it('runs Phase 2 crew choreography from idle -> movement -> console work -> reaction -> idle and supports safe interruption', () => {
    let crew = createInitialCrewState();
    expect(crew.stage).toBe('idle');

    // Command crew to Power console (-2.1m)
    crew = commandCrewToConsole(crew, 'power', 'success');
    expect(crew.stage).toBe('turn');

    // Step partway through movement, then safely interrupt with a Zero-G toggle and a new console command (Docking +1.05m)
    crew = stepCrewChoreography(crew, 0.5);
    expect(crew.stage).toBe('moving');
    crew = toggleCrewGravityMode(crew);
    expect(crew.gravityMode).toBe('zero-g');
    crew = commandCrewToConsole(crew, 'docking', 'success');
    expect(crew.stage).toBe('push_off');

    // Run until sequence completes back to float_idle
    for (let i = 0; i < 60; i++) {
      crew = stepCrewChoreography(crew, 0.1);
    }
    expect(crew.stage).toBe('idle');
    expect(crew.activeClip).toBe('float_idle');
    expect(crew.dockingStatus).toBe('docked');
  });
});
