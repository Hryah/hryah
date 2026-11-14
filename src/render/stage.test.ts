import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createStage } from './stage';

const { renderer, filters } = vi.hoisted(() => ({
  renderer: {
    setClearColor: vi.fn(), setPixelRatio: vi.fn(), getPixelRatio: vi.fn(() => 1), setSize: vi.fn(),
    getDrawingBufferSize: vi.fn((out: { set(x: number, y: number): unknown }) => out.set(640, 480)),
    render: vi.fn(), dispose: vi.fn(),
    toneMapping: 0, toneMappingExposure: 1, shadowMap: { enabled: false, type: 0 },
  },
  filters: { resize: vi.fn(), set: vi.fn(), isActive: () => false, dispose: vi.fn() },
}));

vi.mock('three', async (importOriginal) => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: class { constructor() { return renderer; } },
}));
vi.mock('./filters', () => ({ createFilterChain: () => filters }));

afterEach(() => {
  vi.clearAllMocks();
  Object.assign(renderer, { toneMapping: 0, toneMappingExposure: 1, shadowMap: { enabled: false, type: 0 } });
  vi.unstubAllGlobals();
});

describe('кадри stage', () => {
  it('stop прибирає RAF; resume зберігає час без стрибка після паузи', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    vi.stubGlobal('devicePixelRatio', 1);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const runFrame = (timeMs: number) => {
      const entry = frames.entries().next().value;
      if (!entry) throw new Error('Немає запланованого кадру');
      frames.delete(entry[0]);
      entry[1](timeMs);
    };
    const stage = createStage({ clientWidth: 640, clientHeight: 480 } as HTMLCanvasElement);
    const update = vi.fn();
    stage.start(update);
    runFrame(1000);
    runFrame(1020);
    expect(update).toHaveBeenLastCalledWith(0.02, 0.02);
    stage.stop();
    expect(frames.size).toBe(0);
    expect(renderer.dispose).not.toHaveBeenCalled();
    stage.start(update);
    runFrame(9000);
    expect(update).toHaveBeenLastCalledWith(0, 0.02);
    runFrame(9020);
    expect(update).toHaveBeenLastCalledWith(0.02, 0.04);
    stage.dispose();
    expect(frames.size).toBe(0);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(filters.dispose).toHaveBeenCalledOnce();
  });
});

function stubFrames() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  let t = 0;
  return (n: number) => { for (let i = 0; i < n; i += 1) { t += 100; frames.shift()?.(t); } };
}
const canvas = { clientWidth: 640, clientHeight: 480 } as HTMLCanvasElement;
const lightCount = (stage: ReturnType<typeof createStage>) => stage.root.children.filter((c) => (c as { isLight?: boolean }).isLight).length;

describe('опції рендера', () => {
  it('за замовчуванням: без тіней і tone mapping, зі своїм світлом', () => {
    const stage = createStage(canvas);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(renderer.toneMappingExposure).toBe(1);
    expect(lightCount(stage)).toBe(2);
    stage.dispose();
    expect(lightCount(stage)).toBe(0);
  });

  it('shadows, aces і exposure виставляються на рендерері; custom не додає світло', () => {
    const stage = createStage(canvas, { shadows: { type: 'pcfsoft' }, toneMapping: 'aces', exposure: 1.25, lighting: 'custom' });
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.25);
    expect(lightCount(stage)).toBe(0);
    stage.dispose();
  });
});

describe('камера follow', () => {
  it('без follow камера стоїть', () => {
    const run = stubFrames();
    const stage = createStage(canvas);
    const before = stage.camera.position.clone();
    stage.start(() => undefined);
    run(5);
    expect(stage.camera.position.distanceTo(before)).toBe(0);
    stage.dispose();
  });

  it('плавно наближається до цілі з offset, не перелітає; null повертає камеру', () => {
    const run = stubFrames();
    const stage = createStage(canvas);
    const home = stage.camera.position.clone();
    const target = new THREE.Object3D();
    target.position.set(10, 0, 0);
    stage.follow(target, { offset: { x: 0, y: 5, z: 20 }, rate: 5 });
    stage.start(() => undefined);
    run(2);
    const goal = new THREE.Vector3(10, 5, 20);
    const d1 = stage.camera.position.distanceTo(goal);
    run(10);
    const d2 = stage.camera.position.distanceTo(goal);
    expect(d2).toBeLessThan(d1);
    expect(d2).toBeLessThan(0.5);
    stage.follow(null);
    expect(stage.camera.position.distanceTo(home)).toBe(0);
    run(3);
    expect(stage.camera.position.distanceTo(home)).toBe(0);
    stage.dispose();
  });
});
