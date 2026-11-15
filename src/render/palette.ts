// palette.ts — єдине джерело кольорів для сцен і для тих, хто малює спрайти.
// Правило: жодного кольору, заданого прямо в сцені. Потрібен новий — додай сюди.
import * as THREE from 'three';

export const palette = {
  // космос
  space: 0x0b0d17,
  star: 0xe8eaf3,
  starDim: 0x8a90a8,
  // планета
  planetDay: 0x2b7b9e,
  planetLand: 0x4f9a6b,
  planetNight: 0x0c2f49,
  atmosphere: 0x81c9dd,
  // апарат і кодові об'єкти
  hull: 0xc9ced9,
  panel: 0x2f4f8f,
  metal: 0x7d8597,
  outline: 0x10131f,
  // стани
  accent: 0xa7e8d3,
  alarm: 0xff5d5d,
  calm: 0x6fcf97,
  storm: 0xf4b46a,
  shadow: 0x05060c,
  white: 0xffffff,
} as const;

export type PaletteColor = keyof typeof palette;

/** CSS-рядок кольору палітри: для заглушок спрайтів і HTML поверх полотна. */
export const css = (name: PaletteColor): string => `#${palette[name].toString(16).padStart(6, '0')}`;

/** Плоске затінення для кодових об'єктів (правило вигляду 1). */
export const flatMaterial = (name: PaletteColor): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color: palette[name], flatShading: true });

/** Матеріал без освітлення: промені, сектори, світіння. */
export const glowMaterial = (name: PaletteColor, opacity = 1): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color: palette[name], transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide,
  });

export const lineMaterial = (name: PaletteColor, opacity = 1): THREE.LineBasicMaterial =>
  new THREE.LineBasicMaterial({ color: palette[name], transparent: opacity < 1, opacity });
