import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDrawing, unionBounds } from './svg-geometry.mjs';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const outputDirectory = path.join(repositoryRoot, 'public/assets/astronaut');
export const directions = ['front', 'back', 'left', 'right'];
export const canvas = { widthPx: 1024, heightPx: 1024 };
export const pivot = { x: 0.5, y: 0.92 };
export const visibleHeightPx = 840;
const backgrounds = { front: '#678194', back: '#678093', left: '#678193', right: '#678193' };
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const rounded = (value) => Number(value.toFixed(9));

export async function buildRuntimeAssets() {
  const sourceManifest = JSON.parse(await readFile(path.join(repositoryRoot, 'art/astronaut/source-manifest.json'), 'utf8'));
  assert.equal(sourceManifest.approvedFront, 'front');
  assert.equal(sourceManifest.animationReady, false);
  const files = new Map();
  const runtime = {
    schemaVersion: 1,
    id: sourceManifest.id,
    status: 'static-textures',
    runtimeReady: true,
    animationReady: false,
    canvas,
    pivot,
    visibleHeightPx,
    directions: {},
    preparation: {
      generator: 'scripts/astronaut/prepare.mjs',
      sourceManifest: 'art/astronaut/source-manifest.json',
      method: 'Remove the single verified full-canvas background path; retain every character path; fit exact cubic bounds with a uniform transform.',
      assets: [],
    },
  };
  for (const direction of directions) {
    assert.equal(sourceManifest.canonicalViews[direction], direction);
    const asset = sourceManifest.assets.find((candidate) => candidate.id === direction);
    assert(asset?.primary && asset.direction === direction, `Missing selected ${direction} source`);
    const source = await readFile(path.join(repositoryRoot, 'art/astronaut', asset.path));
    assert.equal(sha256(source), asset.sha256, `${direction}: source integrity changed`);
    const drawing = parseDrawing(source.toString('utf8'));
    assert.equal(drawing.width, asset.widthPx);
    assert.equal(drawing.height, asset.heightPx);
    const background = drawing.paths[0];
    assert.equal(background.fill, backgrounds[direction], `${direction}: expected background at index 0`);
    assert.deepEqual(background.bounds, { minX: 0, minY: 0, maxX: drawing.width, maxY: drawing.height }, `${direction}: background must cover source canvas exactly`);
    assert.equal(drawing.paths.filter((p) => p.fill === backgrounds[direction]).length, 1, `${direction}: unexpected background-colored path requires review`);
    const characterPaths = drawing.paths.slice(1);
    const bounds = unionBounds(characterPaths);
    const scale = visibleHeightPx / (bounds.maxY - bounds.minY);
    const translateX = canvas.widthPx * pivot.x - (bounds.minX + bounds.maxX) * scale / 2;
    const translateY = canvas.heightPx * pivot.y - bounds.maxY * scale;
    const normalizedBounds = {
      minX: rounded(bounds.minX * scale + translateX),
      minY: rounded(bounds.minY * scale + translateY),
      maxX: rounded(bounds.maxX * scale + translateX),
      maxY: rounded(bounds.maxY * scale + translateY),
    };
    assert(normalizedBounds.minX > 0 && normalizedBounds.maxX < canvas.widthPx && normalizedBounds.minY > 0 && normalizedBounds.maxY < canvas.heightPx, `${direction}: drawing overflows common canvas`);
    const body = characterPaths.map((p) => p.tag).join('\n');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.widthPx}" height="${canvas.heightPx}" viewBox="0 0 ${canvas.widthPx} ${canvas.heightPx}">\n<g transform="translate(${rounded(translateX)} ${rounded(translateY)}) scale(${rounded(scale)})">\n${body}\n</g>\n</svg>\n`;
    files.set(`${direction}.svg`, svg);
    const state = () => ({ frames: [`assets/astronaut/${direction}.svg`], fps: 0, loop: true, staticPose: true });
    runtime.directions[direction] = { direction, states: { idle: state(), move: state() } };
    runtime.preparation.assets.push({
      direction,
      source: `art/astronaut/${asset.path}`,
      sourceSha256: asset.sha256,
      output: `assets/astronaut/${direction}.svg`,
      outputSha256: sha256(svg),
      removedBackground: { pathIndex: 0, fill: background.fill, pathSha256: sha256(background.tag) },
      preservedPathCount: characterPaths.length,
      sourceBounds: Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, rounded(value)])),
      normalizedBounds,
      transform: { translateX: rounded(translateX), translateY: rounded(translateY), scale: rounded(scale) },
    });
  }
  files.set('runtime-manifest.json', `${JSON.stringify(runtime, null, 2)}\n`);
  return { files, runtime };
}

async function run() {
  assert(process.argv.slice(2).every((arg) => arg === '--check'), 'Usage: node scripts/astronaut/prepare.mjs [--check]');
  const check = process.argv.includes('--check');
  const { files, runtime } = await buildRuntimeAssets();
  if (!check) await mkdir(outputDirectory, { recursive: true });
  for (const [name, content] of files) {
    const target = path.join(outputDirectory, name);
    if (check) assert.equal(await readFile(target, 'utf8'), content, `${name} is stale; run node scripts/astronaut/prepare.mjs`);
    else await writeFile(target, content, 'utf8');
  }
  console.log(`${check ? 'Verified' : 'Prepared'} four transparent static SVG views and runtime-manifest.json (${visibleHeightPx}px visible height, pivot ${pivot.x}/${pivot.y}).`);
  for (const asset of runtime.preparation.assets) console.log(`${asset.direction}: ${asset.preservedPathCount} character paths retained; bounds ${JSON.stringify(asset.normalizedBounds)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
