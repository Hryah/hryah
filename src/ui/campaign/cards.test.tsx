import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoOrbit } from '../../core/orbit';
import texts from '../../data/texts.en.json';
import { MissionRunner } from './MissionRunner';
import type { PhaseCardId } from './PhaseCard';

const copy = texts as Record<string, string>;
const IDS: PhaseCardId[] = ['window', 'launch', 'orbit', 'orbitCargo', 'report', 'lost'];

describe('phase cards', () => {
  it('has kicker, title, next and why text for every card', () => {
    for (const id of IDS) {
      for (const part of ['kicker', 'title', 'next', 'why']) expect(copy[`ui.card.${id}.${part}`], `${id}.${part}`).toBeTruthy();
    }
  });

  it('opens the launch card before the real-time flight is mounted', () => {
    const { input } = createDemoOrbit();
    const html = renderToStaticMarkup(
      <MissionRunner agencyName="A" mission={input.mission} spec={input.spec} seeds={{ flight: 1, orbit: 2 }} active onReport={() => {}} />,
    );
    expect(html).toContain('data-testid="phase-card-launch"');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('campaign-flight-overlay');
  });
});
