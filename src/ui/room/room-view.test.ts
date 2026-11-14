import { describe, expect, it } from 'vitest';
import { facingForKey, parseAstronautTextures, roomAssetUrl, screenMovement } from './room-view';

describe('room presentation contract', () => {
  it('maps screen controls to a fixed isometric camera without implementing physics', () => {
    const up = screenMovement(new Set(['KeyW']), 'back');
    expect(up.x).toBeCloseTo(-Math.SQRT1_2);
    expect(up.z).toBeCloseTo(-Math.SQRT1_2);
    const right = screenMovement(new Set(['KeyD']), 'right');
    expect(right.x).toBeCloseTo(Math.SQRT1_2);
    expect(right.z).toBeCloseTo(-Math.SQRT1_2);
    expect(screenMovement(new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD']), 'front')).toEqual({ x: 0, z: 0, facing: 'front' });
    expect(facingForKey('KeyA')).toBe('left');
    expect(facingForKey('KeyQ')).toBeNull();
  });

  it('keeps renderer resources beneath root and experimental deployment bases', () => {
    expect(roomAssetUrl('assets/astronaut/front.svg', '/experimental/', 'https://example.org/experimental/#room'))
      .toBe('https://example.org/experimental/assets/astronaut/front.svg');
    expect(roomAssetUrl('assets/room/console-power.glb', './', 'https://example.org/preview/index.html#room'))
      .toBe('https://example.org/preview/assets/room/console-power.glb');
  });

  it('requires all four published directions and a safe shared pivot', () => {
    const manifest = {
      schemaVersion: 1, runtimeReady: true, canvas: { widthPx: 1024, heightPx: 1024 },
      visibleHeightPx: 840, pivot: { x: 0.5, y: 0.92 }, directions: Object.fromEntries(
        ['front', 'back', 'left', 'right'].map((d) => [d, { states: { idle: { frames: [`assets/astronaut/${d}.svg`] } } }]),
      ),
    };
    const result = parseAstronautTextures(manifest);
    expect(result.frames.back).toBe('assets/astronaut/back.svg');
    expect(result.pivot.y).toBe(0.92);
    expect(() => parseAstronautTextures({ ...manifest, pivot: { x: 0.5, y: 2 } })).toThrow();
    expect(() => parseAstronautTextures({ ...manifest, directions: {} })).toThrow();
  });
});
