import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoOrbit } from '../../core/orbit';
import texts from '../../data/texts.en.json';
import { MissionRunner } from './MissionRunner';
import { ART, ART_FALLBACK, DIRECTOR_PORTRAIT, artFor, PhaseCard, type PhaseCardId } from './PhaseCard';

const copy = texts as Record<string, string>;
const IDS: PhaseCardId[] = ['window', 'launch', 'orbit', 'orbitCargo', 'report', 'lost'];
const cardAssetFiles = Object.keys(import.meta.glob('../../../public/assets/cards/**/*', { eager: false })).map(
  (key) => key.replace(/^.*\/public\//, ''),
);

describe('phase cards', () => {
  it('has kicker, title, next and why text for every card', () => {
    for (const id of IDS) {
      for (const part of ['kicker', 'title', 'next', 'why']) expect(copy[`ui.card.${id}.${part}`], `${id}.${part}`).toBeTruthy();
    }
  });

  it('maps every phase card to a valid existing illustration asset', () => {
    expect(ART.window).toBe('assets/cards/window.svg');
    expect(ART.launch).toBe('assets/cards/launch.svg');
    expect(ART.orbit).toBe('assets/cards/orbit.svg');
    expect(ART.report).toBe('assets/cards/report.svg');
    expect(ART_FALLBACK.orbitCargo).toBe('orbit');
    expect(ART_FALLBACK.lost).toBe('report');

    const available = new Set(cardAssetFiles);
    for (const id of IDS) {
      const art = artFor(id);
      expect(art, `Art path for card ${id}`).toBeTruthy();
      expect(available.has(art!), `Asset file exists: ${art}`).toBe(true);
    }
  });

  it('has director portrait asset present on disk as PNG', () => {
    const available = new Set(cardAssetFiles);
    expect(DIRECTOR_PORTRAIT).toBe('assets/cards/director.png');
    expect(available.has(DIRECTOR_PORTRAIT!)).toBe(true);
  });

  it('renders illustration image and director portrait in PhaseCard markup', () => {
    const html = renderToStaticMarkup(
      <PhaseCard
        id="window"
        summary={[{ label: 'Status', value: 'OK' }]}
        sender={{ name: 'Flight Director', role: 'Mission Control' }}
        onContinue={() => {}}
      />,
    );
    expect(html).toContain('src="/assets/cards/window.svg"');
    expect(html).toContain('src="/assets/cards/director.png"');
  });

  it('opens the launch card before the real-time flight is mounted and renders launch art', () => {
    const { input } = createDemoOrbit();
    const html = renderToStaticMarkup(
      <MissionRunner agencyName="A" mission={input.mission} spec={input.spec} seeds={{ flight: 1, orbit: 2 }} active onReport={() => {}} />,
    );
    expect(html).toContain('data-testid="phase-card-launch"');
    expect(html).toContain('src="/assets/cards/launch.svg"');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('campaign-flight-overlay');
  });
});
