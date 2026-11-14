// registry.ts — Реєстр графічних темплейтів.
// Усі дані темплейтів і точок кріплення зберігаються в src/data/visual-templates.json.
// Шляхи до ассетів автоматично враховують import.meta.env.BASE_URL (працює на / і /experimental/).

import type { SlotId, SystemId } from '../../core/contracts';
import rawManifest from '../../data/visual-templates.json';
import type {
  AttachmentSocket,
  BlueprintShapeId,
  ITemplateRegistry,
  SpacecraftVisualAssembly,
  ViewportContext,
  VisualTemplate,
} from './types';

const basePrefix = import.meta.env.BASE_URL || '/';

export function resolveAssetUrl(url: string): string {
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  const clean = url.replace(/^\/+/, '');
  const prefix = basePrefix.endsWith('/') ? basePrefix : `${basePrefix}/`;
  return `${prefix}${clean}`;
}

function normalizeTemplateUrls(t: VisualTemplate): VisualTemplate {
  return {
    ...t,
    model3d: t.model3d ? { ...t.model3d, url: resolveAssetUrl(t.model3d.url) } : undefined,
    sprite2d: t.sprite2d ? { ...t.sprite2d, url: resolveAssetUrl(t.sprite2d.url) } : undefined,
    planetTextures: t.planetTextures
      ? {
          ...t.planetTextures,
          dayMapUrl: resolveAssetUrl(t.planetTextures.dayMapUrl),
          nightMapUrl: t.planetTextures.nightMapUrl ? resolveAssetUrl(t.planetTextures.nightMapUrl) : undefined,
          cloudsMapUrl: t.planetTextures.cloudsMapUrl ? resolveAssetUrl(t.planetTextures.cloudsMapUrl) : undefined,
          normalMapUrl: t.planetTextures.normalMapUrl ? resolveAssetUrl(t.planetTextures.normalMapUrl) : undefined,
          specularMapUrl: t.planetTextures.specularMapUrl ? resolveAssetUrl(t.planetTextures.specularMapUrl) : undefined,
        }
      : undefined,
  };
}

export const SATELLITE_SOCKETS = rawManifest.sockets as unknown as Record<SlotId, AttachmentSocket>;

const SLOT_FALLBACK_IDS = rawManifest.slotFallbackIds as Record<SlotId, string>;

const SLOT_DEFAULT_SHAPES: Record<SlotId, { shape: BlueprintShapeId; system: SystemId; color: string }> = {
  engine: { shape: 'engine-chem', system: 'propulsion', color: '#f97316' },
  solar: { shape: 'solar-medium', system: 'power', color: '#60a5fa' },
  battery: { shape: 'battery-medium', system: 'power', color: '#34d399' },
  antenna: { shape: 'antenna-patch', system: 'comms', color: '#fb923c' },
  instrument: { shape: 'camera-medium', system: 'science', color: '#c084fc' },
};

const BUS_FALLBACK: VisualTemplate = {
  id: 'bus:standard',
  category: 'spacecraft',
  system: 'structure',
  displayName: 'CubeSat / SmallSat Bus',
  packName: 'Fallback',
  blueprint: {
    shape: 'satellite-bus',
    primaryColor: '#2d3748',
    secondaryColor: '#4a5568',
    accentColor: '#eab308',
    scaleFactor: 1.0,
    label: 'BUS',
  },
};

export const DEFAULT_TEMPLATES: readonly VisualTemplate[] = (
  rawManifest.templates as unknown as readonly VisualTemplate[]
).map(normalizeTemplateUrls);

export class TemplateRegistry implements ITemplateRegistry {
  private readonly byId = new Map<string, VisualTemplate>();

  constructor(initial: readonly VisualTemplate[] = DEFAULT_TEMPLATES) {
    this.registerBatch(initial);
  }

  register(template: VisualTemplate): void {
    this.byId.set(template.id, normalizeTemplateUrls(template));
  }

  registerBatch(templates: readonly VisualTemplate[]): void {
    for (const t of templates) {
      this.register(t);
    }
  }

  getTemplate(id: string): VisualTemplate {
    const exact = this.byId.get(id);
    if (exact) return exact;
    return {
      id,
      category: 'prop',
      displayName: id,
      packName: 'Custom',
      blueprint: {
        shape: 'prop-custom',
        primaryColor: '#334155',
        secondaryColor: '#64748b',
        accentColor: '#38bdf8',
        scaleFactor: 1.0,
        label: id.toUpperCase(),
      },
    };
  }

  getModuleTemplate(slot: SlotId, moduleId: string): VisualTemplate {
    const exact = this.byId.get(moduleId);
    if (exact) return exact;
    const fallbackId = SLOT_FALLBACK_IDS[slot];
    const fallback = this.byId.get(fallbackId);
    if (fallback) {
      return {
        ...fallback,
        id: moduleId,
        displayName: `${moduleId} (${slot})`,
        blueprint: { ...fallback.blueprint, label: moduleId.toUpperCase() },
      };
    }
    const slotDefault = SLOT_DEFAULT_SHAPES[slot];
    return {
      id: moduleId,
      category: 'module',
      slot,
      system: slotDefault.system,
      displayName: `${moduleId} (${slot})`,
      packName: 'Fallback',
      blueprint: {
        shape: slotDefault.shape,
        primaryColor: '#1e293b',
        secondaryColor: '#475569',
        accentColor: slotDefault.color,
        scaleFactor: 1.0,
        label: moduleId.toUpperCase(),
      },
    };
  }

  getLauncherTemplate(launcherId: string): VisualTemplate {
    const exact = this.byId.get(launcherId) ?? this.byId.get('medium');
    if (exact) return exact;
    return {
      id: launcherId,
      category: 'launcher',
      displayName: launcherId,
      packName: 'Fallback',
      blueprint: {
        shape: 'launcher-medium',
        primaryColor: '#1e293b',
        secondaryColor: '#f8fafc',
        accentColor: '#f97316',
        scaleFactor: 1.0,
        label: launcherId.toUpperCase(),
      },
    };
  }

  getBodyTemplate(bodyName: string): VisualTemplate {
    const exact = this.byId.get(bodyName) ?? this.byId.get('Earth');
    if (exact) return exact;
    return {
      id: bodyName,
      category: 'body',
      displayName: bodyName,
      packName: 'Fallback',
      blueprint: {
        shape: 'body-earth',
        primaryColor: '#0284c7',
        secondaryColor: '#15803d',
        accentColor: '#7dd3fc',
        scaleFactor: 1.0,
        label: bodyName.toUpperCase(),
      },
    };
  }

  getBusTemplate(): VisualTemplate {
    return this.byId.get('bus:standard') ?? BUS_FALLBACK;
  }

  buildAssembly(ctx: ViewportContext): SpacecraftVisualAssembly {
    const slots: SlotId[] = ['engine', 'solar', 'battery', 'antenna', 'instrument'];
    const damages = ctx.damages ?? ctx.flight?.damage ?? [];

    const attached = {} as SpacecraftVisualAssembly['attachedModules'];
    for (const slot of slots) {
      const moduleId = ctx.design.modules[slot];
      const template = this.getModuleTemplate(slot, moduleId);
      const socket = SATELLITE_SOCKETS[slot];
      const dmg = damages.find((d) => d.system === template.system);
      attached[slot] = {
        moduleId,
        template,
        socket,
        damageSeverity: dmg ? dmg.severity : 0,
      };
    }

    return {
      busTemplate: this.getBusTemplate(),
      launcherTemplate: this.getLauncherTemplate(ctx.design.launcherId),
      bodyTemplate: this.getBodyTemplate(ctx.mission.body.name),
      attachedModules: attached,
    };
  }

  listAll(): readonly VisualTemplate[] {
    return Array.from(this.byId.values());
  }
}

export const templateRegistry = new TemplateRegistry();
