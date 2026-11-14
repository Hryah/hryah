// adapters.tsx — Візуальні адаптери для рендерингу темплейтів у режимах:
// 1. '3d'        — інтерактивний 3D GLB рендер (NASA 3D Resources / Kenney Space Kit)
// 2. 'sprite'    — 2D спрайти або текстури з public/assets/
// 3. 'blueprint' — векторні інженерні схеми NASA-стилю (працюють без зовнішніх файлів)
// 4. 'auto'      — автоматичний вибір доступного представлення з плавним фолбеком

import { useCallback, useEffect, useState } from 'react';
import type { SlotId } from '../../core/contracts';
import { GlbModelCanvas } from './glb-viewer';
import { templateRegistry } from './registry';
import type {
  BlueprintSpec,
  RenderMode,
  SpacecraftVisualAssembly,
  VisualTemplate,
} from './types';

export interface BlueprintShapeProps {
  readonly spec: BlueprintSpec;
  readonly size?: number;
  readonly damaged?: boolean;
}

/** Векторний рендерер інженерних креслень для кожного типу модуля, ракети чи планети */
export function BlueprintShapeSvg({ spec, size = 72, damaged = false }: BlueprintShapeProps) {
  const { shape, primaryColor, secondaryColor, accentColor } = spec;
  const stroke = damaged ? '#ff5c7a' : accentColor;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Двигуни */}
      {shape === 'engine-cold' && (
        <g>
          <rect x="34" y="18" width="32" height="24" rx="4" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <polygon points="38,42 62,42 70,74 30,74" fill={secondaryColor} stroke={stroke} strokeWidth="2" />
          <ellipse cx="50" cy="82" rx="12" ry="6" fill={accentColor} opacity="0.55" />
        </g>
      )}
      {shape === 'engine-chem' && (
        <g>
          <rect x="30" y="14" width="40" height="26" rx="6" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <path d="M35,40 L65,40 L76,76 L24,76 Z" fill={secondaryColor} stroke={stroke} strokeWidth="2" />
          <polygon points="36,76 64,76 50,96" fill={accentColor} opacity="0.85" />
        </g>
      )}
      {shape === 'engine-ion' && (
        <g>
          <rect x="26" y="18" width="48" height="30" rx="6" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <ellipse cx="50" cy="56" rx="26" ry="10" fill={secondaryColor} stroke={stroke} strokeWidth="2" />
          <ellipse cx="50" cy="56" rx="16" ry="6" fill="#090d16" stroke={accentColor} strokeWidth="2" />
          <ellipse cx="50" cy="76" rx="20" ry="14" fill={accentColor} opacity="0.45" />
        </g>
      )}

      {/* Сонячні панелі */}
      {shape === 'solar-small' && (
        <g>
          <rect x="14" y="36" width="72" height="28" rx="3" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <line x1="38" y1="36" x2="38" y2="64" stroke={accentColor} strokeWidth="1.5" />
          <line x1="62" y1="36" x2="62" y2="64" stroke={accentColor} strokeWidth="1.5" />
          <line x1="14" y1="50" x2="86" y2="50" stroke={accentColor} strokeWidth="1.5" />
        </g>
      )}
      {shape === 'solar-medium' && (
        <g>
          <rect x="6" y="30" width="88" height="40" rx="3" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <line x1="28" y1="30" x2="28" y2="70" stroke={accentColor} strokeWidth="1.5" />
          <line x1="50" y1="30" x2="50" y2="70" stroke={accentColor} strokeWidth="2" />
          <line x1="72" y1="30" x2="72" y2="70" stroke={accentColor} strokeWidth="1.5" />
          <line x1="6" y1="50" x2="94" y2="50" stroke={accentColor} strokeWidth="1.5" />
        </g>
      )}
      {shape === 'solar-large' && (
        <g>
          <rect x="2" y="22" width="96" height="56" rx="4" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          {[22, 40, 50, 60, 78].map((x) => (
            <line key={x} x1={x} y1="22" x2={x} y2="78" stroke={accentColor} strokeWidth="1.5" />
          ))}
          <line x1="2" y1="40" x2="98" y2="40" stroke={accentColor} strokeWidth="1.5" />
          <line x1="2" y1="60" x2="98" y2="60" stroke={accentColor} strokeWidth="1.5" />
        </g>
      )}

      {/* Батареї */}
      {(shape === 'battery-small' || shape === 'battery-medium' || shape === 'battery-large') && (
        <g>
          <rect x="22" y="28" width="56" height="46" rx="6" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <rect x="36" y="20" width="10" height="8" rx="2" fill={secondaryColor} />
          <rect x="54" y="20" width="10" height="8" rx="2" fill={secondaryColor} />
          <rect x="28" y="36" width="12" height="30" rx="2" fill={secondaryColor} />
          {(shape === 'battery-medium' || shape === 'battery-large') && (
            <rect x="44" y="36" width="12" height="30" rx="2" fill={secondaryColor} />
          )}
          {shape === 'battery-large' && (
            <rect x="60" y="36" width="12" height="30" rx="2" fill={accentColor} />
          )}
        </g>
      )}

      {/* Антени */}
      {shape === 'antenna-whip' && (
        <g>
          <rect x="42" y="68" width="16" height="16" rx="3" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <line x1="50" y1="68" x2="50" y2="18" stroke={secondaryColor} strokeWidth="3.5" />
          <circle cx="50" cy="16" r="5" fill={accentColor} />
          <path d="M34,26 A20,20 0 0,1 66,26" fill="none" stroke={accentColor} strokeWidth="1.5" strokeDasharray="3 2" />
        </g>
      )}
      {shape === 'antenna-patch' && (
        <g>
          <rect x="24" y="30" width="52" height="40" rx="6" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <rect x="34" y="38" width="32" height="24" rx="3" fill={secondaryColor} />
          <circle cx="50" cy="50" r="6" fill={accentColor} />
        </g>
      )}
      {shape === 'antenna-dish' && (
        <g>
          <path d="M16,42 Q50,82 84,42" fill={primaryColor} stroke={stroke} strokeWidth="2.5" />
          <line x1="50" y1="62" x2="50" y2="24" stroke={secondaryColor} strokeWidth="3" />
          <circle cx="50" cy="22" r="6" fill={accentColor} />
          <line x1="26" y1="46" x2="50" y2="24" stroke={accentColor} strokeWidth="1.2" />
          <line x1="74" y1="46" x2="50" y2="24" stroke={accentColor} strokeWidth="1.2" />
          <rect x="42" y="62" width="16" height="20" rx="3" fill={secondaryColor} />
        </g>
      )}

      {/* Камери / інструменти */}
      {shape === 'camera-compact' && (
        <g>
          <rect x="28" y="32" width="44" height="36" rx="6" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <circle cx="50" cy="50" r="12" fill={secondaryColor} stroke={accentColor} strokeWidth="2" />
          <circle cx="50" cy="50" r="5" fill="#090d16" />
        </g>
      )}
      {shape === 'camera-medium' && (
        <g>
          <rect x="26" y="22" width="48" height="56" rx="6" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <circle cx="50" cy="46" r="16" fill={secondaryColor} stroke={accentColor} strokeWidth="2.5" />
          <circle cx="50" cy="46" r="8" fill="#090d16" />
          <circle cx="54" cy="42" r="3" fill={accentColor} />
        </g>
      )}
      {shape === 'camera-telescope' && (
        <g>
          <polygon points="30,78 70,78 64,26 36,26" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <ellipse cx="50" cy="26" rx="18" ry="7" fill={secondaryColor} stroke={accentColor} strokeWidth="2" />
          <ellipse cx="50" cy="26" rx="11" ry="4" fill="#090d16" />
          <line x1="33" y1="52" x2="67" y2="52" stroke={accentColor} strokeWidth="1.5" />
        </g>
      )}

      {/* Носії */}
      {(shape === 'launcher-small' || shape === 'launcher-medium' || shape === 'launcher-heavy') && (
        <g>
          <polygon points="50,8 62,28 38,28" fill={accentColor} stroke={stroke} strokeWidth="1.5" />
          <rect x="38" y="28" width="24" height="52" fill={secondaryColor} stroke={primaryColor} strokeWidth="2" />
          {shape === 'launcher-heavy' && (
            <>
              <rect x="24" y="42" width="12" height="38" rx="3" fill={secondaryColor} stroke={stroke} strokeWidth="1.5" />
              <rect x="64" y="42" width="12" height="38" rx="3" fill={secondaryColor} stroke={stroke} strokeWidth="1.5" />
            </>
          )}
          <polygon points="38,80 62,80 68,90 32,90" fill={primaryColor} />
        </g>
      )}

      {/* Корпус супутника */}
      {shape === 'satellite-bus' && (
        <g>
          <rect x="26" y="24" width="48" height="52" rx="6" fill={primaryColor} stroke={stroke} strokeWidth="2.5" />
          <line x1="26" y1="50" x2="74" y2="50" stroke={accentColor} strokeWidth="1.5" />
          <line x1="50" y1="24" x2="50" y2="76" stroke={accentColor} strokeWidth="1.5" />
        </g>
      )}

      {/* Планети */}
      {(shape === 'body-earth' || shape === 'body-moon') && (
        <g>
          <circle cx="50" cy="50" r="36" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <circle cx="38" cy="42" r="12" fill={secondaryColor} opacity="0.7" />
          <circle cx="60" cy="58" r="10" fill={secondaryColor} opacity="0.6" />
        </g>
      )}

      {/* Персонажі / Астронавти */}
      {(shape === 'character-astronaut' || shape === 'character-engineer') && (
        <g>
          <rect x="30" y="34" width="40" height="36" rx="4" fill={secondaryColor} stroke={stroke} strokeWidth="1.5" />
          <circle cx="50" cy="26" r="15" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <ellipse cx="50" cy="26" rx="10" ry="7" fill={accentColor} />
          <rect x="35" y="40" width="30" height="30" rx="6" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <rect x="42" y="47" width="16" height="10" rx="2" fill={secondaryColor} stroke={accentColor} strokeWidth="1.2" />
          <rect x="23" y="42" width="10" height="24" rx="5" fill={primaryColor} stroke={stroke} strokeWidth="1.5" />
          <rect x="67" y="42" width="10" height="24" rx="5" fill={primaryColor} stroke={stroke} strokeWidth="1.5" />
          <rect x="37" y="70" width="11" height="20" rx="4" fill={primaryColor} stroke={stroke} strokeWidth="1.5" />
          <rect x="52" y="70" width="11" height="20" rx="4" fill={primaryColor} stroke={stroke} strokeWidth="1.5" />
        </g>
      )}

      {/* Довільна фігура / проп */}
      {shape === 'prop-custom' && (
        <g>
          <polygon points="50,14 84,34 84,70 50,88 16,70 16,34" fill={primaryColor} stroke={stroke} strokeWidth="2" />
          <polyline points="16,34 50,52 84,34" fill="none" stroke={accentColor} strokeWidth="1.5" />
          <line x1="50" y1="52" x2="50" y2="88" stroke={accentColor} strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}

export interface TemplateUnitViewProps {
  readonly template: VisualTemplate;
  readonly mode?: RenderMode;
  readonly width?: number;
  readonly height?: number;
  readonly damaged?: boolean;
}

/**
 * Універсальний адаптер одиниці темплейту:
 * Перемикає між 3D GLB моделлю, 2D текстурою/спрайтом та інженерним SVG-кресленням.
 */
export function TemplateUnitView({
  template,
  mode = 'auto',
  width = 220,
  height = 160,
  damaged = false,
}: TemplateUnitViewProps) {
  const [glbFailed, setGlbFailed] = useState(false);
  const [spriteFailed, setSpriteFailed] = useState(false);

  const modelUrl = template.model3d?.url;
  const imgUrl = template.planetTextures?.dayMapUrl ?? template.sprite2d?.url;

  // Скидаємо стан фолбеку при зміні темплейту, URL асетів або режиму відображення
  useEffect(() => {
    setGlbFailed(false);
    setSpriteFailed(false);
  }, [template.id, modelUrl, imgUrl, mode]);

  const handleGlbFallback = useCallback(() => {
    setGlbFailed(true);
  }, []);

  const canTry3D = (mode === 'auto' || mode === '3d') && !!modelUrl && !glbFailed;
  const canTrySprite =
    (mode === 'sprite' || (mode === 'auto' && !canTry3D)) &&
    !!imgUrl &&
    !spriteFailed;

  if (canTry3D && modelUrl) {
    return (
      <GlbModelCanvas
        url={modelUrl}
        width={width}
        height={height}
        accentColor={damaged ? '#ff5c7a' : template.blueprint.accentColor}
        onFallback={handleGlbFallback}
      />
    );
  }

  if (canTrySprite && imgUrl) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#090c15',
          borderRadius: 8,
          overflow: 'hidden',
          border: `1px solid ${template.blueprint.accentColor}33`,
        }}
      >
        <img
          src={imgUrl}
          alt={template.displayName}
          onError={() => setSpriteFailed(true)}
          style={{
            maxWidth: '90%',
            maxHeight: '90%',
            objectFit: 'contain',
            borderRadius: template.category === 'body' ? '50%' : 4,
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#090c15',
        borderRadius: 8,
        border: `1px solid ${damaged ? '#ff5c7a' : template.blueprint.accentColor}33`,
      }}
    >
      <BlueprintShapeSvg spec={template.blueprint} size={Math.min(width, height) * 0.65} damaged={damaged} />
      <span style={{ fontSize: 10, color: '#8a90a8', marginTop: 4 }}>{template.blueprint.label}</span>
    </div>
  );
}

export interface EntityViewProps {
  readonly id: string;
  readonly mode?: RenderMode;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Однорядковий компонент для виводу будь-якого персонажа, фігури, ракети чи модуля за його ID:
 * Наприклад: <EntityView id="char:astronaut" />
 */
export function EntityView({ id, mode = 'auto', width = 200, height = 160 }: EntityViewProps) {
  const template = templateRegistry.getTemplate(id);
  return <TemplateUnitView template={template} mode={mode} width={width} height={height} />;
}

export interface CompositeSpacecraftSvgProps {
  readonly assembly: SpacecraftVisualAssembly;
  readonly altKm: number;
  readonly fuelKg: number;
  readonly selectedSlot?: SlotId | null;
  readonly onSelectSlot?: (slot: SlotId) => void;
}

/**
 * Композитний візуалізатор зібраного космічного апарата:
 * Динамічно монтує всі 5 обраних гравцем модулів на точки кріплення (socket.pos2d, socket.layerOrder)
 * із маніфесту visual-templates.json та показує ракету-носій поруч.
 */
export function CompositeSpacecraftSvg({
  assembly,
  altKm,
  fuelKg,
  selectedSlot,
  onSelectSlot,
}: CompositeSpacecraftSvgProps) {
  const { attachedModules, launcherTemplate, bodyTemplate, busTemplate } = assembly;
  const busCenter = attachedModules.solar.socket.pos2d;

  // Сортуємо слоти за порядком шарів (socket.layerOrder) із visual-templates.json
  const sortedSlots = (Object.keys(attachedModules) as SlotId[]).sort(
    (a, b) => attachedModules[a].socket.layerOrder - attachedModules[b].socket.layerOrder,
  );

  const renderSlotModule = (slot: SlotId) => {
    const mod = attachedModules[slot];
    const { pos2d, rotationDeg } = mod.socket;
    const { blueprint } = mod.template;
    const isSelected = selectedSlot === slot;
    const strokeColor = mod.damageSeverity > 0 ? '#ff5c7a' : isSelected ? '#ffffff' : blueprint.accentColor;
    const transform = `translate(${pos2d.x}, ${pos2d.y})${rotationDeg ? ` rotate(${rotationDeg})` : ''}`;

    if (slot === 'solar') {
      const wingSpan = Math.round(62 * blueprint.scaleFactor);
      const wingHeight = Math.round(28 * blueprint.scaleFactor);
      return (
        <g key={slot} transform={transform} onClick={() => onSelectSlot?.(slot)} style={{ cursor: 'pointer' }}>
          <rect
            x={-36 - wingSpan}
            y={-wingHeight / 2}
            width={wingSpan}
            height={wingHeight}
            rx="3"
            fill={blueprint.primaryColor}
            stroke={strokeColor}
            strokeWidth={isSelected ? 2.5 : 1.5}
          />
          <rect
            x={36}
            y={-wingHeight / 2}
            width={wingSpan}
            height={wingHeight}
            rx="3"
            fill={blueprint.primaryColor}
            stroke={strokeColor}
            strokeWidth={isSelected ? 2.5 : 1.5}
          />
          <line
            x1={-36 - wingSpan / 2}
            y1={-wingHeight / 2}
            x2={-36 - wingSpan / 2}
            y2={wingHeight / 2}
            stroke={blueprint.accentColor}
            strokeWidth="1"
          />
          <line
            x1={36 + wingSpan / 2}
            y1={-wingHeight / 2}
            x2={36 + wingSpan / 2}
            y2={wingHeight / 2}
            stroke={blueprint.accentColor}
            strokeWidth="1"
          />
          <text x={36 + wingSpan / 2} y={-wingHeight / 2 - 6} textAnchor="middle" fill="#93c5fd" fontSize="9" fontFamily="monospace">
            {blueprint.label}
          </text>
        </g>
      );
    }

    if (slot === 'engine') {
      return (
        <g
          key={slot}
          transform={`${transform} scale(${blueprint.scaleFactor})`}
          onClick={() => onSelectSlot?.(slot)}
          style={{ cursor: 'pointer' }}
        >
          <polygon
            points="-14,0 14,0 22,26 -22,26"
            fill={blueprint.secondaryColor}
            stroke={strokeColor}
            strokeWidth="2"
          />
          <ellipse cx="0" cy="34" rx="14" ry="8" fill={blueprint.accentColor} opacity="0.6" />
          <text x="0" y="50" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontFamily="monospace">
            {blueprint.label}
          </text>
        </g>
      );
    }

    if (slot === 'battery') {
      return (
        <g key={slot} transform={transform} onClick={() => onSelectSlot?.(slot)} style={{ cursor: 'pointer' }}>
          <rect
            x="-26"
            y="-12"
            width="52"
            height="24"
            rx="4"
            fill={blueprint.primaryColor}
            stroke={strokeColor}
            strokeWidth={isSelected ? 2.5 : 1.5}
          />
          <text x="0" y="3" textAnchor="middle" fill="#a7f3d0" fontSize="9" fontFamily="monospace">
            {blueprint.label}
          </text>
        </g>
      );
    }

    if (slot === 'instrument') {
      return (
        <g
          key={slot}
          transform={`${transform} scale(${blueprint.scaleFactor})`}
          onClick={() => onSelectSlot?.(slot)}
          style={{ cursor: 'pointer' }}
        >
          <rect
            x="-18"
            y="-28"
            width="36"
            height="28"
            rx="4"
            fill={blueprint.primaryColor}
            stroke={strokeColor}
            strokeWidth="2"
          />
          <circle cx="0" cy="-14" r="9" fill="#090d16" stroke={blueprint.accentColor} strokeWidth="2" />
          <text x="0" y="-34" textAnchor="middle" fill="#e9d5ff" fontSize="9" fontFamily="monospace">
            {blueprint.label}
          </text>
        </g>
      );
    }

    return (
      <g
        key={slot}
        transform={`${transform} scale(${blueprint.scaleFactor})`}
        onClick={() => onSelectSlot?.(slot)}
        style={{ cursor: 'pointer' }}
      >
        <line x1="0" y1="0" x2="22" y2="-18" stroke="#94a3b8" strokeWidth="2.5" />
        <path
          d="M12,-30 Q26,-10 36,-24"
          fill="none"
          stroke={strokeColor}
          strokeWidth="3"
        />
        <circle cx="28" cy="-26" r="3.5" fill={blueprint.accentColor} />
        <text x="40" y="-22" fill="#fdba74" fontSize="9" fontFamily="monospace">
          {blueprint.label}
        </text>
      </g>
    );
  };

  const backSlots = sortedSlots.filter((s) => attachedModules[s].socket.layerOrder <= 1);
  const frontSlots = sortedSlots.filter((s) => attachedModules[s].socket.layerOrder > 1);

  return (
    <svg
      viewBox="0 0 460 250"
      style={{
        width: '100%',
        height: 'auto',
        background: 'radial-gradient(circle at 75% 85%, #112240 0%, #090c15 70%)',
        borderRadius: 10,
        border: '1px solid #2a2f4a',
      }}
    >
      {/* Фонова сітка креслення */}
      <defs>
        <pattern id="bp-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(92,168,255,0.06)" strokeWidth="1" />
        </pattern>
        <clipPath id="planet-corner-clip">
          <circle cx="420" cy="230" r="95" />
        </clipPath>
      </defs>
      <rect width="460" height="250" fill="url(#bp-grid)" />

      {/* Кривизна планети та орбіти справа знизу */}
      <circle
        cx="420"
        cy="230"
        r="95"
        fill={bodyTemplate.blueprint.primaryColor}
        opacity="0.35"
        stroke={bodyTemplate.blueprint.accentColor}
        strokeWidth="1.5"
      />
      {bodyTemplate.planetTextures?.dayMapUrl && (
        <image
          href={bodyTemplate.planetTextures.dayMapUrl}
          x="325"
          y="135"
          width="190"
          height="190"
          clipPath="url(#planet-corner-clip)"
          opacity="0.55"
          preserveAspectRatio="xMidYMid slice"
        />
      )}
      <circle
        cx="420"
        cy="230"
        r="128"
        fill="none"
        stroke="#5ca8ff"
        strokeWidth="1"
        strokeDasharray="4 4"
        opacity="0.5"
      />
      <text x="345" y="102" fill="#7dd3fc" fontSize="10" fontFamily="monospace">
        ОРБІТА: {altKm} км ({bodyTemplate.id})
      </text>

      {/* Ліва колонка: Ракета-носій */}
      <g transform="translate(52, 128)">
        <text x="0" y="-98" textAnchor="middle" fill="#8a90a8" fontSize="10" fontFamily="monospace">
          НОСІЙ: {launcherTemplate.id.toUpperCase()}
        </text>
        <g transform={`scale(${launcherTemplate.blueprint.scaleFactor * 0.9})`}>
          <polygon
            points="0,-82 18,-48 -18,-48"
            fill={launcherTemplate.blueprint.accentColor}
            stroke="#e2e8f0"
            strokeWidth="1.5"
          />
          <rect
            x="-18"
            y="-48"
            width="36"
            height="96"
            rx="3"
            fill={launcherTemplate.blueprint.secondaryColor}
            stroke={launcherTemplate.blueprint.primaryColor}
            strokeWidth="2"
          />
          {launcherTemplate.id !== 'small' && (
            <>
              <rect
                x="-30"
                y="-15"
                width="10"
                height="62"
                rx="3"
                fill={launcherTemplate.blueprint.secondaryColor}
                stroke={launcherTemplate.blueprint.accentColor}
                strokeWidth="1.2"
              />
              <rect
                x="20"
                y="-15"
                width="10"
                height="62"
                rx="3"
                fill={launcherTemplate.blueprint.secondaryColor}
                stroke={launcherTemplate.blueprint.accentColor}
                strokeWidth="1.2"
              />
            </>
          )}
          <polygon points="-14,48 14,48 20,62 -20,62" fill="#475569" />
        </g>
      </g>

      {/* Задні шари модулів (layerOrder <= 1) */}
      {backSlots.map(renderSlotModule)}

      {/* Базовий корпус супутника + паливний бак */}
      <g transform={`translate(${busCenter.x}, ${busCenter.y})`}>
        <rect
          x="-36"
          y="-42"
          width="72"
          height="84"
          rx="8"
          fill={busTemplate.blueprint.primaryColor}
          stroke={busTemplate.blueprint.accentColor}
          strokeWidth="2"
        />
        <rect
          x="-28"
          y="12"
          width="56"
          height="22"
          rx="3"
          fill="#0f172a"
          stroke="#334155"
        />
        <rect
          x="-26"
          y="14"
          width={Math.min(52, Math.max(4, (fuelKg / 40) * 52))}
          height="18"
          rx="2"
          fill="#38bdf8"
          opacity="0.45"
        />
        <text x="0" y="26" textAnchor="middle" fill="#e2e8f0" fontSize="9" fontFamily="monospace">
          ПАЛИВО: {fuelKg} кг
        </text>
      </g>

      {/* Передні шари модулів (layerOrder > 1) */}
      {frontSlots.map(renderSlotModule)}
    </svg>
  );
}
