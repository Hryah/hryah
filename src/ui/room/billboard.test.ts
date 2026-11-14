import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROOM_CAMERA_OFFSET, createAstronautBillboard } from './billboard';
import type { AstronautTextures } from './room-view';

const created: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];

afterEach(() => {
  for (const mesh of created.splice(0)) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

function manifest(widthPx = 1024, heightPx = 1024): AstronautTextures {
  return {
    widthPx, heightPx, visibleHeightPx: 840, pivot: { x: 0.43, y: 0.92 },
    frames: {
      front: 'assets/astronaut/front.svg', back: 'assets/astronaut/back.svg',
      left: 'assets/astronaut/left.svg', right: 'assets/astronaut/right.svg',
    },
  };
}

function makeBillboard(source: AstronautTextures, texture?: THREE.Texture) {
  const mesh = createAstronautBillboard(source, texture);
  created.push(mesh);
  mesh.geometry.computeBoundingBox();
  mesh.updateMatrixWorld(true);
  return mesh;
}

function camera() {
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 80);
  camera.position.set(ROOM_CAMERA_OFFSET.x, ROOM_CAMERA_OFFSET.y, ROOM_CAMERA_OFFSET.z);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function screenPoint(local: THREE.Vector3, mesh: THREE.Mesh, camera: THREE.Camera) {
  const ndc = local.clone().applyMatrix4(mesh.matrixWorld).project(camera);
  return new THREE.Vector2(ndc.x * 1280 / 2, ndc.y * 800 / 2);
}

describe('upright astronaut billboard at the fixed isometric camera', () => {
  it('preserves the artwork aspect in screen pixels under the elevated camera', () => {
    for (const [widthPx, heightPx] of [[1024, 1024], [768, 1024]] as const) {
      const source = manifest(widthPx, heightPx);
      const mesh = makeBillboard(source);
      const bounds = mesh.geometry.boundingBox!;
      const view = camera();
      const bottomLeft = screenPoint(new THREE.Vector3(bounds.min.x, bounds.min.y, 0), mesh, view);
      const bottomRight = screenPoint(new THREE.Vector3(bounds.max.x, bounds.min.y, 0), mesh, view);
      const topLeft = screenPoint(new THREE.Vector3(bounds.min.x, bounds.max.y, 0), mesh, view);
      const projectedWidth = bottomRight.distanceTo(bottomLeft);
      const projectedHeight = topLeft.distanceTo(bottomLeft);
      expect(projectedWidth / projectedHeight).toBeCloseTo(widthPx / heightPx, 6);
      expect(bottomRight.y).toBeCloseTo(bottomLeft.y, 6);
      expect(topLeft.x).toBeCloseTo(bottomLeft.x, 6);
    }
  });

  it('anchors the texture foot pivot and keeps the head column inside the far wall', () => {
    const source = manifest();
    const mesh = makeBillboard(source);
    mesh.position.set(0, 0.025, -3.75);
    mesh.updateMatrixWorld(true);
    const bounds = mesh.geometry.boundingBox!;
    const size = bounds.getSize(new THREE.Vector3());
    const footLocal = new THREE.Vector3(
      bounds.min.x + source.pivot.x * size.x,
      bounds.max.y - source.pivot.y * size.y,
      0,
    );
    const foot = footLocal.clone().applyMatrix4(mesh.matrixWorld);
    const head = new THREE.Vector3(footLocal.x, bounds.max.y, 0).applyMatrix4(mesh.matrixWorld);
    expect(foot.x).toBeCloseTo(mesh.position.x, 6);
    expect(foot.y).toBeCloseTo(mesh.position.y, 6);
    expect(foot.z).toBeCloseTo(mesh.position.z, 6);
    expect(head.x).toBeCloseTo(foot.x, 6);
    expect(head.z).toBeCloseTo(foot.z, 6);
    expect(head.y).toBeGreaterThan(foot.y);
    expect(head.z).toBeGreaterThan(-4);
  });

  it('retains texture alpha clipping and normal depth occlusion', () => {
    const texture = new THREE.Texture();
    try {
      const mesh = makeBillboard(manifest(), texture);
      expect(mesh.material.map).toBe(texture);
      expect(mesh.material.alphaTest).toBeGreaterThan(0);
      expect(mesh.material.depthTest).toBe(true);
      expect(mesh.material.depthWrite).toBe(true);
      expect(mesh.material.transparent).toBe(false);
      expect(mesh.material.toneMapped).toBe(false);
    } finally {
      texture.dispose();
    }
  });
});
