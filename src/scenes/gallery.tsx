// gallery.tsx — перегляд сцен на вигаданих даних (#gallery). Вид сам змінюється в часі,
// тож сцену можна розробляти й дивитись, не граючи в гру.
import { useEffect, useState } from 'react';
import type { SlotId } from '../core/contracts';
import catalog from '../data/catalog.json';
import { StageCanvas } from '../render/StageCanvas';
import { css } from '../render/palette';
import { t } from '../ui/text';
import { createDesignScene } from './design-scene';
import { createOrbitScene } from './orbit-scene';
import { createTestScene, type TestView } from './test-scene';
import type { DesignView, OrbitView } from './views';

type EntryId = 'engine' | 'orbit' | 'design';
const ENTRIES: EntryId[] = ['engine', 'orbit', 'design'];
const ORBIT_STAGE = { viewHeightUnits: 6.5 };
const DESIGN_STAGE = { viewHeightUnits: 8 };
const DESIGN_SLOTS: SlotId[] = ['engine', 'solar', 'battery', 'antenna', 'instrument'];

/** Секунди від відкриття галереї; оновлюється кілька разів на секунду, цього досить для вигаданого виду. */
function useElapsedS(active: boolean): number {
  const [elapsedS, setElapsedS] = useState(0);
  useEffect(() => {
    if (!active) return;
    const stepMs = 250;
    const timer = setInterval(() => setElapsedS((s) => s + stepMs / 1000), stepMs);
    return () => clearInterval(timer);
  }, [active]);
  return elapsedS;
}

// Вигадані види: цикл 40 с, щоб за один перегляд побачити всі стани.
export function fakeTestView(tS: number): TestView {
  const phase = Math.floor(tS / 4) % 2;
  return { spinRadS: phase === 0 ? 0.8 : 2.4, spriteLiftUnits: phase === 0 ? 0 : 1.2 };
}

export function fakeOrbitView(tS: number): OrbitView {
  const cycleS = tS % 40;
  const failed = cycleS >= 36;
  return {
    eclipseFraction: 0.36,
    passFraction: 0.16,
    chargeFraction: failed ? 0 : 0.55 + 0.45 * Math.cos((cycleS / 20) * Math.PI * 2),
    linkActive: cycleS < 22 || cycleS >= 30,
    cameraActive: cycleS < 30,
    safeMode: cycleS >= 28 && cycleS < 34,
    storm: cycleS >= 12 && cycleS < 20,
    status: failed ? 'failed' : 'active',
  };
}

/** Вигаданий вид проєктування: кожні 3 с один слот переходить до наступного модуля з каталогу. */
export function fakeDesignView(tS: number): DesignView {
  const cycleS = tS % 40;
  const step = Math.floor(tS / 3);
  const modules = {} as Record<SlotId, string>;
  const alerts = {} as Record<SlotId, boolean>;
  DESIGN_SLOTS.forEach((slot, i) => {
    const ids = catalog.modules.filter((m) => m.slot === slot).map((m) => m.id);
    const changes = step >= i ? Math.floor((step - i) / DESIGN_SLOTS.length) + 1 : 0;
    modules[slot] = ids[changes % Math.max(1, ids.length)] ?? '';
    // Тривога в кожного слота свого вікна: слоти по черзі червоніють на 6 с.
    alerts[slot] = cycleS >= 4 + i * 6 && cycleS < 10 + i * 6 && cycleS < 34;
  });
  return { modules, alerts, launchBlocked: cycleS >= 10 && cycleS < 16, confirmed: cycleS >= 35 };
}

export function Gallery({ active }: { active: boolean }) {
  const [entry, setEntry] = useState<EntryId>('engine');
  const elapsedS = useElapsedS(active);
  const fallback = t('ui.render.noWebgl');
  const orbit = fakeOrbitView(elapsedS);

  return (
    <section>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {ENTRIES.map((id) => (
          <button key={id} type="button" onClick={() => setEntry(id)} aria-pressed={entry === id}
            style={{ padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${css('starDim')}`,
              background: entry === id ? css('accent') : 'transparent', color: entry === id ? css('outline') : css('star') }}>
            {t(`ui.gallery.${id}`)}
          </button>
        ))}
      </div>
      <div style={{ height: 520, borderRadius: 8, overflow: 'hidden', border: `1px solid ${css('outline')}` }}>
        {entry === 'engine' && (
          <StageCanvas createScene={createTestScene} view={fakeTestView(elapsedS)} fallback={fallback} label={t('ui.gallery.engine')} />
        )}
        {entry === 'orbit' && (
          <StageCanvas createScene={createOrbitScene} view={orbit} fallback={fallback} options={ORBIT_STAGE} label={t('ui.gallery.orbit')} />
        )}
        {entry === 'design' && (
          <StageCanvas createScene={createDesignScene} view={fakeDesignView(elapsedS)} fallback={fallback} options={DESIGN_STAGE} label={t('ui.gallery.design')} />
        )}
      </div>
      {entry === 'orbit' && (
        <p style={{ color: css('starDim'), fontSize: 13 }}>
          {t('ui.gallery.orbitState', {
            charge: Math.round(orbit.chargeFraction * 100), storm: String(orbit.storm), link: String(orbit.linkActive),
            safe: String(orbit.safeMode), status: orbit.status,
          })}
        </p>
      )}
    </section>
  );
}
