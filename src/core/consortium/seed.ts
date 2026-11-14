// Детерміновані кидки від сіду й ключа, а не від порядку дій: результат розробки однієї агенції
// не залежить від того, скільки разів клацнула інша.

import { nextRandom } from '../physics';

// FNV-1a: текст у 32-бітне число.
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// n значень 0..1 для пари (сід, ключ). Ті самі вхідні дані дають ті самі значення.
export function rolls(seed: number, key: string, n: number): number[] {
  let state = hashSeed(`${seed}|${key}`);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [value, next] = nextRandom(state);
    out.push(value);
    state = next;
  }
  return out;
}
