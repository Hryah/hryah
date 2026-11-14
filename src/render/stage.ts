// stage.ts — полотно, нерухома ортографічна камера, світло, зміна розміру і цикл кадрів.
// Нічого не знає про гру. Сцени отримують Stage і додають у нього свої об'єкти.
import * as THREE from 'three';
import { createFilterChain, type Filter } from './filters';
import { palette } from './palette';

/** Те, що бачить сцена. Після етапу 0 цей інтерфейс міняється лише через Олексія. */
export interface Stage {
  /** Корінь, куди сцена додає свої об'єкти. */
  readonly root: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  /** Висота видимої області у світових одиницях (стала). */
  readonly viewHeightUnits: number;
  /** Ширина видимої області у світових одиницях (залежить від пропорцій полотна). */
  viewWidthUnits(): number;
  /**
   * Точка світу → точка полотна в CSS-пікселях від його лівого верхнього кута (для HTML-підписів над об'єктами).
   * Результат пише в `out` і повертає його; нових об'єктів не створює, тож можна викликати щокадру.
   */
  toScreen(point: THREE.Vector3, out: { x: number; y: number }): { x: number; y: number };
  /**
   * Камера плавно їде за об'єктом (її нахил і масштаб не міняються). `null` знімає слідкування
   * і повертає камеру на початкове місце. Сцени з нерухомою камерою цього не викликають.
   */
  follow(target: THREE.Object3D | null, options?: FollowOptions): void;
}

export interface FollowOptions {
  /** Зсув камери від цілі; типово такий, як у нерухомої камери відносно початку координат. */
  offset?: { x: number; y: number; z: number };
  /** Швидкість наздоганяння, 1/с. Типово 5. */
  rate?: number;
}

export interface StageRunner extends Stage {
  /** Запускає цикл кадрів. onFrame викликається перед кожним малюванням. */
  start(onFrame: (dtS: number, timeS: number) => void): void;
  stop(): void;
  /** Візуальні фільтри на весь кадр (див. filters.ts). Порожній список вимикає постобробку. */
  setFilters(filters: readonly Filter[]): void;
  /** Зупиняє цикл і звільняє ресурси рендерера. Об'єкти сцени прибирає сама сцена. */
  dispose(): void;
}

export interface StageOptions {
  viewHeightUnits?: number;
  /** Нахил камери над горизонтом у градусах: «вигляд спереду трохи згори». */
  cameraElevationDeg?: number;
  /** Тіні від типового сонця (воно кидає тінь; меші сцени мають мати castShadow/receiveShadow). Типово вимкнені. */
  shadows?: boolean;
  /** Відображення яскравості. Типово 'none' (без змін кольорів палітри). */
  toneMapping?: 'none' | 'aces';
  /** Експозиція для toneMapping. Типово 1. */
  exposure?: number;
  /** 'custom': stage не додає своє світло, сцена ставить власне в `root` і сама його прибирає. */
  lighting?: 'default' | 'custom';
}

const MAX_FRAME_S = 0.1; // після паузи вкладки не робимо стрибок на кілька секунд
const CAMERA_DISTANCE = 50;

/** Кидає помилку, якщо WebGL недоступний: StageCanvas ловить її і показує пояснення. */
export function createStage(canvas: HTMLCanvasElement, options: StageOptions = {}): StageRunner {
  const viewHeightUnits = options.viewHeightUnits ?? 10;
  const elevation = THREE.MathUtils.degToRad(options.cameraElevationDeg ?? 24);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(palette.space, 1);
  if (options.toneMapping === 'aces') renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1;
  if (options.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  const root = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_DISTANCE * 2);
  camera.position.set(0, Math.sin(elevation) * CAMERA_DISTANCE, Math.cos(elevation) * CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);

  // Правило вигляду 2: одне спрямоване світло (зліва згори) і м'яке розсіяне, без тіней.
  const lights: THREE.Object3D[] = [];
  let sun: THREE.DirectionalLight | null = null;
  const sunOffset = new THREE.Vector3(-6, 5, 4);
  if (options.lighting !== 'custom') {
    sun = new THREE.DirectionalLight(palette.white, 2.4);
    sun.position.copy(sunOffset);
    if (options.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const half = viewHeightUnits;
      Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 30 });
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.normalBias = 0.03;
    }
    lights.push(sun, sun.target, new THREE.AmbientLight(palette.white, 0.45));
    root.add(...lights);
  }

  const basePosition = camera.position.clone();
  let followTarget: THREE.Object3D | null = null;
  let followOffset = basePosition.clone();
  let followRate = 5;
  const followPoint = new THREE.Vector3();
  const follow: Stage['follow'] = (target, opts) => {
    followTarget = target;
    if (!target) {
      camera.position.copy(basePosition);
      camera.updateMatrixWorld();
      if (sun) { sun.position.copy(sunOffset); sun.target.position.set(0, 0, 0); }
      return;
    }
    followOffset = opts?.offset ? new THREE.Vector3(opts.offset.x, opts.offset.y, opts.offset.z) : basePosition.clone();
    followRate = opts?.rate !== undefined && opts.rate > 0 ? opts.rate : 5;
  };
  const updateFollow = (dtS: number): void => {
    if (!followTarget) return;
    followTarget.getWorldPosition(followPoint).add(followOffset);
    camera.position.lerp(followPoint, 1 - Math.exp(-dtS * followRate));
    if (sun) {
      // Сонце й область його тіні їдуть разом із ціллю, інакше тіні зникли б за межами початкового вікна.
      followTarget.getWorldPosition(sun.target.position);
      sun.position.copy(sun.target.position).add(sunOffset);
    }
  };

  const filters = createFilterChain(renderer);
  const bufferSize = new THREE.Vector2();
  let aspect = 1;
  let widthPx = 0;
  let heightPx = 0;

  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (w === widthPx && h === heightPx && renderer.getPixelRatio() === ratio) return;
    widthPx = w;
    heightPx = h;
    if (w === 0 || h === 0) return; // екран прихований: не малюємо
    aspect = w / h;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(bufferSize);
    filters.resize(bufferSize.x, bufferSize.y);
    const halfH = viewHeightUnits / 2;
    camera.left = -halfH * aspect;
    camera.right = halfH * aspect;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  };

  const projected = new THREE.Vector3();
  const toScreen: Stage['toScreen'] = (point, out) => {
    projected.copy(point).project(camera);
    out.x = (projected.x * 0.5 + 0.5) * widthPx;
    out.y = (0.5 - projected.y * 0.5) * heightPx;
    return out;
  };

  let frameId = 0;
  let running = false;
  let lastMs = 0;
  let timeS = 0;
  let disposed = false;

  const stop = (): void => {
    running = false;
    if (frameId !== 0) cancelAnimationFrame(frameId);
    frameId = 0;
  };

  return {
    root,
    camera,
    viewHeightUnits,
    viewWidthUnits: () => viewHeightUnits * aspect,
    toScreen,
    follow,
    start(onFrame) {
      if (disposed || running) return;
      running = true;
      lastMs = 0;
      const frame = (nowMs: number): void => {
        if (!running) return;
        frameId = requestAnimationFrame(frame);
        const dtS = lastMs === 0 ? 0 : Math.min((nowMs - lastMs) / 1000, MAX_FRAME_S);
        lastMs = nowMs;
        resize();
        if (widthPx === 0 || heightPx === 0) return; // прихований екран не рахує час і не малює
        timeS += dtS;
        onFrame(dtS, timeS);
        updateFollow(dtS);
        if (filters.isActive()) filters.render(root, camera, timeS);
        else renderer.render(root, camera);
      };
      frameId = requestAnimationFrame(frame);
    },
    stop,
    setFilters: (list) => filters.set(list),
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      followTarget = null;
      root.remove(...lights);
      filters.dispose();
      renderer.dispose();
    },
  };
}
