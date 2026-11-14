import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { strFromU8, strToU8, zipSync, unzipSync } from 'fflate';
import { archivePath } from './paths.mjs';

const text = (files, name) => {
  assert(files[name]?.length > 0, `Missing or empty published file: ${name}`);
  return strFromU8(files[name]);
};

export function normalizePublishedText(files) {
  const textExtensions = new Set(['.html', '.js', '.css', '.json', '.md', '.mjs', '.ts']);
  return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [
    name,
    textExtensions.has(extname(name)) ? strToU8(strFromU8(bytes).replace(/\r\n?/g, '\n')) : bytes,
  ]));
}

export function collectPublishedFiles(directory) {
  // Explicit allowlist: source instructions, private docs, and unrelated public files stay out.
  const files = {};
  const add = (relative) => {
    const absolute = resolve(directory, relative);
    assert(!lstatSync(absolute).isSymbolicLink(), `Symlink in published output: ${relative}`);
    files[relative] = new Uint8Array(readFileSync(absolute));
  };
  for (const name of ['index.html', 'manifest.json', 'README.md', 'REPORT.md', 'serve.mjs', 'examples/import-and-animate.ts']) add(name);
  const walkAssets = (relative) => {
    for (const item of readdirSync(resolve(directory, relative), { withFileTypes: true })) {
      const path = `${relative}/${item.name}`;
      assert(!item.isSymbolicLink(), `Symlink in published output: ${path}`);
      if (item.isDirectory()) walkAssets(path);
      else if (path !== archivePath) {
        assert(['.js', '.css', '.json', '.glb'].includes(extname(path)), `Unexpected public asset: ${path}`);
        add(path);
      }
    }
  };
  walkAssets('assets');
  return files;
}

export function assertPublishedArchive(files) {
  const names = Object.keys(files);
  for (const name of names) {
    assert(!name.startsWith('/') && !name.split('/').includes('..') && !name.includes('\\'), `Unsafe archive path: ${name}`);
    assert(!/(?:^|\/)(?:AGENTS\.md|\.env[^/]*|package-lock\.json|package\.json|.*credentials.*|.*token.*)$/i.test(name), `Private/source file in archive: ${name}`);
    assert(name !== archivePath && !name.endsWith('.zip'), 'Archive must not contain itself or other archives');
  }
  const html = text(files, 'index.html');
  text(files, 'README.md');
  text(files, 'REPORT.md');
  text(files, 'serve.mjs');
  const adapter = text(files, 'examples/import-and-animate.ts');
  assert(adapter.includes('GLTFLoader') && adapter.includes('WorkshopAnimationController'), 'Missing real import adapter');
  assert(!/from\s+['"]\.\.?\//.test(adapter), 'Published adapter must not depend on repo sources');
  assert(!html.includes('src/main.ts') && !html.includes('src/styles.css'), 'ZIP contains uncompiled source HTML');
  assert(html.includes('copy-preview-link') && html.includes('share-status'), 'Public share controls missing');
  assert(html.includes(`href="./${archivePath}"`), 'ZIP link must be relative to viewer');

  const linkedScripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  const linkedStyles = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"/g)].map((m) => m[1]);
  assert(linkedScripts.length > 0 && linkedStyles.length > 0, 'Missing compiled JS/CSS');
  const referenced = [...linkedScripts, ...linkedStyles];
  for (const base of ['https://example.org/', 'https://example.org/experimental/']) {
    for (const path of referenced) {
      assert(path.startsWith('./assets/'), `Non-portable compiled resource: ${path}`);
      const url = new URL(path, base);
      assert(url.href.startsWith(base), `Resource escapes deployment base: ${path}`);
      text(files, path.slice(2));
    }
  }
  const css = linkedStyles.map((path) => text(files, path.slice(2))).join('\n');
  assert(css.includes('.share-strip') && css.includes('.share-actions'), 'Public share styling missing');
  // Vite may lower max-width queries to equivalent modern range syntax.
  assert(/(?:max-width:\s*|width\s*<=\s*)1100px/.test(css) &&
    /(?:max-width:\s*|width\s*<=\s*)620px/.test(css), 'Responsive public layout missing');
  assert(css.lastIndexOf('.share-strip') > css.indexOf('.workshop-shell'), 'Public CSS must follow base stylesheet');
  const js = linkedScripts.map((path) => text(files, path.slice(2))).join('\n');
  assert(!js.includes('fetch("/assets/workshop/') && !js.includes("fetch('/assets/workshop/"), 'Root-relative ZIP fetch breaks nested deployments');

  const manifest = JSON.parse(text(files, 'manifest.json'));
  assert(manifest.assets?.length > 0, 'Empty manifest');
  const nestedManifest = JSON.parse(text(files, 'assets/workshop/manifest.json'));
  assert.deepEqual(nestedManifest, manifest, 'Viewer and download manifests diverged');
  for (const asset of manifest.assets) {
    const nestedPath = `assets/workshop/${asset.glbPath}`;
    const raw = files[nestedPath];
    assert(raw?.length === asset.byteSize, `Missing / wrong-sized model: ${nestedPath}`);
    assert.deepEqual(files[asset.zipPath], raw, `Manifest ZIP path missing / diverged: ${asset.zipPath}`);
  }
  return manifest;
}

export function createPublishedZip(files) {
  const normalized = normalizePublishedText(files);
  assertPublishedArchive(normalized);
  // Stable ordering and timestamp make the archive reproducible from the same sources/toolchain.
  return zipSync(Object.fromEntries(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, bytes]) => [name, [bytes, { mtime: new Date(2020, 0, 1) }]])), { level: 6 });
}

export function readPublishedZip(bytes) {
  const files = unzipSync(bytes);
  assertPublishedArchive(files);
  return files;
}
