import * as THREE from 'three';
import { createMountNode, createPalette, makeMesh, quatKeyframes, vecKeyframes } from '../materials/pbr-palette';
import type { GeneratedAsset } from './build-astronaut';

export function buildSatelliteBusAsset(): GeneratedAsset {
  const p = createPalette();
  const root = new THREE.Group();
  root.name = 'satellite_bus_root';

  // Main structural octagonal core (height 0.96m, radius 0.48m)
  const busCore = new THREE.Group();
  busCore.name = 'bus_core';
  root.add(busCore);

  busCore.add(
    makeMesh('bus_octagon_frame', new THREE.CylinderGeometry(0.46, 0.46, 0.94, 8), p.hullDark, [0, 0, 0]),
    makeMesh('bus_top_deck_ring', new THREE.CylinderGeometry(0.49, 0.49, 0.06, 8), p.frameSteel, [0, 0.47, 0]),
    makeMesh('bus_bot_deck_ring', new THREE.CylinderGeometry(0.49, 0.49, 0.06, 8), p.frameSteel, [0, -0.47, 0]),
    makeMesh('bus_mid_belt_ring', new THREE.CylinderGeometry(0.485, 0.485, 0.05, 8), p.frameSteel, [0, 0, 0]),
  );

  // Gold MLI thermal foil blankets offset cleanly outside the octagonal faces (no coplanar overlap)
  const mliGroup = new THREE.Group();
  mliGroup.name = 'mli_blanket_group';
  busCore.add(mliGroup);

  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const r = 0.455;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    mliGroup.add(
      makeMesh(
        `mli_panel_upper_${i}`,
        new THREE.BoxGeometry(0.28, 0.34, 0.025),
        p.mliGoldFoil,
        [x, 0.22, z],
        [0, angle, 0],
      ),
      makeMesh(
        `mli_panel_lower_${i}`,
        new THREE.BoxGeometry(0.28, 0.34, 0.025),
        p.mliGoldFoil,
        [x, -0.22, z],
        [0, angle, 0],
      ),
    );
  }

  // Articulated thermal radiator louvers on +Z and -Z faces
  const louverL = new THREE.Group();
  louverL.name = 'radiator_louver_l';
  louverL.position.set(-0.14, 0, 0.485);
  root.add(louverL);
  louverL.add(
    makeMesh('louver_vane_l', new THREE.BoxGeometry(0.2, 0.36, 0.022), p.antennaDishSilver, [0, 0, 0]),
  );

  const louverR = new THREE.Group();
  louverR.name = 'radiator_louver_r';
  louverR.position.set(0.14, 0, 0.485);
  root.add(louverR);
  louverR.add(
    makeMesh('louver_vane_r', new THREE.BoxGeometry(0.2, 0.36, 0.022), p.antennaDishSilver, [0, 0, 0]),
  );

  // Status beacon LED on top deck
  const statusBeacon = new THREE.Group();
  statusBeacon.name = 'status_beacon';
  statusBeacon.position.set(0.26, 0.53, 0.26);
  root.add(statusBeacon);
  statusBeacon.add(
    makeMesh('beacon_dome_mesh', new THREE.CylinderGeometry(0.045, 0.055, 0.06, 10), p.ledGreen, [0, 0, 0]),
  );

  // Optional VFX layers (separate nodes that can be hidden without affecting model completeness)
  const vfxHeaterGlow = new THREE.Group();
  vfxHeaterGlow.name = 'vfx_heater_glow';
  root.add(vfxHeaterGlow);
  vfxHeaterGlow.add(
    makeMesh('heater_strip_f', new THREE.BoxGeometry(0.56, 0.1, 0.025), p.vfxHeaterGlow, [0, 0, 0.51]),
    makeMesh('heater_strip_b', new THREE.BoxGeometry(0.56, 0.1, 0.025), p.vfxHeaterGlow, [0, 0, -0.51]),
  );

  const vfxColdFrost = new THREE.Group();
  vfxColdFrost.name = 'vfx_cold_frost';
  vfxColdFrost.visible = false;
  root.add(vfxColdFrost);
  vfxColdFrost.add(
    makeMesh('frost_crystal_1', new THREE.OctahedronGeometry(0.11, 0), p.vfxColdFrost, [0.32, 0.35, 0.38]),
    makeMesh('frost_crystal_2', new THREE.OctahedronGeometry(0.09, 0), p.vfxColdFrost, [-0.34, -0.28, 0.36]),
  );

  const vfxStormParticles = new THREE.Group();
  vfxStormParticles.name = 'vfx_storm_particles';
  vfxStormParticles.visible = false;
  root.add(vfxStormParticles);
  vfxStormParticles.add(
    makeMesh('storm_arc_ring_1', new THREE.TorusGeometry(0.82, 0.022, 8, 24), p.vfxStormWave, [0, 0.12, 0], [0.35, 0.2, 0]),
    makeMesh('storm_arc_ring_2', new THREE.TorusGeometry(0.92, 0.018, 8, 24), p.vfxStormWave, [0, -0.14, 0], [-0.3, 0.1, 0]),
  );

  // 7 Stationary Mounting Sockets (Section 6 requirement)
  root.add(
    createMountNode('solar_left', [-0.52, 0, 0], [0, Math.PI, 0]),
    createMountNode('solar_right', [0.52, 0, 0], [0, 0, 0]),
    createMountNode('antenna_mount', [0, 0.5, 0], [0, 0, 0]),
    createMountNode('camera_mount', [0, 0, 0.5], [Math.PI / 2, 0, 0]),
    createMountNode('engine_mount', [0, -0.5, 0], [0, 0, 0]),
    createMountNode('battery_mount', [0, 0, -0.5], [0, Math.PI, 0]),
    createMountNode('satellite_release', [0, -0.52, 0], [0, 0, 0]),
  );

  const clips: THREE.AnimationClip[] = [
    new THREE.AnimationClip('idle', 2.4, [
      new THREE.QuaternionKeyframeTrack(
        'bus_core.quaternion',
        [0, 1.2, 2.4],
        quatKeyframes([
          [0, 0, 0],
          [0.018, 0.03, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('safe_enter', 1.2, [
      new THREE.QuaternionKeyframeTrack(
        'radiator_louver_l.quaternion',
        [0, 1.2],
        quatKeyframes([
          [0, 0.45, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'radiator_louver_r.quaternion',
        [0, 1.2],
        quatKeyframes([
          [0, -0.45, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'bus_core.quaternion',
        [0, 0.6, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [-0.08, 0, 0],
          [-0.12, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('safe_hold', 2.0, [
      new THREE.QuaternionKeyframeTrack(
        'bus_core.quaternion',
        [0, 1.0, 2.0],
        quatKeyframes([
          [-0.12, 0, 0],
          [-0.12, 0.02, 0],
          [-0.12, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('safe_exit', 1.2, [
      new THREE.QuaternionKeyframeTrack(
        'bus_core.quaternion',
        [0, 1.2],
        quatKeyframes([
          [-0.12, 0, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'radiator_louver_l.quaternion',
        [0, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [0, 0.35, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'radiator_louver_r.quaternion',
        [0, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [0, -0.35, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('heater_on', 1.6, [
      new THREE.QuaternionKeyframeTrack(
        'radiator_louver_l.quaternion',
        [0, 0.8, 1.6],
        quatKeyframes([
          [0, 0.1, 0],
          [0, 0, 0],
          [0, 0.1, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'radiator_louver_r.quaternion',
        [0, 0.8, 1.6],
        quatKeyframes([
          [0, -0.1, 0],
          [0, 0, 0],
          [0, -0.1, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('heater_off', 1.0, [
      new THREE.QuaternionKeyframeTrack(
        'radiator_louver_l.quaternion',
        [0, 1.0],
        quatKeyframes([
          [0, 0, 0],
          [0, 0.52, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'radiator_louver_r.quaternion',
        [0, 1.0],
        quatKeyframes([
          [0, 0, 0],
          [0, -0.52, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('separation_drift', 2.4, [
      new THREE.VectorKeyframeTrack(
        'bus_core.position',
        [0, 1.2, 2.4],
        vecKeyframes([
          [0, 0, 0],
          [0, 0.08, 0.04],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'bus_core.quaternion',
        [0, 1.2, 2.4],
        quatKeyframes([
          [0, 0, 0],
          [0.04, 0.12, -0.03],
          [0, 0, 0],
        ]),
      ),
    ]),
  ];

  return { id: 'satellite-bus', root, clips };
}

// ───────────────────────── 1. Engines (eng-cold, eng-chem, eng-ion) ─────────────────────────

export function buildEngineModuleAsset(id: 'eng-cold' | 'eng-chem' | 'eng-ion'): GeneratedAsset {
  const p = createPalette();
  const root = new THREE.Group();
  root.name = 'module_root';

  root.add(createMountNode('engine_mount', [0, 0, 0]));

  // Mounting adapter plate at y = -0.04m
  root.add(
    makeMesh('engine_adapter_flange', new THREE.CylinderGeometry(0.24, 0.26, 0.07, 12), p.frameSteel, [0, -0.035, 0]),
  );

  const gimbalPivot = new THREE.Group();
  gimbalPivot.name = 'gimbal_pivot';
  gimbalPivot.position.set(0, -0.07, 0);
  root.add(gimbalPivot);

  if (id === 'eng-cold') {
    const cluster = new THREE.Group();
    cluster.name = 'nozzle_cluster';
    gimbalPivot.add(cluster);
    cluster.add(
      makeMesh('cold_manifold_hub', new THREE.CylinderGeometry(0.16, 0.14, 0.12, 10), p.hullMid, [0, -0.06, 0]),
      makeMesh('cold_nozzle_1', new THREE.ConeGeometry(0.055, 0.15, 10), p.nozzleGraphite, [0.1, -0.17, 0.1], [Math.PI, 0, 0.15]),
      makeMesh('cold_nozzle_2', new THREE.ConeGeometry(0.055, 0.15, 10), p.nozzleGraphite, [-0.1, -0.17, 0.1], [Math.PI, 0, -0.15]),
      makeMesh('cold_nozzle_3', new THREE.ConeGeometry(0.055, 0.15, 10), p.nozzleGraphite, [0.1, -0.17, -0.1], [Math.PI, 0, 0.15]),
      makeMesh('cold_nozzle_4', new THREE.ConeGeometry(0.055, 0.15, 10), p.nozzleGraphite, [-0.1, -0.17, -0.1], [Math.PI, 0, -0.15]),
    );
  } else if (id === 'eng-chem') {
    const bell = new THREE.Group();
    bell.name = 'bell_nozzle';
    gimbalPivot.add(bell);
    bell.add(
      makeMesh('chem_chamber_throat', new THREE.CylinderGeometry(0.11, 0.08, 0.14, 12), p.mliCopperTrim, [0, -0.07, 0]),
      makeMesh('chem_bell_skirt', new THREE.CylinderGeometry(0.08, 0.24, 0.34, 16), p.nozzleGraphite, [0, -0.31, 0]),
      makeMesh('chem_stiffener_ring', new THREE.TorusGeometry(0.19, 0.016, 8, 16), p.frameSteel, [0, -0.36, 0], [Math.PI / 2, 0, 0]),
    );
  } else {
    const ion = new THREE.Group();
    ion.name = 'ion_chamber';
    gimbalPivot.add(ion);
    ion.add(
      makeMesh('ion_housing_outer', new THREE.CylinderGeometry(0.28, 0.3, 0.18, 16), p.hullMid, [0, -0.09, 0]),
      makeMesh('ion_magnetic_ring', new THREE.TorusGeometry(0.24, 0.035, 10, 20), p.mliCopperTrim, [0, -0.19, 0], [Math.PI / 2, 0, 0]),
      makeMesh('ion_accel_grid', new THREE.CylinderGeometry(0.2, 0.2, 0.025, 16), p.ionGridCyan, [0, -0.195, 0]),
      makeMesh('ion_cathode_neutralizer', new THREE.CylinderGeometry(0.028, 0.022, 0.14, 8), p.frameSteel, [0.27, -0.16, 0], [0, 0, -0.35]),
    );
  }

  // Optional thruster plume VFX node (off during passive orbital observation)
  const vfxPlume = new THREE.Group();
  vfxPlume.name = 'vfx_thruster_plume';
  gimbalPivot.add(vfxPlume);
  const plumeY = id === 'eng-chem' ? -0.68 : id === 'eng-ion' ? -0.46 : -0.38;
  const plumeR = id === 'eng-ion' ? 0.22 : id === 'eng-chem' ? 0.19 : 0.14;
  vfxPlume.add(
    makeMesh('plume_cone_outer', new THREE.ConeGeometry(plumeR, 0.45, 12), p.vfxThrusterPlume, [0, plumeY, 0], [Math.PI, 0, 0]),
  );

  const clips: THREE.AnimationClip[] = [
    new THREE.AnimationClip('idle', 2.0, [
      new THREE.QuaternionKeyframeTrack('gimbal_pivot.quaternion', [0, 1.0, 2.0], quatKeyframes([[0, 0, 0], [0.01, 0, 0.01], [0, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_thruster_plume.scale', [0, 2.0], vecKeyframes([[0.001, 0.001, 0.001], [0.001, 0.001, 0.001]])),
    ]),
    new THREE.AnimationClip('ignition', 0.9, [
      new THREE.QuaternionKeyframeTrack('gimbal_pivot.quaternion', [0, 0.3, 0.6, 0.9], quatKeyframes([[0, 0, 0], [0.06, 0, -0.05], [-0.04, 0, 0.04], [0, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_thruster_plume.scale', [0, 0.4, 0.9], vecKeyframes([[0.01, 0.01, 0.01], [1.15, 1.25, 1.15], [1.0, 1.0, 1.0]])),
    ]),
    new THREE.AnimationClip('thrust', 1.5, [
      new THREE.QuaternionKeyframeTrack('gimbal_pivot.quaternion', [0, 0.5, 1.0, 1.5], quatKeyframes([[0, 0, 0], [0.04, 0, 0.03], [-0.04, 0, -0.03], [0, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_thruster_plume.scale', [0, 0.5, 1.0, 1.5], vecKeyframes([[1.0, 1.0, 1.0], [1.08, 1.18, 1.08], [0.95, 0.9, 0.95], [1.0, 1.0, 1.0]])),
    ]),
    new THREE.AnimationClip('shutdown', 1.0, [
      new THREE.QuaternionKeyframeTrack('gimbal_pivot.quaternion', [0, 1.0], quatKeyframes([[0.03, 0, 0], [0, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_thruster_plume.scale', [0, 0.5, 1.0], vecKeyframes([[1.0, 1.0, 1.0], [0.35, 0.2, 0.35], [0.001, 0.001, 0.001]])),
    ]),
  ];

  return { id, root, clips };
}

// ───────────────────────── 2. Solar Arrays (sol-s, sol-m, sol-l) ─────────────────────────
// Section 5 requirement:
// "Солнечная панель: deploy → изменение угла у шарнира → hold → stow,
//  без изменения формы и масштаба панели; ось крепления неподвижна."

export function buildSolarModuleAsset(id: 'sol-s' | 'sol-m' | 'sol-l'): GeneratedAsset {
  const p = createPalette();
  const root = new THREE.Group();
  root.name = 'module_root';

  // Stationary mounting sockets at origin (x = 0)
  root.add(
    createMountNode('solar_left', [0, 0, 0]),
    createMountNode('solar_right', [0, 0, 0]),
  );

  // Fixed mounting bracket at origin
  root.add(
    makeMesh('solar_mount_bracket', new THREE.BoxGeometry(0.08, 0.16, 0.16), p.frameSteel, [0.04, 0, 0]),
  );

  // Root hinge at x = 0.08m (rotates around X for sun tracking, around Z for deploy/stow)
  const hingeRoot = new THREE.Group();
  hingeRoot.name = 'solar_hinge_root';
  hingeRoot.position.set(0.08, 0, 0);
  root.add(hingeRoot);

  hingeRoot.add(
    makeMesh('solar_yoke_arm', new THREE.BoxGeometry(0.18, 0.04, 0.24), p.frameSteel, [0.09, 0, 0]),
  );

  const numSegments = id === 'sol-s' ? 1 : id === 'sol-m' ? 2 : 3;
  const segLen = 0.68;
  const segWidth = id === 'sol-l' ? 0.56 : 0.48;

  const buildPanelSegment = (index: number, parent: THREE.Group, offsetX: number): THREE.Group => {
    const segGroup = new THREE.Group();
    segGroup.name = `panel_seg_${index}`;
    segGroup.position.set(offsetX, 0, 0);
    parent.add(segGroup);

    // Rigid aluminum substrate frame (thickness 0.024m)
    segGroup.add(
      makeMesh(
        `panel_substrate_${index}`,
        new THREE.BoxGeometry(segLen - 0.02, 0.024, segWidth),
        p.frameSteel,
        [segLen * 0.5, 0, 0],
      ),
      // Solar photovoltaic wafer raised +0.008m above substrate top face (zero z-fighting!)
      makeMesh(
        `panel_cells_top_${index}`,
        new THREE.BoxGeometry(segLen - 0.06, 0.012, segWidth - 0.05),
        p.solarCellBlue,
        [segLen * 0.5, 0.016, 0],
      ),
      // Inter-cell silver busbar rib raised +0.006m above wafer
      makeMesh(
        `panel_busbar_${index}`,
        new THREE.BoxGeometry(segLen - 0.07, 0.006, 0.024),
        p.solarGridLine,
        [segLen * 0.5, 0.024, 0],
      ),
    );
    return segGroup;
  };

  const seg1 = buildPanelSegment(1, hingeRoot, 0.18);
  let seg2: THREE.Group | null = null;
  let seg3: THREE.Group | null = null;
  if (numSegments >= 2) {
    seg2 = buildPanelSegment(2, seg1, segLen);
  }
  if (numSegments >= 3 && seg2) {
    seg3 = buildPanelSegment(3, seg2, segLen);
  }

  // Build pure rotation tracks (NO scale tracks anywhere on solar panels!)
  const deployTracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(
      'solar_hinge_root.quaternion',
      [0, 0.9, 1.8],
      quatKeyframes([
        [0, 0, 1.48],
        [0, 0, 0.45],
        [0, 0, 0],
      ]),
    ),
  ];
  const stowTracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(
      'solar_hinge_root.quaternion',
      [0, 0.9, 1.8],
      quatKeyframes([
        [0, 0, 0],
        [0, 0, 0.65],
        [0, 0, 1.48],
      ]),
    ),
  ];

  if (seg2) {
    deployTracks.push(
      new THREE.QuaternionKeyframeTrack(
        'panel_seg_2.quaternion',
        [0, 0.9, 1.8],
        quatKeyframes([
          [0, 0, -2.65],
          [0, 0, -1.1],
          [0, 0, 0],
        ]),
      ),
    );
    stowTracks.push(
      new THREE.QuaternionKeyframeTrack(
        'panel_seg_2.quaternion',
        [0, 0.9, 1.8],
        quatKeyframes([
          [0, 0, 0],
          [0, 0, -1.1],
          [0, 0, -2.65],
        ]),
      ),
    );
  }

  if (seg3) {
    deployTracks.push(
      new THREE.QuaternionKeyframeTrack(
        'panel_seg_3.quaternion',
        [0, 0.9, 1.8],
        quatKeyframes([
          [0, 0, 2.65],
          [0, 0, 1.1],
          [0, 0, 0],
        ]),
      ),
    );
    stowTracks.push(
      new THREE.QuaternionKeyframeTrack(
        'panel_seg_3.quaternion',
        [0, 0.9, 1.8],
        quatKeyframes([
          [0, 0, 0],
          [0, 0, 1.1],
          [0, 0, 2.65],
        ]),
      ),
    );
  }

  const clips: THREE.AnimationClip[] = [
    new THREE.AnimationClip('deploy', 1.8, deployTracks),
    new THREE.AnimationClip('track_angle', 2.4, [
      new THREE.QuaternionKeyframeTrack(
        'solar_hinge_root.quaternion',
        [0, 0.6, 1.2, 1.8, 2.4],
        quatKeyframes([
          [0, 0, 0],
          [0.65, 0, 0],
          [0, 0, 0],
          [-0.65, 0, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('hold', 2.0, [
      new THREE.QuaternionKeyframeTrack(
        'solar_hinge_root.quaternion',
        [0, 1.0, 2.0],
        quatKeyframes([
          [0.25, 0, 0],
          [0.28, 0, 0],
          [0.25, 0, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('stow', 1.8, stowTracks),
    new THREE.AnimationClip('safe_feather', 1.4, [
      new THREE.QuaternionKeyframeTrack(
        'solar_hinge_root.quaternion',
        [0, 0.7, 1.4],
        quatKeyframes([
          [0, 0, 0],
          [0.5, 0, 0],
          [0.85, 0, 0],
        ]),
      ),
    ]),
  ];

  return { id, root, clips };
}

// ───────────────────────── 3. Batteries (bat-s, bat-m, bat-l) ─────────────────────────

export function buildBatteryModuleAsset(id: 'bat-s' | 'bat-m' | 'bat-l'): GeneratedAsset {
  const p = createPalette();
  const root = new THREE.Group();
  root.name = 'module_root';

  root.add(createMountNode('battery_mount', [0, 0, 0]));

  const packCore = new THREE.Group();
  packCore.name = 'battery_pack_core';
  root.add(packCore);

  const cellCount = id === 'bat-s' ? 1 : id === 'bat-m' ? 2 : 4;
  const width = id === 'bat-s' ? 0.26 : id === 'bat-m' ? 0.42 : 0.56;
  const height = id === 'bat-l' ? 0.38 : 0.24;

  packCore.add(
    makeMesh('battery_tray_base', new THREE.BoxGeometry(width, height, 0.18), p.hullMid, [0, 0, 0.09]),
    makeMesh('battery_thermal_strap', new THREE.BoxGeometry(width + 0.02, 0.04, 0.15), p.mliGoldFoil, [0, 0, 0.1]),
  );

  for (let i = 0; i < cellCount; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = cellCount === 1 ? 0 : (col - 0.5) * 0.18;
    const cy = cellCount <= 2 ? 0 : (row - 0.5) * 0.14;
    packCore.add(
      makeMesh(
        `li_ion_cell_${i}`,
        new THREE.CylinderGeometry(0.065, 0.065, 0.16, 12),
        p.batteryCellTeal,
        [cx, cy, 0.13],
        [Math.PI / 2, 0, 0],
      ),
    );
  }

  const chargeBar = new THREE.Group();
  chargeBar.name = 'charge_indicator_bar';
  chargeBar.position.set(0, height * 0.5 + 0.022, 0.14);
  root.add(chargeBar);
  chargeBar.add(
    makeMesh('charge_led_strip', new THREE.BoxGeometry(width * 0.75, 0.028, 0.028), p.ledGreen, [0, 0, 0]),
  );

  const barY = height * 0.5 + 0.022;
  const clips: THREE.AnimationClip[] = [
    new THREE.AnimationClip('idle', 2.0, [
      new THREE.VectorKeyframeTrack('charge_indicator_bar.position', [0, 1.0, 2.0], vecKeyframes([[0, barY, 0.14], [0, barY + 0.004, 0.14], [0, barY, 0.14]])),
    ]),
    new THREE.AnimationClip('charge_pulse', 1.6, [
      new THREE.VectorKeyframeTrack('charge_indicator_bar.scale', [0, 0.8, 1.6], vecKeyframes([[0.65, 1, 1], [1.05, 1.2, 1.2], [0.65, 1, 1]])),
    ]),
    new THREE.AnimationClip('discharge_pulse', 1.6, [
      new THREE.VectorKeyframeTrack('charge_indicator_bar.scale', [0, 0.8, 1.6], vecKeyframes([[1.0, 1, 1], [0.45, 0.9, 0.9], [1.0, 1, 1]])),
    ]),
    new THREE.AnimationClip('low_charge_warning', 1.0, [
      new THREE.VectorKeyframeTrack('charge_indicator_bar.scale', [0, 0.25, 0.5, 0.75, 1.0], vecKeyframes([[0.25, 1, 1], [0.9, 1.3, 1.3], [0.25, 1, 1], [0.9, 1.3, 1.3], [0.25, 1, 1]])),
    ]),
  ];

  return { id, root, clips };
}

// ───────────────────────── 4. Antennas (ant-s, ant-m, ant-l) ─────────────────────────

export function buildAntennaModuleAsset(id: 'ant-s' | 'ant-m' | 'ant-l'): GeneratedAsset {
  const p = createPalette();
  const root = new THREE.Group();
  root.name = 'module_root';

  root.add(createMountNode('antenna_mount', [0, 0, 0]));

  root.add(
    makeMesh('antenna_base_pedestal', new THREE.CylinderGeometry(0.11, 0.14, 0.08, 12), p.frameSteel, [0, 0.04, 0]),
  );

  // Yaw Gimbal Pivot at y = 0.08m
  const gimbalYaw = new THREE.Group();
  gimbalYaw.name = 'antenna_gimbal_yaw';
  gimbalYaw.position.set(0, 0.08, 0);
  root.add(gimbalYaw);

  const boomHeight = id === 'ant-s' ? 0.14 : id === 'ant-m' ? 0.24 : 0.34;
  gimbalYaw.add(
    makeMesh('antenna_mast_boom', new THREE.CylinderGeometry(0.036, 0.045, boomHeight, 10), p.frameSteel, [0, boomHeight * 0.5, 0]),
  );

  // Pitch Gimbal Pivot at top of boom
  const gimbalPitch = new THREE.Group();
  gimbalPitch.name = 'antenna_gimbal_pitch';
  gimbalPitch.position.set(0, boomHeight, 0);
  gimbalYaw.add(gimbalPitch);

  const radiator = new THREE.Group();
  radiator.name = 'antenna_radiator';
  gimbalPitch.add(radiator);

  if (id === 'ant-s') {
    radiator.add(
      makeMesh('sband_patch_plate', new THREE.BoxGeometry(0.22, 0.04, 0.22), p.mliGoldFoil, [0, 0.03, 0]),
      makeMesh('sband_dipole_whip', new THREE.CylinderGeometry(0.012, 0.018, 0.32, 8), p.antennaDishSilver, [0, 0.2, 0]),
      makeMesh('sband_tip_cap', new THREE.SphereGeometry(0.025, 8, 8), p.ledCyan, [0, 0.36, 0]),
    );
  } else if (id === 'ant-m') {
    radiator.add(
      makeMesh('xband_dish_bowl', new THREE.CylinderGeometry(0.34, 0.08, 0.14, 16), p.antennaDishSilver, [0, 0.08, 0]),
      makeMesh('xband_feed_horn', new THREE.CylinderGeometry(0.024, 0.038, 0.2, 10), p.hullDark, [0, 0.18, 0]),
      makeMesh('xband_feed_cap', new THREE.SphereGeometry(0.03, 10, 8), p.ledCyan, [0, 0.28, 0]),
    );
  } else {
    radiator.add(
      makeMesh('kaband_deep_dish', new THREE.CylinderGeometry(0.54, 0.12, 0.22, 20), p.antennaDishSilver, [0, 0.11, 0]),
      makeMesh('kaband_rim_collar', new THREE.TorusGeometry(0.54, 0.02, 8, 20), p.mliGoldFoil, [0, 0.22, 0], [Math.PI / 2, 0, 0]),
      makeMesh('kaband_subreflector', new THREE.CylinderGeometry(0.07, 0.09, 0.04, 12), p.mliGoldFoil, [0, 0.42, 0]),
      makeMesh('kaband_strut_1', new THREE.CylinderGeometry(0.01, 0.01, 0.34, 6), p.frameSteel, [0.16, 0.28, 0], [0, 0, 0.42]),
      makeMesh('kaband_strut_2', new THREE.CylinderGeometry(0.01, 0.01, 0.34, 6), p.frameSteel, [-0.16, 0.28, 0], [0, 0, -0.42]),
    );
  }

  // Separate optional radio downlink beam VFX node
  const vfxBeam = new THREE.Group();
  vfxBeam.name = 'vfx_downlink_beam';
  radiator.add(vfxBeam);
  vfxBeam.add(
    makeMesh('downlink_cone_mesh', new THREE.ConeGeometry(0.28, 0.85, 14), p.vfxDownlinkBeam, [0, 0.72, 0], [Math.PI, 0, 0]),
    makeMesh('downlink_pulse_ring', new THREE.TorusGeometry(0.22, 0.016, 8, 18), p.ledCyan, [0, 0.65, 0], [Math.PI / 2, 0, 0]),
  );

  const clips: THREE.AnimationClip[] = [
    new THREE.AnimationClip('deploy', 1.5, [
      new THREE.QuaternionKeyframeTrack('antenna_gimbal_pitch.quaternion', [0, 0.8, 1.5], quatKeyframes([[1.35, 0, 0], [0.4, 0, 0], [0, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_downlink_beam.scale', [0, 1.5], vecKeyframes([[0.001, 0.001, 0.001], [0.001, 0.001, 0.001]])),
    ]),
    new THREE.AnimationClip('aim', 1.2, [
      new THREE.QuaternionKeyframeTrack('antenna_gimbal_yaw.quaternion', [0, 0.6, 1.2], quatKeyframes([[0, 0, 0], [0, 0.45, 0], [0, 0.65, 0]])),
      new THREE.QuaternionKeyframeTrack('antenna_gimbal_pitch.quaternion', [0, 0.6, 1.2], quatKeyframes([[0, 0, 0], [0.25, 0, 0], [0.42, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_downlink_beam.scale', [0, 1.2], vecKeyframes([[0.001, 0.001, 0.001], [0.001, 0.001, 0.001]])),
    ]),
    new THREE.AnimationClip('transmit', 2.0, [
      new THREE.QuaternionKeyframeTrack('antenna_gimbal_yaw.quaternion', [0, 1.0, 2.0], quatKeyframes([[0, 0.65, 0], [0, 0.85, 0], [0, 0.65, 0]])),
      new THREE.QuaternionKeyframeTrack('antenna_gimbal_pitch.quaternion', [0, 1.0, 2.0], quatKeyframes([[0.42, 0, 0], [0.48, 0, 0], [0.42, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_downlink_beam.scale', [0, 0.5, 1.0, 1.5, 2.0], vecKeyframes([[1, 1, 1], [1.15, 1.2, 1.15], [0.92, 1.0, 0.92], [1.15, 1.2, 1.15], [1, 1, 1]])),
    ]),
    new THREE.AnimationClip('standby', 2.0, [
      new THREE.QuaternionKeyframeTrack('antenna_gimbal_yaw.quaternion', [0, 1.0, 2.0], quatKeyframes([[0, 0, 0], [0, 0.08, 0], [0, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('antenna_gimbal_pitch.quaternion', [0, 1.0, 2.0], quatKeyframes([[0, 0, 0], [0.05, 0, 0], [0, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_downlink_beam.scale', [0, 2.0], vecKeyframes([[0.001, 0.001, 0.001], [0.001, 0.001, 0.001]])),
    ]),
    new THREE.AnimationClip('stow', 1.4, [
      new THREE.QuaternionKeyframeTrack('antenna_gimbal_yaw.quaternion', [0, 1.4], quatKeyframes([[0, 0.4, 0], [0, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('antenna_gimbal_pitch.quaternion', [0, 0.7, 1.4], quatKeyframes([[0, 0, 0], [0.7, 0, 0], [1.35, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_downlink_beam.scale', [0, 1.4], vecKeyframes([[0.001, 0.001, 0.001], [0.001, 0.001, 0.001]])),
    ]),
  ];

  return { id, root, clips };
}

// ───────────────────────── 5. Cameras / Instruments (cam-s, cam-m, cam-l) ─────────────────────────

export function buildCameraModuleAsset(id: 'cam-s' | 'cam-m' | 'cam-l'): GeneratedAsset {
  const p = createPalette();
  const root = new THREE.Group();
  root.name = 'module_root';

  root.add(createMountNode('camera_mount', [0, 0, 0]));

  const radius = id === 'cam-s' ? 0.11 : id === 'cam-m' ? 0.17 : 0.25;
  const barrelLen = id === 'cam-s' ? 0.2 : id === 'cam-m' ? 0.34 : 0.52;

  const cameraGimbal = new THREE.Group();
  cameraGimbal.name = 'camera_gimbal';
  root.add(cameraGimbal);

  cameraGimbal.add(
    makeMesh('camera_mount_collar', new THREE.CylinderGeometry(radius * 0.95, radius * 1.05, 0.07, 14), p.frameSteel, [0, 0.035, 0]),
    makeMesh('camera_optical_barrel', new THREE.CylinderGeometry(radius, radius * 0.92, barrelLen, 16), p.hullDark, [0, barrelLen * 0.5 + 0.04, 0]),
    makeMesh('camera_gold_wrap', new THREE.CylinderGeometry(radius * 1.02, radius * 0.96, barrelLen * 0.55, 16), p.mliGoldFoil, [0, barrelLen * 0.42 + 0.04, 0]),
  );

  // Primary Lens recessed slightly below the rim so shutters never intersect it
  const lensY = barrelLen + 0.035;
  const opticsLens = new THREE.Group();
  opticsLens.name = 'optics_lens';
  opticsLens.position.set(0, lensY, 0);
  cameraGimbal.add(opticsLens);
  opticsLens.add(
    makeMesh('lens_glass_disc', new THREE.CylinderGeometry(radius * 0.78, radius * 0.78, 0.024, 16), p.opticsLensCyan, [0, 0, 0]),
  );

  if (id === 'cam-l') {
    // Cassegrain secondary mirror spider for large telescope
    opticsLens.add(
      makeMesh('cassegrain_secondary_hub', new THREE.CylinderGeometry(0.055, 0.055, 0.035, 12), p.frameSteel, [0, 0.03, 0]),
      makeMesh('cassegrain_spider_vane_1', new THREE.BoxGeometry(radius * 1.75, 0.012, 0.016), p.frameSteel, [0, 0.025, 0]),
      makeMesh('cassegrain_spider_vane_2', new THREE.BoxGeometry(0.016, 0.012, radius * 1.75), p.frameSteel, [0, 0.025, 0]),
    );
  }

  // Hinged shutter doors at rim edge (+X and -X)
  const rimY = barrelLen + 0.045;
  const shutterL = new THREE.Group();
  shutterL.name = 'camera_shutter_l';
  shutterL.position.set(-radius, rimY, 0);
  cameraGimbal.add(shutterL);
  shutterL.add(
    makeMesh('shutter_leaf_l', new THREE.BoxGeometry(radius * 0.96, 0.02, radius * 1.55), p.hullLight, [radius * 0.48, 0.01, 0]),
  );

  const shutterR = new THREE.Group();
  shutterR.name = 'camera_shutter_r';
  shutterR.position.set(radius, rimY, 0);
  cameraGimbal.add(shutterR);
  shutterR.add(
    makeMesh('shutter_leaf_r', new THREE.BoxGeometry(radius * 0.96, 0.02, radius * 1.55), p.hullLight, [-radius * 0.48, 0.01, 0]),
  );

  // Separate optional scan cone VFX node (distinct from lens/shutter mechanics!)
  const vfxScanCone = new THREE.Group();
  vfxScanCone.name = 'vfx_scan_cone';
  vfxScanCone.position.set(0, rimY + 0.02, 0);
  cameraGimbal.add(vfxScanCone);
  vfxScanCone.add(
    makeMesh('scan_frustum_cone', new THREE.ConeGeometry(radius * 2.2, 0.85, 16), p.vfxScanCone, [0, 0.45, 0], [Math.PI, 0, 0]),
  );

  const clips: THREE.AnimationClip[] = [
    new THREE.AnimationClip('aim', 1.2, [
      new THREE.QuaternionKeyframeTrack('camera_shutter_l.quaternion', [0, 0.7, 1.2], quatKeyframes([[0, 0, 0], [0, 0, 1.65], [0, 0, 1.95]])),
      new THREE.QuaternionKeyframeTrack('camera_shutter_r.quaternion', [0, 0.7, 1.2], quatKeyframes([[0, 0, 0], [0, 0, -1.65], [0, 0, -1.95]])),
      new THREE.QuaternionKeyframeTrack('camera_gimbal.quaternion', [0, 1.2], quatKeyframes([[0, 0, 0], [0.12, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_scan_cone.scale', [0, 1.2], vecKeyframes([[0.001, 0.001, 0.001], [0.001, 0.001, 0.001]])),
    ]),
    new THREE.AnimationClip('scan', 2.0, [
      new THREE.QuaternionKeyframeTrack('camera_shutter_l.quaternion', [0, 2.0], quatKeyframes([[0, 0, 1.95], [0, 0, 1.95]])),
      new THREE.QuaternionKeyframeTrack('camera_shutter_r.quaternion', [0, 2.0], quatKeyframes([[0, 0, -1.95], [0, 0, -1.95]])),
      new THREE.QuaternionKeyframeTrack('camera_gimbal.quaternion', [0, 0.5, 1.0, 1.5, 2.0], quatKeyframes([[0.12, 0, 0], [0.12, 0, 0.16], [0.12, 0, 0], [0.12, 0, -0.16], [0.12, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_scan_cone.scale', [0, 0.5, 1.0, 1.5, 2.0], vecKeyframes([[1, 1, 1], [1.1, 1.05, 1.1], [1, 1, 1], [1.1, 1.05, 1.1], [1, 1, 1]])),
    ]),
    new THREE.AnimationClip('park', 1.2, [
      new THREE.VectorKeyframeTrack('vfx_scan_cone.scale', [0, 0.3, 1.2], vecKeyframes([[1, 1, 1], [0.001, 0.001, 0.001], [0.001, 0.001, 0.001]])),
      new THREE.QuaternionKeyframeTrack('camera_gimbal.quaternion', [0, 1.2], quatKeyframes([[0.12, 0, 0], [0, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('camera_shutter_l.quaternion', [0, 0.4, 1.2], quatKeyframes([[0, 0, 1.95], [0, 0, 1.2], [0, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('camera_shutter_r.quaternion', [0, 0.4, 1.2], quatKeyframes([[0, 0, -1.95], [0, 0, -1.2], [0, 0, 0]])),
    ]),
    new THREE.AnimationClip('cold_locked', 1.6, [
      new THREE.QuaternionKeyframeTrack('camera_shutter_l.quaternion', [0, 1.6], quatKeyframes([[0, 0, 0], [0, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('camera_shutter_r.quaternion', [0, 1.6], quatKeyframes([[0, 0, 0], [0, 0, 0]])),
      new THREE.QuaternionKeyframeTrack('camera_gimbal.quaternion', [0, 0.25, 0.5, 0.75, 1.6], quatKeyframes([[0, 0, 0], [0.03, 0, 0.03], [-0.03, 0, -0.03], [0, 0, 0], [0, 0, 0]])),
      new THREE.VectorKeyframeTrack('vfx_scan_cone.scale', [0, 1.6], vecKeyframes([[0.001, 0.001, 0.001], [0.001, 0.001, 0.001]])),
    ]),
  ];

  return { id, root, clips };
}

// ───────────────────────── 6. Earth, Ground Station & Orbit Ring ─────────────────────────

export function buildEarthEnvironmentAsset(): GeneratedAsset {
  const p = createPalette();
  const root = new THREE.Group();
  root.name = 'earth_root';

  const oceanSphere = new THREE.Group();
  oceanSphere.name = 'earth_ocean_sphere';
  root.add(oceanSphere);

  // Ocean sphere radius = 1.15m
  oceanSphere.add(
    makeMesh('ocean_globe_mesh', new THREE.IcosahedronGeometry(1.15, 2), p.earthOcean, [0, 0, 0]),
  );

  // Raised continental blocks positioned at radius 1.12m..1.21m (proud of ocean surface, zero coplanar faces!)
  const continents = new THREE.Group();
  continents.name = 'earth_continents';
  oceanSphere.add(continents);

  continents.add(
    makeMesh('continent_eurasia', new THREE.BoxGeometry(0.65, 0.38, 0.22), p.earthLand, [0.42, 0.55, 0.88], [-0.45, 0.42, 0.2]),
    makeMesh('continent_africa', new THREE.BoxGeometry(0.42, 0.52, 0.2), p.earthLand, [0.22, -0.1, 1.08], [0.08, 0.2, -0.1]),
    makeMesh('continent_americas_n', new THREE.BoxGeometry(0.48, 0.44, 0.2), p.earthLand, [-0.82, 0.48, 0.58], [-0.35, -0.85, 0]),
    makeMesh('continent_americas_s', new THREE.BoxGeometry(0.32, 0.52, 0.2), p.earthLand, [-0.65, -0.38, 0.78], [0.28, -0.65, 0.15]),
    makeMesh('continent_australia', new THREE.BoxGeometry(0.32, 0.24, 0.18), p.earthLand, [0.88, -0.45, -0.52], [0.35, 2.1, 0]),
    makeMesh('polar_cap_north', new THREE.CylinderGeometry(0.42, 0.48, 0.12, 12), p.earthIce, [0, 1.13, 0]),
    makeMesh('polar_cap_south', new THREE.CylinderGeometry(0.48, 0.42, 0.12, 12), p.earthIce, [0, -1.13, 0]),
  );

  // Ground Station Dish on Earth surface (+Z/+X hemisphere)
  const groundStation = createMountNode('ground_station_anchor', [0.35, 0.22, 1.12], [0.2, 0.3, 0]);
  oceanSphere.add(groundStation);
  groundStation.add(
    makeMesh('station_pad_base', new THREE.CylinderGeometry(0.08, 0.09, 0.05, 10), p.frameSteel, [0, 0, 0.025], [Math.PI / 2, 0, 0]),
    makeMesh('station_dish_reflector', new THREE.CylinderGeometry(0.11, 0.03, 0.06, 12), p.antennaDishSilver, [0, 0, 0.08], [Math.PI / 2, 0, 0]),
  );

  const vfxStationBeacon = new THREE.Group();
  vfxStationBeacon.name = 'vfx_station_beacon';
  groundStation.add(vfxStationBeacon);
  vfxStationBeacon.add(
    makeMesh('station_ping_ring', new THREE.TorusGeometry(0.16, 0.014, 8, 18), p.ledCyan, [0, 0, 0.11]),
  );

  // Inclined Low-Earth Orbit Ring (radius 1.78m)
  const orbitalRing = new THREE.Group();
  orbitalRing.name = 'orbital_ring';
  orbitalRing.rotation.set(0.28, 0, -0.32);
  root.add(orbitalRing);
  orbitalRing.add(
    makeMesh('orbit_trajectory_torus', new THREE.TorusGeometry(1.78, 0.015, 8, 48), p.ledCyan, [0, 0, 0], [Math.PI / 2, 0, 0]),
  );

  const clips: THREE.AnimationClip[] = [
    new THREE.AnimationClip('rotate_orbit', 4.0, [
      new THREE.QuaternionKeyframeTrack(
        'earth_ocean_sphere.quaternion',
        [0, 1.0, 2.0, 3.0, 4.0],
        quatKeyframes([
          [0, 0, 0],
          [0, Math.PI * 0.5, 0],
          [0, Math.PI, 0],
          [0, Math.PI * 1.5, 0],
          [0, Math.PI * 2, 0],
        ]),
      ),
    ]),
    new THREE.AnimationClip('station_pass_ping', 2.0, [
      new THREE.VectorKeyframeTrack(
        'vfx_station_beacon.scale',
        [0, 0.5, 1.0, 1.5, 2.0],
        vecKeyframes([
          [0.8, 0.8, 0.8],
          [1.65, 1.65, 1.65],
          [0.8, 0.8, 0.8],
          [1.65, 1.65, 1.65],
          [0.8, 0.8, 0.8],
        ]),
      ),
    ]),
    new THREE.AnimationClip('storm_front', 2.4, [
      new THREE.QuaternionKeyframeTrack(
        'orbital_ring.quaternion',
        [0, 1.2, 2.4],
        quatKeyframes([
          [0.28, 0, -0.32],
          [0.32, 0.12, -0.28],
          [0.28, 0, -0.32],
        ]),
      ),
    ]),
  ];

  return { id: 'earth', root, clips };
}
