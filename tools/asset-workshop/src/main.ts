import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { zipSync, strToU8 } from 'fflate';
// Keep public overrides after the base sheet when Vite combines production CSS.
import './styles.css';
import './public-preview.css';
import { initPublicPreview, workshopPackUrl } from './public-preview';
import {
  WORKSHOP_ASSETS,
  STANDALONE_GLB_ASSETS,
  getAssetDef,
  type AssetCategory,
  type WorkshopAssetDef,
} from './catalog/asset-registry';
import { translate, type Locale } from './i18n';
import {
  buildAssembledSatelliteScene,
  buildAssembledShipScene,
  DEFAULT_LOADOUT,
  type AssembledSatelliteBundle,
  type AssembledShipBundle,
  type SatelliteLoadout,
} from './generator';
import {
  exportAssetToGlbBytes,
  generateAllWorkshopGlbs,
  inspectSceneMetrics,
  type SceneMetrics,
} from './generator/export-glb';
import {
  loadWorkshopGlb,
  WorkshopAnimationController,
} from './adapter/import-and-animate';
import {
  advanceOrbitalTurn,
  createInitialOrbitalWorkshopState,
  evaluateOrbitalSemantics,
  toggleOrbitalSwitch,
  type OrbitalSwitchId,
  type OrbitalWindowId,
  type OrbitalWorkshopState,
} from './semantics/orbital-switch-machine';
import {
  commandCrewToConsole,
  createInitialCrewState,
  stepCrewChoreography,
  toggleCrewGravityMode,
  type CrewChoreographyState,
} from './semantics/crew-choreography';
import { validateExportedGlbBytes } from './validation/validate-glb';
import type { ConsoleKind } from './generator/build-ship-and-consoles';

type CameraPreset = 'iso' | 'front' | 'side' | 'top';
type BgTheme = 'dark' | 'light' | 'checker';
type RightTab = 'animations' | 'orbital' | 'export';

interface AppState {
  locale: Locale;
  selectedAssetId: string;
  activeTab: RightTab;
  cameraMode: 'ortho' | 'persp';
  cameraPreset: CameraPreset;
  bgTheme: BgTheme;
  showGrid: boolean;
  showWireframe: boolean;
  showMounts: boolean;
  hideCutawayWall: boolean;
  showVfxLayers: boolean;
  helpOpen: boolean;
  loadout: SatelliteLoadout;
  // Animation playback state
  activeClipName: string;
  isPlaying: boolean;
  loopClip: boolean;
  playbackSpeed: number;
  clipTimeS: number;
  clipDurationS: number;
  // Scene metrics
  currentMetrics: SceneMetrics | null;
  currentByteSize: number;
  // Orbital switch & environment state
  orbital: OrbitalWorkshopState;
  // Phase 2 Crew choreography state
  crew: CrewChoreographyState;
  // Validation log output
  qaReportText: string;
}

const state: AppState = {
  locale: 'ru',
  selectedAssetId: 'scene-satellite',
  activeTab: 'orbital',
  cameraMode: 'ortho',
  cameraPreset: 'iso',
  bgTheme: 'dark',
  showGrid: true,
  showWireframe: false,
  showMounts: true,
  hideCutawayWall: true,
  showVfxLayers: true,
  helpOpen: false,
  loadout: { ...DEFAULT_LOADOUT },
  activeClipName: 'idle',
  isPlaying: true,
  loopClip: true,
  playbackSpeed: 1.0,
  clipTimeS: 0,
  clipDurationS: 2.0,
  currentMetrics: null,
  currentByteSize: 0,
  orbital: createInitialOrbitalWorkshopState(),
  crew: createInitialCrewState(),
  qaReportText: 'Ready. Click "Verify Exported GLB in Clean Loader" to run clean-scene re-import checks.',
};

const t = (key: string, params?: Record<string, string | number>) =>
  translate(state.locale, key, params);

// ───────────────────────── Three.js Viewport Setup ─────────────────────────

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene = new THREE.Scene();
let orthoCamera: THREE.OrthographicCamera;
let perspCamera: THREE.PerspectiveCamera;
let controls: OrbitControls | null = null;
let gridHelper: THREE.GridHelper | null = null;
let mountGizmosGroup: THREE.Group = new THREE.Group();
let activeModelRoot: THREE.Object3D | null = null;
let primaryController: WorkshopAnimationController | null = null;
let satelliteBundle: AssembledSatelliteBundle | null = null;
let satelliteControllers: {
  bus: WorkshopAnimationController;
  solarLeft: WorkshopAnimationController;
  solarRight: WorkshopAnimationController;
  antenna: WorkshopAnimationController;
  camera: WorkshopAnimationController;
  engine: WorkshopAnimationController;
  battery: WorkshopAnimationController;
  switches: WorkshopAnimationController;
  earth: WorkshopAnimationController;
} | null = null;
let shipBundle: AssembledShipBundle | null = null;
let shipControllers: {
  ship: WorkshopAnimationController;
  astronaut: WorkshopAnimationController;
  consoles: Record<ConsoleKind, WorkshopAnimationController>;
} | null = null;

function initThreeViewport(container: HTMLElement): void {
  const width = Math.max(320, container.clientWidth);
  const height = Math.max(240, container.clientHeight);
  const aspect = width / height;

  scene = new THREE.Scene();

  const frustum = 4.2;
  orthoCamera = new THREE.OrthographicCamera(
    (-frustum * aspect) / 2,
    (frustum * aspect) / 2,
    frustum / 2,
    -frustum / 2,
    0.05,
    120,
  );
  perspCamera = new THREE.PerspectiveCamera(42, aspect, 0.05, 120);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  // Studio + Space 3-point lighting so dark and light sides are both readable
  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.15);
  hemiLight.position.set(0, 10, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
  keyLight.position.set(6, 9, 7);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.85);
  rimLight.position.set(-7, 4, -6);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.55);
  fillLight.position.set(-4, -3, 5);
  scene.add(fillLight);

  gridHelper = new THREE.GridHelper(10, 10, 0x38bdf8, 0x1e293b);
  gridHelper.position.y = -0.01;
  scene.add(gridHelper);

  mountGizmosGroup = new THREE.Group();
  mountGizmosGroup.name = '__mount_gizmos__';
  scene.add(mountGizmosGroup);

  controls = new OrbitControls(getActiveCamera(), renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  applyCameraPreset(state.cameraPreset);

  window.addEventListener('resize', () => {
    if (!renderer || !container.isConnected) return;
    const w = Math.max(320, container.clientWidth);
    const h = Math.max(240, container.clientHeight);
    const asp = w / h;
    orthoCamera.left = (-frustum * asp) / 2;
    orthoCamera.right = (frustum * asp) / 2;
    orthoCamera.top = frustum / 2;
    orthoCamera.bottom = -frustum / 2;
    orthoCamera.updateProjectionMatrix();
    perspCamera.aspect = asp;
    perspCamera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

function getActiveCamera(): THREE.OrthographicCamera | THREE.PerspectiveCamera {
  return state.cameraMode === 'ortho' ? orthoCamera : perspCamera;
}

function applyCameraPreset(preset: CameraPreset): void {
  state.cameraPreset = preset;
  const cam = getActiveCamera();
  if (!controls) return;
  controls.object = cam;

  const dist = state.selectedAssetId === 'scene-ship' || state.selectedAssetId === 'ship-cutaway' ? 7.2 : 4.5;
  const targetY = state.selectedAssetId === 'astronaut' ? 0.9 : state.selectedAssetId === 'scene-ship' ? 1.1 : 0.2;

  controls.target.set(0, targetY, 0);
  if (preset === 'iso') {
    cam.position.set(dist * 0.78, targetY + dist * 0.62, dist * 0.82);
  } else if (preset === 'front') {
    cam.position.set(0, targetY + 0.2, dist * 1.15);
  } else if (preset === 'side') {
    cam.position.set(dist * 1.15, targetY + 0.2, 0);
  } else if (preset === 'top') {
    cam.position.set(0, targetY + dist * 1.3, 0.01);
  }

  if (cam instanceof THREE.OrthographicCamera) {
    cam.zoom = state.selectedAssetId === 'scene-ship' || state.selectedAssetId === 'ship-cutaway' ? 0.55 : 1.05;
    cam.updateProjectionMatrix();
  }
  controls.update();
}

function fitCameraToActiveModel(): void {
  if (!activeModelRoot || !controls) return;
  const box = new THREE.Box3().setFromObject(activeModelRoot);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxDim = Math.max(0.6, size.x, size.y, size.z);

  const cam = getActiveCamera();
  controls.target.copy(center);
  const dir = cam.position.clone().sub(controls.target).normalize();
  if (dir.lengthSq() < 0.001) dir.set(0.7, 0.6, 0.7).normalize();
  cam.position.copy(center).addScaledVector(dir, maxDim * 1.85);

  if (cam instanceof THREE.OrthographicCamera) {
    cam.zoom = Math.min(3.5, Math.max(0.35, 3.2 / maxDim));
    cam.updateProjectionMatrix();
  }
  controls.update();
}

// ───────────────────────── Scene Loading & Display Modifiers ─────────────────────────

function rebuildMountGizmos(root: THREE.Object3D): void {
  mountGizmosGroup.clear();
  root.updateMatrixWorld(true);

  const sphereGeo = new THREE.SphereGeometry(0.038, 10, 10);
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, wireframe: false });

  root.traverse((obj) => {
    const isKnownMount =
      obj.userData?.isMount ||
      [
        'solar_left',
        'solar_right',
        'antenna_mount',
        'camera_mount',
        'engine_mount',
        'battery_mount',
        'satellite_release',
        'console_interact',
        'hand_target',
        'ground_station_anchor',
      ].includes(obj.name);

    if (isKnownMount) {
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      const marker = new THREE.Mesh(sphereGeo, sphereMat);
      marker.position.copy(worldPos);
      const axes = new THREE.AxesHelper(0.16);
      axes.position.copy(worldPos);
      mountGizmosGroup.add(marker, axes);
    }
  });

  mountGizmosGroup.visible = state.showMounts;
}

function applyDisplayModifiers(): void {
  if (gridHelper) {
    gridHelper.visible = state.showGrid;
  }
  mountGizmosGroup.visible = state.showMounts;

  if (!activeModelRoot) return;

  // Wireframe modifier
  activeModelRoot.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m && 'wireframe' in m) {
          (m as THREE.MeshStandardMaterial).wireframe = state.showWireframe;
        }
      }
    }
  });

  // Cutaway front wall visibility
  const frontWall = activeModelRoot.getObjectByName('wall_cutaway_front');
  if (frontWall) {
    frontWall.visible = !state.hideCutawayWall;
  }

  // Optional VFX layers visibility
  const vfxNames = [
    'vfx_scan_cone',
    'vfx_downlink_beam',
    'vfx_thruster_plume',
    'vfx_heater_glow',
    'vfx_cold_frost',
    'vfx_storm_particles',
    'vfx_station_beacon',
  ];

  if (!state.showVfxLayers) {
    for (const vfxName of vfxNames) {
      activeModelRoot.traverse((node) => {
        if (node.name === vfxName) node.visible = false;
      });
    }
  } else if (state.selectedAssetId === 'scene-satellite' && satelliteBundle) {
    syncSatelliteVisualsToOrbitalState();
  } else {
    for (const vfxName of vfxNames) {
      activeModelRoot.traverse((node) => {
        if (node.name === vfxName) {
          node.visible = vfxName !== 'vfx_cold_frost' && vfxName !== 'vfx_storm_particles';
        }
      });
    }
  }
}

function clearCurrentModel(): void {
  if (primaryController) {
    primaryController.dispose();
    primaryController = null;
  }
  if (satelliteControllers) {
    Object.values(satelliteControllers).forEach((c) => c.dispose());
    satelliteControllers = null;
  }
  if (shipControllers) {
    shipControllers.ship.dispose();
    shipControllers.astronaut.dispose();
    Object.values(shipControllers.consoles).forEach((c) => c.dispose());
    shipControllers = null;
  }
  satelliteBundle = null;
  shipBundle = null;
  if (activeModelRoot) {
    scene.remove(activeModelRoot);
    activeModelRoot = null;
  }
}

async function selectAsset(assetId: string): Promise<void> {
  state.selectedAssetId = assetId;
  const def = getAssetDef(assetId);
  if (!def) return;

  clearCurrentModel();

  if (assetId === 'scene-satellite') {
    satelliteBundle = buildAssembledSatelliteScene(state.loadout);
    activeModelRoot = satelliteBundle.root;
    scene.add(activeModelRoot);

    satelliteControllers = {
      bus: new WorkshopAnimationController(satelliteBundle.bus.root, satelliteBundle.bus.clips),
      solarLeft: new WorkshopAnimationController(satelliteBundle.solarLeft.root, satelliteBundle.solarLeft.clips),
      solarRight: new WorkshopAnimationController(satelliteBundle.solarRight.root, satelliteBundle.solarRight.clips),
      antenna: new WorkshopAnimationController(satelliteBundle.antenna.root, satelliteBundle.antenna.clips),
      camera: new WorkshopAnimationController(satelliteBundle.camera.root, satelliteBundle.camera.clips),
      engine: new WorkshopAnimationController(satelliteBundle.engine.root, satelliteBundle.engine.clips),
      battery: new WorkshopAnimationController(satelliteBundle.battery.root, satelliteBundle.battery.clips),
      switches: new WorkshopAnimationController(satelliteBundle.switches.root, satelliteBundle.switches.clips),
      earth: new WorkshopAnimationController(satelliteBundle.earth.root, satelliteBundle.earth.clips),
    };
    primaryController = satelliteControllers.bus;
    satelliteControllers.earth.playClip('rotate_orbit', { loop: true });
    satelliteControllers.engine.playClip('idle', { loop: true });
    state.currentMetrics = inspectSceneMetrics(activeModelRoot);
    state.currentByteSize = 85600;
    syncSatelliteVisualsToOrbitalState();
  } else if (assetId === 'scene-ship') {
    shipBundle = buildAssembledShipScene();
    activeModelRoot = shipBundle.root;
    scene.add(activeModelRoot);

    shipControllers = {
      ship: new WorkshopAnimationController(shipBundle.ship.root, shipBundle.ship.clips),
      astronaut: new WorkshopAnimationController(shipBundle.astronaut.root, shipBundle.astronaut.clips),
      consoles: {
        power: new WorkshopAnimationController(shipBundle.consoles.power.root, shipBundle.consoles.power.clips),
        thermal: new WorkshopAnimationController(shipBundle.consoles.thermal.root, shipBundle.consoles.thermal.clips),
        oxygen: new WorkshopAnimationController(shipBundle.consoles.oxygen.root, shipBundle.consoles.oxygen.clips),
        docking: new WorkshopAnimationController(shipBundle.consoles.docking.root, shipBundle.consoles.docking.clips),
        separation: new WorkshopAnimationController(shipBundle.consoles.separation.root, shipBundle.consoles.separation.clips),
      },
    };
    primaryController = shipControllers.astronaut;
    shipControllers.astronaut.playClip(state.crew.activeClip, { loop: true });
    state.currentMetrics = inspectSceneMetrics(activeModelRoot);
    state.currentByteSize = 299700;
  } else {
    // Export to real binary GLB from bind pose and re-import into a clean GLTFLoader scene!
    const { bytes, metrics } = await exportAssetToGlbBytes(assetId);
    const gltf = await loadWorkshopGlb(bytes);
    activeModelRoot = gltf.scene;
    scene.add(activeModelRoot);

    primaryController = new WorkshopAnimationController(activeModelRoot, gltf.animations);
    state.currentMetrics = metrics;
    state.currentByteSize = bytes.byteLength;

    const firstClip = def.clips[0];
    if (firstClip) {
      state.activeClipName = firstClip.name;
      state.loopClip = firstClip.loop;
      state.clipDurationS = firstClip.durationS;
      state.clipTimeS = 0;
      primaryController.playClip(firstClip.name, {
        loop: firstClip.loop,
        timeScale: state.playbackSpeed,
      });
    }
  }

  if (activeModelRoot) {
    rebuildMountGizmos(activeModelRoot);
  }
  applyDisplayModifiers();
  applyCameraPreset(state.cameraPreset);
  fitCameraToActiveModel();
  renderUI();
}

// ───────────────────────── Synchronize Orbital Semantics -> 3D Scene ─────────────────────────

function syncSatelliteVisualsToOrbitalState(): void {
  if (!satelliteBundle || !satelliteControllers) return;
  const evalSummary = evaluateOrbitalSemantics(state.orbital);

  // Play target clips on each satellite module
  const playIfChanged = (ctrl: WorkshopAnimationController, clipName: string, loop = true) => {
    if (ctrl.getActiveClipName() !== clipName) {
      ctrl.playClip(clipName, { loop, crossFadeDurationS: 0.25 });
    }
  };

  playIfChanged(satelliteControllers.camera, evalSummary.subsystems.camera.targetClip, true);
  playIfChanged(satelliteControllers.antenna, evalSummary.subsystems.transmitter.targetClip, true);
  playIfChanged(satelliteControllers.solarLeft, evalSummary.solarClip, true);
  playIfChanged(satelliteControllers.solarRight, evalSummary.solarClip, true);
  playIfChanged(satelliteControllers.bus, evalSummary.busClip, true);

  // Sync physical 3D switch lever angles & LEDs on orbital-switches model
  const swRoot = satelliteBundle.switches.root;
  const ids: OrbitalSwitchId[] = ['camera', 'transmitter', 'heater', 'safeMode'];
  for (const id of ids) {
    const sub = evalSummary.subsystems[id];
    const pivot = swRoot.getObjectByName(`switch_${id}_pivot`);
    if (pivot) {
      pivot.rotation.x = sub.commanded ? -0.48 : 0.48;
    }
    const ledGroup = swRoot.getObjectByName(`led_${id}_state`);
    const ledMesh = ledGroup?.children[0] as THREE.Mesh | undefined;
    if (ledMesh && ledMesh.material instanceof THREE.MeshStandardMaterial) {
      if (sub.effectiveActive) {
        ledMesh.material.color.setHex(0x34d399);
        ledMesh.material.emissive.setHex(0x10b981);
        ledMesh.material.emissiveIntensity = 0.9;
      } else if (sub.commanded) {
        ledMesh.material.color.setHex(0xfbbf24);
        ledMesh.material.emissive.setHex(0xd97706);
        ledMesh.material.emissiveIntensity = 0.7;
      } else {
        ledMesh.material.color.setHex(0x27313d);
        ledMesh.material.emissive.setHex(0x000000);
        ledMesh.material.emissiveIntensity = 0;
      }
    }

    const blockedGroup = swRoot.getObjectByName(`led_${id}_blocked`);
    const blockedMesh = blockedGroup?.children[0] as THREE.Mesh | undefined;
    if (blockedMesh && blockedMesh.material instanceof THREE.MeshStandardMaterial) {
      const isBlocked =
        sub.visualState === 'BLOCKED_COLD' ||
        sub.visualState === 'BLOCKED_SAFE' ||
        sub.visualState === 'BLOCKED_DAMAGE' ||
        sub.visualState === 'BLOCKED_NO_POWER' ||
        sub.visualState === 'OVERFLOW_DISCARDING';
      if (isBlocked) {
        blockedMesh.material.color.setHex(0xf87171);
        blockedMesh.material.emissive.setHex(0xef4444);
        blockedMesh.material.emissiveIntensity = 0.95;
      } else {
        blockedMesh.material.color.setHex(0x27313d);
        blockedMesh.material.emissive.setHex(0x000000);
        blockedMesh.material.emissiveIntensity = 0;
      }
    }
  }

  // Toggle optional VFX layers according to evaluation summary & master VFX toggle
  const setVfx = (rootObj: THREE.Object3D, name: string, vis: boolean) => {
    const node = rootObj.getObjectByName(name);
    if (node) node.visible = state.showVfxLayers && vis;
  };

  setVfx(satelliteBundle.camera.root, 'vfx_scan_cone', evalSummary.vfxFlags.vfx_scan_cone);
  setVfx(satelliteBundle.antenna.root, 'vfx_downlink_beam', evalSummary.vfxFlags.vfx_downlink_beam);
  setVfx(satelliteBundle.engine.root, 'vfx_thruster_plume', evalSummary.vfxFlags.vfx_thruster_plume);
  setVfx(satelliteBundle.bus.root, 'vfx_heater_glow', evalSummary.vfxFlags.vfx_heater_glow);
  setVfx(satelliteBundle.bus.root, 'vfx_cold_frost', evalSummary.vfxFlags.vfx_cold_frost);
  setVfx(satelliteBundle.bus.root, 'vfx_storm_particles', evalSummary.vfxFlags.vfx_storm_particles);
}

// ───────────────────────── Browser File Download Helpers ─────────────────────────

function triggerDownloadBlob(filename: string, bytes: Uint8Array, mimeType: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function handleDownloadSelectedGlb(): Promise<void> {
  const def = getAssetDef(state.selectedAssetId);
  const targetId = def?.isCompositeScene
    ? state.selectedAssetId === 'scene-ship'
      ? 'ship-cutaway'
      : 'satellite-bus'
    : state.selectedAssetId;

  const { bytes } = await exportAssetToGlbBytes(targetId);
  triggerDownloadBlob(`${targetId}.glb`, bytes, 'model/gltf-binary');
}

async function handleDownloadAllModelsZip(): Promise<void> {
  const { filesByAssetId } = await generateAllWorkshopGlbs();
  const archive: Record<string, Uint8Array> = {};
  for (const [, item] of filesByAssetId) {
    archive[item.zipPath] = item.bytes;
  }
  const zipped = zipSync(archive, { level: 6 });
  triggerDownloadBlob('hryah-all-25-models.zip', zipped, 'application/zip');
}

async function handleDownloadManifestJson(): Promise<void> {
  const { manifest } = await generateAllWorkshopGlbs();
  const bytes = strToU8(JSON.stringify(manifest, null, 2));
  triggerDownloadBlob('manifest.json', bytes, 'application/json');
}

async function handleDownloadFullWorkshopZip(): Promise<void> {
  try {
    const res = await fetch(workshopPackUrl(document.baseURI));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // An HTTP fallback page is not a downloadable ZIP.
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Invalid ZIP response');
    triggerDownloadBlob('hryah-workshop-pack.zip', bytes, 'application/zip');
  } catch {
    state.qaReportText = translate(state.locale, 'export.packUnavailable');
    renderUI();
  }
}

// ───────────────────────── Clean-Scene Re-Import Verification in UI ─────────────────────────

async function handleRunCleanValidation(allAssets: boolean): Promise<void> {
  state.qaReportText = 'Running clean-scene GLTFLoader re-import verification...\n';
  renderUI();

  const targets = allAssets
    ? STANDALONE_GLB_ASSETS
    : [
        getAssetDef(
          state.selectedAssetId === 'scene-satellite'
            ? 'satellite-bus'
            : state.selectedAssetId === 'scene-ship'
              ? 'astronaut'
              : state.selectedAssetId,
        )!,
      ];

  const lines: string[] = [];
  let passCount = 0;

  for (const def of targets) {
    const { bytes } = await exportAssetToGlbBytes(def.id);
    const report = await validateExportedGlbBytes(def.id, bytes, def);
    if (report.valid) {
      passCount += 1;
      lines.push(
        `✓ ${def.id.padEnd(18)} | ${(report.byteSize / 1024).toFixed(1)} KB | ${report.triangles} tris | ${report.materials.length} mats | ${report.clips.length} clips | 0 coplanar risks`,
      );
      if (!allAssets) {
        for (const c of report.clips) {
          lines.push(
            `    • clip "${c.name}" (${c.actualDurationS}s, ${c.trackCount} tracks): delta=${c.maxPoseDelta}, 5-cycle drift=${c.driftAfter5Cycles}m`,
          );
        }
      }
    } else {
      lines.push(`✗ ${def.id} FAILED: ${report.errors.join('; ')}`);
    }
  }

  lines.push(`\nSummary: ${passCount}/${targets.length} asset(s) passed clean-scene re-import QA.`);
  state.qaReportText = lines.join('\n');
  renderUI();
}

// ───────────────────────── UI Rendering ─────────────────────────

function renderUI(): void {
  const host = document.getElementById('workshop-app');
  if (!host) return;

  // Preserve canvas container so we don't recreate WebGL context on UI state updates
  let canvasContainer = document.getElementById('ws-canvas-container');
  if (!canvasContainer) {
    host.innerHTML = `
      <header class="ws-header" id="ws-header"></header>
      <div class="ws-main">
        <aside class="ws-sidebar-left" id="ws-left"></aside>
        <main class="ws-viewport-wrap bg-${state.bgTheme}" id="ws-viewport-wrap">
          <div class="ws-toolbar-top" id="ws-toolbar-top"></div>
          <div class="ws-canvas-host" id="ws-canvas-container"></div>
          <div class="ws-hud-bottom" id="ws-hud-bottom"></div>
        </main>
        <aside class="ws-sidebar-right" id="ws-right"></aside>
      </div>
      <div id="ws-modal-slot"></div>
    `;
    canvasContainer = document.getElementById('ws-canvas-container')!;
    initThreeViewport(canvasContainer);
  }

  const viewportWrap = document.getElementById('ws-viewport-wrap');
  if (viewportWrap) {
    viewportWrap.className = `ws-viewport-wrap bg-${state.bgTheme}`;
  }

  renderHeader();
  renderLeftCatalog();
  renderViewportToolbars();
  renderRightPanel();
  renderHelpModal();
}

function renderHeader(): void {
  const header = document.getElementById('ws-header');
  if (!header) return;

  const isPreview = state.orbital.mode === 'preview';
  header.innerHTML = `
    <div class="ws-brand">
      <div class="ws-logo">H</div>
      <div class="ws-title-block">
        <h1>${t('app.title')}</h1>
        <p>${t('app.subtitle')}</p>
      </div>
    </div>
    <div class="ws-header-actions">
      <span class="ws-badge ${isPreview ? 'preview' : 'plan'}">
        ${isPreview ? t('app.badge.preview') : t('app.badge.turnPlan')}
      </span>
      <button class="ws-btn ${state.locale === 'en' ? 'active' : ''}" id="btn-lang-en">EN</button>
      <button class="ws-btn ${state.locale === 'ru' ? 'active' : ''}" id="btn-lang-ru">RU</button>
      <button class="ws-btn primary" id="btn-open-help">${t('app.help.open')}</button>
    </div>
  `;

  document.getElementById('btn-lang-en')?.addEventListener('click', () => {
    state.locale = 'en';
    renderUI();
  });
  document.getElementById('btn-lang-ru')?.addEventListener('click', () => {
    state.locale = 'ru';
    renderUI();
  });
  document.getElementById('btn-open-help')?.addEventListener('click', () => {
    state.helpOpen = true;
    renderHelpModal();
  });
}

function renderLeftCatalog(): void {
  const left = document.getElementById('ws-left');
  if (!left) return;

  const categories: AssetCategory[] = [
    'scenes',
    'character',
    'ship',
    'satellite',
    'engine',
    'solar',
    'battery',
    'antenna',
    'instrument',
    'environment',
  ];

  const loadoutHtml =
    state.selectedAssetId === 'scene-satellite'
      ? `
      <div class="ws-section">
        <div class="ws-section-title">Satellite Module Loadout (catalog.json)</div>
        <div class="ws-loadout-grid">
          <label>Engine</label>
          <select class="ws-select" id="sel-loadout-engine">
            ${(['eng-cold', 'eng-chem', 'eng-ion'] as const)
              .map((id) => `<option value="${id}" ${state.loadout.engine === id ? 'selected' : ''}>${t(`asset.${id}.name`)}</option>`)
              .join('')}
          </select>
          <label>Solar</label>
          <select class="ws-select" id="sel-loadout-solar">
            ${(['sol-s', 'sol-m', 'sol-l'] as const)
              .map((id) => `<option value="${id}" ${state.loadout.solar === id ? 'selected' : ''}>${t(`asset.${id}.name`)}</option>`)
              .join('')}
          </select>
          <label>Battery</label>
          <select class="ws-select" id="sel-loadout-battery">
            ${(['bat-s', 'bat-m', 'bat-l'] as const)
              .map((id) => `<option value="${id}" ${state.loadout.battery === id ? 'selected' : ''}>${t(`asset.${id}.name`)}</option>`)
              .join('')}
          </select>
          <label>Antenna</label>
          <select class="ws-select" id="sel-loadout-antenna">
            ${(['ant-s', 'ant-m', 'ant-l'] as const)
              .map((id) => `<option value="${id}" ${state.loadout.antenna === id ? 'selected' : ''}>${t(`asset.${id}.name`)}</option>`)
              .join('')}
          </select>
          <label>Camera</label>
          <select class="ws-select" id="sel-loadout-instrument">
            ${(['cam-s', 'cam-m', 'cam-l'] as const)
              .map((id) => `<option value="${id}" ${state.loadout.instrument === id ? 'selected' : ''}>${t(`asset.${id}.name`)}</option>`)
              .join('')}
          </select>
        </div>
      </div>
    `
      : '';

  const groupsHtml = categories
    .map((cat) => {
      const items = WORKSHOP_ASSETS.filter((a) => a.category === cat);
      return `
        <div class="ws-cat-group">
          <div class="ws-cat-header">${t(`cat.${cat}`)}</div>
          ${items
            .map((item) => {
              const statsText = item.catalogStats
                ? `${item.catalogStats.massKg}kg · $${item.catalogStats.costMUsd}M · ${item.clips.length} clips`
                : `${item.clips.length} clips · ${item.mounts.length} mounts`;
              return `
                <button class="ws-asset-btn ${state.selectedAssetId === item.id ? 'active' : ''}" data-asset-id="${item.id}">
                  <div class="ws-asset-btn-top">
                    <span>${t(item.nameKey)}</span>
                  </div>
                  <div class="ws-asset-meta">${statsText}</div>
                </button>
              `;
            })
            .join('')}
        </div>
      `;
    })
    .join('');

  left.innerHTML = `
    ${loadoutHtml}
    <div class="ws-section" style="border-bottom:none;">
      <div class="ws-section-title">Asset Catalog (25 GLBs + 2 Scenes)</div>
      ${groupsHtml}
    </div>
  `;

  left.querySelectorAll<HTMLButtonElement>('[data-asset-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.assetId;
      if (id) void selectAsset(id);
    });
  });

  const bindLoadoutSelect = <K extends keyof SatelliteLoadout>(elId: string, key: K) => {
    const el = document.getElementById(elId) as HTMLSelectElement | null;
    el?.addEventListener('change', () => {
      state.loadout[key] = el.value as SatelliteLoadout[K];
      void selectAsset('scene-satellite');
    });
  };
  bindLoadoutSelect('sel-loadout-engine', 'engine');
  bindLoadoutSelect('sel-loadout-solar', 'solar');
  bindLoadoutSelect('sel-loadout-battery', 'battery');
  bindLoadoutSelect('sel-loadout-antenna', 'antenna');
  bindLoadoutSelect('sel-loadout-instrument', 'instrument');
}

function renderViewportToolbars(): void {
  const top = document.getElementById('ws-toolbar-top');
  const bottom = document.getElementById('ws-hud-bottom');
  if (!top || !bottom) return;

  top.innerHTML = `
    <div class="ws-toolbar-group">
      <button class="ws-btn ${state.cameraPreset === 'iso' ? 'active' : ''}" data-cam-preset="iso">${t('view.camera.iso')}</button>
      <button class="ws-btn ${state.cameraPreset === 'front' ? 'active' : ''}" data-cam-preset="front">${t('view.camera.front')}</button>
      <button class="ws-btn ${state.cameraPreset === 'side' ? 'active' : ''}" data-cam-preset="side">${t('view.camera.side')}</button>
      <button class="ws-btn ${state.cameraPreset === 'top' ? 'active' : ''}" data-cam-preset="top">${t('view.camera.top')}</button>
      <button class="ws-btn ${state.cameraMode === 'ortho' ? 'active' : ''}" id="btn-cam-ortho">${t('view.camera.ortho')}</button>
      <button class="ws-btn ${state.cameraMode === 'persp' ? 'active' : ''}" id="btn-cam-persp">${t('view.camera.persp')}</button>
      <button class="ws-btn" id="btn-cam-reset">${t('view.camera.reset')}</button>
      <button class="ws-btn" id="btn-cam-fit">${t('view.camera.fit')}</button>
    </div>
    <div class="ws-toolbar-group">
      <button class="ws-btn ${state.bgTheme === 'dark' ? 'active' : ''}" data-bg="dark">${t('view.bg.dark')}</button>
      <button class="ws-btn ${state.bgTheme === 'light' ? 'active' : ''}" data-bg="light">${t('view.bg.light')}</button>
      <button class="ws-btn ${state.bgTheme === 'checker' ? 'active' : ''}" data-bg="checker">${t('view.bg.checker')}</button>
      <button class="ws-btn ${state.showGrid ? 'active' : ''}" id="btn-toggle-grid">${t('view.toggle.grid')}</button>
      <button class="ws-btn ${state.showWireframe ? 'active' : ''}" id="btn-toggle-wire">${t('view.toggle.wireframe')}</button>
      <button class="ws-btn ${state.showMounts ? 'active' : ''}" id="btn-toggle-mounts">${t('view.toggle.mounts')}</button>
      <button class="ws-btn ${state.hideCutawayWall ? 'active' : ''}" id="btn-toggle-cutaway">${t('view.toggle.cutaway')}</button>
      <button class="ws-btn ${state.showVfxLayers ? 'active' : ''}" id="btn-toggle-vfx">${t('view.toggle.vfx')}</button>
    </div>
  `;

  top.querySelectorAll<HTMLButtonElement>('[data-cam-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.camPreset as CameraPreset;
      applyCameraPreset(p);
      renderViewportToolbars();
    });
  });

  document.getElementById('btn-cam-ortho')?.addEventListener('click', () => {
    state.cameraMode = 'ortho';
    applyCameraPreset(state.cameraPreset);
    renderViewportToolbars();
  });
  document.getElementById('btn-cam-persp')?.addEventListener('click', () => {
    state.cameraMode = 'persp';
    applyCameraPreset(state.cameraPreset);
    renderViewportToolbars();
  });
  document.getElementById('btn-cam-reset')?.addEventListener('click', () => {
    applyCameraPreset('iso');
    renderViewportToolbars();
  });
  document.getElementById('btn-cam-fit')?.addEventListener('click', () => {
    fitCameraToActiveModel();
  });

  top.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.bgTheme = btn.dataset.bg as BgTheme;
      renderUI();
    });
  });

  document.getElementById('btn-toggle-grid')?.addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    applyDisplayModifiers();
    renderViewportToolbars();
  });
  document.getElementById('btn-toggle-wire')?.addEventListener('click', () => {
    state.showWireframe = !state.showWireframe;
    applyDisplayModifiers();
    renderViewportToolbars();
  });
  document.getElementById('btn-toggle-mounts')?.addEventListener('click', () => {
    state.showMounts = !state.showMounts;
    applyDisplayModifiers();
    renderViewportToolbars();
  });
  document.getElementById('btn-toggle-cutaway')?.addEventListener('click', () => {
    state.hideCutawayWall = !state.hideCutawayWall;
    applyDisplayModifiers();
    renderViewportToolbars();
  });
  document.getElementById('btn-toggle-vfx')?.addEventListener('click', () => {
    state.showVfxLayers = !state.showVfxLayers;
    applyDisplayModifiers();
    renderViewportToolbars();
  });

  const m = state.currentMetrics;
  const def = getAssetDef(state.selectedAssetId);
  bottom.innerHTML = `
    <div>
      Asset: <strong>${state.selectedAssetId}</strong> ·
      File: <strong>${def?.glbPath ?? ''}</strong> (${(state.currentByteSize / 1024).toFixed(1)} KB)
    </div>
    <div>
      Tris: <strong>${m?.triangles ?? 0}</strong> ·
      Verts: <strong>${m?.vertices ?? 0}</strong> ·
      Mats: <strong>${m?.materialNames.length ?? 0}</strong> ·
      Mounts: <strong>${m?.mounts.length ?? 0}</strong> ·
      BBox: <strong>${m ? m.boundingBoxMeters.size.join('×') : '0'} m</strong>
    </div>
  `;
}

function renderRightPanel(): void {
  const right = document.getElementById('ws-right');
  if (!right) return;

  const def = getAssetDef(state.selectedAssetId)!;

  const tabsHtml = `
    <div class="ws-tabs">
      <button class="ws-tab-btn ${state.activeTab === 'animations' ? 'active' : ''}" data-tab="animations">${t('tab.animations')}</button>
      <button class="ws-tab-btn ${state.activeTab === 'orbital' ? 'active' : ''}" data-tab="orbital">${t('tab.orbital')}</button>
      <button class="ws-tab-btn ${state.activeTab === 'export' ? 'active' : ''}" data-tab="export">${t('tab.export')}</button>
    </div>
  `;

  let bodyHtml = '';

  if (state.activeTab === 'animations') {
    const activeClipMeta = def.clips.find((c) => c.name === state.activeClipName) ?? def.clips[0];
    const totalFrames = Math.max(1, Math.round(state.clipDurationS * 30));
    const currentFrame = Math.min(totalFrames, Math.round(state.clipTimeS * 30));

    bodyHtml = `
      <div class="ws-section">
        <div class="ws-section-title">
          <span>${t('anim.title')} (${def.clips.length})</span>
          <span>${state.activeClipName}</span>
        </div>
        <div class="ws-clip-list">
          ${def.clips
            .map(
              (clip) => `
              <button class="ws-clip-item ${state.activeClipName === clip.name ? 'active' : ''}" data-clip="${clip.name}">
                <strong>${clip.name}</strong>
                <div class="ws-clip-badges">
                  <span>${clip.durationS.toFixed(1)}s</span>
                  <span class="ws-pill ${clip.loop ? 'loop' : 'oneshot'}">${clip.loop ? 'LOOP' : '1-SHOT'}</span>
                  <span class="ws-pill inplace">${clip.rootMotion === 'in-place' ? 'IN-PLACE' : 'DEMO'}</span>
                </div>
              </button>
            `,
            )
            .join('')}
        </div>

        <div class="ws-transport-row">
          <button class="ws-btn primary" id="btn-anim-play">${state.isPlaying ? t('anim.pause') : t('anim.play')}</button>
          <button class="ws-btn" id="btn-anim-reset">${t('anim.stopReset')}</button>
          <button class="ws-btn ${state.loopClip ? 'active' : ''}" id="btn-anim-loop">${t('anim.loop')}</button>
        </div>

        <div class="ws-transport-row">
          <span style="font-size:11px;color:var(--text-1);">${t('anim.speed')}:</span>
          ${[0.25, 0.5, 1, 2]
            .map(
              (spd) => `
              <button class="ws-btn ${state.playbackSpeed === spd ? 'active' : ''}" data-speed="${spd}">${spd}×</button>
            `,
            )
            .join('')}
        </div>

        <div class="ws-slider-row">
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span>${t('anim.time')}</span>
            <span id="lbl-clip-time" style="font-family:var(--font-mono);">${state.clipTimeS.toFixed(2)}s / ${state.clipDurationS.toFixed(2)}s</span>
          </div>
          <input type="range" id="rng-clip-time" min="0" max="${state.clipDurationS}" step="0.01" value="${state.clipTimeS}" />
        </div>

        <div class="ws-transport-row" style="justify-content:space-between;">
          <span style="font-size:11px;color:var(--text-1);">${t('anim.frame')}: <strong id="lbl-frame-num">${currentFrame} / ${totalFrames}</strong></span>
          <div>
            <button class="ws-btn" id="btn-frame-prev">−1 Frame</button>
            <button class="ws-btn" id="btn-frame-next">+1 Frame</button>
          </div>
        </div>

        ${
          activeClipMeta
            ? `
            <div style="margin-top:8px;font-size:11px;color:var(--text-1);">
              <strong>${t('anim.transitions')}:</strong> ${activeClipMeta.allowedTransitions.join(' → ') || 'none'}
            </div>
          `
            : ''
        }
      </div>

      <div class="ws-section">
        <div class="ws-section-title">${t('crew.title')}</div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button class="ws-btn ${state.crew.gravityMode === 'mag-boots' ? 'active' : ''}" id="btn-crew-mag">${t('crew.gravity.mag')}</button>
          <button class="ws-btn ${state.crew.gravityMode === 'zero-g' ? 'active' : ''}" id="btn-crew-zerog">${t('crew.gravity.zeroG')}</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <button class="ws-btn" data-crew-console="power">${t('crew.cmd.power')}</button>
          <button class="ws-btn" data-crew-console="thermal">${t('crew.cmd.thermal')}</button>
          <button class="ws-btn" data-crew-console="oxygen">${t('crew.cmd.oxygen')}</button>
          <button class="ws-btn" data-crew-console="docking">${t('crew.cmd.docking')}</button>
          <button class="ws-btn" data-crew-console="separation">${t('crew.cmd.separation')}</button>
          <button class="ws-btn" id="btn-crew-hatch">${t('crew.cmd.hatch')}</button>
          <button class="ws-btn" id="btn-crew-abort">${t('crew.cmd.abortDock')}</button>
          <button class="ws-btn" id="btn-crew-error">Demo Task Error</button>
        </div>
        <div style="margin-top:8px;font-family:var(--font-mono);font-size:10.5px;color:var(--text-1);">
          Stage: <strong>${state.crew.stage}</strong> · Clip: <strong>${state.crew.activeClip}</strong><br/>
          Ship Solar Angle: <strong>${state.crew.shipSolarAngleDeg}°</strong> · Ship Heater: <strong>${state.crew.shipHeaterOn ? 'ON' : 'OFF'}</strong> · Ship O2: <strong>${state.crew.shipOxygenPercent}%</strong><br/>
          Docking: <strong>${state.crew.dockingStatus}</strong> · Sat Released: <strong>${state.crew.satelliteSeparated ? 'YES' : 'NO'}</strong>
        </div>
      </div>
    `;
  } else if (state.activeTab === 'orbital') {
    const ev = evaluateOrbitalSemantics(state.orbital);
    const f = ev.forecastNextOrbit;
    const windows: OrbitalWindowId[] = ['idle_sun', 'imaging', 'pass', 'shadow'];
    const switchList: OrbitalSwitchId[] = ['camera', 'transmitter', 'heater', 'safeMode'];

    bodyHtml = `
      <div class="ws-section">
        <div class="ws-section-title">
          <span>Mode &amp; Orbit Step</span>
          <span>Orbit ${state.orbital.orbitNumber} / ${state.orbital.totalOrbits}</span>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button class="ws-btn ${state.orbital.mode === 'preview' ? 'active' : ''}" id="btn-mode-preview">${t('orbit.mode.preview')}</button>
          <button class="ws-btn ${state.orbital.mode === 'plan' ? 'active' : ''}" id="btn-mode-plan">${t('orbit.mode.plan')}</button>
          <button class="ws-btn primary" id="btn-next-orbit">${t('orbit.step.next')}</button>
        </div>

        <div class="ws-section-title">${t('orbit.env.window')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;">
          ${windows
            .map(
              (w) => `
              <button class="ws-btn ${state.orbital.window === w ? 'active' : ''}" data-orb-win="${w}">
                ${t(`orbit.win.${w}`)}
              </button>
            `,
            )
            .join('')}
        </div>

        <div class="ws-section-title">${t('orbit.env.title')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;">
          <label style="display:flex;align-items:center;gap:5px;">
            <input type="checkbox" id="chk-orb-storm" ${state.orbital.storm ? 'checked' : ''} />
            ${t('orbit.env.storm')}
          </label>
          <label style="display:flex;align-items:center;gap:5px;">
            <input type="checkbox" id="chk-orb-ended" ${state.orbital.missionEnded ? 'checked' : ''} />
            ${t('orbit.env.missionEnd')}
          </label>
        </div>

        <div style="display:grid;grid-template-columns:115px 1fr;gap:6px;align-items:center;margin-top:8px;">
          <label>${t('orbit.env.cold')}</label>
          <select class="ws-select" id="sel-orb-cold">
            <option value="0" ${state.orbital.coldStress === 0 ? 'selected' : ''}>0 — Nominal (Warm)</option>
            <option value="1" ${state.orbital.coldStress === 1 ? 'selected' : ''}>1 — Cooling (Warning)</option>
            <option value="2" ${state.orbital.coldStress >= 2 ? 'selected' : ''}>2 — Cold Lock (Camera Blocked!)</option>
          </select>

          <label>${t('orbit.env.buffer')}</label>
          <select class="ws-select" id="sel-orb-buffer">
            <option value="0" ${state.orbital.bufferMb === 0 ? 'selected' : ''}>0 Mb (Empty — Tx Standby)</option>
            <option value="1440" ${state.orbital.bufferMb > 0 && state.orbital.bufferMb < 4000 ? 'selected' : ''}>1,440 / 4,000 Mb (36%)</option>
            <option value="4000" ${state.orbital.bufferMb >= 4000 ? 'selected' : ''}>4,000 / 4,000 Mb (100% Full — Overflow!)</option>
          </select>

          <label>${t('orbit.env.power')}</label>
          <select class="ws-select" id="sel-orb-power">
            <option value="52" ${state.orbital.chargeWh > 15 ? 'selected' : ''}>52 / 60 Wh (Nominal)</option>
            <option value="12" ${state.orbital.chargeWh > 0 && state.orbital.chargeWh <= 15 ? 'selected' : ''}>12 / 60 Wh (Low Battery)</option>
            <option value="0" ${state.orbital.chargeWh <= 0 ? 'selected' : ''}>0 Wh (No Power — All Stopped!)</option>
          </select>

          <label>${t('orbit.env.damage')}</label>
          <select class="ws-select" id="sel-orb-damage">
            <option value="none">None (All Healthy)</option>
            <option value="science" ${state.orbital.damage.science >= 1 ? 'selected' : ''}>Camera Damaged (severity 1.0)</option>
            <option value="comms" ${state.orbital.damage.comms >= 1 ? 'selected' : ''}>Transmitter Damaged (severity 1.0)</option>
            <option value="thermal" ${state.orbital.damage.thermal >= 1 ? 'selected' : ''}>Heater Damaged (severity 1.0)</option>
            <option value="power" ${state.orbital.damage.power >= 1 ? 'selected' : ''}>Power Bus Dead (severity 1.0)</option>
          </select>
        </div>
      </div>

      <div class="ws-section">
        <div class="ws-section-title">
          <span>4 Orbital Switches (Command vs Actual System State)</span>
        </div>
        <div class="ws-switch-cards">
          ${switchList
            .map((id) => {
              const sub = ev.subsystems[id];
              const cardTone = sub.effectiveActive
                ? 'working'
                : sub.visualState.startsWith('BLOCKED') || sub.visualState === 'OVERFLOW_DISCARDING'
                  ? 'blocked'
                  : '';
              const cmdLabel =
                sub.overriddenBySafe && id !== 'safeMode'
                  ? sub.savedInSafe
                    ? t('switch.cmd.savedOn')
                    : t('switch.cmd.savedOff')
                  : sub.commanded
                    ? t('switch.cmd.on')
                    : t('switch.cmd.off');
              const sysTone = sub.effectiveActive
                ? 'sys-active'
                : sub.visualState.startsWith('BLOCKED') || sub.visualState === 'OVERFLOW_DISCARDING'
                  ? 'sys-err'
                  : 'sys-warn';

              return `
                <div class="ws-switch-card ${cardTone}">
                  <div class="ws-switch-header">
                    <strong>${t(`switch.${id}`)}</strong>
                    <button class="ws-btn ${sub.commanded ? 'primary' : ''}" data-toggle-sw="${id}">
                      Toggle ${sub.commanded ? 'OFF' : 'ON'}
                    </button>
                  </div>
                  <div class="ws-switch-states">
                    <div class="ws-state-box ${sub.commanded ? 'cmd-on' : ''}">${cmdLabel}</div>
                    <div class="ws-state-box ${sysTone}">${t(`state.${sub.visualState}`)}</div>
                  </div>
                  <div class="ws-switch-reason">
                    ${t(sub.reasonKey)}
                    <span style="display:block;font-family:var(--font-mono);font-size:10px;margin-top:2px;color:var(--accent-cyan);">
                      Clip: ${sub.targetClip} · VFX: ${sub.vfxVisible ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        <div style="margin-top:10px;padding:8px;background:var(--bg-0);border:1px solid var(--border);border-radius:6px;font-family:var(--font-mono);font-size:10.5px;">
          <strong>Next Orbit Forecast (Plan Preview):</strong><br/>
          End Charge: ${f.predictedEndChargeWh} Wh · Generated: +${f.predictedGeneratedMb} Mb · Downlink: +${f.predictedDeliveredMb} Mb · Discarded: ${f.predictedDiscardedMb} Mb
        </div>
      </div>
    `;
  } else {
    bodyHtml = `
      <div class="ws-section">
        <div class="ws-section-title">Download Real Exported GLBs &amp; Bundle</div>
        <div style="display:flex;flex-direction:column;gap:7px;">
          <button class="ws-btn primary" id="btn-dl-selected">${t('export.dlSelected')}</button>
          <button class="ws-btn" id="btn-dl-all-models">${t('export.dlAllModels')}</button>
          <button class="ws-btn" id="btn-dl-manifest">${t('export.dlManifest')}</button>
          <button class="ws-btn success" id="btn-dl-full-pack">${t('export.dlFullPack')}</button>
        </div>
      </div>

      <div class="ws-section">
        <div class="ws-section-title">Clean-Scene GLTFLoader Re-Import Validator</div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button class="ws-btn primary" id="btn-qa-single">${t('app.validate.run')}</button>
          <button class="ws-btn" id="btn-qa-all">${t('app.validate.all')}</button>
        </div>
        <div class="ws-qa-log" id="box-qa-log">${state.qaReportText}</div>
      </div>
    `;
  }

  right.innerHTML = tabsHtml + bodyHtml;

  // Bind tab buttons
  right.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab as RightTab;
      renderRightPanel();
    });
  });

  // Bind Animation tab events
  right.querySelectorAll<HTMLButtonElement>('[data-clip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const clipName = btn.dataset.clip!;
      const clipMeta = def.clips.find((c) => c.name === clipName);
      state.activeClipName = clipName;
      if (clipMeta) {
        state.loopClip = clipMeta.loop;
        state.clipDurationS = clipMeta.durationS;
      }
      state.isPlaying = true;
      primaryController?.playClip(clipName, {
        loop: state.loopClip,
        timeScale: state.playbackSpeed,
      });
      renderRightPanel();
    });
  });

  document.getElementById('btn-anim-play')?.addEventListener('click', () => {
    state.isPlaying = !state.isPlaying;
    primaryController?.setPaused(!state.isPlaying);
    renderRightPanel();
  });

  document.getElementById('btn-anim-reset')?.addEventListener('click', () => {
    state.isPlaying = false;
    state.clipTimeS = 0;
    primaryController?.stopAndResetBindPose();
    renderRightPanel();
  });

  document.getElementById('btn-anim-loop')?.addEventListener('click', () => {
    state.loopClip = !state.loopClip;
    primaryController?.setLoop(state.loopClip);
    renderRightPanel();
  });

  right.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spd = Number(btn.dataset.speed);
      state.playbackSpeed = spd;
      primaryController?.setSpeed(spd);
      renderRightPanel();
    });
  });

  const timeSlider = document.getElementById('rng-clip-time') as HTMLInputElement | null;
  timeSlider?.addEventListener('input', () => {
    const val = Number(timeSlider.value);
    state.isPlaying = false;
    state.clipTimeS = val;
    primaryController?.setPaused(true);
    primaryController?.seekTime(val);
    renderRightPanel();
  });

  document.getElementById('btn-frame-prev')?.addEventListener('click', () => {
    state.isPlaying = false;
    primaryController?.setPaused(true);
    state.clipTimeS = Math.max(0, state.clipTimeS - 1 / 30);
    primaryController?.seekTime(state.clipTimeS);
    renderRightPanel();
  });

  document.getElementById('btn-frame-next')?.addEventListener('click', () => {
    state.isPlaying = false;
    primaryController?.setPaused(true);
    state.clipTimeS = Math.min(state.clipDurationS, state.clipTimeS + 1 / 30);
    primaryController?.seekTime(state.clipTimeS);
    renderRightPanel();
  });

  // Crew choreography buttons
  document.getElementById('btn-crew-mag')?.addEventListener('click', () => {
    if (state.crew.gravityMode !== 'mag-boots') {
      state.crew = toggleCrewGravityMode(state.crew);
      shipControllers?.astronaut.playClip(state.crew.activeClip, { loop: true });
      renderRightPanel();
    }
  });
  document.getElementById('btn-crew-zerog')?.addEventListener('click', () => {
    if (state.crew.gravityMode !== 'zero-g') {
      state.crew = toggleCrewGravityMode(state.crew);
      shipControllers?.astronaut.playClip(state.crew.activeClip, { loop: true });
      renderRightPanel();
    }
  });
  right.querySelectorAll<HTMLButtonElement>('[data-crew-console]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetConsole = btn.dataset.crewConsole as ConsoleKind;
      if (state.selectedAssetId !== 'scene-ship') {
        void selectAsset('scene-ship').then(() => {
          state.crew = commandCrewToConsole(state.crew, targetConsole, 'success');
          shipControllers?.astronaut.playClip(state.crew.activeClip, { loop: true });
          renderRightPanel();
        });
      } else {
        state.crew = commandCrewToConsole(state.crew, targetConsole, 'success');
        shipControllers?.astronaut.playClip(state.crew.activeClip, { loop: true });
        renderRightPanel();
      }
    });
  });

  document.getElementById('btn-crew-hatch')?.addEventListener('click', () => {
    state.crew.hatchOpen = !state.crew.hatchOpen;
    const clip = state.crew.hatchOpen ? 'hatch_open' : 'hatch_close';
    shipControllers?.ship.playClip(clip, { loop: false });
    if (state.selectedAssetId === 'ship-cutaway') {
      primaryController?.playClip(clip, { loop: false });
    }
    renderRightPanel();
  });

  document.getElementById('btn-crew-abort')?.addEventListener('click', () => {
    state.crew.dockingStatus = 'aborted';
    shipControllers?.ship.playClip('docking_abort', { loop: false });
    if (state.selectedAssetId === 'ship-cutaway') {
      primaryController?.playClip('docking_abort', { loop: false });
    }
    renderRightPanel();
  });

  document.getElementById('btn-crew-error')?.addEventListener('click', () => {
    state.crew = commandCrewToConsole(state.crew, state.crew.activeConsole, 'error');
    shipControllers?.astronaut.playClip('task_error', { loop: false });
    if (state.selectedAssetId === 'astronaut') {
      primaryController?.playClip('task_error', { loop: false });
    }
    renderRightPanel();
  });

  // Bind Orbital Switch & Environment Controls
  document.getElementById('btn-mode-preview')?.addEventListener('click', () => {
    state.orbital.mode = 'preview';
    renderUI();
  });
  document.getElementById('btn-mode-plan')?.addEventListener('click', () => {
    state.orbital.mode = 'plan';
    renderUI();
  });
  document.getElementById('btn-next-orbit')?.addEventListener('click', () => {
    state.orbital = advanceOrbitalTurn(state.orbital);
    syncSatelliteVisualsToOrbitalState();
    renderUI();
  });

  right.querySelectorAll<HTMLButtonElement>('[data-orb-win]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.orbital.window = btn.dataset.orbWin as OrbitalWindowId;
      syncSatelliteVisualsToOrbitalState();
      renderRightPanel();
    });
  });

  const stormChk = document.getElementById('chk-orb-storm') as HTMLInputElement | null;
  stormChk?.addEventListener('change', () => {
    state.orbital.storm = stormChk.checked;
    syncSatelliteVisualsToOrbitalState();
    renderRightPanel();
  });

  const endedChk = document.getElementById('chk-orb-ended') as HTMLInputElement | null;
  endedChk?.addEventListener('change', () => {
    state.orbital.missionEnded = endedChk.checked;
    syncSatelliteVisualsToOrbitalState();
    renderRightPanel();
  });

  const coldSel = document.getElementById('sel-orb-cold') as HTMLSelectElement | null;
  coldSel?.addEventListener('change', () => {
    state.orbital.coldStress = Number(coldSel.value);
    syncSatelliteVisualsToOrbitalState();
    renderRightPanel();
  });

  const bufSel = document.getElementById('sel-orb-buffer') as HTMLSelectElement | null;
  bufSel?.addEventListener('change', () => {
    state.orbital.bufferMb = Number(bufSel.value);
    syncSatelliteVisualsToOrbitalState();
    renderRightPanel();
  });

  const pwrSel = document.getElementById('sel-orb-power') as HTMLSelectElement | null;
  pwrSel?.addEventListener('change', () => {
    state.orbital.chargeWh = Number(pwrSel.value);
    syncSatelliteVisualsToOrbitalState();
    renderRightPanel();
  });

  const dmgSel = document.getElementById('sel-orb-damage') as HTMLSelectElement | null;
  dmgSel?.addEventListener('change', () => {
    const v = dmgSel.value;
    state.orbital.damage = {
      power: v === 'power' ? 1 : 0,
      comms: v === 'comms' ? 1 : 0,
      science: v === 'science' ? 1 : 0,
      thermal: v === 'thermal' ? 1 : 0,
      structure: 0,
    };
    syncSatelliteVisualsToOrbitalState();
    renderRightPanel();
  });

  right.querySelectorAll<HTMLButtonElement>('[data-toggle-sw]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const swId = btn.dataset.toggleSw as OrbitalSwitchId;
      state.orbital = toggleOrbitalSwitch(state.orbital, swId);
      syncSatelliteVisualsToOrbitalState();
      renderRightPanel();
    });
  });

  // Bind Export & QA buttons
  document.getElementById('btn-dl-selected')?.addEventListener('click', () => {
    void handleDownloadSelectedGlb();
  });
  document.getElementById('btn-dl-all-models')?.addEventListener('click', () => {
    void handleDownloadAllModelsZip();
  });
  document.getElementById('btn-dl-manifest')?.addEventListener('click', () => {
    void handleDownloadManifestJson();
  });
  document.getElementById('btn-dl-full-pack')?.addEventListener('click', () => {
    void handleDownloadFullWorkshopZip();
  });
  document.getElementById('btn-qa-single')?.addEventListener('click', () => {
    void handleRunCleanValidation(false);
  });
  document.getElementById('btn-qa-all')?.addEventListener('click', () => {
    void handleRunCleanValidation(true);
  });
}

function renderHelpModal(): void {
  const slot = document.getElementById('ws-modal-slot');
  if (!slot) return;
  if (!state.helpOpen) {
    slot.innerHTML = '';
    return;
  }

  slot.innerHTML = `
    <div class="ws-modal-backdrop" id="modal-backdrop">
      <div class="ws-modal" role="dialog" aria-modal="true" aria-labelledby="modal-help-title">
        <h2 id="modal-help-title">${t('help.title')}</h2>
        <p>${t('help.mouse')}</p>
        <p>${t('help.animations')}</p>
        <p>${t('help.downloads')}</p>
        <p>${t('help.react')}</p>
        <div style="display:flex;justify-content:flex-end;margin-top:14px;">
          <button class="ws-btn primary" id="btn-close-help">${t('app.help.close')}</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-close-help')?.addEventListener('click', () => {
    state.helpOpen = false;
    renderHelpModal();
  });
  document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      state.helpOpen = false;
      renderHelpModal();
    }
  });
}

// ───────────────────────── Keyboard Shortcuts & Render Loop ─────────────────────────

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
    return;
  }
  const k = e.key.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    state.isPlaying = !state.isPlaying;
    primaryController?.setPaused(!state.isPlaying);
    renderRightPanel();
  } else if (k === '0') {
    state.isPlaying = false;
    state.clipTimeS = 0;
    primaryController?.stopAndResetBindPose();
    renderRightPanel();
  } else if (k === 'r') {
    applyCameraPreset('iso');
    renderViewportToolbars();
  } else if (k === 'f') {
    fitCameraToActiveModel();
  } else if (k === 'w') {
    state.showWireframe = !state.showWireframe;
    applyDisplayModifiers();
    renderViewportToolbars();
  } else if (k === 'm') {
    state.showMounts = !state.showMounts;
    applyDisplayModifiers();
    renderViewportToolbars();
  }
});

let lastFrameTime = performance.now();

function animateLoop(now: number): void {
  requestAnimationFrame(animateLoop);
  const dtS = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  if (state.isPlaying) {
    if (state.selectedAssetId === 'scene-satellite' && satelliteControllers) {
      Object.values(satelliteControllers).forEach((c) => c.update(dtS));
    } else if (state.selectedAssetId === 'scene-ship' && shipControllers && shipBundle) {
      const prevClip = state.crew.activeClip;
      const prevConsoleClip = state.crew.consoleClip;
      const prevShipClip = state.crew.shipClip;
      state.crew = stepCrewChoreography(state.crew, dtS);

      shipBundle.astronaut.root.position.x = state.crew.currentX;
      shipBundle.astronaut.root.rotation.y = state.crew.facingYawRad;

      if (state.crew.activeClip !== prevClip) {
        shipControllers.astronaut.playClip(state.crew.activeClip, { loop: true, crossFadeDurationS: 0.18 });
      }
      if (state.crew.consoleClip !== prevConsoleClip) {
        shipControllers.consoles[state.crew.activeConsole].playClip(state.crew.consoleClip, {
          loop: state.crew.consoleClip === 'work_cycle',
        });
      }
      if (state.crew.shipClip && state.crew.shipClip !== prevShipClip) {
        shipControllers.ship.playClip(state.crew.shipClip, { loop: state.crew.shipClip === 'docking_docked' });
      }

      shipControllers.ship.update(dtS);
      shipControllers.astronaut.update(dtS);
      Object.values(shipControllers.consoles).forEach((c) => c.update(dtS));
    } else if (primaryController) {
      primaryController.update(dtS);
    }

    if (primaryController) {
      state.clipTimeS = primaryController.getCurrentTime();
      state.clipDurationS = primaryController.getCurrentDuration() || state.clipDurationS;
      const slider = document.getElementById('rng-clip-time') as HTMLInputElement | null;
      const timeLbl = document.getElementById('lbl-clip-time');
      const frameLbl = document.getElementById('lbl-frame-num');
      if (slider && document.activeElement !== slider) {
        slider.value = String(state.clipTimeS);
      }
      if (timeLbl) {
        timeLbl.textContent = `${state.clipTimeS.toFixed(2)}s / ${state.clipDurationS.toFixed(2)}s`;
      }
      if (frameLbl) {
        const tot = Math.max(1, Math.round(state.clipDurationS * 30));
        const cur = Math.min(tot, Math.round(state.clipTimeS * 30));
        frameLbl.textContent = `${cur} / ${tot}`;
      }
    }
  }

  controls?.update();
  if (renderer) {
    renderer.render(scene, getActiveCamera());
  }
}

// Boot the workshop viewer
initPublicPreview();
renderUI();
void selectAsset('scene-satellite');
requestAnimationFrame(animateLoop);
