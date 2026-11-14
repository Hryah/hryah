import * as THREE from 'three';
import { createMountNode, createPalette, makeMesh, quatKeyframes, vecKeyframes } from '../materials/pbr-palette';
import type { GeneratedAsset } from './build-astronaut';

export function buildShipCutawayAsset(): GeneratedAsset {
  const p = createPalette();
  const root = new THREE.Group();
  root.name = 'ship_cutaway_root';

  // 1. Floor deck (6.4m wide x 3.2m deep, 0.14m thick, top at y = 0)
  const floorDeck = new THREE.Group();
  floorDeck.name = 'floor_deck';
  root.add(floorDeck);

  floorDeck.add(
    makeMesh('deck_slab_mesh', new THREE.BoxGeometry(6.4, 0.14, 3.2), p.hullDark, [0, -0.07, 0]),
    makeMesh('deck_walkway_strip', new THREE.BoxGeometry(5.6, 0.016, 0.9), p.hullMid, [0, 0.008, 0.25]),
    makeMesh('deck_guide_rail_f', new THREE.BoxGeometry(5.6, 0.022, 0.05), p.suitAccentOrange, [0, 0.011, 0.75]),
    makeMesh('deck_guide_rail_b', new THREE.BoxGeometry(5.6, 0.022, 0.05), p.suitAccentOrange, [0, 0.011, -0.25]),
  );

  // 2. Rear bulkhead wall (at z = -1.52m)
  const wallBack = new THREE.Group();
  wallBack.name = 'wall_back';
  root.add(wallBack);

  wallBack.add(
    makeMesh('wall_back_panel', new THREE.BoxGeometry(6.4, 2.5, 0.14), p.hullMid, [0, 1.25, -1.53]),
    makeMesh('wall_rib_1', new THREE.BoxGeometry(0.12, 2.32, 0.14), p.frameSteel, [-2.4, 1.22, -1.38]),
    makeMesh('wall_rib_2', new THREE.BoxGeometry(0.12, 2.32, 0.14), p.frameSteel, [-0.8, 1.22, -1.38]),
    makeMesh('wall_rib_3', new THREE.BoxGeometry(0.12, 2.32, 0.14), p.frameSteel, [0.8, 1.22, -1.38]),
    makeMesh('wall_rib_4', new THREE.BoxGeometry(0.12, 2.32, 0.14), p.frameSteel, [2.4, 1.22, -1.38]),
  );

  // 3. Left wall (airlock bulkhead at x = -3.13m with hatch doorway opening)
  const wallLeft = new THREE.Group();
  wallLeft.name = 'wall_left';
  root.add(wallLeft);

  wallLeft.add(
    makeMesh('wall_left_rear', new THREE.BoxGeometry(0.14, 2.46, 0.84), p.hullDark, [-3.13, 1.23, -1.02]),
    makeMesh('wall_left_front', new THREE.BoxGeometry(0.14, 2.46, 0.84), p.hullDark, [-3.13, 1.23, 1.02]),
    makeMesh('wall_left_header', new THREE.BoxGeometry(0.14, 0.65, 1.2), p.hullMid, [-3.13, 2.155, 0]),
  );

  // Airlock Hatch with physical hinge at z = -0.58m so door swings outward (-X) without touching wall
  const hatchFrame = new THREE.Group();
  hatchFrame.name = 'hatch_frame';
  hatchFrame.position.set(-3.04, 0.92, 0);
  root.add(hatchFrame);

  hatchFrame.add(
    makeMesh('hatch_coaming_top', new THREE.BoxGeometry(0.08, 0.08, 1.16), p.frameSteel, [0, 0.88, 0]),
    makeMesh('hatch_coaming_bot', new THREE.BoxGeometry(0.08, 0.08, 1.16), p.frameSteel, [0, -0.88, 0]),
    makeMesh('hatch_status_lamp', new THREE.BoxGeometry(0.05, 0.06, 0.18), p.ledGreen, [0.06, 0.98, 0]),
  );

  const hatchHinge = new THREE.Group();
  hatchHinge.name = 'hatch_hinge';
  // Pivot strictly on the physical rear edge of the hatch opening
  hatchHinge.position.set(-3.22, 0.92, -0.52);
  root.add(hatchHinge);

  const hatchDoor = new THREE.Group();
  hatchDoor.name = 'hatch_door';
  hatchDoor.position.set(0, 0, 0.52);
  hatchHinge.add(hatchDoor);

  hatchDoor.add(
    makeMesh('hatch_door_slab', new THREE.BoxGeometry(0.08, 1.66, 1.02), p.hullLight, [0, 0, 0]),
    makeMesh('hatch_viewport', new THREE.CylinderGeometry(0.18, 0.18, 0.1, 16), p.visorDarkGlass, [0, 0.25, 0], [0, 0, Math.PI / 2]),
    makeMesh('hatch_wheel_handle', new THREE.CylinderGeometry(0.14, 0.14, 0.13, 10), p.suitAccentOrange, [0, -0.2, 0.22], [0, 0, Math.PI / 2]),
  );

  // 4. Right bulkhead wall (docking & payload bulkhead at x = +3.13m)
  const wallRight = new THREE.Group();
  wallRight.name = 'wall_right';
  root.add(wallRight);
  wallRight.add(
    makeMesh('wall_right_panel', new THREE.BoxGeometry(0.14, 2.46, 2.88), p.hullDark, [3.13, 1.23, 0]),
  );

  // 5. Cutaway Front Wall (camera-side wall at z = +1.53m, hideable in viewer)
  const wallCutawayFront = new THREE.Group();
  wallCutawayFront.name = 'wall_cutaway_front';
  root.add(wallCutawayFront);
  wallCutawayFront.add(
    makeMesh('wall_front_lower_sill', new THREE.BoxGeometry(6.4, 0.38, 0.1), p.hullMid, [0, 0.19, 1.55]),
    makeMesh('wall_front_upper_beam', new THREE.BoxGeometry(6.4, 0.28, 0.1), p.hullMid, [0, 2.36, 1.55]),
    makeMesh('wall_front_pillar_l', new THREE.BoxGeometry(0.24, 1.84, 0.1), p.hullDark, [-2.95, 1.3, 1.55]),
    makeMesh('wall_front_pillar_r', new THREE.BoxGeometry(0.24, 1.84, 0.1), p.hullDark, [2.95, 1.3, 1.55]),
  );

  // 6. Zero-G Handrails along the rear wall & ceiling
  const handrailMain = new THREE.Group();
  handrailMain.name = 'handrail_main';
  handrailMain.position.set(0, 1.42, -1.28);
  root.add(handrailMain);
  handrailMain.add(
    makeMesh('handrail_main_bar', new THREE.CylinderGeometry(0.022, 0.022, 4.8, 10), p.suitAccentOrange, [0, 0, 0], [0, 0, Math.PI / 2]),
    makeMesh('handrail_standoff_1', new THREE.BoxGeometry(0.04, 0.04, 0.14), p.frameSteel, [-2.1, 0, -0.07]),
    makeMesh('handrail_standoff_2', new THREE.BoxGeometry(0.04, 0.04, 0.14), p.frameSteel, [-0.7, 0, -0.07]),
    makeMesh('handrail_standoff_3', new THREE.BoxGeometry(0.04, 0.04, 0.14), p.frameSteel, [0.7, 0, -0.07]),
    makeMesh('handrail_standoff_4', new THREE.BoxGeometry(0.04, 0.04, 0.14), p.frameSteel, [2.1, 0, -0.07]),
  );

  const handrailUpper = new THREE.Group();
  handrailUpper.name = 'handrail_upper';
  handrailUpper.position.set(0, 2.18, -0.4);
  root.add(handrailUpper);
  handrailUpper.add(
    makeMesh('handrail_upper_bar', new THREE.CylinderGeometry(0.022, 0.022, 5.2, 10), p.frameSteel, [0, 0, 0], [0, 0, Math.PI / 2]),
  );

  // 7. Docking Port & Target Probe (external right-side adapter at x = +3.24m)
  const dockingRing = new THREE.Group();
  dockingRing.name = 'docking_ring';
  dockingRing.position.set(3.24, 1.25, 0);
  root.add(dockingRing);
  dockingRing.add(
    makeMesh('docking_flange_mesh', new THREE.CylinderGeometry(0.62, 0.68, 0.16, 16), p.frameSteel, [0.06, 0, 0], [0, 0, Math.PI / 2]),
  );

  const dockingCollar = new THREE.Group();
  dockingCollar.name = 'docking_collar';
  dockingCollar.position.set(0.18, 0, 0);
  dockingRing.add(dockingCollar);
  dockingCollar.add(
    makeMesh('docking_collar_sleeve', new THREE.CylinderGeometry(0.52, 0.52, 0.14, 16), p.hullLight, [0, 0, 0], [0, 0, Math.PI / 2]),
    makeMesh('docking_beacon_top', new THREE.BoxGeometry(0.06, 0.08, 0.08), p.ledGreen, [0.04, 0.56, 0]),
  );

  const dockingLatches = new THREE.Group();
  dockingLatches.name = 'docking_latches';
  dockingCollar.add(dockingLatches);
  dockingLatches.add(
    makeMesh('docking_latch_top', new THREE.BoxGeometry(0.14, 0.08, 0.12), p.suitAccentOrange, [0.08, 0.44, 0]),
    makeMesh('docking_latch_bot', new THREE.BoxGeometry(0.14, 0.08, 0.12), p.suitAccentOrange, [0.08, -0.44, 0]),
  );

  const dockingTargetProbe = new THREE.Group();
  dockingTargetProbe.name = 'docking_target_probe';
  dockingTargetProbe.position.set(0.95, 0.08, 0.06);
  dockingRing.add(dockingTargetProbe);
  dockingTargetProbe.add(
    makeMesh('probe_cone_mesh', new THREE.ConeGeometry(0.24, 0.38, 12), p.mliGoldFoil, [0, 0, 0], [0, 0, Math.PI / 2]),
    makeMesh('probe_body_mesh', new THREE.CylinderGeometry(0.38, 0.38, 0.45, 12), p.hullMid, [0.35, 0, 0], [0, 0, Math.PI / 2]),
    makeMesh('probe_target_cross', new THREE.BoxGeometry(0.04, 0.3, 0.3), p.ledCyan, [-0.18, 0, 0]),
  );

  // 8. Upper Satellite Payload Bay & Release Mechanism (roof bay at y = 2.55m)
  const satelliteBayCradle = new THREE.Group();
  satelliteBayCradle.name = 'satellite_bay_cradle';
  satelliteBayCradle.position.set(0, 2.52, -0.35);
  root.add(satelliteBayCradle);
  satelliteBayCradle.add(
    makeMesh('cradle_base_ring', new THREE.CylinderGeometry(0.55, 0.62, 0.12, 12), p.frameSteel, [0, 0, 0]),
  );

  const satelliteClampL = new THREE.Group();
  satelliteClampL.name = 'satellite_clamp_l';
  satelliteClampL.position.set(-0.48, 0.06, 0);
  satelliteBayCradle.add(satelliteClampL);
  satelliteClampL.add(
    makeMesh('clamp_jaw_l', new THREE.BoxGeometry(0.12, 0.24, 0.26), p.suitAccentOrange, [0.05, 0.12, 0]),
  );

  const satelliteClampR = new THREE.Group();
  satelliteClampR.name = 'satellite_clamp_r';
  satelliteClampR.position.set(0.48, 0.06, 0);
  satelliteBayCradle.add(satelliteClampR);
  satelliteClampR.add(
    makeMesh('clamp_jaw_r', new THREE.BoxGeometry(0.12, 0.24, 0.26), p.suitAccentOrange, [-0.05, 0.12, 0]),
  );

  const satelliteReleaseMount = createMountNode('satellite_release', [0, 2.75, -0.35]);
  root.add(satelliteReleaseMount);

  const deployedSatelliteProxy = new THREE.Group();
  deployedSatelliteProxy.name = 'deployed_satellite_proxy';
  deployedSatelliteProxy.position.set(0, 2.95, -0.35);
  root.add(deployedSatelliteProxy);
  deployedSatelliteProxy.add(
    makeMesh('proxy_bus_oct', new THREE.CylinderGeometry(0.38, 0.38, 0.56, 8), p.mliGoldFoil, [0, 0, 0]),
    makeMesh('proxy_wing_l', new THREE.BoxGeometry(0.75, 0.03, 0.32), p.solarCellBlue, [-0.62, 0, 0]),
    makeMesh('proxy_wing_r', new THREE.BoxGeometry(0.75, 0.03, 0.32), p.solarCellBlue, [0.62, 0, 0]),
    makeMesh('proxy_dish_top', new THREE.CylinderGeometry(0.22, 0.05, 0.14, 12), p.antennaDishSilver, [0, 0.36, 0]),
  );

  // 9. Console Stations & Crew Work Anchors along the cabin
  const stations: Array<{ id: string; x: number }> = [
    { id: 'power', x: -2.1 },
    { id: 'thermal', x: -1.05 },
    { id: 'oxygen', x: 0.0 },
    { id: 'docking', x: 1.05 },
    { id: 'separation', x: 2.1 },
  ];
  for (const st of stations) {
    root.add(createMountNode(`mount_console_${st.id}`, [st.x, 0, -0.92]));
    root.add(createMountNode(`anchor_${st.id}`, [st.x, 0, -0.28]));
  }
  root.add(createMountNode('console_interact', [0, 0, -0.28]));
  root.add(createMountNode('hand_target', [0.16, 1.12, -0.72]));

  // ───────────────────────── Ship Cutaway Animation Clips ─────────────────────────
  const clips: THREE.AnimationClip[] = [
    new THREE.AnimationClip('hatch_open', 1.5, [
      new THREE.QuaternionKeyframeTrack(
        'hatch_hinge.quaternion',
        [0, 0.5, 1.1, 1.5],
        quatKeyframes([
          [0, 0, 0],
          [0, -0.45, 0],
          [0, -1.25, 0],
          [0, -1.55, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('hatch_close', 1.5, [
      new THREE.QuaternionKeyframeTrack(
        'hatch_hinge.quaternion',
        [0, 0.5, 1.1, 1.5],
        quatKeyframes([
          [0, -1.55, 0],
          [0, -1.1, 0],
          [0, -0.35, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('docking_approach', 2.0, [
      new THREE.VectorKeyframeTrack(
        'docking_target_probe.position',
        [0, 1.0, 2.0],
        vecKeyframes([
          [1.45, 0.14, 0.12],
          [0.95, 0.08, 0.06],
          [0.58, 0.04, 0.03],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'docking_target_probe.quaternion',
        [0, 2.0],
        quatKeyframes([
          [0.08, 0.06, -0.05],
          [0.04, 0.03, -0.02],
        ]),
      ),
    ]),
    new THREE.AnimationClip('docking_align', 1.6, [
      new THREE.VectorKeyframeTrack(
        'docking_target_probe.position',
        [0, 0.8, 1.6],
        vecKeyframes([
          [0.58, 0.04, 0.03],
          [0.44, 0.01, 0.0],
          [0.36, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'docking_target_probe.quaternion',
        [0, 0.8, 1.6],
        quatKeyframes([
          [0.04, 0.03, -0.02],
          [-0.02, -0.01, 0.01],
          [0, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('docking_latch', 1.2, [
      new THREE.VectorKeyframeTrack(
        'docking_target_probe.position',
        [0, 0.7, 1.2],
        vecKeyframes([
          [0.36, 0, 0],
          [0.24, 0, 0],
          [0.2, 0, 0],
        ]),
      ),
      new THREE.VectorKeyframeTrack(
        'docking_collar.position',
        [0, 0.6, 1.2],
        vecKeyframes([
          [0.18, 0, 0],
          [0.24, 0, 0],
          [0.15, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'docking_latches.quaternion',
        [0, 0.6, 1.2],
        quatKeyframes([
          [0, 0, 0.25],
          [0, 0, -0.15],
          [0, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('docking_docked', 2.0, [
      new THREE.VectorKeyframeTrack(
        'docking_target_probe.position',
        [0, 1.0, 2.0],
        vecKeyframes([
          [0.2, 0, 0],
          [0.205, 0, 0],
          [0.2, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('docking_abort', 1.6, [
      new THREE.VectorKeyframeTrack(
        'docking_target_probe.position',
        [0, 0.8, 1.6],
        vecKeyframes([
          [0.36, 0, 0],
          [0.85, 0.05, 0.04],
          [1.45, 0.14, 0.12],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'docking_latches.quaternion',
        [0, 0.6, 1.6],
        quatKeyframes([
          [0, 0, 0],
          [0, 0, 0.32],
          [0, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('satellite_release_latch', 1.2, [
      new THREE.QuaternionKeyframeTrack(
        'satellite_clamp_l.quaternion',
        [0, 0.6, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [0, 0, 0.55],
          [0, 0, 0.68],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'satellite_clamp_r.quaternion',
        [0, 0.6, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [0, 0, -0.55],
          [0, 0, -0.68],
        ]),
      ),
    ]),
    new THREE.AnimationClip('satellite_depart', 2.0, [
      new THREE.QuaternionKeyframeTrack(
        'satellite_clamp_l.quaternion',
        [0, 2.0],
        quatKeyframes([
          [0, 0, 0.68],
          [0, 0, 0.68],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'satellite_clamp_r.quaternion',
        [0, 2.0],
        quatKeyframes([
          [0, 0, -0.68],
          [0, 0, -0.68],
        ]),
      ),
      new THREE.VectorKeyframeTrack(
        'deployed_satellite_proxy.position',
        [0, 0.7, 1.4, 2.0],
        vecKeyframes([
          [0, 2.95, -0.35],
          [0, 3.28, -0.32],
          [0, 3.68, -0.25],
          [0, 4.05, -0.18],
        ]),
      ),
    ]),
    new THREE.AnimationClip('satellite_drift', 2.8, [
      new THREE.VectorKeyframeTrack(
        'deployed_satellite_proxy.position',
        [0, 1.4, 2.8],
        vecKeyframes([
          [0, 4.05, -0.18],
          [0.08, 4.18, -0.12],
          [0, 4.05, -0.18],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'deployed_satellite_proxy.quaternion',
        [0, 1.4, 2.8],
        quatKeyframes([
          [0, 0, 0],
          [0.06, 0.18, -0.04],
          [0, 0, 0],
        ]),
      ),
    ]),
  ];

  return { id: 'ship-cutaway', root, clips };
}

export type ConsoleKind = 'power' | 'thermal' | 'oxygen' | 'docking' | 'separation';

export function buildConsoleAsset(kind: ConsoleKind): GeneratedAsset {
  const p = createPalette();
  const id = `console-${kind}`;
  const root = new THREE.Group();
  root.name = `${id}_root`;

  const consoleBody = new THREE.Group();
  consoleBody.name = 'console_body';
  root.add(consoleBody);

  // Pedestal + angled control desk + upper monitor hood
  consoleBody.add(
    makeMesh('pedestal_base', new THREE.BoxGeometry(0.76, 0.78, 0.48), p.hullDark, [0, 0.39, 0]),
    makeMesh('desk_sloped_top', new THREE.BoxGeometry(0.8, 0.16, 0.56), p.hullMid, [0, 0.84, 0.04], [0.28, 0, 0]),
    makeMesh('monitor_hood', new THREE.BoxGeometry(0.78, 0.44, 0.28), p.hullDark, [0, 1.14, -0.1]),
    makeMesh('monitor_screen', new THREE.BoxGeometry(0.64, 0.3, 0.02), p.consoleScreenBlue, [0, 1.15, 0.052]),
  );

  // Status indicator LED bar (distinct color accent per system)
  const accentMat =
    kind === 'power'
      ? p.ledCyan
      : kind === 'thermal'
        ? p.ledAmber
        : kind === 'oxygen'
          ? p.ledGreen
          : kind === 'docking'
            ? p.ledCyan
            : p.ledRed;

  const indicatorStatus = new THREE.Group();
  indicatorStatus.name = 'indicator_status';
  indicatorStatus.position.set(0, 1.33, 0.052);
  root.add(indicatorStatus);
  indicatorStatus.add(
    makeMesh('indicator_bar_mesh', new THREE.BoxGeometry(0.46, 0.035, 0.022), accentMat, [0, 0, 0]),
  );

  // Primary Hinged Lever (pivot strictly at physical shaft base on desk surface)
  const controlLeverPivot = new THREE.Group();
  controlLeverPivot.name = 'control_lever_pivot';
  controlLeverPivot.position.set(-0.2, 0.91, 0.16);
  root.add(controlLeverPivot);

  controlLeverPivot.add(
    makeMesh('lever_hinge_drum', new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), p.frameSteel, [0, 0, 0], [0, 0, Math.PI / 2]),
    makeMesh('lever_stem', new THREE.CylinderGeometry(0.014, 0.014, 0.14, 8), p.frameSteel, [0, 0.07, 0]),
    makeMesh('lever_grip_handle', new THREE.BoxGeometry(0.075, 0.036, 0.036), p.suitAccentOrange, [0, 0.145, 0]),
  );

  // Rotary Dial / Wheel (or Safety Cover on separation, Oxygen Valve Wheel on oxygen)
  const controlDialPivot = new THREE.Group();
  controlDialPivot.name = 'control_dial_pivot';
  controlDialPivot.position.set(0.02, 0.92, 0.16);
  root.add(controlDialPivot);

  if (kind === 'oxygen') {
    const valveWheel = new THREE.Group();
    valveWheel.name = 'oxygen_valve_wheel';
    controlDialPivot.add(valveWheel);
    valveWheel.add(
      makeMesh('o2_wheel_hub', new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10), p.frameSteel, [0, 0.025, 0]),
      makeMesh('o2_wheel_rim', new THREE.CylinderGeometry(0.095, 0.095, 0.022, 14), p.ledGreen, [0, 0.055, 0]),
      makeMesh('o2_wheel_spoke_1', new THREE.BoxGeometry(0.17, 0.018, 0.02), p.frameSteel, [0, 0.055, 0]),
      makeMesh('o2_wheel_spoke_2', new THREE.BoxGeometry(0.02, 0.018, 0.17), p.frameSteel, [0, 0.055, 0]),
    );
  } else {
    controlDialPivot.add(
      makeMesh('dial_knob_cylinder', new THREE.CylinderGeometry(0.055, 0.062, 0.045, 12), p.frameSteel, [0, 0.022, 0]),
      makeMesh('dial_pointer_notch', new THREE.BoxGeometry(0.018, 0.016, 0.065), p.suitAccentOrange, [0, 0.048, 0.02]),
    );
  }

  // Safety flip-cover for separation console (and present as hinged guard on others)
  const safetyCoverPivot = new THREE.Group();
  safetyCoverPivot.name = 'safety_cover_pivot';
  safetyCoverPivot.position.set(0.22, 0.92, 0.1);
  root.add(safetyCoverPivot);
  safetyCoverPivot.add(
    makeMesh('safety_guard_hood', new THREE.BoxGeometry(0.11, 0.05, 0.11), p.suitAccentOrange, [0, 0.025, 0.055]),
  );

  // Confirm / Action Push-Button
  const controlButton = new THREE.Group();
  controlButton.name = 'control_button';
  controlButton.position.set(0.22, 0.91, 0.155);
  root.add(controlButton);
  controlButton.add(
    makeMesh('button_plunger_cap', new THREE.CylinderGeometry(0.038, 0.04, 0.036, 12), accentMat, [0, 0.018, 0]),
  );

  // Stationary interaction anchors for astronaut
  root.add(
    createMountNode('console_interact', [0, 0, 0.62], [0, Math.PI, 0]),
    createMountNode('hand_target', [-0.2, 1.04, 0.16]),
  );

  const clips: THREE.AnimationClip[] = [
    new THREE.AnimationClip('idle', 2.0, [
      new THREE.VectorKeyframeTrack(
        'indicator_status.position',
        [0, 1.0, 2.0],
        vecKeyframes([
          [0, 1.33, 0.052],
          [0, 1.334, 0.052],
          [0, 1.33, 0.052],
        ]),
      ),
    ]),
    new THREE.AnimationClip('switch_on', 0.9, [
      new THREE.QuaternionKeyframeTrack(
        'control_lever_pivot.quaternion',
        [0, 0.45, 0.9],
        quatKeyframes([
          [0.45, 0, 0],
          [-0.25, 0, 0],
          [-0.52, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'safety_cover_pivot.quaternion',
        [0, 0.35, 0.9],
        quatKeyframes([
          [0, 0, 0],
          [-1.35, 0, 0],
          [-1.35, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('switch_off', 0.9, [
      new THREE.QuaternionKeyframeTrack(
        'control_lever_pivot.quaternion',
        [0, 0.45, 0.9],
        quatKeyframes([
          [-0.52, 0, 0],
          [0.15, 0, 0],
          [0.45, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'safety_cover_pivot.quaternion',
        [0, 0.55, 0.9],
        quatKeyframes([
          [-1.35, 0, 0],
          [-0.4, 0, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('work_cycle', 1.8, [
      new THREE.QuaternionKeyframeTrack(
        'control_dial_pivot.quaternion',
        [0, 0.6, 1.2, 1.8],
        quatKeyframes([
          [0, 0, 0],
          [0, 1.4, 0],
          [0, 2.8, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'control_lever_pivot.quaternion',
        [0, 0.6, 1.2, 1.8],
        quatKeyframes([
          [0, 0, 0],
          [-0.48, 0, 0],
          [0.35, 0, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('confirm', 1.0, [
      new THREE.QuaternionKeyframeTrack(
        'safety_cover_pivot.quaternion',
        [0, 0.25, 0.8, 1.0],
        quatKeyframes([
          [0, 0, 0],
          [-1.4, 0, 0],
          [-1.4, 0, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.VectorKeyframeTrack(
        'control_button.position',
        [0, 0.3, 0.5, 0.75, 1.0],
        vecKeyframes([
          [0.22, 0.91, 0.155],
          [0.22, 0.91, 0.155],
          [0.22, 0.892, 0.155],
          [0.22, 0.91, 0.155],
          [0.22, 0.91, 0.155],
        ]),
      ),
    ]),
    new THREE.AnimationClip('alarm', 1.2, [
      new THREE.QuaternionKeyframeTrack(
        'control_lever_pivot.quaternion',
        [0, 0.3, 0.6, 0.9, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [0.18, 0, 0],
          [-0.18, 0, 0],
          [0.18, 0, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
  ];

  return { id, root, clips };
}

/**
 * Builds the 4-switch Orbital Control Panel asset (camera, transmitter, heater, safeMode)
 * with physical hinged toggles, ON/OFF/blocked/SAFE indicator lamps, and clips.
 */
export function buildOrbitalSwitchesAsset(): GeneratedAsset {
  const p = createPalette();
  const root = new THREE.Group();
  root.name = 'orbital_switches_root';

  const frame = new THREE.Group();
  frame.name = 'switch_panel_frame';
  root.add(frame);

  frame.add(
    makeMesh('panel_chassis', new THREE.BoxGeometry(1.12, 0.54, 0.14), p.hullDark, [0, 0.32, 0]),
    makeMesh('panel_bezel_plate', new THREE.BoxGeometry(1.04, 0.46, 0.025), p.hullMid, [0, 0.32, 0.082]),
  );

  const switchIds = ['camera', 'transmitter', 'heater', 'safeMode'] as const;
  const xs = [-0.36, -0.12, 0.12, 0.36];

  switchIds.forEach((swId, idx) => {
    const x = xs[idx]!;
    // Guard rails around toggle
    frame.add(
      makeMesh(`guard_l_${swId}`, new THREE.BoxGeometry(0.016, 0.14, 0.045), p.frameSteel, [x - 0.055, 0.3, 0.115]),
      makeMesh(`guard_r_${swId}`, new THREE.BoxGeometry(0.016, 0.14, 0.045), p.frameSteel, [x + 0.055, 0.3, 0.115]),
    );

    // Physical toggle lever pivot at hinge center
    const pivot = new THREE.Group();
    pivot.name = `switch_${swId}_pivot`;
    pivot.position.set(x, 0.3, 0.098);
    // Default initial state matches game init: camera ON, transmitter ON, heater ON, safeMode OFF
    const initialOn = swId !== 'safeMode';
    pivot.rotation.set(initialOn ? -0.48 : 0.48, 0, 0);
    root.add(pivot);

    const handleMat = swId === 'safeMode' ? p.suitAccentOrange : p.frameSteel;
    pivot.add(
      makeMesh(`toggle_bushing_${swId}`, new THREE.CylinderGeometry(0.024, 0.028, 0.03, 10), p.frameSteel, [0, 0, 0], [Math.PI / 2, 0, 0]),
      makeMesh(`toggle_bat_${swId}`, new THREE.CylinderGeometry(0.012, 0.018, 0.11, 10), handleMat, [0, 0, 0.055], [Math.PI / 2, 0, 0]),
      makeMesh(`toggle_tip_${swId}`, new THREE.SphereGeometry(0.022, 10, 8), handleMat, [0, 0, 0.11]),
    );

    // Status LED (Active / Standby / Safe)
    const ledGroup = new THREE.Group();
    ledGroup.name = `led_${swId}_state`;
    ledGroup.position.set(x, 0.46, 0.1);
    root.add(ledGroup);
    ledGroup.add(
      makeMesh(
        `led_active_mesh_${swId}`,
        new THREE.BoxGeometry(0.09, 0.036, 0.022),
        initialOn ? p.ledGreen : p.ledOff,
        [0, 0, 0],
      ),
    );

    // Blocked / Override warning LED below switch
    const blockedGroup = new THREE.Group();
    blockedGroup.name = `led_${swId}_blocked`;
    blockedGroup.position.set(x, 0.16, 0.1);
    root.add(blockedGroup);
    blockedGroup.add(
      makeMesh(
        `led_blocked_mesh_${swId}`,
        new THREE.BoxGeometry(0.09, 0.026, 0.02),
        p.ledOff,
        [0, 0, 0],
      ),
    );
  });

  root.add(
    createMountNode('console_interact', [0, 0, 0.55], [0, Math.PI, 0]),
    createMountNode('hand_target', [-0.36, 0.3, 0.21]),
  );

  const makeSwitchClip = (name: string, targetNode: string, fromAngle: number, toAngle: number, duration = 0.8) =>
    new THREE.AnimationClip(name, duration, [
      new THREE.QuaternionKeyframeTrack(
        `${targetNode}.quaternion`,
        [0, duration * 0.5, duration],
        quatKeyframes([
          [fromAngle, 0, 0],
          [(fromAngle + toAngle) * 0.5, 0, 0],
          [toAngle, 0, 0],
        ]),
      ),
    ]);

  const clips: THREE.AnimationClip[] = [
    new THREE.AnimationClip('all_on_nominal', 1.2, [
      new THREE.QuaternionKeyframeTrack('switch_camera_pivot.quaternion', [0, 1.2], quatKeyframes([[0.48, 0, 0], [-0.48, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('switch_transmitter_pivot.quaternion', [0, 1.2], quatKeyframes([[0.48, 0, 0], [-0.48, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('switch_heater_pivot.quaternion', [0, 1.2], quatKeyframes([[0.48, 0, 0], [-0.48, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('switch_safeMode_pivot.quaternion', [0, 1.2], quatKeyframes([[-0.48, 0, 0], [0.48, 0, 0]])),
    ]),
    makeSwitchClip('camera_on', 'switch_camera_pivot', 0.48, -0.48),
    makeSwitchClip('camera_off', 'switch_camera_pivot', -0.48, 0.48),
    makeSwitchClip('transmitter_on', 'switch_transmitter_pivot', 0.48, -0.48),
    makeSwitchClip('transmitter_off', 'switch_transmitter_pivot', -0.48, 0.48),
    makeSwitchClip('heater_on', 'switch_heater_pivot', 0.48, -0.48),
    makeSwitchClip('heater_off', 'switch_heater_pivot', -0.48, 0.48),
    new THREE.AnimationClip('safe_mode_on', 1.0, [
      new THREE.QuaternionKeyframeTrack('switch_safeMode_pivot.quaternion', [0, 0.5, 1.0], quatKeyframes([[0.48, 0, 0], [-0.2, 0, 0], [-0.48, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('switch_camera_pivot.quaternion', [0, 0.5, 1.0], quatKeyframes([[-0.48, 0, 0], [0.1, 0, 0], [0.48, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('switch_transmitter_pivot.quaternion', [0, 0.5, 1.0], quatKeyframes([[-0.48, 0, 0], [0.1, 0, 0], [0.48, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('switch_heater_pivot.quaternion', [0, 0.5, 1.0], quatKeyframes([[0.48, 0, 0], [-0.2, 0, 0], [-0.48, 0, 0]])),
    ]),
    new THREE.AnimationClip('safe_mode_off', 1.0, [
      new THREE.QuaternionKeyframeTrack('switch_safeMode_pivot.quaternion', [0, 0.5, 1.0], quatKeyframes([[-0.48, 0, 0], [0.2, 0, 0], [0.48, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('switch_camera_pivot.quaternion', [0, 0.5, 1.0], quatKeyframes([[0.48, 0, 0], [-0.1, 0, 0], [-0.48, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('switch_transmitter_pivot.quaternion', [0, 0.5, 1.0], quatKeyframes([[0.48, 0, 0], [-0.1, 0, 0], [-0.48, 0, 0]])),
    ]),
  ];

  return { id: 'orbital-switches', root, clips };
}
