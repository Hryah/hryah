import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Scene } from '../scenes/types';
import { pixelate } from './filters';
import { createSceneSession } from './scene-session';
import type { StageRunner } from './stage';

function setup() {
  const stage: StageRunner = {
    root: new THREE.Scene(), camera: new THREE.OrthographicCamera(), viewHeightUnits: 10,
    viewWidthUnits: () => 10, toScreen: (_point, out) => out, follow: vi.fn(),
    start: vi.fn(), stop: vi.fn(), setFilters: vi.fn(), dispose: vi.fn(),
  };
  const scene: Scene<{ value: number }> = { mount: vi.fn(), update: vi.fn(), dispose: vi.fn() };
  const makeStage = vi.fn(() => stage);
  const makeScene = vi.fn(() => scene);
  let view = { value: 1 };
  const session = createSceneSession(makeStage, makeScene, () => view);
  return { session, stage, scene, makeStage, makeScene, setView: (value: number) => { view = { value }; } };
}

describe('життєвий цикл сцени', () => {
  it('не створює WebGL для екрана, який ще не показували', () => {
    const { session, makeStage, makeScene } = setup();
    session.setFilters([pixelate()]);
    session.setActive(false);
    session.dispose();
    expect(makeStage).not.toHaveBeenCalled();
    expect(makeScene).not.toHaveBeenCalled();
  });

  it('паузить і відновлює той самий stage та сцену, передаючи останній вид', () => {
    const { session, stage, scene, makeStage, makeScene, setView } = setup();
    const filters = [pixelate()];
    session.setFilters(filters);
    session.setActive(true);
    session.setActive(true);
    expect(stage.start).toHaveBeenCalledTimes(1);
    expect(stage.setFilters).toHaveBeenCalledWith(filters);
    session.setActive(false);
    expect(stage.stop).toHaveBeenCalledTimes(1);
    expect(scene.dispose).not.toHaveBeenCalled();
    expect(stage.dispose).not.toHaveBeenCalled();
    setView(2);
    session.setActive(true);
    expect(makeStage).toHaveBeenCalledTimes(1);
    expect(makeScene).toHaveBeenCalledTimes(1);
    expect(scene.mount).toHaveBeenCalledTimes(1);
    expect(stage.start).toHaveBeenCalledTimes(2);
    const frame = vi.mocked(stage.start).mock.calls.at(-1)?.[0];
    frame?.(0.02, 3);
    expect(scene.update).toHaveBeenCalledWith({ value: 2 }, 0.02, 3);
    session.dispose();
    session.dispose();
    session.setActive(true);
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(stage.dispose).toHaveBeenCalledTimes(1);
    expect(stage.start).toHaveBeenCalledTimes(2);
  });

  it('звільняє WebGL і частково змонтовану сцену після помилки mount', () => {
    const { session, scene, stage } = setup();
    vi.mocked(scene.mount).mockImplementation(() => { throw new Error('mount failed'); });
    expect(() => session.setActive(true)).toThrow('mount failed');
    expect(stage.start).not.toHaveBeenCalled();
    expect(stage.stop).toHaveBeenCalledOnce();
    expect(scene.dispose).toHaveBeenCalledOnce();
    expect(stage.dispose).toHaveBeenCalledOnce();
    session.dispose();
    expect(stage.dispose).toHaveBeenCalledOnce();
  });

  it('звільняє stage після помилки фабрики сцени', () => {
    const { session, makeScene, stage } = setup();
    makeScene.mockImplementation(() => { throw new Error('factory failed'); });
    expect(() => session.setActive(true)).toThrow('factory failed');
    expect(stage.dispose).toHaveBeenCalledOnce();
  });

  it('прибирає ресурси після помилки встановлення фільтрів', () => {
    const { session, stage } = setup();
    session.setActive(true);
    vi.mocked(stage.setFilters).mockImplementation(() => { throw new Error('filter failed'); });
    expect(() => session.setFilters([pixelate()])).toThrow('filter failed');
    expect(stage.dispose).toHaveBeenCalledOnce();
  });

  it('звільняє stage, навіть якщо scene.dispose кидає помилку', () => {
    const { session, scene, stage } = setup();
    session.setActive(true);
    vi.mocked(scene.dispose).mockImplementation(() => { throw new Error('dispose failed'); });
    expect(() => session.dispose()).toThrow('dispose failed');
    expect(stage.dispose).toHaveBeenCalledOnce();
  });

  it('зберігає первинну помилку mount, навіть якщо очищення теж падає', () => {
    const { session, scene, stage } = setup();
    vi.mocked(scene.mount).mockImplementation(() => { throw new Error('mount failed'); });
    vi.mocked(scene.dispose).mockImplementation(() => { throw new Error('dispose failed'); });
    expect(() => session.setActive(true)).toThrow('mount failed');
    expect(stage.dispose).toHaveBeenCalledOnce();
  });
});
