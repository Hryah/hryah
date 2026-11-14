import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { archivePath, outputArgument, workshopRoot } from './paths.mjs';
import { collectPublishedFiles, createPublishedZip, normalizePublishedText } from './package.mjs';

const output = outputArgument();
const assets = resolve(output, 'assets/workshop');
const manifest = JSON.parse(readFileSync(resolve(assets, 'manifest.json'), 'utf8'));
cpSync(resolve(assets, 'manifest.json'), resolve(output, 'manifest.json'));
for (const name of ['README.md', 'REPORT.md', 'serve.mjs']) {
  cpSync(resolve(workshopRoot, 'public-templates', name), resolve(output, name));
}
mkdirSync(resolve(output, 'examples'), { recursive: true });
cpSync(resolve(workshopRoot, 'src/adapter/import-and-animate.ts'), resolve(output, 'examples/import-and-animate.ts'));
// Retain manifest.zipPath compatibility for asset imports; the viewer uses assets/workshop/.
for (const asset of manifest.assets) {
  const destination = resolve(output, asset.zipPath);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(resolve(assets, asset.glbPath), destination);
}
const files = normalizePublishedText(collectPublishedFiles(output));
// Export and ZIP must agree byte-for-byte regardless of Git's checkout line endings.
for (const [name, bytes] of Object.entries(files)) writeFileSync(resolve(output, name), bytes);
const zip = createPublishedZip(files);
writeFileSync(resolve(output, archivePath), zip);
console.log(`Complete runnable viewer ZIP: ${Object.keys(files).length} files, ${(zip.byteLength / 1024).toFixed(1)} KiB`);
