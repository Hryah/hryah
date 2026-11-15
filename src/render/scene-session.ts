import type { Scene } from '../scenes/types';
import type { Filter } from './filters';
import type { StageRunner } from './stage';

/** Ресурси сцени живуть до dispose; пауза зберігає сцену й час, не створюючи нового WebGL. */
export function createSceneSession<View>(
  makeStage: () => StageRunner,
  makeScene: () => Scene<View>,
  getView: () => View,
) {
  let stage: StageRunner | null = null;
  let scene: Scene<View> | null = null;
  let filters: readonly Filter[] = [];
  let active = false;
  let disposed = false;

  const release = (): void => {
    const previousStage = stage;
    const previousScene = scene;
    stage = null;
    scene = null;
    active = false;
    try {
      previousStage?.stop();
    } finally {
      try {
        previousScene?.dispose();
      } finally {
        previousStage?.dispose();
      }
    }
  };

  const attempt = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      disposed = true;
      try { release(); } catch { /* зберігаємо початкову помилку після спроби звільнити всі ресурси */ }
      throw error;
    }
  };

  return {
    setFilters(list: readonly Filter[]) {
      if (disposed) return;
      filters = list;
      attempt(() => stage?.setFilters(filters));
    },
    setActive(next: boolean) {
      if (disposed || next === active) return;
      attempt(() => {
        if (!next) {
          stage?.stop();
        } else {
          if (!stage) {
            stage = makeStage();
            stage.setFilters(filters);
            scene = makeScene();
            scene.mount(stage);
          }
          stage.start((dtS, timeS) => scene?.update(getView(), dtS, timeS));
        }
        active = next;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}
