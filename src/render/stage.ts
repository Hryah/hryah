// stage.ts — полотно, нерухома ортографічна камера, світло, зміна розміру і цикл кадрів.
// Нічого не знає про гру. Сцени отримують Stage і додають у нього свої об'єкти.
import * as THREE from 'three';
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
}

export interface StageRunner extends Stage {
  /** Запускає цикл кадрів. onFrame викликається перед кожним малюванням. */
  start(onFrame: (dtS: number, timeS: number) => void): void;
  stop(): void;
  /** Зупиняє цикл і звільняє ресурси рендерера. Об'єкти сцени прибирає сама сцена. */
  dispose(): void;
}

export interface StageOptions {
  viewHeightUnits?: number;
  /** Нахил камери над горизонтом у градусах: «вигляд спереду трохи згори». */
  cameraElevationDeg?: number;
}

const MAX_FRAME_S = 0.1; // після паузи вкладки не робимо стрибок на кілька секунд
const CAMERA_DISTANCE = 50;

/** Кидає помилку, якщо WebGL недоступний: StageCanvas ловить її і показує пояснення. */
export function createStage(canvas: HTMLCanvasElement, options: StageOptions = {}): StageRunner {
  const viewHeightUnits = options.viewHeightUnits ?? 10;
  const elevation = THREE.MathUtils.degToRad(options.cameraElevationDeg ?? 24);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(palette.space, 1);

  const root = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_DISTANCE * 2);
  camera.position.set(0, Math.sin(elevation) * CAMERA_DISTANCE, Math.cos(elevation) * CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);

  // Правило вигляду 2: одне спрямоване світло (зліва згори) і м'яке розсіяне, без тіней.
  const sun = new THREE.DirectionalLight(palette.white, 2.4);
  sun.position.set(-6, 5, 4);
  const ambient = new THREE.AmbientLight(palette.white, 0.45);
  root.add(sun, ambient);

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
    const halfH = viewHeightUnits / 2;
    camera.left = -halfH * aspect;
    camera.right = halfH * aspect;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
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
        renderer.render(root, camera);
      };
      frameId = requestAnimationFrame(frame);
    },
    stop,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      root.remove(sun, ambient);
      renderer.dispose();
    },
  };
}
