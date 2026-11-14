import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { strToU8, unzipSync } from 'fflate';
import { assertPublishedArchive, createPublishedZip, normalizePublishedText, readPublishedZip } from './package.mjs';
import { outputArgument } from './paths.mjs';
import { resetGeneratedAssetsDirectory } from './generated-directory.mjs';

function fixture() {
  const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
  const manifest = JSON.stringify({ assets: [{ id: 'test', glbPath: 'test.glb', zipPath: 'assets/test.glb', byteSize: glb.length }] });
  return Object.fromEntries(Object.entries({
    'index.html': '<header id="copy-preview-link"></header><span id="share-status"></span><a href="./assets/workshop/hryah-workshop-pack.zip">Pack</a><script type="module" src="./assets/index-test.js"></script><link rel="stylesheet" href="./assets/index-test.css">',
    'assets/index-test.js': 'const url = new URL("./assets/workshop/hryah-workshop-pack.zip", document.baseURI);',
    'assets/index-test.css': '.workshop-shell{height:100vh}.share-strip{height:46px}.share-actions{display:flex}@media(max-width:1100px){}@media(max-width:620px){}',
    'manifest.json': manifest,
    'assets/workshop/manifest.json': manifest,
    'README.md': 'Run node serve.mjs',
    'REPORT.md': 'Generated inventory; visual review remains manual.',
    'serve.mjs': '/* standalone Node server */',
    'examples/import-and-animate.ts': 'import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"; export class WorkshopAnimationController {}',
    'assets/workshop/test.glb': glb,
    'assets/test.glb': glb,
  }).map(([name, value]) => [name, typeof value === 'string' ? strToU8(value) : value]));
}

test('complete viewer archive round-trips its exact compiled files without recursion', () => {
  const files = fixture();
  const bytes = createPublishedZip(files);
  assert.deepEqual(readPublishedZip(bytes), files);
  assert.deepEqual(Object.keys(unzipSync(bytes)).sort(), Object.keys(files).sort());
  assert.deepEqual(createPublishedZip(files), bytes);
});

test('LF and CRLF checkouts produce identical published text and ZIP bytes', () => {
  const lf = fixture();
  lf['README.md'] = strToU8('# Viewer\n\nRun node serve.mjs\n');
  lf['REPORT.md'] = strToU8('Inventory\nManual review remains pending.\n');
  lf['examples/import-and-animate.ts'] = strToU8(new TextDecoder().decode(lf['examples/import-and-animate.ts']) + '\n');
  const crlf = Object.fromEntries(Object.entries(lf).map(([name, bytes]) => [
    name, name.endsWith('.glb') ? bytes : strToU8(new TextDecoder().decode(bytes).replace(/\n/g, '\r\n')),
  ]));
  assert.deepEqual(normalizePublishedText(crlf), lf);
  assert.deepEqual(createPublishedZip(crlf), createPublishedZip(lf));
  assert.deepEqual(readPublishedZip(createPublishedZip(crlf)), lf);
  assert.deepEqual(normalizePublishedText({ 'note.md': strToU8('one\rtwo\r') }), { 'note.md': strToU8('one\ntwo\n') });
});

test('rejects source HTML and missing compiled resources rather than a fake runnable ZIP', () => {
  const source = fixture();
  source['index.html'] = strToU8('<script src="./src/main.ts"></script>');
  assert.throws(() => createPublishedZip(source), /uncompiled source HTML/);
  const missing = fixture();
  delete missing['assets/index-test.js'];
  assert.throws(() => createPublishedZip(missing), /Missing or empty/);
});

test('requires portable URLs, responsive CSS after base, and coherent model bytes', () => {
  const optimized = fixture();
  optimized['assets/index-test.css'] = strToU8('.workshop-shell{}.share-strip{}.share-actions{}@media(width<=1100px){}@media(width<=620px){}');
  assert.doesNotThrow(() => assertPublishedArchive(optimized));
  const absolute = fixture();
  absolute['index.html'] = strToU8(new TextDecoder().decode(absolute['index.html']).replace('./assets/index-test.js', '/assets/index-test.js'));
  assert.throws(() => assertPublishedArchive(absolute), /Non-portable/);
  const badOrder = fixture();
  badOrder['assets/index-test.css'] = strToU8('.share-strip{}.share-actions{}@media(max-width:1100px){}@media(max-width:620px){}.workshop-shell{}');
  assert.throws(() => assertPublishedArchive(badOrder), /CSS must follow/);
  const missingModel = fixture();
  delete missingModel['assets/workshop/test.glb'];
  assert.throws(() => assertPublishedArchive(missingModel), /model/);
});

test('forbids instructions, credentials, traversal, and the archive itself in a public ZIP', () => {
  for (const name of ['AGENTS.md', 'assets/AGENTS.md', '.env.local', 'credentials.json', 'assets/api-token.json', '../private.txt', 'assets/workshop/hryah-workshop-pack.zip']) {
    assert.throws(() => createPublishedZip({ ...fixture(), [name]: strToU8('must stay private') }));
  }
});

test('build output cannot erase source, repository ancestors, or unrelated directories', () => {
  for (const directory of ['.', '..', '../..', 'src', 'scripts', 'generated', 'exports']) {
    assert.throws(() => outputArgument(['--out-dir', directory]), /Unsafe build output/);
  }
  assert(outputArgument(['--out-dir', 'exports/release']).endsWith('release'));
});

test('generation removes obsolete models without deleting other generated data', () => {
  const root = mkdtempSync(join(tmpdir(), 'hryah-workshop-stale-'));
  try {
    const target = join(root, 'generated/assets/workshop');
    mkdirSync(join(target, 'modules'), { recursive: true });
    writeFileSync(join(target, 'modules/obsolete.glb'), 'stale model');
    writeFileSync(join(target, 'obsolete.json'), 'stale metadata');
    writeFileSync(join(root, 'generated/keep.txt'), 'other generated data');
    writeFileSync(join(root, 'keep.txt'), 'source data');
    resetGeneratedAssetsDirectory(root);
    assert.deepEqual(readdirSync(target), []);
    assert(!existsSync(join(target, 'modules/obsolete.glb')));
    assert.equal(readFileSync(join(root, 'generated/keep.txt'), 'utf8'), 'other generated data');
    assert.equal(readFileSync(join(root, 'keep.txt'), 'utf8'), 'source data');
  } finally {
    // This exact temporary root was created above by this test.
    rmSync(root, { recursive: true, force: true });
  }
});

test('default and explicit build outputs reject junctions without touching their targets', () => {
  const lab = mkdtempSync(join(tmpdir(), 'hryah-workshop-junction-'));
  const protectedDirectory = join(lab, 'protected');
  mkdirSync(protectedDirectory);
  writeFileSync(join(protectedDirectory, 'keep.txt'), 'must remain unchanged');
  try {
    const scenarios = [
      { path: 'dist', args: [] },
      { path: 'exports/release', args: ['--out-dir', 'exports/release'] },
      { path: 'exports', args: ['--out-dir', 'exports/release'] },
    ];
    for (const [index, scenario] of scenarios.entries()) {
      const root = join(lab, `package-${index}`);
      const link = join(root, scenario.path);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(protectedDirectory, link, process.platform === 'win32' ? 'junction' : 'dir');
      try {
        assert.throws(() => outputArgument(scenario.args, root), /redirected output directory/);
        assert.equal(readFileSync(join(protectedDirectory, 'keep.txt'), 'utf8'), 'must remain unchanged');
      } finally {
        unlinkSync(link);
      }
    }
  } finally {
    // Junctions were explicitly unlinked above; this exact lab was created by the test.
    rmSync(lab, { recursive: true, force: true });
  }
});
