// adapters.tsx — Візуальні адаптери для рендерингу 2D SVG темплейтів:
// 1. 'sprite'    — 2D SVG спрайти з public/assets/templates/ та bodies/
// 2. 'blueprint' — векторні інженерні схеми NASA-стилю (без зовнішніх растрових чи SVG-зображень)
// 3. 'auto'      — автоматичний вибір доступного 2D SVG представлення з фолбеком на схему

import { useEffect, useId, useState, type ReactNode } from 'react';
import type { SlotId } from '../../core/contracts';
import { rendererRegistry } from './renderer-registry';
import { templateRegistry } from './registry';
import type {
  BlueprintShapeRenderContext,
  BlueprintShapeRenderer,
  BlueprintSpec,
  BuiltinBlueprintShapeId,
  IGraphicsRendererRegistry,
  RenderMode,
  SlotCompositeRenderContext,
  SlotCompositeRenderer,
  SpacecraftVisualAssembly,
  UnitRenderMode,
  UnitRenderer,
  VisualTemplate,
} from './types';

function renderBatteryShape(ctx: BlueprintShapeRenderContext, cellCount: 1 | 2 | 3): ReactNode {
  const { spec, stroke } = ctx;
  const cells = [28, 44, 60].slice(0, cellCount);
  return (
    <g>
      <rect x="22" y="28" width="56" height="46" rx="6" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <rect x="36" y="20" width="10" height="8" rx="2" fill={spec.secondaryColor} />
      <rect x="54" y="20" width="10" height="8" rx="2" fill={spec.secondaryColor} />
      {cells.map((x, idx) => (
        <rect
          key={x}
          x={x}
          y="36"
          width="12"
          height="30"
          rx="2"
          fill={idx === 2 ? spec.accentColor : spec.secondaryColor}
        />
      ))}
    </g>
  );
}

function renderLauncherShape(ctx: BlueprintShapeRenderContext, hasBoosters: boolean): ReactNode {
  const { spec, stroke } = ctx;
  return (
    <g>
      <polygon points="50,8 62,28 38,28" fill={spec.accentColor} stroke={stroke} strokeWidth="1.5" />
      <rect x="38" y="28" width="24" height="52" fill={spec.secondaryColor} stroke={spec.primaryColor} strokeWidth="2" />
      {hasBoosters && (
        <>
          <rect x="24" y="42" width="12" height="38" rx="3" fill={spec.secondaryColor} stroke={stroke} strokeWidth="1.5" />
          <rect x="64" y="42" width="12" height="38" rx="3" fill={spec.secondaryColor} stroke={stroke} strokeWidth="1.5" />
        </>
      )}
      <polygon points="38,80 62,80 68,90 32,90" fill={spec.primaryColor} />
    </g>
  );
}

function renderBodyShape(
  ctx: BlueprintShapeRenderContext,
  variant: 'earth' | 'moon' | 'mars',
): ReactNode {
  const { spec, stroke } = ctx;
  return (
    <g>
      <circle cx="50" cy="50" r="36" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      {variant === 'moon' ? (
        <>
          <circle cx="38" cy="39" r="9" fill={spec.secondaryColor} opacity="0.55" stroke={spec.accentColor} strokeWidth="1" />
          <circle cx="62" cy="57" r="7" fill={spec.secondaryColor} opacity="0.45" stroke={spec.accentColor} strokeWidth="1" />
          <circle cx="56" cy="34" r="4" fill={spec.secondaryColor} opacity="0.4" />
        </>
      ) : variant === 'mars' ? (
        <>
          <path d="M36,20 Q50,25 64,20" fill="none" stroke={spec.accentColor} strokeWidth="3" strokeLinecap="round" opacity="0.7" />
          <ellipse cx="44" cy="48" rx="14" ry="8" fill={spec.secondaryColor} opacity="0.6" />
          <line x1="28" y1="58" x2="68" y2="54" stroke={spec.accentColor} strokeWidth="1.5" strokeDasharray="3 2" />
        </>
      ) : (
        <>
          <circle cx="38" cy="42" r="12" fill={spec.secondaryColor} opacity="0.7" />
          <circle cx="60" cy="58" r="10" fill={spec.secondaryColor} opacity="0.6" />
        </>
      )}
    </g>
  );
}

function renderSuitCharacterShape(ctx: BlueprintShapeRenderContext): ReactNode {
  const { spec, stroke } = ctx;
  return (
    <g>
      <rect x="30" y="34" width="40" height="36" rx="4" fill={spec.secondaryColor} stroke={stroke} strokeWidth="1.5" />
      <circle cx="50" cy="26" r="15" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <ellipse cx="50" cy="26" rx="10" ry="7" fill={spec.accentColor} />
      <rect x="35" y="40" width="30" height="30" rx="6" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <rect x="42" y="47" width="16" height="10" rx="2" fill={spec.secondaryColor} stroke={spec.accentColor} strokeWidth="1.2" />
      <rect x="23" y="42" width="10" height="24" rx="5" fill={spec.primaryColor} stroke={stroke} strokeWidth="1.5" />
      <rect x="67" y="42" width="10" height="24" rx="5" fill={spec.primaryColor} stroke={stroke} strokeWidth="1.5" />
      <rect x="37" y="70" width="11" height="20" rx="4" fill={spec.primaryColor} stroke={stroke} strokeWidth="1.5" />
      <rect x="52" y="70" width="11" height="20" rx="4" fill={spec.primaryColor} stroke={stroke} strokeWidth="1.5" />
    </g>
  );
}

function renderCargoContainerShape(ctx: BlueprintShapeRenderContext): ReactNode {
  const { spec, stroke } = ctx;
  return (
    <g>
      <rect x="20" y="26" width="60" height="48" rx="6" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <rect x="26" y="32" width="48" height="36" rx="3" fill={spec.secondaryColor} opacity="0.5" />
      <line x1="20" y1="50" x2="80" y2="50" stroke={spec.accentColor} strokeWidth="1.5" />
      <line x1="50" y1="26" x2="50" y2="74" stroke={spec.accentColor} strokeWidth="1.5" />
      <rect x="42" y="44" width="16" height="12" rx="2" fill="#090d16" stroke={spec.accentColor} strokeWidth="1.5" />
    </g>
  );
}

const BUILTIN_BLUEPRINT_SHAPES: Record<BuiltinBlueprintShapeId, BlueprintShapeRenderer> = {
  'engine-cold': ({ spec, stroke }) => (
    <g>
      <rect x="34" y="18" width="32" height="24" rx="4" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <polygon points="38,42 62,42 70,74 30,74" fill={spec.secondaryColor} stroke={stroke} strokeWidth="2" />
      <ellipse cx="50" cy="82" rx="12" ry="6" fill={spec.accentColor} opacity="0.55" />
    </g>
  ),
  'engine-chem': ({ spec, stroke }) => (
    <g>
      <rect x="30" y="14" width="40" height="26" rx="6" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <path d="M35,40 L65,40 L76,76 L24,76 Z" fill={spec.secondaryColor} stroke={stroke} strokeWidth="2" />
      <polygon points="36,76 64,76 50,96" fill={spec.accentColor} opacity="0.85" />
    </g>
  ),
  'engine-ion': ({ spec, stroke }) => (
    <g>
      <rect x="26" y="18" width="48" height="30" rx="6" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <ellipse cx="50" cy="56" rx="26" ry="10" fill={spec.secondaryColor} stroke={stroke} strokeWidth="2" />
      <ellipse cx="50" cy="56" rx="16" ry="6" fill="#090d16" stroke={spec.accentColor} strokeWidth="2" />
      <ellipse cx="50" cy="76" rx="20" ry="14" fill={spec.accentColor} opacity="0.45" />
    </g>
  ),
  'solar-small': ({ spec, stroke }) => (
    <g>
      <rect x="14" y="36" width="72" height="28" rx="3" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <line x1="38" y1="36" x2="38" y2="64" stroke={spec.accentColor} strokeWidth="1.5" />
      <line x1="62" y1="36" x2="62" y2="64" stroke={spec.accentColor} strokeWidth="1.5" />
      <line x1="14" y1="50" x2="86" y2="50" stroke={spec.accentColor} strokeWidth="1.5" />
    </g>
  ),
  'solar-medium': ({ spec, stroke }) => (
    <g>
      <rect x="6" y="30" width="88" height="40" rx="3" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <line x1="28" y1="30" x2="28" y2="70" stroke={spec.accentColor} strokeWidth="1.5" />
      <line x1="50" y1="30" x2="50" y2="70" stroke={spec.accentColor} strokeWidth="2" />
      <line x1="72" y1="30" x2="72" y2="70" stroke={spec.accentColor} strokeWidth="1.5" />
      <line x1="6" y1="50" x2="94" y2="50" stroke={spec.accentColor} strokeWidth="1.5" />
    </g>
  ),
  'solar-large': ({ spec, stroke }) => (
    <g>
      <rect x="2" y="22" width="96" height="56" rx="4" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      {[22, 40, 50, 60, 78].map((x) => (
        <line key={x} x1={x} y1="22" x2={x} y2="78" stroke={spec.accentColor} strokeWidth="1.5" />
      ))}
      <line x1="2" y1="40" x2="98" y2="40" stroke={spec.accentColor} strokeWidth="1.5" />
      <line x1="2" y1="60" x2="98" y2="60" stroke={spec.accentColor} strokeWidth="1.5" />
    </g>
  ),
  'battery-small': (ctx) => renderBatteryShape(ctx, 1),
  'battery-medium': (ctx) => renderBatteryShape(ctx, 2),
  'battery-large': (ctx) => renderBatteryShape(ctx, 3),
  'antenna-whip': ({ spec, stroke }) => (
    <g>
      <rect x="42" y="68" width="16" height="16" rx="3" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <line x1="50" y1="68" x2="50" y2="18" stroke={spec.secondaryColor} strokeWidth="3.5" />
      <circle cx="50" cy="16" r="5" fill={spec.accentColor} />
      <path d="M34,26 A20,20 0 0,1 66,26" fill="none" stroke={spec.accentColor} strokeWidth="1.5" strokeDasharray="3 2" />
    </g>
  ),
  'antenna-patch': ({ spec, stroke }) => (
    <g>
      <rect x="24" y="30" width="52" height="40" rx="6" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <rect x="34" y="38" width="32" height="24" rx="3" fill={spec.secondaryColor} />
      <circle cx="50" cy="50" r="6" fill={spec.accentColor} />
    </g>
  ),
  'antenna-dish': ({ spec, stroke }) => (
    <g>
      <path d="M16,42 Q50,82 84,42" fill={spec.primaryColor} stroke={stroke} strokeWidth="2.5" />
      <line x1="50" y1="62" x2="50" y2="24" stroke={spec.secondaryColor} strokeWidth="3" />
      <circle cx="50" cy="22" r="6" fill={spec.accentColor} />
      <line x1="26" y1="46" x2="50" y2="24" stroke={spec.accentColor} strokeWidth="1.2" />
      <line x1="74" y1="46" x2="50" y2="24" stroke={spec.accentColor} strokeWidth="1.2" />
      <rect x="42" y="62" width="16" height="20" rx="3" fill={spec.secondaryColor} />
    </g>
  ),
  'camera-compact': ({ spec, stroke }) => (
    <g>
      <rect x="28" y="32" width="44" height="36" rx="6" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <circle cx="50" cy="50" r="12" fill={spec.secondaryColor} stroke={spec.accentColor} strokeWidth="2" />
      <circle cx="50" cy="50" r="5" fill="#090d16" />
    </g>
  ),
  'camera-medium': ({ spec, stroke }) => (
    <g>
      <rect x="26" y="22" width="48" height="56" rx="6" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <circle cx="50" cy="46" r="16" fill={spec.secondaryColor} stroke={spec.accentColor} strokeWidth="2.5" />
      <circle cx="50" cy="46" r="8" fill="#090d16" />
      <circle cx="54" cy="42" r="3" fill={spec.accentColor} />
    </g>
  ),
  'camera-telescope': ({ spec, stroke }) => (
    <g>
      <polygon points="30,78 70,78 64,26 36,26" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <ellipse cx="50" cy="26" rx="18" ry="7" fill={spec.secondaryColor} stroke={spec.accentColor} strokeWidth="2" />
      <ellipse cx="50" cy="26" rx="11" ry="4" fill="#090d16" />
      <line x1="33" y1="52" x2="67" y2="52" stroke={spec.accentColor} strokeWidth="1.5" />
    </g>
  ),
  'cargo-container': renderCargoContainerShape,
  'launcher-small': (ctx) => renderLauncherShape(ctx, false),
  'launcher-medium': (ctx) => renderLauncherShape(ctx, false),
  'launcher-heavy': (ctx) => renderLauncherShape(ctx, true),
  'satellite-bus': ({ spec, stroke }) => (
    <g>
      <rect x="26" y="24" width="48" height="52" rx="6" fill={spec.primaryColor} stroke={stroke} strokeWidth="2.5" />
      <line x1="26" y1="50" x2="74" y2="50" stroke={spec.accentColor} strokeWidth="1.5" />
      <line x1="50" y1="24" x2="50" y2="76" stroke={spec.accentColor} strokeWidth="1.5" />
    </g>
  ),
  'body-earth': (ctx) => renderBodyShape(ctx, 'earth'),
  'body-moon': (ctx) => renderBodyShape(ctx, 'moon'),
  'body-mars': (ctx) => renderBodyShape(ctx, 'mars'),
  'character-astronaut': renderSuitCharacterShape,
  'character-engineer': renderSuitCharacterShape,
  'prop-custom': ({ spec, stroke }) => (
    <g>
      <polygon points="50,14 84,34 84,70 50,88 16,70 16,34" fill={spec.primaryColor} stroke={stroke} strokeWidth="2" />
      <polyline points="16,34 50,52 84,34" fill="none" stroke={spec.accentColor} strokeWidth="1.5" />
      <line x1="50" y1="52" x2="50" y2="88" stroke={spec.accentColor} strokeWidth="1.5" />
    </g>
  ),
};

export interface BlueprintShapeProps {
  readonly spec: BlueprintSpec;
  readonly size?: number;
  readonly damaged?: boolean;
  readonly shapeRenderers?: Readonly<Record<string, BlueprintShapeRenderer>>;
  readonly registry?: IGraphicsRendererRegistry;
}

/** Векторний рендерер інженерних креслень для кожного типу модуля, ракети чи планети */
export function BlueprintShapeSvg({
  spec,
  size = 72,
  damaged = false,
  shapeRenderers,
  registry = rendererRegistry,
}: BlueprintShapeProps) {
  const idPrefix = useId().replace(/:/g, '');
  const stroke = damaged ? '#ff5c7a' : spec.accentColor;
  const renderer =
    shapeRenderers?.[spec.shape] ??
    registry.getBlueprintShape(spec.shape) ??
    BUILTIN_BLUEPRINT_SHAPES[spec.shape as BuiltinBlueprintShapeId] ??
    BUILTIN_BLUEPRINT_SHAPES['prop-custom'];

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {renderer({ spec, stroke, damaged, idPrefix })}
    </svg>
  );
}

interface UnitFrameProps {
  readonly width: number;
  readonly height: number;
  readonly borderColor: string;
  readonly column?: boolean;
  readonly children: ReactNode;
}

function UnitFrame({ width, height, borderColor, column = false, children }: UnitFrameProps) {
  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: column ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#090c15',
        borderRadius: 8,
        overflow: column ? undefined : 'hidden',
        border: `1px solid ${borderColor}`,
      }}
    >
      {children}
    </div>
  );
}

export interface TemplateUnitViewProps {
  readonly template: VisualTemplate;
  readonly mode?: UnitRenderMode;
  readonly width?: number;
  readonly height?: number;
  readonly damaged?: boolean;
  readonly customRenderers?: Readonly<Record<string, UnitRenderer>>;
  readonly shapeRenderers?: Readonly<Record<string, BlueprintShapeRenderer>>;
  readonly registry?: IGraphicsRendererRegistry;
}

/**
 * Універсальний адаптер відображення одного об'єкта.
 * Перемикає між 2D SVG-спрайтом (або текстурою тіла), інженерним SVG-кресленням
 * і довільними кастомними режимами з GraphicsRendererRegistry.
 */
export function TemplateUnitView({
  template,
  mode = 'auto',
  width = 220,
  height = 160,
  damaged = false,
  customRenderers,
  shapeRenderers,
  registry = rendererRegistry,
}: TemplateUnitViewProps) {
  const [spriteFailed, setSpriteFailed] = useState(false);

  const imgUrl = template.sprite2d?.url ?? template.planetTextures?.dayMapUrl;

  // Скидаємо стан фолбеку при зміні темплейту, URL асетів або режиму відображення
  useEffect(() => {
    setSpriteFailed(false);
  }, [template.id, imgUrl, mode]);

  const borderColor = `${damaged ? '#ff5c7a' : template.blueprint.accentColor}33`;
  const customRenderer = customRenderers?.[mode] ?? registry.getUnitRenderer(mode);
  if (customRenderer) {
    return (
      <UnitFrame width={width} height={height} borderColor={borderColor}>
        {customRenderer({ template, mode, width, height, damaged, spriteUrl: imgUrl })}
      </UnitFrame>
    );
  }

  const canTrySprite = mode !== 'blueprint' && !!imgUrl && !spriteFailed;
  if (canTrySprite && imgUrl) {
    return (
      <UnitFrame width={width} height={height} borderColor={borderColor}>
        <img
          src={imgUrl}
          alt={template.displayName}
          onError={() => setSpriteFailed(true)}
          loading="lazy"
          decoding="async"
          style={{
            maxWidth: '90%',
            maxHeight: '90%',
            objectFit: 'contain',
            borderRadius: template.category === 'body' ? '50%' : 4,
          }}
        />
      </UnitFrame>
    );
  }

  return (
    <UnitFrame width={width} height={height} borderColor={borderColor} column>
      <BlueprintShapeSvg
        spec={template.blueprint}
        size={Math.min(width, height) * 0.65}
        damaged={damaged}
        shapeRenderers={shapeRenderers}
        registry={registry}
      />
      <span style={{ fontSize: 10, color: '#8a90a8', marginTop: 4 }}>{template.blueprint.label}</span>
    </UnitFrame>
  );
}

export interface EntityViewProps {
  readonly id: string;
  readonly mode?: UnitRenderMode;
  readonly width?: number;
  readonly height?: number;
  readonly customRenderers?: Readonly<Record<string, UnitRenderer>>;
  readonly shapeRenderers?: Readonly<Record<string, BlueprintShapeRenderer>>;
  readonly registry?: IGraphicsRendererRegistry;
}

/**
 * Однорядковий компонент для виводу будь-якого персонажа, фігури, ракети чи модуля за його ID:
 * Наприклад: <EntityView id="char:astronaut" />
 */
export function EntityView({
  id,
  mode = 'auto',
  width = 200,
  height = 160,
  customRenderers,
  shapeRenderers,
  registry = rendererRegistry,
}: EntityViewProps) {
  const template = templateRegistry.getTemplate(id);
  return (
    <TemplateUnitView
      template={template}
      mode={mode}
      width={width}
      height={height}
      customRenderers={customRenderers}
      shapeRenderers={shapeRenderers}
      registry={registry}
    />
  );
}

interface SlotContainerProps {
  readonly slot: SlotId;
  readonly transform: string;
  readonly onSelectSlot?: (slot: SlotId) => void;
  readonly children: ReactNode;
}

function SlotContainer({ slot, transform, onSelectSlot, children }: SlotContainerProps) {
  return (
    <g transform={transform} onClick={() => onSelectSlot?.(slot)} style={{ cursor: 'pointer' }}>
      {children}
    </g>
  );
}

function SelectionBox({
  x,
  y,
  width,
  height,
  stroke,
}: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly stroke: string;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx="4"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeDasharray="3 3"
    />
  );
}

function SelectionRing({
  cx,
  cy,
  r,
  stroke,
}: {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly stroke: string;
}) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeDasharray="3 3"
    />
  );
}

function slotTransform(ctx: SlotCompositeRenderContext, withScale = false): string {
  const { pos2d, rotationDeg } = ctx.socket;
  const base = `translate(${pos2d.x}, ${pos2d.y})${rotationDeg ? ` rotate(${rotationDeg})` : ''}`;
  return withScale ? `${base} scale(${ctx.template.blueprint.scaleFactor})` : base;
}

function slotStroke(ctx: SlotCompositeRenderContext): string {
  return ctx.isDamaged ? '#ff5c7a' : ctx.isSelected ? '#ffffff' : ctx.template.blueprint.accentColor;
}

const BUILTIN_SLOT_RENDERERS: Record<SlotId, SlotCompositeRenderer> = {
  solar: (ctx) => {
    const { template, spriteUrl, useSprites, isSelected, isDamaged, onSelectSlot } = ctx;
    const { blueprint } = template;
    const stroke = slotStroke(ctx);
    const highlighted = isSelected || isDamaged;

    if (useSprites && spriteUrl) {
      const wingW = Math.round(78 * blueprint.scaleFactor);
      const wingH = Math.round(48 * blueprint.scaleFactor);
      return (
        <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx)} onSelectSlot={onSelectSlot}>
          <g transform="scale(-1, 1)">
            <image href={spriteUrl} x={24} y={-wingH / 2} width={wingW} height={wingH} preserveAspectRatio="xMinYMid meet" />
          </g>
          <image href={spriteUrl} x={24} y={-wingH / 2} width={wingW} height={wingH} preserveAspectRatio="xMinYMid meet" />
          {highlighted &&
            [-(26 + wingW), 22].map((rectX) => (
              <SelectionBox key={rectX} x={rectX} y={-wingH / 2 - 2} width={wingW + 4} height={wingH + 4} stroke={stroke} />
            ))}
          <text x={24 + wingW * 0.55} y={-wingH / 2 - 5} textAnchor="middle" fill="#93c5fd" fontSize="9" fontFamily="monospace">
            {blueprint.label}
          </text>
        </SlotContainer>
      );
    }

    const wingSpan = Math.round(62 * blueprint.scaleFactor);
    const wingHeight = Math.round(28 * blueprint.scaleFactor);
    const wings = [-36 - wingSpan, 36];
    return (
      <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx)} onSelectSlot={onSelectSlot}>
        {wings.map((wx) => (
          <g key={wx}>
            <rect
              x={wx}
              y={-wingHeight / 2}
              width={wingSpan}
              height={wingHeight}
              rx="3"
              fill={blueprint.primaryColor}
              stroke={stroke}
              strokeWidth={isSelected ? 2.5 : 1.5}
            />
            <line
              x1={wx + wingSpan / 2}
              y1={-wingHeight / 2}
              x2={wx + wingSpan / 2}
              y2={wingHeight / 2}
              stroke={blueprint.accentColor}
              strokeWidth="1"
            />
          </g>
        ))}
        <text x={36 + wingSpan / 2} y={-wingHeight / 2 - 6} textAnchor="middle" fill="#93c5fd" fontSize="9" fontFamily="monospace">
          {blueprint.label}
        </text>
      </SlotContainer>
    );
  },

  engine: (ctx) => {
    const { template, spriteUrl, useSprites, isSelected, isDamaged, onSelectSlot } = ctx;
    const { blueprint } = template;
    const stroke = slotStroke(ctx);
    const highlighted = isSelected || isDamaged;

    if (useSprites && spriteUrl) {
      const w = Math.round(56 * blueprint.scaleFactor);
      const h = Math.round(56 * blueprint.scaleFactor);
      return (
        <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx)} onSelectSlot={onSelectSlot}>
          <image href={spriteUrl} x={-w / 2} y={-6} width={w} height={h} preserveAspectRatio="xMidYMin meet" />
          {highlighted && <SelectionRing cx={0} cy={h * 0.42} r={w * 0.48} stroke={stroke} />}
          <text x={0} y={h + 4} textAnchor="middle" fill="#cbd5e1" fontSize="9" fontFamily="monospace">
            {blueprint.label}
          </text>
        </SlotContainer>
      );
    }

    return (
      <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx, true)} onSelectSlot={onSelectSlot}>
        <polygon points="-14,0 14,0 22,26 -22,26" fill={blueprint.secondaryColor} stroke={stroke} strokeWidth="2" />
        <ellipse cx="0" cy="34" rx="14" ry="8" fill={blueprint.accentColor} opacity="0.6" />
        <text x="0" y="50" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontFamily="monospace">
          {blueprint.label}
        </text>
      </SlotContainer>
    );
  },

  battery: (ctx) => {
    const { template, spriteUrl, useSprites, isSelected, isDamaged, onSelectSlot } = ctx;
    const { blueprint } = template;
    const stroke = slotStroke(ctx);
    const highlighted = isSelected || isDamaged;

    if (useSprites && spriteUrl) {
      return (
        <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx)} onSelectSlot={onSelectSlot}>
          <image href={spriteUrl} x={-20} y={-24} width={40} height={46} preserveAspectRatio="xMidYMid meet" />
          {highlighted && <SelectionBox x={-22} y={-25} width={44} height={48} stroke={stroke} />}
        </SlotContainer>
      );
    }

    return (
      <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx)} onSelectSlot={onSelectSlot}>
        <rect
          x="-26"
          y="-12"
          width="52"
          height="24"
          rx="4"
          fill={blueprint.primaryColor}
          stroke={stroke}
          strokeWidth={isSelected ? 2.5 : 1.5}
        />
        <text x="0" y="3" textAnchor="middle" fill="#a7f3d0" fontSize="9" fontFamily="monospace">
          {blueprint.label}
        </text>
      </SlotContainer>
    );
  },

  instrument: (ctx) => {
    const { template, spriteUrl, useSprites, isSelected, isDamaged, onSelectSlot } = ctx;
    const { blueprint } = template;
    const stroke = slotStroke(ctx);
    const highlighted = isSelected || isDamaged;

    if (useSprites && spriteUrl) {
      const w = Math.round(82 * blueprint.scaleFactor);
      const h = Math.round(42 * blueprint.scaleFactor);
      return (
        <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx)} onSelectSlot={onSelectSlot}>
          <image href={spriteUrl} x={-w / 2} y={-h + 4} width={w} height={h} preserveAspectRatio="xMidYMax meet" />
          {highlighted && <SelectionBox x={-w / 2 - 2} y={-h + 2} width={w + 4} height={h + 2} stroke={stroke} />}
          <text x={0} y={-h - 2} textAnchor="middle" fill="#e9d5ff" fontSize="9" fontFamily="monospace">
            {blueprint.label}
          </text>
        </SlotContainer>
      );
    }

    if (blueprint.shape === 'cargo-container') {
      return (
        <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx, true)} onSelectSlot={onSelectSlot}>
          <rect x="-22" y="-30" width="44" height="30" rx="4" fill={blueprint.primaryColor} stroke={stroke} strokeWidth="2" />
          <line x1="-22" y1="-15" x2="22" y2="-15" stroke={blueprint.accentColor} strokeWidth="1.2" />
          <line x1="0" y1="-30" x2="0" y2="0" stroke={blueprint.accentColor} strokeWidth="1.2" />
          <text x="0" y="-36" textAnchor="middle" fill="#fcd34d" fontSize="9" fontFamily="monospace">
            {blueprint.label}
          </text>
        </SlotContainer>
      );
    }

    return (
      <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx, true)} onSelectSlot={onSelectSlot}>
        <rect x="-18" y="-28" width="36" height="28" rx="4" fill={blueprint.primaryColor} stroke={stroke} strokeWidth="2" />
        <circle cx="0" cy="-14" r="9" fill="#090d16" stroke={blueprint.accentColor} strokeWidth="2" />
        <text x="0" y="-34" textAnchor="middle" fill="#e9d5ff" fontSize="9" fontFamily="monospace">
          {blueprint.label}
        </text>
      </SlotContainer>
    );
  },

  antenna: (ctx) => {
    const { template, spriteUrl, useSprites, isSelected, isDamaged, onSelectSlot } = ctx;
    const { blueprint } = template;
    const stroke = slotStroke(ctx);
    const highlighted = isSelected || isDamaged;

    if (useSprites && spriteUrl) {
      const w = Math.round(48 * blueprint.scaleFactor);
      const h = Math.round(48 * blueprint.scaleFactor);
      return (
        <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx)} onSelectSlot={onSelectSlot}>
          <image href={spriteUrl} x={-4} y={-h + 8} width={w} height={h} preserveAspectRatio="xMinYMax meet" />
          {highlighted && <SelectionRing cx={w * 0.42} cy={-h * 0.38} r={w * 0.52} stroke={stroke} />}
          <text x={w + 2} y={-h * 0.45} fill="#fdba74" fontSize="9" fontFamily="monospace">
            {blueprint.label}
          </text>
        </SlotContainer>
      );
    }

    return (
      <SlotContainer key={ctx.slot} slot={ctx.slot} transform={slotTransform(ctx, true)} onSelectSlot={onSelectSlot}>
        <line x1="0" y1="0" x2="22" y2="-18" stroke="#94a3b8" strokeWidth="2.5" />
        <path d="M12,-30 Q26,-10 36,-24" fill="none" stroke={stroke} strokeWidth="3" />
        <circle cx="28" cy="-26" r="3.5" fill={blueprint.accentColor} />
        <text x="40" y="-22" fill="#fdba74" fontSize="9" fontFamily="monospace">
          {blueprint.label}
        </text>
      </SlotContainer>
    );
  },
};

function CompositePlanetBackdrop({
  bodyTemplate,
  planetImageUrl,
  clipId,
}: {
  readonly bodyTemplate: VisualTemplate;
  readonly planetImageUrl?: string;
  readonly clipId: string;
}) {
  const { blueprint } = bodyTemplate;
  return (
    <>
      <circle
        cx="420"
        cy="230"
        r="95"
        fill={blueprint.primaryColor}
        opacity="0.35"
        stroke={blueprint.accentColor}
        strokeWidth="1.5"
      />
      {planetImageUrl ? (
        <image
          href={planetImageUrl}
          x="325"
          y="135"
          width="190"
          height="190"
          clipPath={`url(#${clipId})`}
          opacity="0.72"
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <g clipPath={`url(#${clipId})`}>
          {/* Векторне креслення поверхні планети та координатної сітки для Blueprint-режиму */}
          {blueprint.shape === 'body-moon' ? (
            <>
              <circle cx="386" cy="192" r="14" fill={blueprint.secondaryColor} opacity="0.4" stroke={blueprint.accentColor} strokeWidth="1" />
              <circle cx="422" cy="212" r="9" fill={blueprint.secondaryColor} opacity="0.35" stroke={blueprint.accentColor} strokeWidth="1" />
              <circle cx="364" cy="224" r="7" fill={blueprint.secondaryColor} opacity="0.3" stroke={blueprint.accentColor} strokeWidth="1" />
            </>
          ) : (
            <>
              <ellipse cx="390" cy="204" rx="28" ry="15" fill={blueprint.secondaryColor} opacity="0.38" />
              <ellipse cx="436" cy="228" rx="22" ry="12" fill={blueprint.secondaryColor} opacity="0.32" />
            </>
          )}
          <ellipse cx="420" cy="230" rx="95" ry="38" fill="none" stroke={blueprint.accentColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.45" />
          <ellipse cx="420" cy="230" rx="48" ry="95" fill="none" stroke={blueprint.accentColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
          <circle cx="420" cy="230" r="88" fill="none" stroke={blueprint.accentColor} strokeWidth="0.9" opacity="0.35" />
        </g>
      )}
      <circle cx="420" cy="230" r="128" fill="none" stroke="#5ca8ff" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
    </>
  );
}

function CompositeLauncherColumn({
  launcherTemplate,
  useSprites,
}: {
  readonly launcherTemplate: VisualTemplate;
  readonly useSprites: boolean;
}) {
  const showSideBoosters =
    launcherTemplate.blueprint.shape !== 'launcher-small' && launcherTemplate.id !== 'small';

  return (
    <g transform="translate(52, 128)">
      <text x="0" y="-98" textAnchor="middle" fill="#8a90a8" fontSize="10" fontFamily="monospace">
        LAUNCHER: {launcherTemplate.id.toUpperCase()}
      </text>
      {useSprites && launcherTemplate.sprite2d?.url ? (
        <image
          href={launcherTemplate.sprite2d.url}
          x={-54}
          y={-88}
          width={108}
          height={166}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <g transform={`scale(${launcherTemplate.blueprint.scaleFactor * 0.9})`}>
          <polygon points="0,-82 18,-48 -18,-48" fill={launcherTemplate.blueprint.accentColor} stroke="#e2e8f0" strokeWidth="1.5" />
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
          {showSideBoosters &&
            [-30, 20].map((bx) => (
              <rect
                key={bx}
                x={bx}
                y="-15"
                width="10"
                height="62"
                rx="3"
                fill={launcherTemplate.blueprint.secondaryColor}
                stroke={launcherTemplate.blueprint.accentColor}
                strokeWidth="1.2"
              />
            ))}
          <polygon points="-14,48 14,48 20,62 -20,62" fill="#475569" />
        </g>
      )}
    </g>
  );
}

export interface CompositeSpacecraftSvgProps {
  readonly assembly: SpacecraftVisualAssembly;
  readonly altKm: number;
  readonly fuelKg: number;
  readonly selectedSlot?: SlotId | null;
  readonly onSelectSlot?: (slot: SlotId) => void;
  readonly preferSprites?: boolean;
  readonly mode?: RenderMode;
  readonly slotRenderers?: Partial<Record<SlotId, SlotCompositeRenderer>>;
  readonly registry?: IGraphicsRendererRegistry;
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
  preferSprites = true,
  mode,
  slotRenderers,
  registry = rendererRegistry,
}: CompositeSpacecraftSvgProps) {
  const { attachedModules, launcherTemplate, bodyTemplate, busTemplate } = assembly;
  const busCenter = attachedModules.solar.socket.pos2d;
  const useSprites = mode !== undefined ? mode !== 'blueprint' : preferSprites;
  const planetImageUrl = useSprites
    ? (bodyTemplate.sprite2d?.url ?? bodyTemplate.planetTextures?.dayMapUrl)
    : undefined;

  // Кілька збірок на сторінці (зокрема в прихованих екранах) не мають ділити id у <defs>.
  const uid = useId().replace(/:/g, '');
  const gridId = `bp-grid-${uid}`;
  const clipId = `planet-corner-clip-${uid}`;

  // Сортуємо слоти за порядком шарів (socket.layerOrder) із visual-templates.json
  const sortedSlots = (Object.keys(attachedModules) as SlotId[]).sort(
    (a, b) => attachedModules[a].socket.layerOrder - attachedModules[b].socket.layerOrder,
  );

  const renderSlotModule = (slot: SlotId) => {
    const mod = attachedModules[slot];
    const spriteUrl = useSprites ? mod.template.sprite2d?.url : undefined;
    const renderer = slotRenderers?.[slot] ?? registry.getSlotRenderer(slot) ?? BUILTIN_SLOT_RENDERERS[slot];

    return renderer({
      slot,
      template: mod.template,
      socket: mod.socket,
      damageSeverity: mod.damageSeverity,
      useSprites,
      spriteUrl,
      spriteMissing: useSprites && !mod.template.sprite2d?.url,
      isSelected: selectedSlot === slot,
      isDamaged: mod.damageSeverity > 0,
      onSelectSlot,
    });
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
        <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(92,168,255,0.06)" strokeWidth="1" />
        </pattern>
        <clipPath id={clipId}>
          <circle cx="420" cy="230" r="95" />
        </clipPath>
      </defs>
      <rect width="460" height="250" fill={`url(#${gridId})`} />

      {/* Кривизна планети та орбіти справа знизу */}
      <CompositePlanetBackdrop bodyTemplate={bodyTemplate} planetImageUrl={planetImageUrl} clipId={clipId} />
      <text x="345" y="102" fill="#7dd3fc" fontSize="10" fontFamily="monospace">
        ORBIT: {altKm} km ({bodyTemplate.id})
      </text>

      {/* Ліва колонка: Ракета-носій */}
      <CompositeLauncherColumn launcherTemplate={launcherTemplate} useSprites={useSprites} />

      {/* Задні шари модулів (layerOrder <= 1) */}
      {backSlots.map(renderSlotModule)}

      {/* Базовий корпус супутника + паливний бак */}
      <g transform={`translate(${busCenter.x}, ${busCenter.y})`}>
        {useSprites && busTemplate.sprite2d?.url ? (
          <image
            href={busTemplate.sprite2d.url}
            x={-48}
            y={-48}
            width={96}
            height={96}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
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
        )}
        <rect x="-28" y="26" width="56" height="16" rx="3" fill="#0f172a" stroke="#334155" />
        <rect
          x="-26"
          y="28"
          width={Math.min(52, Math.max(4, (fuelKg / 40) * 52))}
          height="12"
          rx="2"
          fill="#38bdf8"
          opacity="0.55"
        />
        <text x="0" y="37" textAnchor="middle" fill="#e2e8f0" fontSize="8" fontFamily="monospace">
          FUEL: {fuelKg} kg
        </text>
      </g>

      {/* Передні шари модулів (layerOrder > 1) */}
      {frontSlots.map(renderSlotModule)}
    </svg>
  );
}
