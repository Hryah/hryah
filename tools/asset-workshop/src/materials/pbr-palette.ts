import * as THREE from 'three';

export interface MaterialPalette {
  hullDark: THREE.MeshStandardMaterial;
  hullMid: THREE.MeshStandardMaterial;
  hullLight: THREE.MeshStandardMaterial;
  frameSteel: THREE.MeshStandardMaterial;
  solarCellBlue: THREE.MeshStandardMaterial;
  solarGridLine: THREE.MeshStandardMaterial;
  mliGoldFoil: THREE.MeshStandardMaterial;
  mliCopperTrim: THREE.MeshStandardMaterial;
  suitWhite: THREE.MeshStandardMaterial;
  suitJointGray: THREE.MeshStandardMaterial;
  suitAccentOrange: THREE.MeshStandardMaterial;
  visorDarkGlass: THREE.MeshStandardMaterial;
  opticsLensCyan: THREE.MeshStandardMaterial;
  nozzleGraphite: THREE.MeshStandardMaterial;
  ionGridCyan: THREE.MeshStandardMaterial;
  batteryCellTeal: THREE.MeshStandardMaterial;
  antennaDishSilver: THREE.MeshStandardMaterial;
  consoleBezelDark: THREE.MeshStandardMaterial;
  consoleScreenBlue: THREE.MeshStandardMaterial;
  earthOcean: THREE.MeshStandardMaterial;
  earthLand: THREE.MeshStandardMaterial;
  earthIce: THREE.MeshStandardMaterial;
  earthAtmosphere: THREE.MeshStandardMaterial;
  ledGreen: THREE.MeshStandardMaterial;
  ledAmber: THREE.MeshStandardMaterial;
  ledRed: THREE.MeshStandardMaterial;
  ledCyan: THREE.MeshStandardMaterial;
  ledOff: THREE.MeshStandardMaterial;
  vfxScanCone: THREE.MeshStandardMaterial;
  vfxDownlinkBeam: THREE.MeshStandardMaterial;
  vfxThrusterPlume: THREE.MeshStandardMaterial;
  vfxHeaterGlow: THREE.MeshStandardMaterial;
  vfxColdFrost: THREE.MeshStandardMaterial;
  vfxStormWave: THREE.MeshStandardMaterial;
}

export function createPalette(): MaterialPalette {
  const mat = (
    name: string,
    colorHex: number,
    roughness: number,
    metalness: number,
    opts: {
      emissive?: number;
      emissiveIntensity?: number;
      transparent?: boolean;
      opacity?: number;
      depthWrite?: boolean;
    } = {},
  ) => {
    const m = new THREE.MeshStandardMaterial({
      name,
      color: new THREE.Color(colorHex),
      roughness,
      metalness,
      emissive: new THREE.Color(opts.emissive ?? 0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1.0,
      depthWrite: opts.depthWrite ?? !(opts.transparent ?? false),
      side: THREE.FrontSide,
    });
    return m;
  };

  return {
    hullDark: mat('mat_hull_dark', 0x1a2332, 0.55, 0.45),
    hullMid: mat('mat_hull_mid', 0x28364a, 0.5, 0.42),
    hullLight: mat('mat_hull_light', 0x3b4d66, 0.45, 0.38),
    frameSteel: mat('mat_frame_steel', 0x6f8197, 0.38, 0.72),
    solarCellBlue: mat('mat_solar_cell_blue', 0x164c82, 0.28, 0.35, {
      emissive: 0x081e38,
      emissiveIntensity: 0.25,
    }),
    solarGridLine: mat('mat_solar_grid_line', 0x92b4d4, 0.32, 0.68),
    mliGoldFoil: mat('mat_mli_gold_foil', 0xcf9f37, 0.32, 0.78, {
      emissive: 0x261a05,
      emissiveIntensity: 0.15,
    }),
    mliCopperTrim: mat('mat_mli_copper_trim', 0xa86b2c, 0.36, 0.74),
    suitWhite: mat('mat_suit_white', 0xe6ecf2, 0.62, 0.08),
    suitJointGray: mat('mat_suit_joint_gray', 0x394554, 0.68, 0.22),
    suitAccentOrange: mat('mat_suit_accent_orange', 0xe06d2b, 0.45, 0.18),
    visorDarkGlass: mat('mat_visor_dark_glass', 0x0d1b2a, 0.14, 0.85, {
      emissive: 0x0b253c,
      emissiveIntensity: 0.2,
    }),
    opticsLensCyan: mat('mat_optics_lens_cyan', 0x1d6b87, 0.15, 0.8, {
      emissive: 0x16536b,
      emissiveIntensity: 0.35,
    }),
    nozzleGraphite: mat('mat_nozzle_graphite', 0x232931, 0.48, 0.68),
    ionGridCyan: mat('mat_ion_grid_cyan', 0x3ac2f0, 0.22, 0.5, {
      emissive: 0x2596c4,
      emissiveIntensity: 0.75,
    }),
    batteryCellTeal: mat('mat_battery_cell_teal', 0x245e68, 0.42, 0.35),
    antennaDishSilver: mat('mat_antenna_dish_silver', 0xc5d1de, 0.3, 0.65),
    consoleBezelDark: mat('mat_console_bezel_dark', 0x151d28, 0.6, 0.35),
    consoleScreenBlue: mat('mat_console_screen_blue', 0x153e5c, 0.25, 0.2, {
      emissive: 0x174c70,
      emissiveIntensity: 0.45,
    }),
    earthOcean: mat('mat_earth_ocean', 0x174d6e, 0.42, 0.18),
    earthLand: mat('mat_earth_land', 0x5c8b6e, 0.68, 0.08),
    earthIce: mat('mat_earth_ice', 0xdce7ef, 0.5, 0.05),
    earthAtmosphere: mat('mat_earth_atmosphere', 0x6ec3e8, 0.25, 0.0, {
      emissive: 0x2b7fa6,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
    ledGreen: mat('mat_led_green', 0x45e08b, 0.2, 0.1, {
      emissive: 0x2fd478,
      emissiveIntensity: 0.9,
    }),
    ledAmber: mat('mat_led_amber', 0xf5a638, 0.2, 0.1, {
      emissive: 0xe6911e,
      emissiveIntensity: 0.9,
    }),
    ledRed: mat('mat_led_red', 0xf05252, 0.2, 0.1, {
      emissive: 0xd93838,
      emissiveIntensity: 0.95,
    }),
    ledCyan: mat('mat_led_cyan', 0x4cd4f7, 0.2, 0.1, {
      emissive: 0x29b8de,
      emissiveIntensity: 0.9,
    }),
    ledOff: mat('mat_led_off', 0x27313d, 0.65, 0.2),
    vfxScanCone: mat('mat_vfx_scan_cone', 0x56e3c2, 0.2, 0.0, {
      emissive: 0x38cfa8,
      emissiveIntensity: 0.75,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
    vfxDownlinkBeam: mat('mat_vfx_downlink_beam', 0x6ee7b7, 0.2, 0.0, {
      emissive: 0x42d49c,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    }),
    vfxThrusterPlume: mat('mat_vfx_thruster_plume', 0x60c5ff, 0.2, 0.0, {
      emissive: 0x3ba8f5,
      emissiveIntensity: 0.95,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
    vfxHeaterGlow: mat('mat_vfx_heater_glow', 0xf29d38, 0.3, 0.0, {
      emissive: 0xd97d18,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
    vfxColdFrost: mat('mat_vfx_cold_frost', 0x9ce3ff, 0.3, 0.1, {
      emissive: 0x52b6e8,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
    vfxStormWave: mat('mat_vfx_storm_wave', 0xf4b46a, 0.25, 0.0, {
      emissive: 0xe3963e,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  };
}

/**
 * Creates a stationary named mount/socket node with metadata.
 */
export function createMountNode(
  name: string,
  position: [number, number, number],
  rotationEuler: [number, number, number] = [0, 0, 0],
): THREE.Group {
  const node = new THREE.Group();
  node.name = name;
  node.position.set(position[0], position[1], position[2]);
  node.rotation.set(rotationEuler[0], rotationEuler[1], rotationEuler[2]);
  node.userData = { isMount: true, mountName: name };
  return node;
}

/**
 * Helper to create a clean mesh with non-zero thickness and explicit material.
 */
export function makeMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  geometry.computeVertexNormals();
  geometry.normalizeNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (material.transparent) {
    mesh.renderOrder = 2;
  }
  return mesh;
}

/**
 * Helper to build aQuaternion keyframe array from Euler angles in radians.
 */
export function quatKeyframes(eulers: Array<[number, number, number]>): number[] {
  const values: number[] = [];
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  for (const [rx, ry, rz] of eulers) {
    euler.set(rx, ry, rz, 'XYZ');
    quat.setFromEuler(euler);
    values.push(quat.x, quat.y, quat.z, quat.w);
  }
  return values;
}

/**
 * Helper to build a Vector3 keyframe array from [x, y, z] tuples.
 */
export function vecKeyframes(vecs: Array<[number, number, number]>): number[] {
  const values: number[] = [];
  for (const [x, y, z] of vecs) {
    values.push(x, y, z);
  }
  return values;
}
