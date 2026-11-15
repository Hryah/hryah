// types.ts — Контракти адаптерної архітектури графічних темплейтів (лише для UI).
// Дозволяє прив'язувати 3D-моделі (.glb/.gltf), 2D-спрайти (.png/.svg), текстури планет
// та процедурні креслення (blueprints) до будь-яких ID модулів, ракет і небесних тіл із ядра.

import type { ReactNode } from 'react';
import type { Damage, Design, FlightResult, Mission, SlotId, SpacecraftSpec, SystemId } from '../../core/contracts';

// Графіка дизайну суто 2D: 'auto' бере SVG-спрайт, а без нього інженерне креслення.
export type RenderMode = 'auto' | 'sprite' | 'blueprint';

/** Розширюваний режим рендеру одиниці (вбудовані 2D/Blueprint + кастомні рендерери з GraphicsRendererRegistry) */
export type UnitRenderMode = RenderMode | (string & {});

export type TemplateCategory =
  | 'module'
  | 'launcher'
  | 'body'
  | 'spacecraft'
  | 'character'
  | 'prop'
  | 'ui-control';

export interface Vector3Tuple {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Point2DTuple {
  readonly x: number;
  readonly y: number;
}

/** Опис 3D-моделі (Kenney Space Kit / NASA 3D Resources у форматі GLB/GLTF) */
export interface Model3DSource {
  readonly url: string;
  readonly format: 'glb' | 'gltf' | 'obj';
  readonly scale?: number;
  readonly rotationDeg?: Vector3Tuple;
  readonly offset?: Vector3Tuple;
  readonly attribution?: string;
}

/** Опис 2D-спрайта або іконки (Kenney Simple Space / Space Shooter / SVG) */
export interface Sprite2DSource {
  readonly url: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly tintColor?: string;
  readonly format?: 'svg' | 'png';
  readonly attribution?: string;
}

/** Опис текстур небесного тіла (Three.js / NASA Blue Marble / Solar System Scope) */
export interface PlanetTextureSource {
  readonly dayMapUrl: string;
  readonly nightMapUrl?: string;
  readonly cloudsMapUrl?: string;
  readonly normalMapUrl?: string;
  readonly specularMapUrl?: string;
  readonly atmosphereColor?: string;
  readonly format?: 'svg' | 'png' | 'jpg';
  readonly attribution?: string;
}

/** Вбудовані процедурні векторні форми (працюють завжди, навіть без зовнішніх файлів) */
export type BuiltinBlueprintShapeId =
  | 'engine-cold'
  | 'engine-chem'
  | 'engine-ion'
  | 'solar-small'
  | 'solar-medium'
  | 'solar-large'
  | 'battery-small'
  | 'battery-medium'
  | 'battery-large'
  | 'antenna-whip'
  | 'antenna-patch'
  | 'antenna-dish'
  | 'camera-compact'
  | 'camera-medium'
  | 'camera-telescope'
  | 'cargo-container'
  | 'launcher-small'
  | 'launcher-medium'
  | 'launcher-heavy'
  | 'satellite-bus'
  | 'body-earth'
  | 'body-moon'
  | 'body-mars'
  | 'character-astronaut'
  | 'character-engineer'
  | 'prop-custom';

/** Ідентифікатор векторної форми: підтримує всі вбудовані форми та довільні розширення */
export type BlueprintShapeId = BuiltinBlueprintShapeId | (string & {});

export interface BlueprintSpec {
  readonly shape: BlueprintShapeId;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly accentColor: string;
  readonly scaleFactor: number;
  readonly label: string;
}

/** Універсальний графічний темплейт одиниці (модуля, ракети, планети, корпусу) */
export interface VisualTemplate {
  readonly id: string;
  readonly category: TemplateCategory;
  readonly slot?: SlotId;
  readonly system?: SystemId;
  readonly displayName: string;
  readonly packName?: string;
  readonly model3d?: Model3DSource;
  readonly sprite2d?: Sprite2DSource;
  readonly planetTextures?: PlanetTextureSource;
  readonly blueprint: BlueprintSpec;
}

/** Точка кріплення (сокет) модуля на корпусі супутника */
export interface AttachmentSocket {
  readonly slot: SlotId;
  readonly label: string;
  /** Координати на 2D-кресленні (у межах viewBox 360x260) */
  readonly pos2d: Point2DTuple;
  /** 3D-координати для Three.js / WebGL сцени */
  readonly pos3d: Vector3Tuple;
  readonly rotationDeg?: number;
  readonly layerOrder: number;
}

/** Зібрана візуальна модель космічного апарата з прив'язаними темплейтами */
export interface SpacecraftVisualAssembly {
  readonly busTemplate: VisualTemplate;
  readonly launcherTemplate: VisualTemplate;
  readonly bodyTemplate: VisualTemplate;
  readonly attachedModules: Record<SlotId, {
    readonly moduleId: string;
    readonly template: VisualTemplate;
    readonly socket: AttachmentSocket;
    readonly damageSeverity: number;
  }>;
}

/** Вхідні дані для універсального в'юпорта гри */
export interface ViewportContext {
  readonly phase: 'design' | 'flight' | 'orbit' | 'debrief';
  readonly mission: Mission;
  readonly design: Design;
  readonly spec?: SpacecraftSpec;
  readonly flight?: FlightResult;
  readonly damages?: Damage[];
}

/** Контекст рендеру окремої векторної blueprint-форми */
export interface BlueprintShapeRenderContext {
  readonly spec: BlueprintSpec;
  readonly stroke: string;
  readonly damaged: boolean;
  readonly idPrefix: string;
}

/** Функція рендеру векторної blueprint-форми */
export type BlueprintShapeRenderer = (ctx: BlueprintShapeRenderContext) => ReactNode;

/** Контекст кастомного рендерера одного юніта (для TemplateUnitView / додаткових режимів) */
export interface TemplateUnitRenderContext {
  readonly template: VisualTemplate;
  readonly mode: UnitRenderMode;
  readonly width: number;
  readonly height: number;
  readonly damaged: boolean;
  readonly spriteUrl?: string;
}

/** Функція кастомного рендеру юніта у певному режимі */
export type UnitRenderer = (ctx: TemplateUnitRenderContext) => ReactNode;

/** Контекст рендеру слота всередині композитної схеми апарата */
export interface SlotCompositeRenderContext {
  readonly slot: SlotId;
  readonly template: VisualTemplate;
  readonly socket: AttachmentSocket;
  readonly damageSeverity: number;
  readonly useSprites: boolean;
  readonly spriteUrl?: string;
  readonly spriteMissing: boolean;
  readonly isSelected: boolean;
  readonly isDamaged: boolean;
  readonly onSelectSlot?: (slot: SlotId) => void;
}

/** Функція рендеру конкретного слота на композитній схемі апарата */
export type SlotCompositeRenderer = (ctx: SlotCompositeRenderContext) => ReactNode;

/** Опис опції режиму в перемикачі в'юпорта */
export interface ViewportModeOption {
  readonly id: UnitRenderMode;
  readonly label: string;
}

/** Реєстр розширень рендерингу для масштабування форм, режимів та слотів без редагування ядра адаптерів */
export interface IGraphicsRendererRegistry {
  registerBlueprintShape(shape: BlueprintShapeId, renderer: BlueprintShapeRenderer): void;
  getBlueprintShape(shape: BlueprintShapeId): BlueprintShapeRenderer | undefined;
  registerUnitRenderer(mode: UnitRenderMode, renderer: UnitRenderer): void;
  getUnitRenderer(mode: UnitRenderMode): UnitRenderer | undefined;
  registerSlotRenderer(slot: SlotId, renderer: SlotCompositeRenderer): void;
  getSlotRenderer(slot: SlotId): SlotCompositeRenderer | undefined;
  registerModeOption(option: ViewportModeOption): void;
  listModeOptions(): readonly ViewportModeOption[];
}

/** Інтерфейс реєстру темплейтів ( дозволить легко підміняти або довантажувати паки ) */
export interface ITemplateRegistry {
  register(template: VisualTemplate): void;
  registerBatch(templates: readonly VisualTemplate[]): void;
  registerAlias(aliasId: string, targetId: string): void;
  resolveTemplateId(id: string): string;
  getTemplate(id: string): VisualTemplate;
  getModuleTemplate(slot: SlotId, moduleId: string): VisualTemplate;
  getLauncherTemplate(launcherId: string): VisualTemplate;
  getBodyTemplate(bodyName: string): VisualTemplate;
  getBusTemplate(): VisualTemplate;
  buildAssembly(ctx: ViewportContext): SpacecraftVisualAssembly;
  listAll(): readonly VisualTemplate[];
  listAliases(): Readonly<Record<string, string>>;
}
