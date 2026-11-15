import { mkdirSync, rmSync } from 'node:fs';
import { resolveOwnedDirectory } from './owned-directory.mjs';

/** Recreate only this package's owned model output, leaving other generated data alone. */
export function resetGeneratedAssetsDirectory(workshopDirectory) {
  const target = resolveOwnedDirectory(workshopDirectory, 'generated/assets/workshop');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  return target;
}
