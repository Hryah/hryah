import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Preserve the canonical workshop export, including its embedded PBR materials.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'nikita models/assets/workshop/consoles/console-power.glb');
const destination = resolve(root, 'public/assets/room/console-power.glb');
const manifest = JSON.parse(readFileSync(resolve(root, 'nikita models/manifest.json'), 'utf8'));
const entry = manifest.assets.find((asset) => asset.id === 'console-power');
assert(entry, 'Missing canonical console manifest entry');
const bytes = readFileSync(source);
assert(bytes.length === entry.byteSize && bytes.toString('ascii', 0, 4) === 'glTF', 'Invalid canonical console');
assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--check'), 'Usage: node scripts/room-assets.mjs [--check]');
if (process.argv[2] !== '--check') {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
assert(existsSync(destination) && readFileSync(destination).equals(bytes), 'Room console differs; run node scripts/room-assets.mjs');
console.log('Room console matches canonical workshop GLB (264 triangles, embedded materials).');
