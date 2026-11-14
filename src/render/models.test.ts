import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadAsync } = vi.hoisted(() => ({ loadAsync: vi.fn() }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: class { loadAsync = loadAsync; } }));

import { clearModelCache, loadModel } from './models';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const makeGltf = () => {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometry, material));
  return { scene, geometry, material };
};

beforeEach(() => loadAsync.mockReset());
afterEach(() => clearModelCache());

describe('loadModel', () => {
  it('до завантаження заглушка; після — модель; файл вантажиться один раз', async () => {
    const gltf = makeGltf();
    loadAsync.mockResolvedValue({ scene: gltf.scene });
    const a = loadModel('a.glb');
    const b = loadModel('a.glb');
    expect(a.isPlaceholder()).toBe(true);
    expect(a.object.children).toHaveLength(1);
    await flush();
    expect(loadAsync).toHaveBeenCalledOnce();
    expect(a.isPlaceholder()).toBe(false);
    expect(b.isPlaceholder()).toBe(false);
    expect(a.object.children).toHaveLength(1);
    expect(a.object.children[0]).not.toBe(b.object.children[0]);
  });

  it('помилка завантаження лишає заглушку й не кидає; наступний виклик пробує знову', async () => {
    loadAsync.mockRejectedValueOnce(new Error('404'));
    const a = loadModel('bad.glb');
    await flush();
    expect(a.isPlaceholder()).toBe(true);
    loadAsync.mockResolvedValueOnce({ scene: makeGltf().scene });
    const b = loadModel('bad.glb');
    await flush();
    expect(b.isPlaceholder()).toBe(false);
    expect(loadAsync).toHaveBeenCalledTimes(2);
  });

  it('спільні ресурси звільняються лише з останньою копією', async () => {
    const gltf = makeGltf();
    const spy = vi.spyOn(gltf.geometry, 'dispose');
    loadAsync.mockResolvedValue({ scene: gltf.scene });
    const a = loadModel('a.glb');
    const b = loadModel('a.glb');
    await flush();
    a.dispose();
    expect(spy).not.toHaveBeenCalled();
    b.dispose();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('dispose до завантаження: модель не з\'являється, ресурси звільняються', async () => {
    const gltf = makeGltf();
    const spy = vi.spyOn(gltf.geometry, 'dispose');
    loadAsync.mockResolvedValue({ scene: gltf.scene });
    const a = loadModel('a.glb');
    a.dispose();
    await flush();
    expect(a.object.children).toHaveLength(0);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('dispose старої копії не звільняє модель нового запису після помилки', async () => {
    loadAsync.mockRejectedValueOnce(new Error('404'));
    const old = loadModel('x.glb');
    await flush();
    const gltf = makeGltf();
    const spy = vi.spyOn(gltf.geometry, 'dispose');
    loadAsync.mockResolvedValueOnce({ scene: gltf.scene });
    const fresh = loadModel('x.glb');
    await fresh.ready;
    old.dispose();
    expect(spy).not.toHaveBeenCalled();
    expect(fresh.isPlaceholder()).toBe(false);
  });

  it('shadows вмикає castShadow на мешах після завантаження; ready чекає підміни', async () => {
    loadAsync.mockResolvedValue({ scene: makeGltf().scene });
    const a = loadModel('s.glb', { shadows: true });
    await a.ready;
    const meshes: THREE.Mesh[] = [];
    a.object.traverse((n) => { if ((n as THREE.Mesh).isMesh) meshes.push(n as THREE.Mesh); });
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((m) => m.castShadow && m.receiveShadow)).toBe(true);
  });
});
