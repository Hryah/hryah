// sprites.ts — маніфест спрайтів, фабрика і заглушка для відсутнього файла.
// Спрайт — площина, завжди повернута до камери. Розмір у світових одиницях, не в пікселях.
// Якщо файла (або запису в маніфесті) немає, лишається заглушка: кольоровий прямокутник із підписом id.
import * as THREE from 'three';
import { css, palette, type PaletteColor } from './palette';

export interface SpriteDef {
  /** Шлях відносно public/assets/sprites/. */
  file: string;
  /** Ширина у світових одиницях; висота береться з пропорцій картинки. */
  widthUnits: number;
  /** Точка прив'язки в частках розміру: [0.5, 0] — середина нижнього краю. */
  anchor: [number, number];
}

export type SpriteManifest = Record<string, SpriteDef>;

export interface SpriteHandle {
  readonly id: string;
  /** Додається в сцену; позицію, масштаб-множник і колір міняє сцена. */
  readonly object: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  /** true, доки показується заглушка. */
  isPlaceholder(): boolean;
  /** Загальний множник розміру (для плавної появи): 1 — розмір із маніфесту. */
  setScale(k: number): void;
  dispose(): void;
}

/** Перетворює сирий JSON маніфесту на типізований; неповні записи відкидає (для них буде заглушка). */
export function parseManifest(raw: Record<string, { file?: unknown; widthUnits?: unknown; anchor?: unknown }>): SpriteManifest {
  const manifest: SpriteManifest = {};
  for (const [id, entry] of Object.entries(raw)) {
    const anchor = Array.isArray(entry.anchor) ? entry.anchor : [];
    const [ax, ay] = anchor as unknown[];
    if (typeof entry.file !== 'string' || typeof entry.widthUnits !== 'number' || !(entry.widthUnits > 0)
      || typeof ax !== 'number' || typeof ay !== 'number') continue;
    manifest[id] = { file: entry.file, widthUnits: entry.widthUnits, anchor: [ax, ay] };
  }
  return manifest;
}

const DEFAULT_DEF: Omit<SpriteDef, 'file'> = { widthUnits: 1, anchor: [0.5, 0.5] };
const PLACEHOLDER_COLORS: PaletteColor[] = ['panel', 'metal', 'accent', 'storm', 'calm', 'atmosphere'];

/** Запис маніфесту для id або типові розміри без файла. Чиста функція, тестується без браузера. */
export function resolveSprite(id: string, manifest: SpriteManifest): SpriteDef | (Omit<SpriteDef, 'file'> & { file: null }) {
  // Модуль власного виробництва (fab-<базовий id>-<агенція>-<n>) малюється спрайтом базового модуля.
  const fab = /^fab-(.+)-[^-]+-\d+$/.exec(id);
  const def = manifest[id] ?? (fab ? manifest[fab[1]!] : undefined);
  return def ?? { ...DEFAULT_DEF, file: null };
}

/** Стабільний колір заглушки за id: той самий модуль завжди того самого кольору. */
export function placeholderColor(id: string): PaletteColor {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_COLORS[hash % PLACEHOLDER_COLORS.length] ?? 'metal';
}

function placeholderTexture(id: string): THREE.Texture {
  const size = 128;
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = css(placeholderColor(id));
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = css('outline');
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, size - 8, size - 8);
    ctx.fillStyle = css('outline');
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(id, size / 2, size / 2, size - 20);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface SpriteFactoryOptions {
  manifest: SpriteManifest;
  /** Корінь файлів спрайтів, напр. `${import.meta.env.BASE_URL}assets/sprites/`. */
  baseUrl: string;
  /** Наявні файли відносно baseUrl. Якщо передано, відсутні PNG лишаються заглушками без запиту. */
  availableFiles?: readonly string[] | (() => Promise<readonly string[]>);
}

/**
 * Створює спрайт за id із ядра. Одразу повертає заглушку; якщо файл є, він підміняє її після завантаження.
 * Викликати лише в Scene.mount, не в update.
 */
export function createSprite(id: string, { manifest, baseUrl, availableFiles }: SpriteFactoryOptions): SpriteHandle {
  const def = resolveSprite(id, manifest);
  let texture: THREE.Texture = placeholderTexture(id);
  let placeholder = true;
  let disposed = false;
  let aspect = 1; // висота / ширина
  let scale = 1;

  const material = new THREE.SpriteMaterial({ map: texture, color: palette.white, transparent: true });
  const object = new THREE.Sprite(material);
  object.center.set(def.anchor[0], def.anchor[1]);
  object.name = `sprite:${id}`;

  const applyScale = (): void => {
    object.scale.set(def.widthUnits * scale, def.widthUnits * aspect * scale, 1);
  };
  applyScale();

  const loadFile = (): void => {
    if (disposed || def.file === null) return;
    new THREE.TextureLoader().load(
      `${baseUrl}${def.file}`,
      (loaded) => {
        if (disposed) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        const image = loaded.image as { width?: number; height?: number } | undefined;
        if (image?.width && image.height) aspect = image.height / image.width;
        texture.dispose();
        texture = loaded;
        material.map = loaded;
        material.needsUpdate = true;
        placeholder = false;
        applyScale();
      },
      undefined,
      () => { /* файла ще немає: лишається заглушка */ },
    );
  };

  if (def.file !== null) {
    if (typeof availableFiles === 'function') {
      void availableFiles().then((files) => {
        if (def.file !== null && files.includes(def.file)) loadFile();
      }).catch(() => { /* список недоступний: лишається заглушка */ });
    } else if (availableFiles === undefined || availableFiles.includes(def.file)) {
      loadFile();
    }
  }

  return {
    id,
    object,
    material,
    isPlaceholder: () => placeholder,
    setScale(k) { scale = k; applyScale(); },
    dispose() {
      disposed = true;
      object.removeFromParent();
      texture.dispose();
      material.dispose();
    },
  };
}
