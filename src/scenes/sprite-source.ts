// sprite-source.ts — звідки сцени беруть спрайти: маніфест із даних і тека public/assets/sprites/.
import rawManifest from '../data/sprites.json';
import { parseManifest, type SpriteFactoryOptions } from '../render/sprites';

export const spriteSource: SpriteFactoryOptions = {
  manifest: parseManifest(rawManifest),
  baseUrl: `${import.meta.env.BASE_URL}assets/sprites/`,
};
