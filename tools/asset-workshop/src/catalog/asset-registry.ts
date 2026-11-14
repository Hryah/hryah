export type AssetCategory =
  | 'scenes'
  | 'character'
  | 'ship'
  | 'satellite'
  | 'engine'
  | 'solar'
  | 'battery'
  | 'antenna'
  | 'instrument'
  | 'environment';

export interface ClipMeta {
  name: string;
  durationS: number;
  loop: boolean;
  rootMotion: 'in-place' | 'scene-demo';
  allowedTransitions: string[];
}

export interface CatalogModuleStats {
  slot: 'engine' | 'solar' | 'battery' | 'antenna' | 'instrument';
  massKg: number;
  costMUsd: number;
  ispS?: number;
  powerW?: number;
  capacityWh?: number;
  downlinkMbps?: number;
  apertureM?: number;
  dataRateMbps?: number;
}

export interface WorkshopAssetDef {
  id: string;
  category: AssetCategory;
  isCompositeScene?: boolean;
  /** Path inside the workshop's generated/assets/workshop/ directory. */
  glbPath: string;
  /** Path inside downloadable ZIP archive */
  zipPath: string;
  nameKey: string;
  descKey: string;
  catalogStats?: CatalogModuleStats;
  requiredNodes: string[];
  mounts: string[];
  vfxLayers: string[];
  clips: ClipMeta[];
}

export const ASTRONAUT_CLIPS: ClipMeta[] = [
  {
    name: 'idle',
    durationS: 2.4,
    loop: true,
    rootMotion: 'in-place',
    allowedTransitions: ['run', 'float_idle', 'float_move', 'push_off', 'task_work', 'switch_on', 'switch_off', 'turn_left', 'turn_right', 'reposition'],
  },
  {
    name: 'run',
    durationS: 1.0,
    loop: true,
    rootMotion: 'in-place',
    allowedTransitions: ['idle', 'turn_left', 'turn_right', 'task_work', 'switch_on', 'switch_off'],
  },
  {
    name: 'float_idle',
    durationS: 3.0,
    loop: true,
    rootMotion: 'in-place',
    allowedTransitions: ['float_move', 'push_off', 'grab_handle', 'idle', 'task_work', 'switch_on', 'switch_off'],
  },
  {
    name: 'float_move',
    durationS: 1.6,
    loop: true,
    rootMotion: 'in-place',
    allowedTransitions: ['float_idle', 'grab_handle', 'push_off', 'task_work'],
  },
  {
    name: 'push_off',
    durationS: 1.1,
    loop: false,
    rootMotion: 'in-place',
    allowedTransitions: ['float_move', 'float_idle', 'grab_handle'],
  },
  {
    name: 'grab_handle',
    durationS: 1.1,
    loop: false,
    rootMotion: 'in-place',
    allowedTransitions: ['float_idle', 'task_work', 'switch_on', 'switch_off', 'idle'],
  },
  {
    name: 'task_work',
    durationS: 2.0,
    loop: true,
    rootMotion: 'in-place',
    allowedTransitions: ['task_success', 'task_error', 'switch_on', 'switch_off', 'idle', 'float_idle'],
  },
  {
    name: 'switch_on',
    durationS: 1.2,
    loop: false,
    rootMotion: 'in-place',
    allowedTransitions: ['task_work', 'task_success', 'idle', 'float_idle', 'switch_off'],
  },
  {
    name: 'switch_off',
    durationS: 1.2,
    loop: false,
    rootMotion: 'in-place',
    allowedTransitions: ['task_work', 'task_success', 'idle', 'float_idle', 'switch_on'],
  },
  {
    name: 'turn_left',
    durationS: 0.9,
    loop: false,
    rootMotion: 'in-place',
    allowedTransitions: ['idle', 'run', 'float_idle', 'float_move'],
  },
  {
    name: 'turn_right',
    durationS: 0.9,
    loop: false,
    rootMotion: 'in-place',
    allowedTransitions: ['idle', 'run', 'float_idle', 'float_move'],
  },
  {
    name: 'reposition',
    durationS: 2.4,
    loop: false,
    rootMotion: 'scene-demo',
    allowedTransitions: ['idle', 'task_work', 'switch_on', 'switch_off'],
  },
  {
    name: 'task_success',
    durationS: 1.2,
    loop: false,
    rootMotion: 'in-place',
    allowedTransitions: ['idle', 'float_idle', 'run'],
  },
  {
    name: 'task_error',
    durationS: 1.2,
    loop: false,
    rootMotion: 'in-place',
    allowedTransitions: ['idle', 'float_idle', 'task_work'],
  },
];

export const SHIP_CUTAWAY_CLIPS: ClipMeta[] = [
  { name: 'hatch_open', durationS: 1.5, loop: false, rootMotion: 'in-place', allowedTransitions: ['hatch_close'] },
  { name: 'hatch_close', durationS: 1.5, loop: false, rootMotion: 'in-place', allowedTransitions: ['hatch_open'] },
  { name: 'docking_approach', durationS: 2.0, loop: false, rootMotion: 'in-place', allowedTransitions: ['docking_align', 'docking_abort'] },
  { name: 'docking_align', durationS: 1.6, loop: false, rootMotion: 'in-place', allowedTransitions: ['docking_latch', 'docking_abort'] },
  { name: 'docking_latch', durationS: 1.2, loop: false, rootMotion: 'in-place', allowedTransitions: ['docking_docked', 'docking_abort'] },
  { name: 'docking_docked', durationS: 2.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['docking_abort'] },
  { name: 'docking_abort', durationS: 1.6, loop: false, rootMotion: 'in-place', allowedTransitions: ['docking_approach'] },
  { name: 'satellite_release_latch', durationS: 1.2, loop: false, rootMotion: 'in-place', allowedTransitions: ['satellite_depart'] },
  { name: 'satellite_depart', durationS: 2.0, loop: false, rootMotion: 'in-place', allowedTransitions: ['satellite_drift'] },
  { name: 'satellite_drift', durationS: 2.8, loop: true, rootMotion: 'in-place', allowedTransitions: [] },
];

export const CONSOLE_CLIPS: ClipMeta[] = [
  { name: 'idle', durationS: 2.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['switch_on', 'switch_off', 'work_cycle', 'confirm', 'alarm'] },
  { name: 'switch_on', durationS: 0.9, loop: false, rootMotion: 'in-place', allowedTransitions: ['work_cycle', 'switch_off', 'idle'] },
  { name: 'switch_off', durationS: 0.9, loop: false, rootMotion: 'in-place', allowedTransitions: ['switch_on', 'idle'] },
  { name: 'work_cycle', durationS: 1.8, loop: true, rootMotion: 'in-place', allowedTransitions: ['confirm', 'switch_off', 'idle'] },
  { name: 'confirm', durationS: 1.0, loop: false, rootMotion: 'in-place', allowedTransitions: ['idle', 'work_cycle'] },
  { name: 'alarm', durationS: 1.2, loop: true, rootMotion: 'in-place', allowedTransitions: ['idle', 'switch_off'] },
];

export const ORBITAL_SWITCH_CLIPS: ClipMeta[] = [
  { name: 'all_on_nominal', durationS: 1.2, loop: false, rootMotion: 'in-place', allowedTransitions: ['camera_on', 'camera_off', 'transmitter_on', 'transmitter_off', 'heater_on', 'heater_off', 'safe_mode_on', 'safe_mode_off'] },
  { name: 'camera_on', durationS: 0.8, loop: false, rootMotion: 'in-place', allowedTransitions: ['camera_off', 'safe_mode_on'] },
  { name: 'camera_off', durationS: 0.8, loop: false, rootMotion: 'in-place', allowedTransitions: ['camera_on', 'safe_mode_on'] },
  { name: 'transmitter_on', durationS: 0.8, loop: false, rootMotion: 'in-place', allowedTransitions: ['transmitter_off', 'safe_mode_on'] },
  { name: 'transmitter_off', durationS: 0.8, loop: false, rootMotion: 'in-place', allowedTransitions: ['transmitter_on', 'safe_mode_on'] },
  { name: 'heater_on', durationS: 0.8, loop: false, rootMotion: 'in-place', allowedTransitions: ['heater_off', 'safe_mode_on'] },
  { name: 'heater_off', durationS: 0.8, loop: false, rootMotion: 'in-place', allowedTransitions: ['heater_on', 'safe_mode_on'] },
  { name: 'safe_mode_on', durationS: 1.0, loop: false, rootMotion: 'in-place', allowedTransitions: ['safe_mode_off'] },
  { name: 'safe_mode_off', durationS: 1.0, loop: false, rootMotion: 'in-place', allowedTransitions: ['safe_mode_on', 'all_on_nominal'] },
];

export const SATELLITE_BUS_CLIPS: ClipMeta[] = [
  { name: 'idle', durationS: 2.4, loop: true, rootMotion: 'in-place', allowedTransitions: ['safe_enter', 'heater_on', 'separation_drift'] },
  { name: 'safe_enter', durationS: 1.2, loop: false, rootMotion: 'in-place', allowedTransitions: ['safe_hold', 'safe_exit'] },
  { name: 'safe_hold', durationS: 2.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['safe_exit'] },
  { name: 'safe_exit', durationS: 1.2, loop: false, rootMotion: 'in-place', allowedTransitions: ['idle', 'heater_on'] },
  { name: 'heater_on', durationS: 1.6, loop: true, rootMotion: 'in-place', allowedTransitions: ['heater_off', 'safe_enter'] },
  { name: 'heater_off', durationS: 1.0, loop: false, rootMotion: 'in-place', allowedTransitions: ['heater_on', 'idle'] },
  { name: 'separation_drift', durationS: 2.4, loop: true, rootMotion: 'in-place', allowedTransitions: ['idle'] },
];

export const ENGINE_CLIPS: ClipMeta[] = [
  { name: 'idle', durationS: 2.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['ignition'] },
  { name: 'ignition', durationS: 0.9, loop: false, rootMotion: 'in-place', allowedTransitions: ['thrust', 'shutdown'] },
  { name: 'thrust', durationS: 1.5, loop: true, rootMotion: 'in-place', allowedTransitions: ['shutdown'] },
  { name: 'shutdown', durationS: 1.0, loop: false, rootMotion: 'in-place', allowedTransitions: ['idle', 'ignition'] },
];

export const SOLAR_CLIPS: ClipMeta[] = [
  { name: 'deploy', durationS: 1.8, loop: false, rootMotion: 'in-place', allowedTransitions: ['track_angle', 'hold', 'stow', 'safe_feather'] },
  { name: 'track_angle', durationS: 2.4, loop: true, rootMotion: 'in-place', allowedTransitions: ['hold', 'stow', 'safe_feather'] },
  { name: 'hold', durationS: 2.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['track_angle', 'stow', 'safe_feather'] },
  { name: 'stow', durationS: 1.8, loop: false, rootMotion: 'in-place', allowedTransitions: ['deploy'] },
  { name: 'safe_feather', durationS: 1.4, loop: false, rootMotion: 'in-place', allowedTransitions: ['hold', 'track_angle'] },
];

export const BATTERY_CLIPS: ClipMeta[] = [
  { name: 'idle', durationS: 2.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['charge_pulse', 'discharge_pulse', 'low_charge_warning'] },
  { name: 'charge_pulse', durationS: 1.6, loop: true, rootMotion: 'in-place', allowedTransitions: ['idle', 'discharge_pulse'] },
  { name: 'discharge_pulse', durationS: 1.6, loop: true, rootMotion: 'in-place', allowedTransitions: ['idle', 'charge_pulse', 'low_charge_warning'] },
  { name: 'low_charge_warning', durationS: 1.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['charge_pulse', 'idle'] },
];

export const ANTENNA_CLIPS: ClipMeta[] = [
  { name: 'deploy', durationS: 1.5, loop: false, rootMotion: 'in-place', allowedTransitions: ['aim', 'standby'] },
  { name: 'aim', durationS: 1.2, loop: false, rootMotion: 'in-place', allowedTransitions: ['transmit', 'standby'] },
  { name: 'transmit', durationS: 2.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['standby', 'aim'] },
  { name: 'standby', durationS: 2.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['aim', 'stow'] },
  { name: 'stow', durationS: 1.4, loop: false, rootMotion: 'in-place', allowedTransitions: ['deploy'] },
];

export const CAMERA_CLIPS: ClipMeta[] = [
  { name: 'aim', durationS: 1.2, loop: false, rootMotion: 'in-place', allowedTransitions: ['scan', 'park'] },
  { name: 'scan', durationS: 2.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['park', 'cold_locked'] },
  { name: 'park', durationS: 1.2, loop: false, rootMotion: 'in-place', allowedTransitions: ['aim', 'cold_locked'] },
  { name: 'cold_locked', durationS: 1.6, loop: true, rootMotion: 'in-place', allowedTransitions: ['park', 'aim'] },
];

export const EARTH_CLIPS: ClipMeta[] = [
  { name: 'rotate_orbit', durationS: 4.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['station_pass_ping', 'storm_front'] },
  { name: 'station_pass_ping', durationS: 2.0, loop: true, rootMotion: 'in-place', allowedTransitions: ['rotate_orbit', 'storm_front'] },
  { name: 'storm_front', durationS: 2.4, loop: true, rootMotion: 'in-place', allowedTransitions: ['rotate_orbit'] },
];

export const WORKSHOP_ASSETS: WorkshopAssetDef[] = [
  // Assembled scenes (viewer presets)
  {
    id: 'scene-satellite',
    category: 'scenes',
    isCompositeScene: true,
    glbPath: 'satellite-bus.glb',
    zipPath: 'assets/satellite-bus.glb',
    nameKey: 'asset.scene-satellite.name',
    descKey: 'asset.scene-satellite.desc',
    requiredNodes: ['bus_core', 'solar_left', 'solar_right', 'antenna_mount', 'camera_mount', 'engine_mount', 'battery_mount'],
    mounts: ['solar_left', 'solar_right', 'antenna_mount', 'camera_mount', 'engine_mount', 'battery_mount', 'satellite_release'],
    vfxLayers: ['vfx_scan_cone', 'vfx_downlink_beam', 'vfx_thruster_plume', 'vfx_heater_glow', 'vfx_cold_frost', 'vfx_storm_particles'],
    clips: SATELLITE_BUS_CLIPS,
  },
  {
    id: 'scene-ship',
    category: 'scenes',
    isCompositeScene: true,
    glbPath: 'ship-cutaway.glb',
    zipPath: 'assets/ship-cutaway.glb',
    nameKey: 'asset.scene-ship.name',
    descKey: 'asset.scene-ship.desc',
    requiredNodes: ['floor_deck', 'wall_cutaway_front', 'hatch_hinge', 'docking_collar', 'satellite_release'],
    mounts: ['satellite_release', 'console_interact', 'hand_target', 'mount_console_power', 'mount_console_thermal', 'mount_console_oxygen', 'mount_console_docking', 'mount_console_separation'],
    vfxLayers: [],
    clips: SHIP_CUTAWAY_CLIPS,
  },

  // 1. Astronaut
  {
    id: 'astronaut',
    category: 'character',
    glbPath: 'astronaut.glb',
    zipPath: 'assets/astronaut.glb',
    nameKey: 'asset.astronaut.name',
    descKey: 'asset.astronaut.desc',
    requiredNodes: [
      'astronaut_root',
      'hips',
      'spine',
      'chest',
      'neck',
      'head',
      'helmet',
      'visor',
      'backpack',
      'shoulder_l',
      'upper_arm_l',
      'forearm_l',
      'hand_l',
      'thumb_l',
      'fingers_l',
      'shoulder_r',
      'upper_arm_r',
      'forearm_r',
      'hand_r',
      'thumb_r',
      'fingers_r',
      'thigh_l',
      'shin_l',
      'foot_l',
      'thigh_r',
      'shin_r',
      'foot_r',
    ],
    mounts: ['hand_target', 'hand_target_l', 'hand_target_r', 'backpack_mount'],
    vfxLayers: [],
    clips: ASTRONAUT_CLIPS,
  },

  // 2. Ship Cutaway & 5 Flight Consoles
  {
    id: 'ship-cutaway',
    category: 'ship',
    glbPath: 'ship-cutaway.glb',
    zipPath: 'assets/ship-cutaway.glb',
    nameKey: 'asset.ship-cutaway.name',
    descKey: 'asset.ship-cutaway.desc',
    requiredNodes: [
      'floor_deck',
      'wall_back',
      'wall_left',
      'wall_right',
      'wall_cutaway_front',
      'hatch_frame',
      'hatch_hinge',
      'hatch_door',
      'handrail_main',
      'handrail_upper',
      'docking_ring',
      'docking_collar',
      'docking_latches',
      'docking_target_probe',
      'satellite_bay_cradle',
      'satellite_clamp_l',
      'satellite_clamp_r',
      'deployed_satellite_proxy',
    ],
    mounts: [
      'satellite_release',
      'console_interact',
      'hand_target',
      'mount_console_power',
      'mount_console_thermal',
      'mount_console_oxygen',
      'mount_console_docking',
      'mount_console_separation',
      'anchor_power',
      'anchor_thermal',
      'anchor_oxygen',
      'anchor_docking',
      'anchor_separation',
    ],
    vfxLayers: [],
    clips: SHIP_CUTAWAY_CLIPS,
  },
  {
    id: 'console-power',
    category: 'ship',
    glbPath: 'consoles/console-power.glb',
    zipPath: 'assets/consoles/console-power.glb',
    nameKey: 'asset.console-power.name',
    descKey: 'asset.console-power.desc',
    requiredNodes: ['console_body', 'control_lever_pivot', 'control_dial_pivot', 'control_button', 'indicator_status'],
    mounts: ['console_interact', 'hand_target'],
    vfxLayers: [],
    clips: CONSOLE_CLIPS,
  },
  {
    id: 'console-thermal',
    category: 'ship',
    glbPath: 'consoles/console-thermal.glb',
    zipPath: 'assets/consoles/console-thermal.glb',
    nameKey: 'asset.console-thermal.name',
    descKey: 'asset.console-thermal.desc',
    requiredNodes: ['console_body', 'control_lever_pivot', 'control_dial_pivot', 'control_button', 'indicator_status'],
    mounts: ['console_interact', 'hand_target'],
    vfxLayers: [],
    clips: CONSOLE_CLIPS,
  },
  {
    id: 'console-oxygen',
    category: 'ship',
    glbPath: 'consoles/console-oxygen.glb',
    zipPath: 'assets/consoles/console-oxygen.glb',
    nameKey: 'asset.console-oxygen.name',
    descKey: 'asset.console-oxygen.desc',
    requiredNodes: ['console_body', 'control_lever_pivot', 'control_dial_pivot', 'control_button', 'indicator_status', 'oxygen_valve_wheel'],
    mounts: ['console_interact', 'hand_target'],
    vfxLayers: [],
    clips: CONSOLE_CLIPS,
  },
  {
    id: 'console-docking',
    category: 'ship',
    glbPath: 'consoles/console-docking.glb',
    zipPath: 'assets/consoles/console-docking.glb',
    nameKey: 'asset.console-docking.name',
    descKey: 'asset.console-docking.desc',
    requiredNodes: ['console_body', 'control_lever_pivot', 'control_dial_pivot', 'control_button', 'indicator_status'],
    mounts: ['console_interact', 'hand_target'],
    vfxLayers: [],
    clips: CONSOLE_CLIPS,
  },
  {
    id: 'console-separation',
    category: 'ship',
    glbPath: 'consoles/console-separation.glb',
    zipPath: 'assets/consoles/console-separation.glb',
    nameKey: 'asset.console-separation.name',
    descKey: 'asset.console-separation.desc',
    requiredNodes: ['console_body', 'control_lever_pivot', 'safety_cover_pivot', 'control_button', 'indicator_status'],
    mounts: ['console_interact', 'hand_target'],
    vfxLayers: [],
    clips: CONSOLE_CLIPS,
  },

  // 3. Satellite Bus & Orbital Switches
  {
    id: 'satellite-bus',
    category: 'satellite',
    glbPath: 'satellite-bus.glb',
    zipPath: 'assets/satellite-bus.glb',
    nameKey: 'asset.satellite-bus.name',
    descKey: 'asset.satellite-bus.desc',
    requiredNodes: [
      'bus_core',
      'mli_blanket_group',
      'radiator_louver_l',
      'radiator_louver_r',
      'status_beacon',
      'vfx_heater_glow',
      'vfx_cold_frost',
      'vfx_storm_particles',
    ],
    mounts: [
      'solar_left',
      'solar_right',
      'antenna_mount',
      'camera_mount',
      'engine_mount',
      'battery_mount',
      'satellite_release',
    ],
    vfxLayers: ['vfx_heater_glow', 'vfx_cold_frost', 'vfx_storm_particles'],
    clips: SATELLITE_BUS_CLIPS,
  },
  {
    id: 'orbital-switches',
    category: 'satellite',
    glbPath: 'consoles/orbital-switches.glb',
    zipPath: 'assets/consoles/orbital-switches.glb',
    nameKey: 'asset.orbital-switches.name',
    descKey: 'asset.orbital-switches.desc',
    requiredNodes: [
      'switch_panel_frame',
      'switch_camera_pivot',
      'switch_transmitter_pivot',
      'switch_heater_pivot',
      'switch_safeMode_pivot',
      'led_camera_state',
      'led_transmitter_state',
      'led_heater_state',
      'led_safeMode_state',
    ],
    mounts: ['console_interact', 'hand_target'],
    vfxLayers: [],
    clips: ORBITAL_SWITCH_CLIPS,
  },

  // 4. Engines (catalog.json: eng-cold, eng-chem, eng-ion)
  {
    id: 'eng-cold',
    category: 'engine',
    glbPath: 'modules/eng-cold.glb',
    zipPath: 'assets/modules/eng-cold.glb',
    nameKey: 'asset.eng-cold.name',
    descKey: 'asset.eng-cold.desc',
    catalogStats: { slot: 'engine', massKg: 4, costMUsd: 1, ispS: 220 },
    requiredNodes: ['module_root', 'nozzle_cluster', 'gimbal_pivot', 'vfx_thruster_plume'],
    mounts: ['engine_mount'],
    vfxLayers: ['vfx_thruster_plume'],
    clips: ENGINE_CLIPS,
  },
  {
    id: 'eng-chem',
    category: 'engine',
    glbPath: 'modules/eng-chem.glb',
    zipPath: 'assets/modules/eng-chem.glb',
    nameKey: 'asset.eng-chem.name',
    descKey: 'asset.eng-chem.desc',
    catalogStats: { slot: 'engine', massKg: 8, costMUsd: 3, ispS: 300 },
    requiredNodes: ['module_root', 'bell_nozzle', 'gimbal_pivot', 'vfx_thruster_plume'],
    mounts: ['engine_mount'],
    vfxLayers: ['vfx_thruster_plume'],
    clips: ENGINE_CLIPS,
  },
  {
    id: 'eng-ion',
    category: 'engine',
    glbPath: 'modules/eng-ion.glb',
    zipPath: 'assets/modules/eng-ion.glb',
    nameKey: 'asset.eng-ion.name',
    descKey: 'asset.eng-ion.desc',
    catalogStats: { slot: 'engine', massKg: 20, costMUsd: 9, ispS: 1500 },
    requiredNodes: ['module_root', 'ion_chamber', 'gimbal_pivot', 'vfx_thruster_plume'],
    mounts: ['engine_mount'],
    vfxLayers: ['vfx_thruster_plume'],
    clips: ENGINE_CLIPS,
  },

  // 5. Solar Arrays (catalog.json: sol-s, sol-m, sol-l)
  {
    id: 'sol-s',
    category: 'solar',
    glbPath: 'modules/sol-s.glb',
    zipPath: 'assets/modules/sol-s.glb',
    nameKey: 'asset.sol-s.name',
    descKey: 'asset.sol-s.desc',
    catalogStats: { slot: 'solar', massKg: 5, costMUsd: 1, powerW: 80 },
    requiredNodes: ['module_root', 'solar_hinge_root', 'panel_seg_1'],
    mounts: ['solar_left', 'solar_right'],
    vfxLayers: [],
    clips: SOLAR_CLIPS,
  },
  {
    id: 'sol-m',
    category: 'solar',
    glbPath: 'modules/sol-m.glb',
    zipPath: 'assets/modules/sol-m.glb',
    nameKey: 'asset.sol-m.name',
    descKey: 'asset.sol-m.desc',
    catalogStats: { slot: 'solar', massKg: 10, costMUsd: 2, powerW: 160 },
    requiredNodes: ['module_root', 'solar_hinge_root', 'panel_seg_1', 'panel_seg_2'],
    mounts: ['solar_left', 'solar_right'],
    vfxLayers: [],
    clips: SOLAR_CLIPS,
  },
  {
    id: 'sol-l',
    category: 'solar',
    glbPath: 'modules/sol-l.glb',
    zipPath: 'assets/modules/sol-l.glb',
    nameKey: 'asset.sol-l.name',
    descKey: 'asset.sol-l.desc',
    catalogStats: { slot: 'solar', massKg: 20, costMUsd: 4, powerW: 320 },
    requiredNodes: ['module_root', 'solar_hinge_root', 'panel_seg_1', 'panel_seg_2', 'panel_seg_3'],
    mounts: ['solar_left', 'solar_right'],
    vfxLayers: [],
    clips: SOLAR_CLIPS,
  },

  // 6. Batteries (catalog.json: bat-s, bat-m, bat-l)
  {
    id: 'bat-s',
    category: 'battery',
    glbPath: 'modules/bat-s.glb',
    zipPath: 'assets/modules/bat-s.glb',
    nameKey: 'asset.bat-s.name',
    descKey: 'asset.bat-s.desc',
    catalogStats: { slot: 'battery', massKg: 3, costMUsd: 1, capacityWh: 30 },
    requiredNodes: ['module_root', 'battery_pack_core', 'charge_indicator_bar'],
    mounts: ['battery_mount'],
    vfxLayers: [],
    clips: BATTERY_CLIPS,
  },
  {
    id: 'bat-m',
    category: 'battery',
    glbPath: 'modules/bat-m.glb',
    zipPath: 'assets/modules/bat-m.glb',
    nameKey: 'asset.bat-m.name',
    descKey: 'asset.bat-m.desc',
    catalogStats: { slot: 'battery', massKg: 6, costMUsd: 2, capacityWh: 60 },
    requiredNodes: ['module_root', 'battery_pack_core', 'charge_indicator_bar'],
    mounts: ['battery_mount'],
    vfxLayers: [],
    clips: BATTERY_CLIPS,
  },
  {
    id: 'bat-l',
    category: 'battery',
    glbPath: 'modules/bat-l.glb',
    zipPath: 'assets/modules/bat-l.glb',
    nameKey: 'asset.bat-l.name',
    descKey: 'asset.bat-l.desc',
    catalogStats: { slot: 'battery', massKg: 12, costMUsd: 4, capacityWh: 120 },
    requiredNodes: ['module_root', 'battery_pack_core', 'charge_indicator_bar'],
    mounts: ['battery_mount'],
    vfxLayers: [],
    clips: BATTERY_CLIPS,
  },

  // 7. Antennas (catalog.json: ant-s, ant-m, ant-l)
  {
    id: 'ant-s',
    category: 'antenna',
    glbPath: 'modules/ant-s.glb',
    zipPath: 'assets/modules/ant-s.glb',
    nameKey: 'asset.ant-s.name',
    descKey: 'asset.ant-s.desc',
    catalogStats: { slot: 'antenna', massKg: 2, costMUsd: 1, downlinkMbps: 2, powerW: 10 },
    requiredNodes: ['module_root', 'antenna_gimbal_yaw', 'antenna_gimbal_pitch', 'antenna_radiator', 'vfx_downlink_beam'],
    mounts: ['antenna_mount'],
    vfxLayers: ['vfx_downlink_beam'],
    clips: ANTENNA_CLIPS,
  },
  {
    id: 'ant-m',
    category: 'antenna',
    glbPath: 'modules/ant-m.glb',
    zipPath: 'assets/modules/ant-m.glb',
    nameKey: 'asset.ant-m.name',
    descKey: 'asset.ant-m.desc',
    catalogStats: { slot: 'antenna', massKg: 6, costMUsd: 3, downlinkMbps: 10, powerW: 30 },
    requiredNodes: ['module_root', 'antenna_gimbal_yaw', 'antenna_gimbal_pitch', 'antenna_radiator', 'vfx_downlink_beam'],
    mounts: ['antenna_mount'],
    vfxLayers: ['vfx_downlink_beam'],
    clips: ANTENNA_CLIPS,
  },
  {
    id: 'ant-l',
    category: 'antenna',
    glbPath: 'modules/ant-l.glb',
    zipPath: 'assets/modules/ant-l.glb',
    nameKey: 'asset.ant-l.name',
    descKey: 'asset.ant-l.desc',
    catalogStats: { slot: 'antenna', massKg: 15, costMUsd: 7, downlinkMbps: 50, powerW: 80 },
    requiredNodes: ['module_root', 'antenna_gimbal_yaw', 'antenna_gimbal_pitch', 'antenna_radiator', 'vfx_downlink_beam'],
    mounts: ['antenna_mount'],
    vfxLayers: ['vfx_downlink_beam'],
    clips: ANTENNA_CLIPS,
  },

  // 8. Cameras / Instruments (catalog.json: cam-s, cam-m, cam-l)
  {
    id: 'cam-s',
    category: 'instrument',
    glbPath: 'modules/cam-s.glb',
    zipPath: 'assets/modules/cam-s.glb',
    nameKey: 'asset.cam-s.name',
    descKey: 'asset.cam-s.desc',
    catalogStats: { slot: 'instrument', massKg: 5, costMUsd: 3, apertureM: 0.1, dataRateMbps: 2, powerW: 10 },
    requiredNodes: ['module_root', 'camera_gimbal', 'camera_shutter_l', 'camera_shutter_r', 'optics_lens', 'vfx_scan_cone'],
    mounts: ['camera_mount'],
    vfxLayers: ['vfx_scan_cone'],
    clips: CAMERA_CLIPS,
  },
  {
    id: 'cam-m',
    category: 'instrument',
    glbPath: 'modules/cam-m.glb',
    zipPath: 'assets/modules/cam-m.glb',
    nameKey: 'asset.cam-m.name',
    descKey: 'asset.cam-m.desc',
    catalogStats: { slot: 'instrument', massKg: 20, costMUsd: 10, apertureM: 0.2, dataRateMbps: 8, powerW: 30 },
    requiredNodes: ['module_root', 'camera_gimbal', 'camera_shutter_l', 'camera_shutter_r', 'optics_lens', 'vfx_scan_cone'],
    mounts: ['camera_mount'],
    vfxLayers: ['vfx_scan_cone'],
    clips: CAMERA_CLIPS,
  },
  {
    id: 'cam-l',
    category: 'instrument',
    glbPath: 'modules/cam-l.glb',
    zipPath: 'assets/modules/cam-l.glb',
    nameKey: 'asset.cam-l.name',
    descKey: 'asset.cam-l.desc',
    catalogStats: { slot: 'instrument', massKg: 70, costMUsd: 25, apertureM: 0.4, dataRateMbps: 30, powerW: 60 },
    requiredNodes: ['module_root', 'camera_gimbal', 'camera_shutter_l', 'camera_shutter_r', 'optics_lens', 'vfx_scan_cone'],
    mounts: ['camera_mount'],
    vfxLayers: ['vfx_scan_cone'],
    clips: CAMERA_CLIPS,
  },

  // 9. Environment
  {
    id: 'earth',
    category: 'environment',
    glbPath: 'environment/earth.glb',
    zipPath: 'assets/environment/earth.glb',
    nameKey: 'asset.earth.name',
    descKey: 'asset.earth.desc',
    requiredNodes: ['earth_root', 'earth_ocean_sphere', 'earth_continents', 'ground_station_anchor', 'orbital_ring'],
    mounts: ['ground_station_anchor'],
    vfxLayers: ['vfx_station_beacon'],
    clips: EARTH_CLIPS,
  },
];

export const STANDALONE_GLB_ASSETS = WORKSHOP_ASSETS.filter((a) => !a.isCompositeScene);

export function getAssetDef(id: string): WorkshopAssetDef | undefined {
  return WORKSHOP_ASSETS.find((a) => a.id === id);
}
