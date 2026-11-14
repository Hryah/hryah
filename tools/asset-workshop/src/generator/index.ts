import * as THREE from 'three';
import { buildAstronautAsset, type GeneratedAsset } from './build-astronaut';
import {
  buildConsoleAsset,
  buildOrbitalSwitchesAsset,
  buildShipCutawayAsset,
  type ConsoleKind,
} from './build-ship-and-consoles';
import {
  buildAntennaModuleAsset,
  buildBatteryModuleAsset,
  buildCameraModuleAsset,
  buildEarthEnvironmentAsset,
  buildEngineModuleAsset,
  buildSatelliteBusAsset,
  buildSolarModuleAsset,
} from './build-satellite-and-modules';

export type { GeneratedAsset };

export interface SatelliteLoadout {
  engine: 'eng-cold' | 'eng-chem' | 'eng-ion';
  solar: 'sol-s' | 'sol-m' | 'sol-l';
  battery: 'bat-s' | 'bat-m' | 'bat-l';
  antenna: 'ant-s' | 'ant-m' | 'ant-l';
  instrument: 'cam-s' | 'cam-m' | 'cam-l';
}

export const DEFAULT_LOADOUT: SatelliteLoadout = {
  engine: 'eng-chem',
  solar: 'sol-m',
  battery: 'bat-m',
  antenna: 'ant-m',
  instrument: 'cam-m',
};

/**
 * Builds a fresh, clean bind-pose instance of any standalone GLB asset by ID.
 */
export function buildWorkshopAssetById(id: string): GeneratedAsset {
  switch (id) {
    case 'astronaut':
      return buildAstronautAsset();
    case 'ship-cutaway':
      return buildShipCutawayAsset();
    case 'console-power':
    case 'console-thermal':
    case 'console-oxygen':
    case 'console-docking':
    case 'console-separation': {
      const kind = id.replace('console-', '') as ConsoleKind;
      return buildConsoleAsset(kind);
    }
    case 'satellite-bus':
      return buildSatelliteBusAsset();
    case 'orbital-switches':
      return buildOrbitalSwitchesAsset();
    case 'eng-cold':
    case 'eng-chem':
    case 'eng-ion':
      return buildEngineModuleAsset(id);
    case 'sol-s':
    case 'sol-m':
    case 'sol-l':
      return buildSolarModuleAsset(id);
    case 'bat-s':
    case 'bat-m':
    case 'bat-l':
      return buildBatteryModuleAsset(id);
    case 'ant-s':
    case 'ant-m':
    case 'ant-l':
      return buildAntennaModuleAsset(id);
    case 'cam-s':
    case 'cam-m':
    case 'cam-l':
      return buildCameraModuleAsset(id);
    case 'earth':
      return buildEarthEnvironmentAsset();
    default:
      throw new Error(`Unknown workshop asset ID: ${id}`);
  }
}

export interface AssembledSatelliteBundle {
  root: THREE.Group;
  bus: GeneratedAsset;
  solarLeft: GeneratedAsset;
  solarRight: GeneratedAsset;
  antenna: GeneratedAsset;
  camera: GeneratedAsset;
  engine: GeneratedAsset;
  battery: GeneratedAsset;
  switches: GeneratedAsset;
  earth: GeneratedAsset;
}

/**
 * Assembles the modular satellite scene using the stationary mount sockets on satellite-bus.
 */
export function buildAssembledSatelliteScene(
  loadout: SatelliteLoadout = DEFAULT_LOADOUT,
): AssembledSatelliteBundle {
  const root = new THREE.Group();
  root.name = 'assembled_satellite_scene';

  const bus = buildSatelliteBusAsset();
  bus.root.position.set(0, 0.35, 0);
  root.add(bus.root);

  const solarLeft = buildSolarModuleAsset(loadout.solar);
  const solarRight = buildSolarModuleAsset(loadout.solar);
  const antenna = buildAntennaModuleAsset(loadout.antenna);
  const camera = buildCameraModuleAsset(loadout.instrument);
  const engine = buildEngineModuleAsset(loadout.engine);
  const battery = buildBatteryModuleAsset(loadout.battery);

  const attachToMount = (mountName: string, childRoot: THREE.Object3D) => {
    const mount = bus.root.getObjectByName(mountName);
    if (mount) {
      mount.add(childRoot);
    } else {
      bus.root.add(childRoot);
    }
  };

  attachToMount('solar_left', solarLeft.root);
  attachToMount('solar_right', solarRight.root);
  attachToMount('antenna_mount', antenna.root);
  attachToMount('camera_mount', camera.root);
  attachToMount('engine_mount', engine.root);
  attachToMount('battery_mount', battery.root);

  // Place Earth below/behind satellite for orbital context
  const earth = buildEarthEnvironmentAsset();
  earth.root.position.set(0, -2.15, -1.65);
  earth.root.scale.setScalar(0.95);
  root.add(earth.root);

  // Place Orbital Switches control bank in front-right for direct visual feedback
  const switches = buildOrbitalSwitchesAsset();
  switches.root.position.set(0, -0.78, 1.25);
  switches.root.rotation.set(-0.35, 0, 0);
  switches.root.scale.setScalar(0.85);
  root.add(switches.root);

  return {
    root,
    bus,
    solarLeft,
    solarRight,
    antenna,
    camera,
    engine,
    battery,
    switches,
    earth,
  };
}

export interface AssembledShipBundle {
  root: THREE.Group;
  ship: GeneratedAsset;
  astronaut: GeneratedAsset;
  consoles: Record<ConsoleKind, GeneratedAsset>;
}

/**
 * Assembles the Phase 2 Ship Cutaway scene with all 5 consoles mounted at their sockets
 * and the rigged astronaut positioned inside the cabin.
 */
export function buildAssembledShipScene(): AssembledShipBundle {
  const root = new THREE.Group();
  root.name = 'assembled_ship_scene';

  const ship = buildShipCutawayAsset();
  root.add(ship.root);

  const kinds: ConsoleKind[] = ['power', 'thermal', 'oxygen', 'docking', 'separation'];
  const consoles = {} as Record<ConsoleKind, GeneratedAsset>;

  for (const kind of kinds) {
    const consoleAsset = buildConsoleAsset(kind);
    consoles[kind] = consoleAsset;
    const mount = ship.root.getObjectByName(`mount_console_${kind}`);
    if (mount) {
      mount.add(consoleAsset.root);
    } else {
      ship.root.add(consoleAsset.root);
    }
  }

  const astronaut = buildAstronautAsset();
  // Start at central oxygen console station facing the console (-Z)
  astronaut.root.position.set(0, 0, -0.28);
  astronaut.root.rotation.set(0, Math.PI, 0);
  root.add(astronaut.root);

  return {
    root,
    ship,
    astronaut,
    consoles,
  };
}
