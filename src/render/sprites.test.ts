import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import rawManifest from '../data/sprites.json';
import catalog from '../data/catalog.json';
import { spriteSource } from '../scenes/sprite-source';
import { palette } from './palette';
import { createSprite, parseManifest, placeholderColor, resolveSprite } from './sprites';

describe('маніфест спрайтів', () => {
  const manifest = parseManifest(rawManifest);

  it('кожен запис файла даних коректний', () => {
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(rawManifest).sort());
    for (const def of Object.values(manifest)) {
      expect(def.file).toMatch(/\.png$/);
      for (const a of def.anchor) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  it('кожен модуль каталогу і корпус мають запис', () => {
    for (const module of catalog.modules) expect(manifest[module.id], module.id).toBeDefined();
    expect(manifest.bus).toBeDefined();
  });

  it('невідомий id дає заглушку без файла', () => {
    expect(resolveSprite('no-such-sprite', manifest)).toEqual({ file: null, widthUnits: 1, anchor: [0.5, 0.5] });
    expect(resolveSprite('bus', manifest).file).toBe('spacecraft/bus.png');
  });

  it('неповні записи відкидаються', () => {
    expect(parseManifest({
      a: { file: 'a.png', widthUnits: 1, anchor: [0.5] },
      b: { widthUnits: 1, anchor: [0, 0] },
      c: { file: 'c.png', widthUnits: 0, anchor: [0, 0] },
    })).toEqual({});
  });

  it('колір заглушки стабільний і з палітри', () => {
    expect(placeholderColor('cam-m')).toBe(placeholderColor('cam-m'));
    expect(palette[placeholderColor('cam-m')]).toBeTypeOf('number');
  });
});

describe('завантаження спрайтів', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup() {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const manifest = parseManifest(rawManifest);
    return { load, manifest };
  }

  it('відсутній PNG не створює запиту, але зберігає масштаб і прив’язку маніфесту', () => {
    const { load, manifest } = setup();
    const sprite = createSprite('sol-m', { manifest, baseUrl: '/experimental/assets/sprites/', availableFiles: [] });
    expect(load).not.toHaveBeenCalled();
    expect(sprite.isPlaceholder()).toBe(true);
    expect(sprite.object.scale.x).toBe(1.6);
    expect(sprite.object.center).toEqual(new THREE.Vector2(1, 0.5));
    sprite.dispose();
  });

  it('наявний PNG завантажується з правильним префіксом і підміняє заглушку', () => {
    const { load, manifest } = setup();
    const sprite = createSprite('bus', {
      manifest, baseUrl: '/experimental/assets/sprites/', availableFiles: ['spacecraft/bus.png'],
    });
    expect(load).toHaveBeenCalledOnce();
    const call = load.mock.calls[0];
    expect(call?.[0]).toBe('/experimental/assets/sprites/spacecraft/bus.png');
    const loaded = new THREE.Texture({ width: 256, height: 512 } as HTMLImageElement);
    call?.[1]?.(loaded);
    expect(sprite.isPlaceholder()).toBe(false);
    expect(sprite.material.map).toBe(loaded);
    expect(sprite.object.scale.y).toBe(4);
    sprite.dispose();
  });

  it('джерело сцен не запитує файлів, відсутніх у списку PNG від Vite', async () => {
    const { load } = setup();
    const sprites = Object.keys(spriteSource.manifest).map((id) => createSprite(id, spriteSource));
    const files = typeof spriteSource.availableFiles === 'function' ? await spriteSource.availableFiles() : spriteSource.availableFiles;
    const expectedUrls = Object.values(spriteSource.manifest)
      .filter((def) => files?.includes(def.file))
      .map((def) => `${spriteSource.baseUrl}${def.file}`);
    expect(load.mock.calls.map((call) => call[0])).toEqual(expectedUrls);
    expect(spriteSource.manifest.bus?.file).toBe('spacecraft/bus.png');
    for (const sprite of sprites) sprite.dispose();
  });

  it('не починає завантаження, якщо спрайт прибрано до отримання списку файлів', async () => {
    const { load, manifest } = setup();
    let ready: (files: readonly string[]) => void = () => {};
    const files = new Promise<readonly string[]>((resolve) => { ready = resolve; });
    const sprite = createSprite('bus', { manifest, baseUrl: '/', availableFiles: () => files });
    sprite.dispose();
    ready(['spacecraft/bus.png']);
    await files;
    expect(load).not.toHaveBeenCalled();
  });

  it('починає завантаження після асинхронного підтвердження наявності PNG', async () => {
    const { load, manifest } = setup();
    const files = Promise.resolve(['spacecraft/bus.png']);
    const sprite = createSprite('bus', { manifest, baseUrl: '/assets/sprites/', availableFiles: () => files });
    expect(load).not.toHaveBeenCalled();
    await files;
    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0]?.[0]).toBe('/assets/sprites/spacecraft/bus.png');
    sprite.dispose();
  });

  it('лишає заглушку, якщо список PNG не завантажився', async () => {
    const { load, manifest } = setup();
    const files = Promise.reject(new Error('offline'));
    const sprite = createSprite('bus', { manifest, baseUrl: '/', availableFiles: () => files });
    await files.catch(() => {});
    expect(load).not.toHaveBeenCalled();
    expect(sprite.isPlaceholder()).toBe(true);
    sprite.dispose();
  });
});

describe('спрайт модуля власного виробництва', () => {
  it('fab-<id>-<агенція>-<n> бере спрайт базового модуля', () => {
    const manifest = { 'cam-m': { file: 'modules/cam-m.png', widthUnits: 1, anchor: [0, 0.5] as [number, number] } };
    expect(resolveSprite('fab-cam-m-borealis-2', manifest).file).toBe('modules/cam-m.png');
    expect(resolveSprite('fab-unknown-borealis-1', manifest).file).toBeNull();
  });
});
