import * as THREE from 'three';
import type { AstronautTextures } from './room-view';

export const ROOM_CAMERA_OFFSET = { x: 11, y: 12, z: 11 } as const;

/** Upright cutout: no head lean through walls; compensate pitch to preserve the drawn aspect. */
export function createAstronautBillboard(
  manifest: AstronautTextures,
  texture?: THREE.Texture,
  visibleHeightM = 1.8,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const { x, y, z } = ROOM_CAMERA_OFFSET;
  const verticalScale = Math.hypot(x, y, z) / Math.hypot(x, z);
  const height = visibleHeightM * manifest.heightPx / manifest.visibleHeightPx;
  const width = height * manifest.widthPx / manifest.heightPx;
  const geometry = new THREE.PlaneGeometry(width, height);
  // Keep the texture pivot at local origin before scaling; the mesh origin is world feet.
  geometry.translate((0.5 - manifest.pivot.x) * width, (manifest.pivot.y - 0.5) * height, 0);
  geometry.scale(1, verticalScale, 1);
  const plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: texture, alphaTest: 0.12, transparent: false, depthTest: true, depthWrite: true, toneMapped: false,
  }));
  plane.rotation.y = Math.atan2(x, z);
  return plane;
}
