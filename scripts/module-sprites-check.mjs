import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const baseCatalog = JSON.parse(readFileSync(resolve(root, 'src/data/catalog.json'), 'utf8'));
const BASE_MODULE_IDS = baseCatalog.modules.map((m) => m.id);

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPngMetadata(filePath) {
  const bytes = readFileSync(filePath);
  assert(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${filePath}: invalid PNG signature`);

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let compressionMethod = -1;
  let filterMethod = -1;
  let interlaceMethod = -1;
  const idatChunks = [];

  while (pos + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString('ascii', pos + 4, pos + 8);
    const data = bytes.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      compressionMethod = data[10];
      filterMethod = data[11];
      interlaceMethod = data[12];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }

  assert(width >= 64 && width <= 2048, `${filePath}: unexpected width ${width} (expected 64..2048)`);
  assert(height >= 64 && height <= 2048, `${filePath}: unexpected height ${height} (expected 64..2048)`);
  assert.equal(bitDepth, 8, `${filePath}: expected 8-bit depth`);
  assert.equal(colorType, 6, `${filePath}: expected RGBA colorType 6 (got ${colorType})`);
  assert.equal(compressionMethod, 0, `${filePath}: expected compression method 0`);
  assert.equal(filterMethod, 0, `${filePath}: expected filter method 0`);
  assert.equal(interlaceMethod, 0, `${filePath}: expected non-interlaced PNG (IHDR[12] === 0, got ${interlaceMethod})`);

  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * 4;
  // Unfilter minimal check: count transparent alpha bytes directly on type-0 rows, or reconstruct alpha channel.
  const bpp = 4;
  const recon = Buffer.alloc(height * stride);
  let src = 0;
  let transparentCount = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[src++];
      const a = x >= bpp ? recon[rowStart + x - bpp] : 0;
      const b = y > 0 ? recon[rowStart - stride + x] : 0;
      const c = y > 0 && x >= bpp ? recon[rowStart - stride + x - bpp] : 0;
      let out = val;
      if (filter === 1) out = (val + a) & 0xff;
      else if (filter === 2) out = (val + b) & 0xff;
      else if (filter === 3) out = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        out = (val + pr) & 0xff;
      }
      recon[rowStart + x] = out;
      if ((x & 3) === 3 && out === 0) transparentCount++;
    }
  }
  const transparentRatio = transparentCount / (width * height);
  assert(transparentRatio > 0.05, `${filePath}: expected transparent background pixels (ratio ${transparentRatio.toFixed(3)})`);

  return { width, height, transparentRatio };
}

const manifest = JSON.parse(readFileSync(resolve(root, 'src/data/sprites.json'), 'utf8'));
const seenModuleFiles = new Map();

for (const [id, def] of Object.entries(manifest)) {
  if (typeof def?.file === 'string' && def.file.startsWith('modules/')) {
    const prev = seenModuleFiles.get(def.file);
    assert(!prev, `Duplicate module sprite mapping: ${id} and ${prev} both point to ${def.file}`);
    seenModuleFiles.set(def.file, id);
  }
}
assert.equal(seenModuleFiles.size, BASE_MODULE_IDS.length, 'sprites.json module file count must match catalog.json base modules');

for (const id of BASE_MODULE_IDS) {
  const svgPath = resolve(root, 'public/assets/templates/design', `${id}.svg`);
  assert(existsSync(svgPath), `Missing design SVG: ${svgPath}`);
  const svg = readFileSync(svgPath, 'utf8');
  assert(/<svg\b[^>]*>/i.test(svg), `${id}.svg: missing <svg> root`);
  assert(!/<rect\b[^>]*width="1024"[^>]*height="1024"/i.test(svg), `${id}.svg: solid 1024x1024 background <rect> detected`);
  assert(!/fill=["']#fdfbf7["']/i.test(svg), `${id}.svg: parchment background #fdfbf7 still present`);

  const pngRel = `modules/${id}.png`;
  const pngPath = resolve(root, 'public/assets/sprites', pngRel);
  assert(existsSync(pngPath), `Missing 2x transparent module sprite: ${pngPath}`);
  readPngMetadata(pngPath);

  assert.equal(manifest[id]?.file, pngRel, `src/data/sprites.json entry for ${id} must point to ${pngRel}`);
}

console.log(`Verified ${BASE_MODULE_IDS.length} module SVGs (no opaque background) and ${BASE_MODULE_IDS.length} transparent 2x module PNGs matching src/data/sprites.json.`);
