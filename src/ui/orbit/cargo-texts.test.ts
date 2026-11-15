import { describe, expect, it } from 'vitest';
import orbitTexts from './texts.en.json';
import type { CargoKind } from '../../core/contracts';

const copy = orbitTexts as Record<string, string>;
const KINDS: CargoKind[] = ['water', 'food', 'parts', 'experiment'];

describe('cargo orbit texts', () => {
  it('names every container in the delivery log instead of a raw cargo kind', () => {
    for (const kind of KINDS) {
      const text = copy[`orbit.cargo.delivered.${kind}`];
      expect(text, kind).toBeTruthy();
      expect(text).not.toContain('{cargoKind}');
    }
  });

  it('has cargo wording for overflow, cold-lock risks and the success banner', () => {
    for (const key of ['clarity.risk.overflowCargo', 'clarity.risk.coldCargo', 'ui.successDescriptionCargo']) {
      expect(copy[key], key).toBeTruthy();
      expect(copy[key]).not.toMatch(/imagery|camera/i);
    }
  });
});
