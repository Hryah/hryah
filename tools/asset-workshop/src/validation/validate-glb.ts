import * as THREE from 'three';
import { getAssetDef, type WorkshopAssetDef } from '../catalog/asset-registry';
import {
  captureBindPose,
  loadWorkshopGlb,
  restoreBindPose,
  WorkshopAnimationController,
} from '../adapter/import-and-animate';

export interface ClipValidationReport {
  name: string;
  expectedDurationS: number;
  actualDurationS: number;
  trackCount: number;
  unboundTracks: string[];
  maxPoseDelta: number;
  movedDuringPlayback: boolean;
  driftAfter5Cycles: number;
  scalePreserved: boolean;
}

export interface GlbValidationReport {
  assetId: string;
  valid: boolean;
  byteSize: number;
  gltfVersion: string;
  triangles: number;
  vertices: number;
  meshCount: number;
  materials: string[];
  missingNodes: string[];
  missingMounts: string[];
  missingMaterialsOnMeshes: string[];
  coplanarZFightingRisks: string[];
  boundingBoxSizeMeters: [number, number, number];
  clips: ClipValidationReport[];
  errors: string[];
}

/**
 * Parses the raw GLB binary header and embedded glTF 2.0 JSON chunk directly
 * (independent structural check before Three.js loader).
 */
export function inspectRawGlbHeader(bytes: Uint8Array): {
  magicOk: boolean;
  version: number;
  declaredLength: number;
  gltfJson: Record<string, unknown> | null;
  error?: string;
} {
  if (bytes.byteLength < 20) {
    return { magicOk: false, version: 0, declaredLength: 0, gltfJson: null, error: 'GLB buffer shorter than 20 bytes' };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  const chunk0Len = view.getUint32(12, true);
  const chunk0Type = view.getUint32(16, true);

  if (magic !== 0x46546c67) {
    return { magicOk: false, version, declaredLength, gltfJson: null, error: 'Invalid GLB magic header' };
  }
  if (chunk0Type !== 0x4e4f534a) {
    return { magicOk: true, version, declaredLength, gltfJson: null, error: 'First GLB chunk is not JSON' };
  }
  const jsonBytes = bytes.subarray(20, 20 + chunk0Len);
  const jsonText = new TextDecoder().decode(jsonBytes);
  const gltfJson = JSON.parse(jsonText) as Record<string, unknown>;
  return {
    magicOk: true,
    version,
    declaredLength,
    gltfJson,
  };
}

/**
 * Checks for coplanar overlapping horizontal/vertical faces between distinct opaque meshes
 * with different materials that could cause z-fighting.
 */
function checkCoplanarZFighting(root: THREE.Object3D): string[] {
  root.updateMatrixWorld(true);
  const meshes: Array<{
    name: string;
    materialName: string;
    box: THREE.Box3;
  }> = [];

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!mat || mat.transparent) return;
      const box = new THREE.Box3().setFromObject(obj);
      meshes.push({
        name: obj.name || 'unnamed_mesh',
        materialName: mat.name || 'unnamed_mat',
        box,
      });
    }
  });

  const risks: string[] = [];
  const eps = 0.0005; // 0.5mm coplanar threshold

  for (let i = 0; i < meshes.length; i++) {
    for (let j = i + 1; j < meshes.length; j++) {
      const a = meshes[i]!;
      const b = meshes[j]!;
      if (a.materialName === b.materialName) continue;

      // Check if their bounding boxes overlap significantly in 2 axes AND share the exact same boundary plane in the 3rd axis
      const overlapX = Math.min(a.box.max.x, b.box.max.x) - Math.max(a.box.min.x, b.box.min.x);
      const overlapY = Math.min(a.box.max.y, b.box.max.y) - Math.max(a.box.min.y, b.box.min.y);
      const overlapZ = Math.min(a.box.max.z, b.box.max.z) - Math.max(a.box.min.z, b.box.min.z);

      if (overlapX > 0.04 && overlapY > 0.04 && overlapZ > 0.04) {
        const sameMaxZ = Math.abs(a.box.max.z - b.box.max.z) < eps;
        const sameMinZ = Math.abs(a.box.min.z - b.box.min.z) < eps;
        const sameMaxY = Math.abs(a.box.max.y - b.box.max.y) < eps;
        const sameMinY = Math.abs(a.box.min.y - b.box.min.y) < eps;
        const sameMaxX = Math.abs(a.box.max.x - b.box.max.x) < eps;
        const sameMinX = Math.abs(a.box.min.x - b.box.min.x) < eps;

        if ((sameMaxZ && sameMinZ) || (sameMaxY && sameMinY) || (sameMaxX && sameMinX)) {
          risks.push(`${a.name} (${a.materialName}) coplanar with ${b.name} (${b.materialName})`);
        }
      }
    }
  }

  return risks;
}

/**
 * Re-imports exported `.glb` bytes into a completely clean GLTFLoader, fresh Scene, and fresh
 * AnimationMixer, validating geometry, materials, node hierarchy, sockets, and animation clips.
 */
export async function validateExportedGlbBytes(
  assetId: string,
  bytes: Uint8Array,
  customDef?: WorkshopAssetDef,
): Promise<GlbValidationReport> {
  const def = customDef ?? getAssetDef(assetId);
  if (!def) {
    throw new Error(`No WorkshopAssetDef found for ${assetId}`);
  }

  const errors: string[] = [];
  const rawHeader = inspectRawGlbHeader(bytes);
  if (!rawHeader.magicOk || rawHeader.version !== 2 || rawHeader.declaredLength !== bytes.byteLength) {
    errors.push(rawHeader.error || `GLB header mismatch: version=${rawHeader.version}, len=${rawHeader.declaredLength}`);
  }

  // Check raw glTF JSON for external URIs (Section 6: no external file paths or CDN links)
  if (rawHeader.gltfJson) {
    const images = (rawHeader.gltfJson.images as Array<{ uri?: string }> | undefined) ?? [];
    for (const img of images) {
      if (img.uri && !img.uri.startsWith('data:')) {
        errors.push(`External image URI found in GLB: ${img.uri}`);
      }
    }
  }

  // Load into a brand-new GLTFLoader instance
  const gltf = await loadWorkshopGlb(bytes);
  const cleanScene = gltf.scene;
  cleanScene.updateMatrixWorld(true);

  let triangles = 0;
  let vertices = 0;
  let meshCount = 0;
  const materialNames = new Set<string>();
  const missingMaterialsOnMeshes: string[] = [];
  const presentNodes = new Set<string>();

  cleanScene.traverse((obj) => {
    if (obj.name) {
      presentNodes.add(obj.name);
    }
    if (obj instanceof THREE.Mesh) {
      meshCount += 1;
      const geom = obj.geometry as THREE.BufferGeometry;
      const pos = geom.getAttribute('position');
      if (pos) {
        vertices += pos.count;
        triangles += geom.index ? Math.floor(geom.index.count / 3) : Math.floor(pos.count / 3);
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (mats.length === 0 || !mats[0]) {
        missingMaterialsOnMeshes.push(obj.name || 'unnamed_mesh');
      }
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) {
          materialNames.add(m.name || 'standard_mat');
          if (Number.isNaN(m.roughness) || Number.isNaN(m.metalness)) {
            errors.push(`Mesh ${obj.name} has NaN PBR roughness/metalness`);
          }
        } else if (m) {
          materialNames.add(m.name || m.type);
        }
      }
    }
  });

  if (meshCount === 0) {
    errors.push('Re-imported GLB contains 0 meshes');
  }
  if (missingMaterialsOnMeshes.length > 0) {
    errors.push(`Meshes missing materials: ${missingMaterialsOnMeshes.join(', ')}`);
  }

  const missingNodes = def.requiredNodes.filter((n) => !presentNodes.has(n));
  if (missingNodes.length > 0) {
    errors.push(`Missing required nodes: ${missingNodes.join(', ')}`);
  }

  const missingMounts = def.mounts.filter((m) => !presentNodes.has(m));
  if (missingMounts.length > 0) {
    errors.push(`Missing mount sockets: ${missingMounts.join(', ')}`);
  }

  // Check scale / bounding box
  const bbox = new THREE.Box3().setFromObject(cleanScene);
  const sizeVec = new THREE.Vector3();
  bbox.getSize(sizeVec);
  const boundingBoxSizeMeters: [number, number, number] = [
    Number(sizeVec.x.toFixed(3)),
    Number(sizeVec.y.toFixed(3)),
    Number(sizeVec.z.toFixed(3)),
  ];
  if (sizeVec.length() < 0.05 || sizeVec.length() > 25) {
    errors.push(`Unreasonable bounding box size (meters): ${boundingBoxSizeMeters.join(' x ')}`);
  }

  // Check coplanar z-fighting risks in bind pose
  const coplanarZFightingRisks = checkCoplanarZFighting(cleanScene);
  if (coplanarZFightingRisks.length > 0) {
    errors.push(`Coplanar z-fighting risks detected: ${coplanarZFightingRisks.join('; ')}`);
  }

  // Validate every expected AnimationClip in a fresh AnimationController
  const bindSnapshot = captureBindPose(cleanScene);
  const controller = new WorkshopAnimationController(cleanScene, gltf.animations);
  const clipReports: ClipValidationReport[] = [];

  for (const expectedClip of def.clips) {
    restoreBindPose(bindSnapshot);
    cleanScene.updateMatrixWorld(true);

    const actualClip = gltf.animations.find((c) => c.name === expectedClip.name);
    if (!actualClip) {
      errors.push(`Missing AnimationClip "${expectedClip.name}" in re-imported GLB`);
      continue;
    }

    const unboundTracks: string[] = [];
    for (const track of actualClip.tracks) {
      const dotIdx = track.name.lastIndexOf('.');
      const targetNodeName = dotIdx > 0 ? track.name.slice(0, dotIdx) : track.name;
      const targetNode = cleanScene.getObjectByName(targetNodeName);
      if (!targetNode) {
        unboundTracks.push(track.name);
      }
    }
    if (unboundTracks.length > 0) {
      errors.push(`Clip "${expectedClip.name}" has unbound tracks: ${unboundTracks.join(', ')}`);
    }

    // Record initial transforms at t = 0
    controller.playClip(expectedClip.name, {
      loop: expectedClip.loop,
      crossFadeDurationS: 0,
    });
    controller.seekTime(0);

    const startTransforms = new Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }>();
    cleanScene.traverse((node) => {
      if (node.name) {
        startTransforms.set(node.name, {
          pos: node.position.clone(),
          quat: node.quaternion.clone(),
          scale: node.scale.clone(),
        });
      }
    });

    let maxPoseDelta = 0;
    let scalePreserved = true;
    const sampleFractions = [0.2, 0.45, 0.7, 0.95];
    for (const frac of sampleFractions) {
      controller.seekTime(actualClip.duration * frac);
      cleanScene.traverse((node) => {
        if (!node.name) return;
        const init = startTransforms.get(node.name);
        if (!init) return;
        const posDiff = node.position.distanceTo(init.pos);
        const angleDiff = 2 * Math.acos(Math.min(1, Math.abs(node.quaternion.dot(init.quat))));
        const scaleDiff = node.scale.distanceTo(init.scale);
        maxPoseDelta = Math.max(maxPoseDelta, posDiff + angleDiff + scaleDiff);

        // Solar panels must never deform/scale during deploy/stow/track_angle
        if (def.category === 'solar') {
          if (scaleDiff > 0.0001) {
            scalePreserved = false;
          }
        }
      });
    }

    const movedDuringPlayback = maxPoseDelta > 0.001;
    if (!movedDuringPlayback) {
      errors.push(`Clip "${expectedClip.name}" produced static pose (maxPoseDelta=${maxPoseDelta})`);
    }
    if (!scalePreserved) {
      errors.push(`Solar clip "${expectedClip.name}" altered panel scale`);
    }

    // Check multi-cycle drift for loop clips (5 full cycles)
    let driftAfter5Cycles = 0;
    if (expectedClip.loop) {
      controller.seekTime(0);
      const rootPos0 = cleanScene.position.clone();
      const hipsNode = cleanScene.getObjectByName('hips') ?? cleanScene;
      const hipsPos0 = hipsNode.position.clone();

      // Advance 5 full cycles
      for (let c = 0; c < 5; c++) {
        controller.update(actualClip.duration);
      }
      controller.seekTime(0);
      driftAfter5Cycles =
        cleanScene.position.distanceTo(rootPos0) + hipsNode.position.distanceTo(hipsPos0);
      if (driftAfter5Cycles > 0.001) {
        errors.push(`Loop clip "${expectedClip.name}" drifted by ${driftAfter5Cycles.toFixed(5)}m after 5 cycles`);
      }
    }

    clipReports.push({
      name: expectedClip.name,
      expectedDurationS: expectedClip.durationS,
      actualDurationS: Number(actualClip.duration.toFixed(3)),
      trackCount: actualClip.tracks.length,
      unboundTracks,
      maxPoseDelta: Number(maxPoseDelta.toFixed(4)),
      movedDuringPlayback,
      driftAfter5Cycles: Number(driftAfter5Cycles.toFixed(6)),
      scalePreserved,
    });
  }

  controller.dispose();

  return {
    assetId,
    valid: errors.length === 0,
    byteSize: bytes.byteLength,
    gltfVersion: String((rawHeader.gltfJson?.asset as { version?: string } | undefined)?.version ?? '2.0'),
    triangles,
    vertices,
    meshCount,
    materials: Array.from(materialNames).sort(),
    missingNodes,
    missingMounts,
    missingMaterialsOnMeshes,
    coplanarZFightingRisks,
    boundingBoxSizeMeters,
    clips: clipReports,
    errors,
  };
}
