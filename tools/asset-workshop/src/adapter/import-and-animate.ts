// import-and-animate.ts — Standalone GLB Import, Socket Attachment & Animation Playback Adapter for hryah.
//
// Architectural boundary (docs/ARCHITECTURE.md & REVIEW_RULES.md):
// - Game logic lives strictly in `src/core/` as pure deterministic functions `step(state, action) -> state`.
// - This adapter is purely a presentation-layer helper: it loads binary `.glb` assets, attaches modules
//   to named sockets, plays/crossfades baked `AnimationClip`s, toggles optional VFX layers, and disposes
//   GPU resources when unmounted.
// - Animation completion events are visual only and NEVER decide mission success, failure, or resource counters.

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface PlayClipOptions {
  /** Override loop mode; defaults to true unless oneShot is true */
  loop?: boolean;
  /** Playback speed multiplier (e.g. 0.25, 0.5, 1.0, 2.0) */
  timeScale?: number;
  /** Smooth crossfade duration in seconds (default 0.22s) */
  crossFadeDurationS?: number;
  /** Hold final frame when a one-shot clip finishes (default true) */
  clampWhenFinished?: boolean;
}

export interface BindPoseSnapshot {
  positions: Map<THREE.Object3D, THREE.Vector3>;
  quaternions: Map<THREE.Object3D, THREE.Quaternion>;
  scales: Map<THREE.Object3D, THREE.Vector3>;
}

/**
 * Captures the initial bind pose of every node in a hierarchy so `stopAndResetBindPose()`
 * can deterministically restore the exact bind pose at any time.
 */
export function captureBindPose(root: THREE.Object3D): BindPoseSnapshot {
  const positions = new Map<THREE.Object3D, THREE.Vector3>();
  const quaternions = new Map<THREE.Object3D, THREE.Quaternion>();
  const scales = new Map<THREE.Object3D, THREE.Vector3>();

  root.traverse((node) => {
    positions.set(node, node.position.clone());
    quaternions.set(node, node.quaternion.clone());
    scales.set(node, node.scale.clone());
  });

  return { positions, quaternions, scales };
}

/**
 * Restores a node hierarchy to its captured bind pose.
 */
export function restoreBindPose(snapshot: BindPoseSnapshot): void {
  for (const [node, pos] of snapshot.positions.entries()) {
    node.position.copy(pos);
  }
  for (const [node, quat] of snapshot.quaternions.entries()) {
    node.quaternion.copy(quat);
  }
  for (const [node, scl] of snapshot.scales.entries()) {
    node.scale.copy(scl);
  }
}

/**
 * Loads a `.glb` from either a URL string or an in-memory `ArrayBuffer` / `Uint8Array`
 * into a fresh GLTFLoader instance.
 */
export async function loadWorkshopGlb(source: string | ArrayBuffer | Uint8Array): Promise<GLTF> {
  const loader = new GLTFLoader();
  if (typeof source === 'string') {
    return await loader.loadAsync(source);
  }
  const arrayBuffer =
    source instanceof Uint8Array
      ? source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
      : source;
  return await new Promise<GLTF>((resolve, reject) => {
    loader.parse(arrayBuffer as ArrayBuffer, '', resolve, reject);
  });
}

/**
 * Attaches a modular child asset (`sol-m`, `ant-l`, `cam-s`, `eng-ion`, etc.)
 * to a named stationary mount socket (`solar_left`, `antenna_mount`, `camera_mount`, etc.)
 * on a parent spacecraft or ship hull.
 */
export function attachModuleToSocket(
  parentRoot: THREE.Object3D,
  socketName: string,
  moduleRoot: THREE.Object3D,
): boolean {
  const socket = parentRoot.getObjectByName(socketName);
  if (!socket) return false;
  socket.add(moduleRoot);
  moduleRoot.position.set(0, 0, 0);
  moduleRoot.rotation.set(0, 0, 0);
  parentRoot.updateMatrixWorld(true);
  return true;
}

/**
 * Manages AnimationMixer playback, crossfading, manual frame scrubbing, bind-pose reset,
 * optional VFX layer visibility, and GPU memory cleanup for a loaded GLB asset.
 */
export class WorkshopAnimationController {
  public readonly root: THREE.Object3D;
  public readonly clips: THREE.AnimationClip[];
  public readonly mixer: THREE.AnimationMixer;
  private readonly clipMap = new Map<string, THREE.AnimationClip>();
  private readonly bindPose: BindPoseSnapshot;
  private currentAction: THREE.AnimationAction | null = null;
  private currentClipName: string | null = null;
  private paused = false;
  private timeScale = 1.0;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.root = root;
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(root);
    this.bindPose = captureBindPose(root);
    for (const clip of clips) {
      this.clipMap.set(clip.name, clip);
    }
  }

  public getAvailableClipNames(): string[] {
    return Array.from(this.clipMap.keys());
  }

  public getActiveClipName(): string | null {
    return this.currentClipName;
  }

  public getClip(name: string): THREE.AnimationClip | undefined {
    return this.clipMap.get(name);
  }

  /**
   * Plays a clip by name with optional loop, speed, and crossfade transition.
   * Safe against rapid repeated calls or interrupting an active one-shot clip.
   */
  public playClip(name: string, options: PlayClipOptions = {}): THREE.AnimationAction | null {
    const clip = this.clipMap.get(name);
    if (!clip) return null;

    const loop = options.loop ?? true;
    const fadeS = options.crossFadeDurationS ?? 0.22;
    this.timeScale = options.timeScale ?? this.timeScale;
    this.paused = false;

    const nextAction = this.mixer.clipAction(clip);
    nextAction.enabled = true;
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.clampWhenFinished = options.clampWhenFinished ?? true;
    nextAction.setEffectiveTimeScale(this.timeScale);
    nextAction.setEffectiveWeight(1.0);

    if (this.currentAction && this.currentAction !== nextAction) {
      if (fadeS <= 0) {
        this.mixer.stopAllAction();
        nextAction.reset();
        nextAction.play();
      } else {
        nextAction.reset();
        nextAction.play();
        this.currentAction.crossFadeTo(nextAction, fadeS, false);
      }
    } else {
      nextAction.reset();
      nextAction.play();
    }

    this.currentAction = nextAction;
    this.currentClipName = name;
    return nextAction;
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.currentAction) {
      this.currentAction.paused = paused;
    }
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public setSpeed(speed: number): void {
    this.timeScale = speed;
    if (this.currentAction) {
      this.currentAction.setEffectiveTimeScale(speed);
    }
  }

  public setLoop(loop: boolean): void {
    if (this.currentAction) {
      this.currentAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    }
  }

  /**
   * Advances the animation mixer by `dtS` seconds.
   */
  public update(dtS: number): void {
    if (!this.paused && dtS > 0) {
      this.mixer.update(dtS);
      this.root.updateMatrixWorld(true);
    }
  }

  /**
   * Scrubs to an exact timestamp `timeS` within the active clip.
   */
  public seekTime(timeS: number): void {
    if (!this.currentAction) return;
    const clip = this.currentAction.getClip();
    const clamped = Math.max(0, Math.min(clip.duration, timeS));
    const wasPaused = this.currentAction.paused;
    this.currentAction.paused = false;
    this.currentAction.time = clamped;
    this.mixer.update(0);
    this.currentAction.paused = wasPaused;
    this.root.updateMatrixWorld(true);
  }

  /**
   * Scrubs to a specific frame number at the given FPS (default 30 FPS).
   */
  public seekFrame(frameIndex: number, fps = 30): void {
    this.seekTime(frameIndex / Math.max(1, fps));
  }

  public getCurrentTime(): number {
    return this.currentAction ? this.currentAction.time : 0;
  }

  public getCurrentDuration(): number {
    return this.currentAction ? this.currentAction.getClip().duration : 0;
  }

  /**
   * Stops all animations and resets the entire hierarchy to its exact bind pose.
   */
  public stopAndResetBindPose(): void {
    this.mixer.stopAllAction();
    this.currentAction = null;
    this.currentClipName = null;
    restoreBindPose(this.bindPose);
    this.root.updateMatrixWorld(true);
  }

  /**
   * Toggles visibility of an optional VFX layer (`vfx_scan_cone`, `vfx_downlink_beam`, etc.)
   * without affecting the underlying mechanical model.
   */
  public setVfxLayerVisible(layerName: string, visible: boolean): void {
    const node = this.root.getObjectByName(layerName);
    if (node) {
      node.visible = visible;
    }
  }

  /**
   * Releases mixer bindings, geometries, and materials when the model is unmounted.
   */
  public dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          m?.dispose();
        }
      }
    });
  }
}
