import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateAllWorkshopGlbs } from '../src/generator/export-glb';
import { workshopRoot } from './paths.mjs';
import { resetGeneratedAssetsDirectory } from './generated-directory.mjs';

async function main() {
  console.log('Generating all workshop GLBs from clean bind poses...');
  const { filesByAssetId, manifest } = await generateAllWorkshopGlbs();
  const generatedAssets = resetGeneratedAssetsDirectory(workshopRoot);
  for (const [assetId, file] of filesByAssetId) {
    const outPath = resolve(generatedAssets, file.glbPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, file.bytes);
    console.log(`  ${assetId}: ${file.bytes.byteLength} bytes`);
  }
  writeFileSync(resolve(generatedAssets, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Generated ${manifest.assets.length} models and ${manifest.assets.reduce((sum, asset) => sum + asset.clips.length, 0)} clips in generated/assets/workshop/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
