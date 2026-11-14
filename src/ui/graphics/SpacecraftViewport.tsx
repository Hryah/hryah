// SpacecraftViewport.tsx — Головний графічний в'юпорт гри, побудований поверх адаптерної архітектури темплейтів.
// Автоматично синхронізується з поточним станом гри (Design, Flight, Orbit, Debrief).

import { useState } from 'react';
import type { SlotId } from '../../core/contracts';
import { CompositeSpacecraftSvg, TemplateUnitView } from './adapters';
import { templateRegistry } from './registry';
import type { RenderMode, ViewportContext, VisualTemplate } from './types';

const SLOT_ORDER: readonly SlotId[] = ['instrument', 'solar', 'battery', 'antenna', 'engine'];

export interface SpacecraftViewportProps {
  readonly context: ViewportContext;
}

export function SpacecraftViewport({ context }: SpacecraftViewportProps) {
  const [renderMode, setRenderMode] = useState<RenderMode>('auto');
  const [selectedSlot, setSelectedSlot] = useState<SlotId>('instrument');
  const [inspectTarget, setInspectTarget] = useState<'slot' | 'bus' | 'launcher' | 'body' | 'astronaut'>('slot');

  const assembly = templateRegistry.buildAssembly(context);

  let activeTemplate: VisualTemplate;
  let activeDamaged = false;
  if (inspectTarget === 'bus') {
    activeTemplate = assembly.busTemplate;
  } else if (inspectTarget === 'launcher') {
    activeTemplate = assembly.launcherTemplate;
  } else if (inspectTarget === 'body') {
    activeTemplate = assembly.bodyTemplate;
  } else if (inspectTarget === 'astronaut') {
    activeTemplate = templateRegistry.getTemplate('char:astronaut');
  } else {
    const slotInfo = assembly.attachedModules[selectedSlot];
    activeTemplate = slotInfo.template;
    activeDamaged = slotInfo.damageSeverity > 0;
  }

  return (
    <div
      style={{
        background: '#141829',
        borderRadius: 12,
        padding: 16,
        border: '1px solid #2a2f4a',
      }}
    >
      {/* Верхня панель перемикання режимів адаптера */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div>
          <strong style={{ fontSize: 15 }}>🛰️ Графічний адаптер · Збірка та 3D-темплейти</strong>
          <div style={{ fontSize: 11, color: '#8a90a8' }}>
            Автоматична прив&apos;язка стану гри до 3D GLB (NASA/Kenney), текстур планет та SVG-схем
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['auto', '3d', 'sprite', 'blueprint'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setRenderMode(m)}
              style={{
                padding: '4px 9px',
                borderRadius: 6,
                border: `1px solid ${renderMode === m ? '#5ca8ff' : '#2a2f4a'}`,
                background: renderMode === m ? '#1b2644' : 'transparent',
                color: renderMode === m ? '#5ca8ff' : '#8a90a8',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: renderMode === m ? 700 : 400,
              }}
            >
              {m === 'auto' ? 'Auto' : m === '3d' ? '3D GLB' : m === 'sprite' ? '2D/Tex' : 'Blueprint'}
            </button>
          ))}
        </div>
      </div>

      {/* Основна сітка: зліва композитне креслення збірки, справа інспектор обраного 3D/2D темплейту */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 1.4fr) minmax(220px, 1fr)',
          gap: 14,
          alignItems: 'start',
        }}
      >
        <div>
          <CompositeSpacecraftSvg
            assembly={assembly}
            altKm={context.flight?.orbit.altKm ?? context.design.altKm}
            fuelKg={context.flight?.fuelLeftKg ?? context.design.fuelKg}
            selectedSlot={inspectTarget === 'slot' ? selectedSlot : null}
            onSelectSlot={(slot) => {
              setInspectTarget('slot');
              setSelectedSlot(slot);
            }}
          />

          {/* Швидкий вибір вузла для огляду в 3D */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {SLOT_ORDER.map((slot) => {
              const mod = assembly.attachedModules[slot];
              const isSelected = inspectTarget === 'slot' && selectedSlot === slot;
              return (
                <button
                  key={slot}
                  onClick={() => {
                    setInspectTarget('slot');
                    setSelectedSlot(slot);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    cursor: 'pointer',
                    border: `1px solid ${isSelected ? mod.template.blueprint.accentColor : '#2a2f4a'}`,
                    background: isSelected ? '#1e293b' : 'transparent',
                    color: 'inherit',
                  }}
                >
                  {slot}: <strong>{mod.moduleId}</strong>
                </button>
              );
            })}
            <button
              onClick={() => setInspectTarget('bus')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer',
                border: `1px solid ${inspectTarget === 'bus' ? '#eab308' : '#2a2f4a'}`,
                background: inspectTarget === 'bus' ? '#1e293b' : 'transparent',
                color: 'inherit',
              }}
            >
              Корпус
            </button>
            <button
              onClick={() => setInspectTarget('launcher')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer',
                border: `1px solid ${inspectTarget === 'launcher' ? '#f97316' : '#2a2f4a'}`,
                background: inspectTarget === 'launcher' ? '#1e293b' : 'transparent',
                color: 'inherit',
              }}
            >
              Носій: <strong>{context.design.launcherId}</strong>
            </button>
            <button
              onClick={() => setInspectTarget('body')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer',
                border: `1px solid ${inspectTarget === 'body' ? '#38bdf8' : '#2a2f4a'}`,
                background: inspectTarget === 'body' ? '#1e293b' : 'transparent',
                color: 'inherit',
              }}
            >
              Планета: <strong>{context.mission.body.name}</strong>
            </button>
            <button
              onClick={() => setInspectTarget('astronaut')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer',
                border: `1px solid ${inspectTarget === 'astronaut' ? '#f59e0b' : '#2a2f4a'}`,
                background: inspectTarget === 'astronaut' ? '#1e293b' : 'transparent',
                color: 'inherit',
              }}
            >
              🧑‍🚀 Астронавт
            </button>
          </div>
        </div>

        {/* Картка активного темплейту з 3D-в'ювером */}
        <div
          style={{
            background: '#0e1220',
            borderRadius: 10,
            padding: 12,
            border: '1px solid #232842',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
            {activeTemplate.displayName}
          </div>
          <div style={{ fontSize: 11, color: '#8a90a8', marginBottom: 8 }}>
            ID: <code>{activeTemplate.id}</code> · Пак: {activeTemplate.packName ?? 'Custom'}
          </div>

          <TemplateUnitView
            key={`${activeTemplate.id}-${renderMode}`}
            template={activeTemplate}
            mode={renderMode}
            width={240}
            height={175}
            damaged={activeDamaged}
          />

          <div style={{ marginTop: 8, fontSize: 10, color: '#8a90a8', lineHeight: 1.45 }}>
            {activeTemplate.model3d && (
              <div>
                📦 3D: <code>{activeTemplate.model3d.url}</code>
              </div>
            )}
            {activeTemplate.planetTextures && (
              <div>
                🌍 Tex: <code>{activeTemplate.planetTextures.dayMapUrl}</code>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
