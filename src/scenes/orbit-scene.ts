// orbit-scene.ts — сцена частини 3: планета, кільце орбіти, сектор тіні, станція, апарат.
// Рух апарата по орбіті належить сцені (один виток за ORBIT_PERIOD_S), бо ядро рахує виток за один крок.
// Вид каже лише «що зараз правда»: частка тіні, чи працює передавач, чи буря.
import * as THREE from 'three';
import { approach, inArc, onCircle, orbitAngle, pulse } from '../render/motion';
import { palette } from '../render/palette';
import {
  createArcSector, createBeam, createBox, createOrbitRing, createPlanet, createStars, disposeObject,
  setArc, setBeam, type Planet, type Stars,
} from '../render/primitives';
import { createSprite, type SpriteHandle } from '../render/sprites';
import type { Stage } from '../render/stage';
import { spriteSource } from './sprite-source';
import type { Scene } from './types';
import type { OrbitView } from './views';

const TAU = Math.PI * 2;
const PLANET_RADIUS = 2;
const ORBIT_RADIUS = 3.7;
const ORBIT_PERIOD_S = 20;
const START_ANGLE = Math.PI * 0.75;
// Світло падає зліва, тож тінь планети лежить праворуч: центр сектора тіні в куті 0 (+X).
const SHADOW_CENTER = 0;
// Станція стоїть на освітленому боці, повернутому до камери.
const STATION_ANGLE = Math.PI * 1.3;
const CRAFT_SCALE = 0.45;
const CHARGE_BAR_UNITS = 0.9;
const LOW_CHARGE = 0.25;

interface Parts {
  planet: Planet;
  stars: Stars;
  ring: THREE.LineLoop;
  shadow: THREE.Mesh;
  pass: THREE.Mesh;
  station: THREE.Group;
  beam: THREE.Mesh;
  craft: SpriteHandle;
  chargeBar: THREE.Sprite;
  chargeMaterial: THREE.SpriteMaterial;
}

export function createOrbitScene(): Scene<OrbitView> {
  let parts: Parts | null = null;
  // Згладжені значення: вид може змінитись стрибком, картинка ні.
  let shade = 0;
  let stormLevel = 0;
  let beamLevel = 0;
  let alarmLevel = 0;
  let charge = 1;
  let eclipse = -1;
  let pass = -1;

  const lit = new THREE.Color(palette.white);
  const dark = new THREE.Color(palette.planetNight);
  const alarm = new THREE.Color(palette.alarm);
  const calmAir = new THREE.Color(palette.atmosphere);
  const stormAir = new THREE.Color(palette.storm);
  const chargeOk = new THREE.Color(palette.calm);
  const beamCalm = new THREE.Color(palette.accent);
  const craftPosition = new THREE.Vector3();
  const stationPosition = new THREE.Vector3();

  return {
    mount(stage: Stage) {
      // Якщо mount кине виняток до присвоєння parts, dispose() нічого не знає про вже створене: звільняємо його тут.
      const created: THREE.Object3D[] = [];
      const own = <T extends THREE.Object3D>(object: T): T => { created.push(object); return object; };
      let craft: SpriteHandle | null = null;
      let chargeMaterial: THREE.SpriteMaterial | null = null;
      try {
      const planet = createPlanet(PLANET_RADIUS);
      own(planet.group);
      const stars = createStars(400, 30, 11);
      own(stars.points);
      const ring = own(createOrbitRing(ORBIT_RADIUS));
      const shadow = own(createArcSector(PLANET_RADIUS * 1.02, ORBIT_RADIUS + 0.5, SHADOW_CENTER, 0, 'shadow', 0.55));
      const passSector = own(createArcSector(PLANET_RADIUS * 1.02, ORBIT_RADIUS, STATION_ANGLE, 0, 'accent', 0.1));
      shadow.position.y = -0.01;
      passSector.position.y = -0.02;

      const station = own(createBox(0.22, 0.3, 0.22, 'hull'));
      const surface = onCircle(STATION_ANGLE, PLANET_RADIUS);
      stationPosition.set(surface.x, 0, surface.z);
      station.position.copy(stationPosition).multiplyScalar(1.05);
      // вісь коробки вздовж радіуса планети
      station.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stationPosition.clone().normalize());

      const beam = own(createBeam('accent'));
      const bus = createSprite('bus', spriteSource);
      craft = bus;
      bus.setScale(CRAFT_SCALE);

      const material = new THREE.SpriteMaterial({ color: palette.calm, depthTest: false });
      chargeMaterial = material;
      const chargeBar = new THREE.Sprite(material);
      chargeBar.center.set(0, 0.5);
      chargeBar.renderOrder = 2;

      stage.root.add(stars.points, planet.group, ring, shadow, passSector, station, beam, bus.object, chargeBar);
      parts = { planet, stars, ring, shadow, pass: passSector, station, beam, craft: bus, chargeBar, chargeMaterial: material };
      } catch (error) {
        for (const object of created) disposeObject(object);
        craft?.dispose();
        chargeMaterial?.dispose();
        throw error;
      }
    },

    update(view, dtS, timeS) {
      if (!parts) return;
      const { planet, stars, shadow, beam, craft, chargeBar, chargeMaterial } = parts;

      // Сектори міняються рідко (нова місія), тому перераховуємо їх лише за зміни виду.
      if (view.eclipseFraction !== eclipse) {
        eclipse = view.eclipseFraction;
        setArc(shadow, SHADOW_CENTER, eclipse * TAU);
      }
      if (view.passFraction !== pass) {
        pass = view.passFraction;
        setArc(parts.pass, STATION_ANGLE, pass * TAU);
      }

      // Власний рух сцени.
      planet.globe.rotation.y += dtS * 0.12;
      stars.points.rotation.y += dtS * 0.004;
      stars.material.opacity = 0.65 + 0.3 * pulse(timeS, 4);

      const angle = orbitAngle(timeS, ORBIT_PERIOD_S, START_ANGLE);
      const point = onCircle(angle, ORBIT_RADIUS);
      craftPosition.set(point.x, 0.08 * Math.sin(timeS * 1.7), point.z);
      craft.object.position.copy(craftPosition);

      const inShadow = inArc(angle, SHADOW_CENTER, eclipse * TAU);
      const overStation = inArc(angle, STATION_ANGLE, pass * TAU);
      const failed = view.status === 'failed';

      shade = approach(shade, inShadow ? 1 : 0, 6, dtS);
      alarmLevel = approach(alarmLevel, failed ? 1 : 0, 4, dtS);
      stormLevel = approach(stormLevel, view.storm ? 1 : 0, 3, dtS);
      beamLevel = approach(beamLevel, overStation && view.linkActive && view.status === 'active' ? 1 : 0, 8, dtS);
      charge = approach(charge, view.chargeFraction, 2.5, dtS);

      // Апарат темніє в тіні; після відмови блимає кольором тривоги; у безпечному режимі тьмяніший.
      craft.material.color.lerpColors(lit, dark, shade * 0.75);
      craft.material.color.lerp(alarm, alarmLevel * (0.45 + 0.4 * pulse(timeS, 0.9)));
      craft.material.opacity = view.safeMode ? 0.75 : 1;

      // Промінь до станції під час сеансу зв'язку.
      beam.visible = beamLevel > 0.02;
      if (beam.visible) {
        setBeam(beam, craftPosition, stationPosition);
        const material = beam.material as THREE.MeshBasicMaterial;
        material.color.lerpColors(beamCalm, stormAir, stormLevel);
        material.opacity = beamLevel * (0.45 + 0.4 * pulse(timeS, view.storm ? 0.25 : 0.6));
      }

      // Буря: атмосфера міняє колір і пульсує.
      planet.atmosphereMaterial.color.lerpColors(calmAir, stormAir, stormLevel);
      planet.atmosphereMaterial.opacity = 0.14 + stormLevel * (0.2 + 0.25 * pulse(timeS, 0.7));
      planet.atmosphere.scale.setScalar(1 + stormLevel * 0.06 * pulse(timeS, 0.7));

      // Смужка заряду над апаратом.
      chargeBar.position.set(craftPosition.x - CHARGE_BAR_UNITS / 2, craftPosition.y + 0.75, craftPosition.z);
      chargeBar.scale.set(Math.max(0.02, charge * CHARGE_BAR_UNITS), 0.08, 1);
      chargeMaterial.color.lerpColors(alarm, chargeOk, Math.min(1, charge / LOW_CHARGE) ** 2);
    },

    dispose() {
      if (!parts) return;
      const { planet, stars, ring, shadow, pass: passSector, station, beam, craft, chargeBar, chargeMaterial } = parts;
      for (const object of [planet.group, stars.points, ring, shadow, passSector, station, beam]) disposeObject(object);
      craft.dispose();
      chargeBar.removeFromParent();
      chargeMaterial.dispose();
      parts = null;
    },
  };
}
