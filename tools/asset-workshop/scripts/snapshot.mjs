import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { archivePath, outputArgument, snapshotRoot, workshopRoot } from './paths.mjs';
import { collectPublishedFiles, assertPublishedArchive, readPublishedZip } from './package.mjs';

const output = outputArgument();
const files = collectPublishedFiles(output);
assertPublishedArchive(files);
const zip = new Uint8Array(readFileSync(resolve(output, archivePath)));
readPublishedZip(zip);
// Delete only the explicitly owned repository snapshot, after verifying its absolute target.
if (snapshotRoot !== resolve(workshopRoot, '../../nikita models')) throw new Error('Unsafe snapshot target');
rmSync(snapshotRoot, { recursive: true, force: true });
for (const [name, bytes] of Object.entries({ ...files, [archivePath]: zip })) {
  const destination = resolve(snapshotRoot, name);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
}
writeFileSync(resolve(snapshotRoot, '.gitattributes'), '# Generated viewer: review tools/asset-workshop sources.\nassets/index-*.js -text -diff linguist-generated=true\nassets/index-*.css -text linguist-generated=true\n*.glb binary\n*.zip binary\n');
console.log('Updated repository snapshot: nikita models/');
