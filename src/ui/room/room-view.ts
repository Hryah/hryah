import type { RoomFacing } from '../../core/flight/room';

/** Presentation mapping for a fixed 45-degree camera; core normalizes velocity. */
export function screenMovement(keys: ReadonlySet<string>, facing: RoomFacing) {
  const horizontal = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const vertical = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
  return {
    x: (horizontal + vertical) * Math.SQRT1_2,
    z: (vertical - horizontal) * Math.SQRT1_2,
    facing,
  };
}

export function facingForKey(code: string): RoomFacing | null {
  return code === 'KeyW' ? 'back' : code === 'KeyS' ? 'front' :
    code === 'KeyA' ? 'left' : code === 'KeyD' ? 'right' : null;
}

export function roomAssetUrl(path: string, base: string, pageUrl: string): string {
  return new URL(path, new URL(base, pageUrl)).href;
}

export interface AstronautTextures {
  widthPx: number;
  heightPx: number;
  visibleHeightPx: number;
  pivot: { x: number; y: number };
  frames: Record<RoomFacing, string>;
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid astronaut manifest');
  return value as Record<string, unknown>;
};
const positive = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('Invalid astronaut dimensions');
  return value;
};

/** Read only the published texture contract, never assumptions about source SVG bounds. */
export function parseAstronautTextures(value: unknown): AstronautTextures {
  const manifest = record(value);
  if (manifest.schemaVersion !== 1 || manifest.runtimeReady !== true) throw new Error('Unsupported astronaut manifest');
  const canvas = record(manifest.canvas);
  const pivot = record(manifest.pivot);
  const pivotX = positive(pivot.x);
  const pivotY = positive(pivot.y);
  if (pivotX > 1 || pivotY > 1) throw new Error('Invalid astronaut pivot');
  const directions = record(manifest.directions);
  const frames = {} as Record<RoomFacing, string>;
  for (const direction of ['front', 'back', 'left', 'right'] as const) {
    const idle = record(record(record(directions[direction]).states).idle);
    const frame = Array.isArray(idle.frames) ? idle.frames[0] as unknown : null;
    if (typeof frame !== 'string' || !frame.startsWith('assets/astronaut/') || frame.includes('..') || frame.includes('\\')) {
      throw new Error(`Invalid astronaut frame: ${direction}`);
    }
    frames[direction] = frame;
  }
  return {
    widthPx: positive(canvas.widthPx), heightPx: positive(canvas.heightPx),
    visibleHeightPx: positive(manifest.visibleHeightPx), pivot: { x: pivotX, y: pivotY }, frames,
  };
}
