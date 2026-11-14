import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STANDALONE_GLB_ASSETS } from '../src/catalog/asset-registry';
import { validateExportedGlbBytes } from '../src/validation/validate-glb';
import type { WorkshopManifest } from '../src/generator/export-glb';
import { archivePath, outputArgument } from './paths.mjs';
import { assertPublishedArchive, collectPublishedFiles, readPublishedZip } from './package.mjs';

async function main() {
  const output = outputArgument();
  const published = collectPublishedFiles(output);
  const manifest = assertPublishedArchive(published) as WorkshopManifest;
  const unzipped = readPublishedZip(new Uint8Array(readFileSync(resolve(output, archivePath))));
  assert.deepEqual(Object.keys(unzipped).sort(), Object.keys(published).sort(), 'ZIP and published viewer file sets diverged');
  for (const [name, bytes] of Object.entries(published)) {
    assert.deepEqual(unzipped[name], bytes, `ZIP and published viewer bytes diverged: ${name}`);
  }
  assert.equal(manifest.assets.length, STANDALONE_GLB_ASSETS.length, 'Manifest asset count mismatch');

  console.log('Validating every actual packaged GLB in a clean GLTFLoader scene...');
  let failedCount = 0;
  let verifiedClips = 0;
  for (const def of STANDALONE_GLB_ASSETS) {
    // Re-import the real archive bytes, never original generator objects.
    const bytes = unzipped[`assets/workshop/${def.glbPath}`];
    assert(bytes?.byteLength > 0, `Missing packaged GLB for ${def.id}`);
    const report = await validateExportedGlbBytes(def.id, bytes, def);
    const entry = manifest.assets.find((asset) => asset.id === def.id);
    assert(entry, `Missing manifest entry for ${def.id}`);
    assert.equal(report.triangles, entry.triangles, `Triangle count mismatch: ${def.id}`);
    assert.equal(report.byteSize, entry.byteSize, `Byte size mismatch: ${def.id}`);
    assert.deepEqual(report.clips.map((clip) => clip.name), entry.clips.map((clip) => clip.name), `Manifest animation mismatch: ${def.id}`);
    assert.deepEqual([...report.materials].sort(), [...entry.materials].sort(), `Material mismatch: ${def.id}`);
    if (!report.valid) {
      failedCount++;
      console.error(`  FAILED ${def.id}:`, report.errors);
    } else {
      verifiedClips += report.clips.length;
      console.log(`  VALID ${def.id}: ${report.triangles} triangles, ${report.materials.length} materials, ${report.clips.length} dynamic clips, 0 coplanar risks`);
    }
  }
  assert.equal(failedCount, 0, `${failedCount} model(s) failed clean-scene validation`);
  console.log(`All ${STANDALONE_GLB_ASSETS.length} packaged models and ${verifiedClips} clips passed clean-scene re-import.`);
  console.log(`Runnable ZIP verified: ${Object.keys(unzipped).length} files; compiled resources resolve at / and /experimental/.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
