import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { newConsortium, type Market } from '../../core/consortium';
import { designPhase } from '../../core/design';
import type { AgencyProfile } from '../../core/design/agency';
import { newGame } from '../../core/game';
import { SAMPLE_CATALOG, SAMPLE_MISSION } from '../../core/stubs';
import agencies from '../../data/agencies.json';
import market from '../../data/market.json';
import { PlayScreen } from '../play/PlayScreen';
import { Turn } from './ConsortiumScreen';
import { DesignScreen } from './DesignScreen';
import { DesignStage } from './DesignStage';

vi.mock('../../render/StageCanvas', () => ({
  StageCanvas: ({ active = true }: { active?: boolean }) => <canvas data-active={String(active)} />,
}));

describe('активність сцени проєктування', () => {
  const input = { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG };
  const state = designPhase.init(input, 7);

  it.each([true, false])('передає active=%s з усіх екранів до полотна', (active) => {
    const game = newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7);
    const consortium = newConsortium(input, market as Market, [agencies.borealis as AgencyProfile], undefined, 7);
    const screens = [
      <DesignStage state={state} active={active} />,
      <DesignScreen state={state} active={active} editable dispatch={() => {}} />,
      <PlayScreen game={game} active={active} setGame={() => {}} />,
      <Turn state={consortium} active={active} dispatch={() => {}} />,
    ];
    for (const screen of screens) {
      expect(renderToStaticMarkup(screen)).toContain(`data-active="${active}"`);
    }
  });

  it('на пульті апарат видно завжди: сцена активна з будь-якою вкладкою палуби й призупинена лише з неактивним екраном', () => {
    const consortium = newConsortium({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, market as Market, [agencies.borealis as AgencyProfile]);
    const shown = renderToStaticMarkup(<Turn state={consortium} active={true} initialTab="factory" dispatch={() => {}} />);
    expect(shown).toContain('id="mc-panel-design"');
    expect(shown).toContain('data-active="true"');
    const hidden = renderToStaticMarkup(<Turn state={consortium} active={false} initialTab="factory" dispatch={() => {}} />);
    expect(hidden).toContain('data-active="false"');
    expect(hidden).not.toContain('data-active="true"');
  });
});
