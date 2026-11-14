import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildRuntimeAssets, canvas, directions, outputDirectory, pivot, repositoryRoot, sha256, visibleHeightPx } from './prepare.mjs';
import { parseDrawing, pathBounds, unionBounds } from './svg-geometry.mjs';

test('cubic bounds use curve extrema, not its control-point rectangle', () => {
  assert.deepEqual(pathBounds('M0,0C0,100,100,100,100,0Z'), { minX: 0, minY: 0, maxX: 100, maxY: 75 });
  assert.deepEqual(pathBounds('M10,20c0,100,100,100,100,0z'), { minX: 10, minY: 20, maxX: 110, maxY: 95 });
  assert.deepEqual(pathBounds('M0,0C0,0,30,0,30,0M50,40c0,0,10,0,10,0Z'), { minX: 0, minY: 0, maxX: 60, maxY: 40 });
  assert.throws(() => pathBounds('M0,0A10,10,0,0,0,20,20'), /Unsupported path command/);
  assert.throws(() => pathBounds('M0,0C1,1'), /Missing path coordinate/);
});

test('published textures exactly reproduce from the immutable selected sources', async () => {
  const first = await buildRuntimeAssets();
  const second = await buildRuntimeAssets();
  assert.deepEqual(first, second, 'Generator must not depend on clock, randomness or local paths');
  for (const [name, expected] of first.files) {
    assert.equal(await readFile(path.join(outputDirectory, name), 'utf8'), expected, `${name} is stale`);
  }
  const runtime = first.runtime;
  assert.equal(runtime.animationReady, false);
  assert.equal(runtime.runtimeReady, true);
  assert.deepEqual(runtime.canvas, { widthPx: 1024, heightPx: 1024 });
  assert.deepEqual(runtime.pivot, { x: 0.5, y: 0.92 });
  assert.deepEqual(Object.keys(runtime.directions), directions);
  for (const direction of directions) {
    const metadata = runtime.preparation.assets.find((asset) => asset.direction === direction);
    assert(metadata);
    const original = await readFile(path.join(repositoryRoot, metadata.source));
    assert.equal(sha256(original), metadata.sourceSha256);
    const source = parseDrawing(original.toString('utf8'));
    const output = first.files.get(`${direction}.svg`);
    assert.equal(sha256(output), metadata.outputSha256);
    const group = /<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)">/.exec(output);
    assert(group, 'Expected one uniform normalization transform');
    const [tx, ty, scale] = group.slice(1).map(Number);
    assert(scale > 0);
    const retained = parseDrawing(output.replace(/<g\b[^>]*>|<\/g>/g, ''));
    assert.deepEqual({ widthPx: retained.width, heightPx: retained.height }, canvas);
    // Compare every tag, not just a color histogram: white helmet, backpack,
    // suit highlights, outline and tiny details all survive the edit unchanged.
    assert.deepEqual(retained.paths.map((p) => p.tag), source.paths.slice(1).map((p) => p.tag));
    assert.equal(retained.paths.length, metadata.preservedPathCount);
    assert.equal(retained.paths.filter((p) => p.fill === metadata.removedBackground.fill).length, 0);
    const pale = (p) => p.fill.match(/[\da-f]{2}/gi).every((channel) => parseInt(channel, 16) >= 220);
    assert(source.paths.filter(pale).length > 0, 'Expected original light suit paths');
    assert.equal(retained.paths.filter(pale).length, source.paths.filter(pale).length, 'Light suit paths changed');
    const bounds = unionBounds(retained.paths);
    const normalized = {
      minX: bounds.minX * scale + tx,
      maxX: bounds.maxX * scale + tx,
      minY: bounds.minY * scale + ty,
      maxY: bounds.maxY * scale + ty,
    };
    const close = (actual, expected) => assert(Math.abs(actual - expected) < 0.000002, `Expected ${actual} close to ${expected}`);
    close(normalized.maxY - normalized.minY, visibleHeightPx);
    close(normalized.maxY, canvas.heightPx * pivot.y);
    close((normalized.minX + normalized.maxX) / 2, canvas.widthPx * pivot.x);
    assert(normalized.minX > 0 && normalized.maxX < canvas.widthPx && normalized.minY > 0 && normalized.maxY < canvas.heightPx, 'Character must remain inside transparent margins');
    assert.equal(sha256(source.paths[0].tag), metadata.removedBackground.pathSha256);
    assert.equal(metadata.removedBackground.pathIndex, 0);
    assert.equal(runtime.directions[direction].direction, direction);
    for (const state of ['idle', 'move']) {
      assert.deepEqual(runtime.directions[direction].states[state], {
        frames: [`assets/astronaut/${direction}.svg`], fps: 0, loop: true, staticPose: true,
      });
    }
  }
});

test('source reader rejects external content and unexpected elements', () => {
  const root = '<svg width="10" height="10">';
  const paths = '<path d="M0,0C0,1,1,1,1,0Z" fill="#ffffff"/><path d="M0,0C0,1,1,1,1,0Z" fill="#000000"/>';
  assert.throws(() => parseDrawing(`${root}<image href="https://example.invalid/image.png"/>${paths}</svg>`), /Unsupported SVG content/);
  assert.throws(() => parseDrawing(`${root}<rect width="10" height="10"/>${paths}</svg>`), /Unsupported element/);
});
