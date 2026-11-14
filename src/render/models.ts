// models.ts — завантаження .glb-моделей для сцен. Викликати в Scene.mount.
// Одразу повертає групу із заглушкою (кольоровий бокс); після завантаження заглушку заміняє модель.
// Помилка завантаження не кидається: лишається заглушка. Файл завантажується один раз на url.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { palette } from './palette';
import { placeholderColor } from './sprites';
import { disposeObject } from './primitives';

export interface ModelHandle {
  /** Додається в сцену; позицію, поворот і масштаб міняє сцена. Вміст підміняється після завантаження. */
  readonly object: THREE.Group;
  /** true, доки показується заглушка (або файл не завантажився). */
  isPlaceholder(): boolean;
  /** Виймає з батька й звільняє; спільні ресурси файла звільняються з останньою копією. */
  dispose(): void;
}

export interface ModelOptions {
  /** Розмір заглушки у світових одиницях. Типово 1. */
  placeholderSize?: number;
}

interface CacheEntry {
  promise: Promise<THREE.Group | null>;
  source: THREE.Group | null;
  refs: number;
}

const cache = new Map<string, CacheEntry>();

/** Для тестів: скидає кеш, не звільняючи копії, що ще живуть. */
export function clearModelCache(): void {
  for (const entry of cache.values()) if (entry.source) disposeObject(entry.source);
  cache.clear();
}

function release(url: string): void {
  const entry = cache.get(url);
  if (!entry || --entry.refs > 0) return;
  cache.delete(url);
  if (entry.source) disposeObject(entry.source);
}

export function loadModel(url: string, options: ModelOptions = {}): ModelHandle {
  const size = options.placeholderSize ?? 1;
  const object = new THREE.Group();
  const stub = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshLambertMaterial({ color: palette[placeholderColor(url)], flatShading: true }),
  );
  object.add(stub);
  let placeholder = true;
  let disposed = false;

  let entry = cache.get(url);
  if (!entry) {
    const created: CacheEntry = { promise: Promise.resolve(null), source: null, refs: 0 };
    created.promise = new GLTFLoader().loadAsync(url).then(
      (gltf) => {
        // Усі копії вже звільнені, поки файл вантажився: тримати його нема кому.
        if (cache.get(url) !== created) { disposeObject(gltf.scene); return null; }
        created.source = gltf.scene;
        return gltf.scene;
      },
      () => { if (cache.get(url) === created) cache.delete(url); return null; },
    );
    cache.set(url, created);
    entry = created;
  }
  entry.refs += 1;

  void entry.promise.then((source) => {
    if (disposed || !source) return;
    // Клон ділить геометрії й матеріали з оригіналом: їх звільняє лише release.
    disposeObject(stub);
    object.add(source.clone(true));
    placeholder = false;
  });

  return {
    object,
    isPlaceholder: () => placeholder,
    dispose() {
      if (disposed) return;
      disposed = true;
      object.removeFromParent();
      if (placeholder) disposeObject(stub);
      object.clear();
      release(url);
    },
  };
}
