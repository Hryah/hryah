// registry.ts — Реєстр графічних темплейтів.
// Усі дані темплейтів і точок кріплення зберігаються в src/data/visual-templates.json.
// Шляхи до ассетів автоматично враховують import.meta.env.BASE_URL (працює на / і /experimental/).

import type { SlotId } from '../../core/contracts';
import rawManifest from '../../data/visual-templates.json';
import type {
  AttachmentSocket,
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
    if (!fallback) {
      throw new Error(`Missing fallback template for slot: ${slot}`);
    }
    return {
      ...fallback,
      id: moduleId,
      displayName: `${moduleId} (${slot})`,
      blueprint: { ...fallback.blueprint, label: moduleId.toUpperCase() },
    };
  }

  getLauncherTemplate(launcherId: string): VisualTemplate {
    return this.byId.get(launcherId) ?? this.byId.get('medium')!;
  }

  getBodyTemplate(bodyName: string): VisualTemplate {
    return this.byId.get(bodyName) ?? this.byId.get('Earth')!;
  }

  getBusTemplate(): VisualTemplate {
    return this.byId.get('bus:standard')!;
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
