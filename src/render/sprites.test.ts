import { describe, expect, it } from 'vitest';
import rawManifest from '../data/sprites.json';
import catalog from '../data/catalog.json';
import { palette } from './palette';
import { parseManifest, placeholderColor, resolveSprite } from './sprites';

describe('маніфест спрайтів', () => {
  const manifest = parseManifest(rawManifest);

  it('кожен запис файла даних коректний', () => {
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(rawManifest).sort());
    for (const def of Object.values(manifest)) {
      expect(def.file).toMatch(/\.png$/);
      for (const a of def.anchor) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  it('кожен модуль каталогу і корпус мають запис', () => {
    for (const module of catalog.modules) expect(manifest[module.id], module.id).toBeDefined();
    expect(manifest.bus).toBeDefined();
  });

  it('невідомий id дає заглушку без файла', () => {
    expect(resolveSprite('no-such-sprite', manifest)).toEqual({ file: null, widthUnits: 1, anchor: [0.5, 0.5] });
    expect(resolveSprite('bus', manifest).file).toBe('spacecraft/bus.png');
  });

  it('неповні записи відкидаються', () => {
    expect(parseManifest({
      a: { file: 'a.png', widthUnits: 1, anchor: [0.5] },
      b: { widthUnits: 1, anchor: [0, 0] },
      c: { file: 'c.png', widthUnits: 0, anchor: [0, 0] },
    })).toEqual({});
  });

  it('колір заглушки стабільний і з палітри', () => {
    expect(placeholderColor('cam-m')).toBe(placeholderColor('cam-m'));
    expect(palette[placeholderColor('cam-m')]).toBeTypeOf('number');
  });
});
