// index.ts — Публічний API адаптерної архітектури графічних темплейтів.

export type {
  AttachmentSocket,
  BlueprintShapeId,
  BlueprintSpec,
  ITemplateRegistry,
  Model3DSource,
  PlanetTextureSource,
  Point2DTuple,
  RenderMode,
  SpacecraftVisualAssembly,
  Sprite2DSource,
  TemplateCategory,
  Vector3Tuple,
  ViewportContext,
  VisualTemplate,
} from './types';

export {
  DEFAULT_TEMPLATES,
  SATELLITE_SOCKETS,
  TemplateRegistry,
  templateRegistry,
} from './registry';

export {
  BlueprintShapeSvg,
  CompositeSpacecraftSvg,
  EntityView,
  TemplateUnitView,
} from './adapters';

export { GlbModelCanvas, parseGlbBuffer } from './glb-viewer';
export { SpacecraftViewport } from './SpacecraftViewport';
