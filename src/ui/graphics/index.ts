// index.ts — Публічний API адаптерної архітектури графічних темплейтів.

export type {
  AttachmentSocket,
  BlueprintShapeId,
  BlueprintShapeRenderContext,
  BlueprintShapeRenderer,
  BlueprintSpec,
  BuiltinBlueprintShapeId,
  IGraphicsRendererRegistry,
  ITemplateRegistry,
  Model3DSource,
  PlanetTextureSource,
  Point2DTuple,
  RenderMode,
  SlotCompositeRenderContext,
  SlotCompositeRenderer,
  SpacecraftVisualAssembly,
  Sprite2DSource,
  TemplateCategory,
  TemplateUnitRenderContext,
  UnitRenderMode,
  UnitRenderer,
  Vector3Tuple,
  ViewportContext,
  ViewportModeOption,
  VisualTemplate,
} from './types';

export {
  DEFAULT_ALIASES,
  DEFAULT_TEMPLATES,
  SATELLITE_SOCKETS,
  TemplateRegistry,
  resolveAssetUrl,
  templateRegistry,
} from './registry';

export {
  DEFAULT_VIEWPORT_MODE_OPTIONS,
  GraphicsRendererRegistry,
  rendererRegistry,
} from './renderer-registry';

export {
  BlueprintShapeSvg,
  CompositeSpacecraftSvg,
  EntityView,
  TemplateUnitView,
  type BlueprintShapeProps,
  type CompositeSpacecraftSvgProps,
  type EntityViewProps,
  type TemplateUnitViewProps,
} from './adapters';

export { SpacecraftViewport, type SpacecraftViewportProps } from './SpacecraftViewport';
