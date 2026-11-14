import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createBeam, disposeObject, setBeam } from './primitives';

describe('промінь', () => {
  it('показує новий промінь і відновлює його після нульової довжини', () => {
    const beam = createBeam('accent');
    const from = new Vector3(1, 2, 3);
    const to = new Vector3(1, 6, 3);
    expect(beam.visible).toBe(false);
    setBeam(beam, from, to);
    expect(beam.visible).toBe(true);
    expect(beam.position).toEqual(new Vector3(1, 4, 3));
    expect(beam.scale.y).toBe(4);
    setBeam(beam, from, from);
    expect(beam.visible).toBe(false);
    setBeam(beam, to, from);
    expect(beam.visible).toBe(true);
    expect(beam.scale.y).toBe(4);
    expect(from).toEqual(new Vector3(1, 2, 3));
    expect(to).toEqual(new Vector3(1, 6, 3));
    disposeObject(beam);
  });
});
