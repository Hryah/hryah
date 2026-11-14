import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStage } from './stage';

const { renderer, filters } = vi.hoisted(() => ({
  renderer: {
    setClearColor: vi.fn(), setPixelRatio: vi.fn(), getPixelRatio: vi.fn(() => 1), setSize: vi.fn(),
    getDrawingBufferSize: vi.fn((out: { set(x: number, y: number): unknown }) => out.set(640, 480)),
    render: vi.fn(), dispose: vi.fn(),
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
