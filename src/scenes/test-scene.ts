// test-scene.ts — перевірка рушія (етап 0): куб, що крутиться, і спрайт-заглушка.
// Заодно найкоротший зразок сцени: усе створюється в mount, update лише рухає.
import type * as THREE from 'three';
import { approach, pulse } from '../render/motion';
import { createBox, createStars, disposeObject, type Stars } from '../render/primitives';
import { createSprite, type SpriteHandle } from '../render/sprites';
import type { Stage } from '../render/stage';
import { spriteSource } from './sprite-source';
import type { Scene } from './types';

export interface TestView {
  /** Швидкість обертання куба, рад/с. */
  spinRadS: number;
  /** Висота спрайта над підлогою у світових одиницях. */
  spriteLiftUnits: number;
}

export function createTestScene(): Scene<TestView> {
  let cube: THREE.Group | null = null;
  let stars: Stars | null = null;
  let sprite: SpriteHandle | null = null;
  let spin = 0;
  let lift = 0;

  return {
    mount(stage: Stage) {
      cube = createBox(2, 2, 2, 'panel');
      cube.position.set(-2, 0, 0);
      stars = createStars(300, 30, 3);
      // "no-such-sprite" навмисно відсутній у маніфесті: перевіряємо заглушку.
      sprite = createSprite('no-such-sprite', spriteSource);
      sprite.setScale(2);
      sprite.object.position.set(2.5, 0, 0);
      stage.root.add(cube, stars.points, sprite.object);
    },
    update(view, dtS, timeS) {
      if (!cube || !stars || !sprite) return;
      spin = approach(spin, view.spinRadS, 2, dtS);
      lift = approach(lift, view.spriteLiftUnits, 3, dtS);
      cube.rotation.y += spin * dtS;
      cube.rotation.x += spin * 0.4 * dtS;
      sprite.object.position.y = lift + 0.15 * Math.sin(timeS * 2);
      stars.material.opacity = 0.6 + 0.3 * pulse(timeS, 3);
    },
    dispose() {
      if (cube) disposeObject(cube);
      if (stars) disposeObject(stars.points);
      sprite?.dispose();
      cube = null;
      stars = null;
      sprite = null;
    },
  };
}
