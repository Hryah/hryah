import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STANDALONE_GLB_ASSETS, type ClipMeta, type CatalogModuleStats } from '../catalog/asset-registry';
import { buildWorkshopAssetById } from './index';

/**
 * Installs a lightweight FileReader polyfill when running inside Node.js so
 * Three.js GLTFExporter can serialize binary ArrayBuffers identically in CLI and Browser.
 */
export function ensureNodeFileReaderPolyfill(): void {
  if (typeof globalThis.FileReader !== 'undefined') return;

  class NodeFileReaderPolyfill {
    public result: ArrayBuffer | string | null = null;
    public onloadend: (() => void) | null = null;
    public onload: (() => void) | null = null;
    public onerror: ((err: unknown) => void) | null = null;

    public readAsArrayBuffer(blob: Blob): void {
      blob
        .arrayBuffer()
        .then((ab) => {
          this.result = ab;
          if (this.onload) this.onload();
          if (this.onloadend) this.onloadend();
        })
        .catch((err) => {
          if (this.onerror) this.onerror(err);
        });
    }

    public readAsDataURL(blob: Blob): void {
      blob
        .arrayBuffer()
        .then((ab) => {
          const bytes = new Uint8Array(ab);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]!);
          }
          const base64 = typeof btoa === 'function' ? btoa(binary) : '';
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
          if (this.onload) this.onload();
          if (this.onloadend) this.onloadend();
        })
        .catch((err) => {
          if (this.onerror) this.onerror(err);
        });
    }
  }

  (globalThis as unknown as { FileReader: typeof NodeFileReaderPolyfill }).FileReader = NodeFileReaderPolyfill;
}

export interface SceneMetrics {
  triangles: number;
  vertices: number;
  meshCount: number;
  materialNames: string[];
  nodeNames: string[];
  mounts: Array<{ name: string; position: [number, number, number]; rotation: [number, number, number] }>;
  boundingBoxMeters: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
}

export function inspectSceneMetrics(root: THREE.Object3D): SceneMetrics {
  root.updateMatrixWorld(true);
  let triangles = 0;
  let vertices = 0;
  let meshCount = 0;
  const materialSet = new Set<string>();
  const nodeNames: string[] = [];
  const mounts: SceneMetrics['mounts'] = [];

  root.traverse((obj) => {
    if (obj.name) nodeNames.push(obj.name);
    if (obj.userData?.isMount) {
      mounts.push({
        name: obj.name,
        position: [
          Number(obj.position.x.toFixed(4)),
          Number(obj.position.y.toFixed(4)),
          Number(obj.position.z.toFixed(4)),
        ],
        rotation: [
          Number(obj.rotation.x.toFixed(4)),
          Number(obj.rotation.y.toFixed(4)),
          Number(obj.rotation.z.toFixed(4)),
        ],
      });
    }
    if (obj instanceof THREE.Mesh) {
      meshCount += 1;
      const geom = obj.geometry as THREE.BufferGeometry;
      const posAttr = geom.getAttribute('position');
      if (posAttr) {
        vertices += posAttr.count;
        if (geom.index) {
          triangles += Math.floor(geom.index.count / 3);
        } else {
          triangles += Math.floor(posAttr.count / 3);
        }
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m && m.name) materialSet.add(m.name);
      }
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  return {
    triangles,
    vertices,
    meshCount,
    materialNames: Array.from(materialSet).sort(),
    nodeNames,
    mounts,
    boundingBoxMeters: {
      min: [Number(box.min.x.toFixed(3)), Number(box.min.y.toFixed(3)), Number(box.min.z.toFixed(3))],
      max: [Number(box.max.x.toFixed(3)), Number(box.max.y.toFixed(3)), Number(box.max.z.toFixed(3))],
      size: [Number(size.x.toFixed(3)), Number(size.y.toFixed(3)), Number(size.z.toFixed(3))],
    },
  };
}

/**
 * Exports a standalone asset ID to binary GLB (.glb) bytes from its clean bind pose,
 * embedding all PBR materials and all AnimationClips.
 */
export async function exportAssetToGlbBytes(assetId: string): Promise<{
  bytes: Uint8Array;
  metrics: SceneMetrics;
}> {
  ensureNodeFileReaderPolyfill();
  // Always construct a fresh bind-pose instance so live viewer animations never deform exported geometry
  const asset = buildWorkshopAssetById(assetId);
  asset.root.updateMatrixWorld(true);
  const metrics = inspectSceneMetrics(asset.root);

  const exporter = new GLTFExporter();
  const buffer = await exporter.parseAsync(asset.root, {
    binary: true,
    animations: asset.clips,
    onlyVisible: false,
    trs: true,
  });

  if (!(buffer instanceof ArrayBuffer)) {
    throw new Error(`GLTFExporter did not return binary ArrayBuffer for ${assetId}`);
  }

  return {
    bytes: new Uint8Array(buffer),
    metrics,
  };
}

export interface ManifestAssetEntry {
  id: string;
  category: string;
  glbPath: string;
  zipPath: string;
  byteSize: number;
  catalogStats?: CatalogModuleStats;
  triangles: number;
  vertices: number;
  meshCount: number;
  materials: string[];
  mounts: SceneMetrics['mounts'];
  vfxLayers: string[];
  clips: ClipMeta[];
  boundingBoxMeters: SceneMetrics['boundingBoxMeters'];
}

export interface WorkshopManifest {
  schemaVersion: '1.0.0';
  game: 'hryah';
  conventions: {
    units: 'meters';
    upAxis: '+Y';
    forwardAxis: '+Z';
    handedness: 'right-handed (glTF 2.0 standard)';
    rendererConversionNotes: {
      threeJs: 'Native match (+Y up, +Z forward, 1 unit = 1 meter). Load directly via GLTFLoader.',
      babylonJs: 'Babylon converts right-handed glTF automatically via __root__ node; use scene.useRightHandedSystem = true for direct socket parity.',
      blenderOrZUp: 'Rotate root +90 deg around X (X-right, Y-forward, Z-up) on import; standard Blender glTF 2.0 importer handles +Y up -> +Z up automatically.',
    };
  };
  vfxLayerSemantics: Record<string, string>;
  assets: ManifestAssetEntry[];
}

export function createWorkshopManifest(entries: ManifestAssetEntry[]): WorkshopManifest {
  return {
    schemaVersion: '1.0.0',
    game: 'hryah',
    conventions: {
      units: 'meters',
      upAxis: '+Y',
      forwardAxis: '+Z',
      handedness: 'right-handed (glTF 2.0 standard)',
      rendererConversionNotes: {
        threeJs: 'Native match (+Y up, +Z forward, 1 unit = 1 meter). Load directly via GLTFLoader.',
        babylonJs: 'Babylon converts right-handed glTF automatically via __root__ node; use scene.useRightHandedSystem = true for direct socket parity.',
        blenderOrZUp: 'Rotate root +90 deg around X (X-right, Y-forward, Z-up) on import; standard Blender glTF 2.0 importer handles +Y up -> +Z up automatically.',
      },
    },
    vfxLayerSemantics: {
      vfx_scan_cone: 'Optional camera imaging frustum cone. Show only when camera is actively scanning inside the imaging window.',
      vfx_downlink_beam: 'Optional antenna radio link cone/pulses. Show only during ground station pass when bufferMb > 0 and transmitter is active.',
      vfx_thruster_plume: 'Optional engine exhaust plume. Show only during ignition/thrust maneuvers; keep hidden during passive orbital observation.',
      vfx_heater_glow: 'Optional subtle amber heater strip indicator on satellite bus. Show only when heater is actively warming in eclipse shadow.',
      vfx_cold_frost: 'Optional frost crystal overlay when coldStress >= 2 (camera cold-locked).',
      vfx_storm_particles: 'Optional solar storm plasma ring overlay when storm === true.',
    },
    assets: entries,
  };
}

/**
 * Generates all 25 standalone GLBs and returns their binary buffers + manifest.
 */
export async function generateAllWorkshopGlbs(): Promise<{
  filesByAssetId: Map<string, { glbPath: string; zipPath: string; bytes: Uint8Array }>;
  manifest: WorkshopManifest;
}> {
  const filesByAssetId = new Map<string, { glbPath: string; zipPath: string; bytes: Uint8Array }>();
  const entries: ManifestAssetEntry[] = [];

  for (const def of STANDALONE_GLB_ASSETS) {
    const { bytes, metrics } = await exportAssetToGlbBytes(def.id);
    filesByAssetId.set(def.id, {
      glbPath: def.glbPath,
      zipPath: def.zipPath,
      bytes,
    });
    entries.push({
      id: def.id,
      category: def.category,
      glbPath: def.glbPath,
      zipPath: def.zipPath,
      byteSize: bytes.byteLength,
      ...(def.catalogStats ? { catalogStats: def.catalogStats } : {}),
      triangles: metrics.triangles,
      vertices: metrics.vertices,
      meshCount: metrics.meshCount,
      materials: metrics.materialNames,
      mounts: metrics.mounts,
      vfxLayers: def.vfxLayers,
      clips: def.clips,
      boundingBoxMeters: metrics.boundingBoxMeters,
    });
  }

  return {
    filesByAssetId,
    manifest: createWorkshopManifest(entries),
  };
}
