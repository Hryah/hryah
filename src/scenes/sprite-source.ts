// sprite-source.ts — звідки сцени беруть спрайти: маніфест із даних і тека public/assets/sprites/.
import rawManifest from '../data/sprites.json';
import { parseManifest, type SpriteFactoryOptions } from '../render/sprites';

// Список PNG потрібен лише при монтуванні сцени, а не при серверному рендері HTML.
let fileList: Promise<readonly string[]> | null = null;
const availableFiles = (): Promise<readonly string[]> =>
  fileList ??= import('./sprite-files').then((module) => module.spriteFiles);

export const spriteSource: SpriteFactoryOptions = {
  manifest: parseManifest(rawManifest),
  baseUrl: `${import.meta.env.BASE_URL}assets/sprites/`,
  availableFiles,
};
