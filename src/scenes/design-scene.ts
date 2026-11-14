// design-scene.ts — сцена частини 1: стенд, корпус апарата і модулі в точках кріплення.
// Усі спрайти модулів створюються в mount (по одному на кожен id із каталогу); update лише ховає й показує їх.
import * as THREE from 'three';
import type { SlotId } from '../core/contracts';
import catalog from '../data/catalog.json';
import { approach, pulse } from '../render/motion';
import { palette } from '../render/palette';
import { createBox, createStars, disposeObject, type Stars } from '../render/primitives';
import { createSprite, type SpriteHandle } from '../render/sprites';
import type { Stage } from '../render/stage';
import { spriteSource } from './sprite-source';
import type { Scene } from './types';
import type { DesignView } from './views';

// Точки кріплення на корпусі (світові одиниці, відносно центра корпуса) і зсув у глибину до камери.
// Якір спрайта з sprites.json стає в цю точку: двигун висить знизу, панель іде ліворуч, антена стоїть згори, камера йде праворуч.
const ATTACH: Record<SlotId, { x: number; y: number; z: number }> = {
  engine: { x: 0, y: -0.8, z: 0.05 },
  solar: { x: -1.0, y: 0, z: 0.05 },
  antenna: { x: 0, y: 0.8, z: 0.05 },
  instrument: { x: 1.0, y: 0, z: 0.05 },
  battery: { x: 0, y: -0.1, z: 0.12 },
};
const KNOWN_IDS: string[] = catalog.modules.map((m) => m.id);
const HULL_Z = 0;
// Порядок малювання шарів апарата. Спрайт має одну глибину на всю площину, і за нахиленої камери її
// визначає висота, а не зсув по z, тож шари задаємо явно і без перевірки глибини: апарат завжди поверх стенда.
const HULL_ORDER = 2;
const SLOT_ORDER: Record<SlotId, number> = { engine: 1, battery: 3, solar: 4, antenna: 4, instrument: 4 };

function layer(sprite: SpriteHandle, order: number): void {
  sprite.material.depthTest = false;
  sprite.material.depthWrite = false;
  sprite.object.renderOrder = order;
}
const CRAFT_BASE_Y = 2.0;
const WORLD_Y = -1.3;
const LAUNCH_LIFT = 3.2;
const BOB_UNITS = 0.08;
const SWAY_UNITS = 0.05;
const SHOW_RATE = 7;
const ALERT_RATE = 6;
const HIDE_EPSILON = 0.01;

interface ModuleEntry {
  slot: SlotId;
  /** id модуля з каталогу; null — запасний спрайт слота для модуля, якого в каталозі немає (розробка консорціуму). */
  id: string | null;
  sprite: SpriteHandle;
  level: number;
  alert: number;
}

interface Parts {
  world: THREE.Group;
  stand: THREE.Group;
  craft: THREE.Group;
  stars: Stars;
  hull: SpriteHandle;
  modules: ModuleEntry[];
}

export function createDesignScene(): Scene<DesignView> {
  let parts: Parts | null = null;
  let lift = 0;
  let blockLevel = 0;

  const white = new THREE.Color(palette.white);
  const alarm = new THREE.Color(palette.alarm);

  return {
    mount(stage: Stage) {
      // Усе, що вже створено, збираємо тут: якщо mount кине виняток до присвоєння parts, dispose() нічого не знає про ці об'єкти.
      const created: SpriteHandle[] = [];
      const trackSprite = (sprite: SpriteHandle) => { created.push(sprite); return sprite; };
      const world = new THREE.Group();
      const stand = new THREE.Group();
      let stars: ReturnType<typeof createStars> | null = null;
      try {
      world.position.y = WORLD_Y;

      // Стенд: низька платформа й дві опори.
      const platform = createBox(4.2, 0.25, 2.2, 'metal');
      platform.position.y = -0.125;
      stand.add(platform);
      for (const x of [-0.9, 0.9]) {
        const post = createBox(0.2, 0.7, 0.2, 'panel');
        post.position.set(x, 0.35, 0);
        stand.add(post);
      }

      const craft = new THREE.Group();
      craft.position.y = CRAFT_BASE_Y;
      const hull = trackSprite(createSprite('bus', spriteSource));
      hull.object.position.z = HULL_Z;
      layer(hull, HULL_ORDER);
      craft.add(hull.object);

      const modules: ModuleEntry[] = [];
      for (const item of catalog.modules) {
        const slot = item.slot as SlotId;
        const point = ATTACH[slot];
        if (!point) continue;
        const sprite = trackSprite(createSprite(item.id, spriteSource));
        sprite.object.position.set(point.x, point.y, point.z);
        sprite.setScale(0);
        layer(sprite, SLOT_ORDER[slot]);
        sprite.object.visible = false;
        craft.add(sprite.object);
        modules.push({ slot, id: item.id, sprite, level: 0, alert: 0 });
      }

      // Запасний спрайт на кожен слот: модуль поза каталогом теж має бути видно.
      for (const slot of Object.keys(ATTACH) as SlotId[]) {
        const point = ATTACH[slot];
        const sprite = trackSprite(createSprite(`custom-${slot}`, spriteSource));
        sprite.object.position.set(point.x, point.y, point.z);
        sprite.setScale(0);
        layer(sprite, SLOT_ORDER[slot]);
        sprite.object.visible = false;
        craft.add(sprite.object);
        modules.push({ slot, id: null, sprite, level: 0, alert: 0 });
      }

      stars = createStars(400, 30, 5);
      world.add(stand, craft);
      stage.root.add(stars.points, world);
      parts = { world, stand, craft, stars, hull, modules };
      } catch (error) {
        for (const sprite of created) sprite.dispose();
        disposeObject(stand);
        if (stars) disposeObject(stars.points);
        world.removeFromParent();
        throw error;
      }
    },

    update(view, dtS, timeS) {
      if (!parts) return;
      const { craft, stars, hull, modules } = parts;

      stars.material.opacity = 0.6 + 0.3 * pulse(timeS, 3.5);
      stars.points.rotation.y += dtS * 0.004;

      // Апарат погойдується; після підтвердження плавно відривається від стенда.
      lift = approach(lift, view.confirmed ? LAUNCH_LIFT : 0, 1.6, dtS);
      craft.position.set(
        SWAY_UNITS * Math.sin(timeS * 0.9),
        CRAFT_BASE_Y + lift + BOB_UNITS * Math.sin(timeS * 1.6),
        0,
      );

      // Корпус блимає тривогою, коли запуск заблоковано.
      blockLevel = approach(blockLevel, view.launchBlocked ? 1 : 0, ALERT_RATE, dtS);
      hull.material.color.lerpColors(white, alarm, blockLevel * 0.35 * (0.4 + 0.6 * pulse(timeS, 1.1)));

      for (const entry of modules) {
        const wanted = view.modules[entry.slot];
        const chosen = entry.id === null ? wanted !== '' && !KNOWN_IDS.includes(wanted) : wanted === entry.id;
        entry.level = approach(entry.level, chosen ? 1 : 0, SHOW_RATE, dtS);
        if (!chosen && entry.level < HIDE_EPSILON) entry.level = 0;
        const shown = entry.level > 0;
        entry.sprite.object.visible = shown;
        if (!shown) { entry.alert = 0; continue; }
        entry.sprite.setScale(entry.level);
        entry.alert = approach(entry.alert, chosen && view.alerts[entry.slot] ? 1 : 0, ALERT_RATE, dtS);
        entry.sprite.material.color.lerpColors(white, alarm, entry.alert * (0.35 + 0.45 * pulse(timeS, 0.8)));
      }
    },

    dispose() {
      if (!parts) return;
      const { world, stand, craft, stars, hull, modules } = parts;
      disposeObject(stand);
      disposeObject(stars.points);
      hull.dispose();
      for (const entry of modules) entry.sprite.dispose();
      craft.removeFromParent();
      world.removeFromParent();
      parts = null;
    },
  };
}
