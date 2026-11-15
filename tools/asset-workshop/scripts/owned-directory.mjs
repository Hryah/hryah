import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Resolve a disposable child directory without following redirected ancestors. */
export function resolveOwnedDirectory(workshopDirectory, relativeDirectory) {
  const root = realpathSync(workshopDirectory);
  const target = resolve(root, relativeDirectory);
  const child = relative(root, target);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`Unsafe owned output directory: ${target}`);
  }
  let directory = root;
  for (const part of child.split(sep)) {
    directory = resolve(directory, part);
    const stat = lstatSync(directory, { throwIfNoEntry: false });
    if (stat && (stat.isSymbolicLink() || realpathSync(directory) !== directory)) {
      throw new Error(`Refusing redirected output directory: ${directory}`);
    }
  }
  return target;
}
