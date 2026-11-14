import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOwnedDirectory } from './owned-directory.mjs';

export const workshopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const generatedRoot = resolve(workshopRoot, 'generated');
export const generatedAssets = resolve(generatedRoot, 'assets/workshop');
export const defaultOutput = resolve(workshopRoot, 'dist');
export const snapshotRoot = resolve(workshopRoot, '../../nikita models');
export const archivePath = 'assets/workshop/hryah-workshop-pack.zip';

export function outputArgument(args = process.argv.slice(2), root = workshopRoot) {
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--out-dir')) {
    throw new Error('Usage: [--out-dir <workshop-relative-or-absolute-directory>]');
  }
  const output = resolve(root, args.length === 0 ? 'dist' : args[1]);
  // Vite empties its output. Limit that operation to dedicated directories inside this package.
  const child = relative(root, output);
  const segments = child.split(sep);
  if (!['dist', 'exports'].includes(segments[0]) ||
      (segments[0] === 'exports' && segments.length < 2)) {
    throw new Error(`Unsafe build output: ${output}`);
  }
  // Validate both the default and explicit target before Vite's recursive emptyOutDir.
  return resolveOwnedDirectory(root, child);
}
