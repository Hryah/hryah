import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'source-manifest.json'), 'utf8'));
const expectedViews = { front: 'front', back: 'back', left: 'left', right: 'right' };

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.status, 'raw-source');
assert.equal(manifest.runtimeReady, false);
assert.equal(manifest.animationReady, false);
assert.equal(manifest.approvedFront, 'front');
assert.deepEqual(manifest.canonicalViews, expectedViews);
assert.equal(manifest.assets.length, 5);
assert.equal(new Set(manifest.assets.map(asset => asset.id)).size, 5);
assert.deepEqual(manifest.assets.map(asset => asset.id).sort(), ['back', 'front', 'front-alternate', 'left', 'right']);
for (const [direction, id] of Object.entries(expectedViews)) {
  const selected = manifest.assets.find(asset => asset.id === id);
  assert.equal(selected.direction, direction);
  assert.equal(selected.primary, true);
}

for (const asset of manifest.assets) {
  assert.match(asset.path, /^source\/[a-z-]+\.svg$/);
  const file = resolve(root, asset.path);
  assert.ok(file.startsWith(resolve(root, 'source') + sep), 'Asset must stay inside source/');
  const bytes = readFileSync(file);
  const text = bytes.toString('utf8');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `${asset.id}: source bytes changed`);
  const svgTag = text.match(/<svg\b[^>]*>/s)?.[0];
  assert.ok(svgTag, `${asset.id}: missing SVG root`);
  assert.ok(/<\/svg>\s*$/.test(text), `${asset.id}: missing closing SVG root`);
  assert.equal(Number(svgTag.match(/\bwidth="([0-9.]+)"/)?.[1]), asset.widthPx);
  assert.equal(Number(svgTag.match(/\bheight="([0-9.]+)"/)?.[1]), asset.heightPx);
  assert.ok(!/<(?:script|foreignObject)\b|\son[a-z]+\s*=|<!DOCTYPE|<!ENTITY/i.test(text), `${asset.id}: active SVG content`);
  for (const [, href] of text.matchAll(/(?:\b(?:xlink:)?href)\s*=\s*["']([^"']+)["']/gi)) {
    assert.ok(href.startsWith('#'), `${asset.id}: external reference`);
  }
  for (const [, url] of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) {
    assert.ok(url.startsWith('#'), `${asset.id}: external CSS reference`);
  }
  const selected = expectedViews[asset.direction] === asset.id;
  assert.equal(asset.primary, selected, `${asset.id}: selected-view mismatch`);
  console.log(`OK ${asset.id}: ${asset.widthPx}×${asset.heightPx}px, SHA-256 verified`);
}

assert.equal(manifest.assets.find(asset => asset.id === 'front')?.originalFilename, 'космонавт перед (2).svg');
assert.equal(manifest.assets.find(asset => asset.id === 'front-alternate')?.primary, false);
console.log('All 5 original SVG sources verified. Four canonical views selected; runtime preparation is pending.');
